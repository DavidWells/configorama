const { originAt } = require('./utils/paths/fileOrigin')
const { scan: scanExpression, references: expressionReferences } = require('./utils/expressions/scan')
const { encodePathIdentity, decodePathIdentity, displayPath, lookupPathSegments } = require('./utils/paths/pathIdentity')
const validateStructure = require('./utils/validateStructure')
const opaque = require('./utils/encoders/opaque')
const { resolutionRecord, isResolutionRecord } = require('./utils/resolutionRecord')
/* Node built-ins */
const os = require('os')
const path = require('path')
const fs = require('fs')
/* // disable logs to find broken tests
console.log = () => {}
// process.exit(1)
/** */
/* External dependencies */
const findUp = require('find-up')
/**
 * Pre-order DFS walk that mimics the subset of `traverse(obj).forEach(fn)`
 * we actually use: only `this.path` and `this.update(v)`. ~2x faster than
 * the `traverse` package because it avoids the per-node State object alloc.
 *
 * @param {*} root
 * @param {Function} callback - called with `this = {path, update}` per node
 */
function walkAndUpdate(root, callback) {
  function visit(value, path, parent, key) {
    const ctx = {
      path,
      update(newValue) { if (parent !== null) parent[key] = newValue }
    }
    callback.call(ctx, value)
    // Re-read in case callback mutated the slot
    const current = parent === null ? root : parent[key]
    if (current !== null && typeof current === 'object') {
      // Use Object.keys for both arrays and objects so sparse-array holes are
      // skipped, matching the `traverse` package's behavior.
      const keys = Object.keys(current)
      const isArr = Array.isArray(current)
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]
        const idx = isArr && /^(?:0|[1-9]\d*)$/.test(k) ? Number(k) : k
        visit(current[k], path.concat(idx), current, k)
      }
    }
  }
  visit(root, [], null, null)
}

// True when matchedString sits inside the argument list of a registered filter/function call, e.g. the
// `${n}` in `${a | trunc(${n})}` or `${sep}` in `${split(${s}, ${sep})}`. Such a value is base64-encoded on
// substitution so its own commas/quotes can't be mis-split when the call's args are parsed. Uses actual
// parenthesis depth at the match position (not global pipe/paren indices, which misfire with multiple calls)
// and requires the enclosing `(` to directly follow a name in callNames — so eval/if/cron/file/text (which
// are resolvers, not in this.functions/this.filters) handle their own args and are left alone.
function isNestedCallArgument(property, matchedString, callNames, prefix, suffix) {
  if(typeof property!=='string'||typeof matchedString!=='string'||!callNames)return false
  const at=property.indexOf(matchedString);if(at<0||property.trim()===matchedString.trim())return false
  const call=scanExpression(property,{prefix,suffix}).nodes.filter(n=>n.kind==='Call'&&n.contentStart<=at&&n.end>at).sort((a,b)=>b.start-a.start)[0]
  return !!call&&(callNames.has(call.name)||callNames.has(call.name.toLowerCase()))
}

// True when matchedString sits INSIDE an outer variable expression — the text before it has more variable
// openers than closers, e.g. `${self:flag}` inside `${env:X, ${self:flag}}`. Used to keep a substituted
// value's type (a boolean fallback) intact instead of stringifying it into the outer expression.
function isInsideOuterVariable(property, matchedString, varPrefix, varSuffix) {
  const index=property.indexOf(matchedString)
  return !!findParentVariable(property,matchedString,varPrefix,varSuffix,index)
}

// True when the match at matchIndex is a fallback item of the variable enclosing it: a comma at
// the enclosing variable's own level comes before it, e.g. `${self:obj}` in `${opt:x, ${self:obj}}`
// but not the source slot of `${env:${self:obj}}`
function isInFallbackSlot(property, matchedString, matchIndex, varPrefix, varSuffix) {
  const parent=findParentVariable(property,matchedString,varPrefix,varSuffix,matchIndex)
  return !!parent&&isFallbackSlot(parent.text,matchedString,varPrefix,varSuffix)
}

// Narrower check for object/number args: encode only for FILTER arg lists (enclosing `(` follows a `|`).
// Object/array values passed to a FUNCTION (e.g. merge(${obj})) must stay raw, not base64-encoded.
function isNestedFilterArgument(property, matchedString, prefix, suffix) {
  if(typeof property!=='string'||typeof matchedString!=='string')return false
  const at=property.indexOf(matchedString);if(at<0)return false
  const syntax=scanExpression(property,{prefix,suffix})
  const call=syntax.nodes.filter(n=>n.kind==='Call'&&n.contentStart<=at&&n.end>at).sort((a,b)=>b.start-a.start)[0]
  if(!call)return false
  let id=call.parentId
  while(id!==null){const node=syntax.nodes[id];if(node.kind==='Filter')return true;id=node.parentId}
  return false
}

/**
 * Whether two resolved match results hold the same value (unwrapping resolver metadata)
 * @param {any} a - A resolved match result
 * @param {any} b - A resolved match result
 * @returns {boolean} True if both carry the same value
 */
function isSameResult(a, b) {
  /** @param {any} r */
  const unwrap = (r) => (isResolutionRecord(r)) ? r.value : r
  const x = unwrap(a)
  const y = unwrap(b)
  if (x === y) return true
  if (x && y && typeof x === 'object' && typeof y === 'object') return JSON.stringify(x) === JSON.stringify(y)
  return false
}

function resolveConfigFilePath(filePath) {
  const absolutePath = path.resolve(filePath)
  try {
    return fs.realpathSync(absolutePath)
  } catch (err) {
    return absolutePath
  }
}

function getConfigFileDirectory(filePath) {
  return path.dirname(resolveConfigFilePath(filePath))
}

const dotProp = require('dot-prop')

function resolveStaticFilterArg(arg, config) {
  const match = String(arg).trim().match(/^\$\{(?:self:)?([^}]+)\}$/)
  if (!match) return arg
  if (!dotProp.has(config, match[1])) return arg
  return encodeFilterArg(dotProp.get(config, match[1]))
}

/**
 * Parse a single filter expression into its name and resolved static arguments.
 *   `toUpperCase` -> { name: 'toUpperCase', args: null }
 *   `trunc(4)`    -> { name: 'trunc', args: [4] }
 * Function-style filters have their args comma-split, with `${...}` refs resolved from config.
 * @param {string} filterExpression - a single filter, e.g. `toUpperCase` or `trunc(4)`
 * @param {Object} config - config used to resolve `${...}` references inside the args
 * @returns {{ name: string, args: Array|null }} args is null when the filter takes none
 */
function parseFilter(filterExpression, config) {
  const funcMatch = filterExpression.match(/^(\w+)\((.*)\)$/)
  if (!funcMatch) {
    return { name: filterExpression, args: null }
  }
  const rawArgs = funcMatch[2]
  if (!rawArgs) {
    return { name: funcMatch[1], args: null }
  }
  // Split on any comma (not just `, `) so no-space args work — `oneOf("a","b")` as well as
  // `oneOf("a", "b")`. protectVariables keeps commas inside quotes, parens/brackets, and `${...}` intact.
  const splitter = splitCsv(rawArgs, ',', { protectVariables: true })
  const args = formatFunctionArgs(splitter.map(arg => resolveStaticFilterArg(arg, config)))
  return { name: funcMatch[1], args }
}

/**
 * Canonical filter-cache key: filter name plus its RESOLVED arguments. Both filter-application sites
 * (getValueFromSource and populateVariable) must agree on whether a filter already ran, but they see the
 * filter string in different forms — a variable arg is raw `${b}` at one site and an encoded marker at the
 * other. Keying on the resolved args makes those forms compare equal (so `${a | append(${b})}` runs once)
 * while still distinguishing genuinely different args (`append('X')` vs `append('Y')`).
 * @param {string} filterExpression
 * @param {Object} config
 * @returns {string}
 */
function filterCacheKey(filterExpression, config) {
  const { name, args } = parseFilter(filterExpression, config)
  if (!args || !args.length) return name
  // A variable-derived arg looks different at the two sites — a decoded marker (ResolvedFilterArg) at one,
  // an unresolved `${...}` (e.g. `${opt:x}`, which resolveStaticFilterArg can't reach) at the other. Collapse
  // both to a single token so the same filter is recognized as already-run; literal args keep their value so
  // `append('X')` and `append('Y')` stay distinct.
  const normalized = args.map((a) => {
    if (isResolvedFilterArg(a)) return '\x00VAR\x00'
    if (typeof a === 'string' && /\$\{.*\}/.test(a)) return '\x00VAR\x00'
    return a
  })
  return `${name}(${JSON.stringify(normalized)})`
}

/* Utils - root */
const {
  isArray, isString, isNumber, isObject, isDate, isRegExp, isFunction,
  isEmpty, trim, camelCase, kebabCase, capitalize, split, map, mapValues,
  assign, set, cloneDeep
} = require('./utils/lodash')
const PromiseTracker = require('./utils/PromiseTracker')
const handleSignalEvents = require('./utils/handleSignalEvents')
/* Utils - encoders */
const { encodeUnknown, decodeUnknown, hasEncodedUnknown, findUnknownValues } = require('./utils/encoders/unknown-values')
const { decodeEncodedValue } = require('./utils/encoders')
const { decodeJsSyntax, hasParenthesesPlaceholder, encodeJsonForVariable, parseEncodedJson, isEncodedJson } = require('./utils/encoders/js-fixes')
const { tagDates, reviveDates } = require('./utils/encoders/dates')
const { bracketsToDots } = require('./utils/paths/bracketsToDots')
const { encodeStrayVariableChars, decodeLiteralBraces, decodeLiteralBracesDeep, decodeForDisplay, encodeQuotedLiteralsDeep } = require('./utils/encoders/literal-braces')
/* Utils - parsing */
const preProcess = require('./utils/parsing/preProcess')
const { parseFileContents, getBodyContentKey } = require('./utils/parsing/parse')
const { mergeByKeys } = require('./utils/parsing/mergeByKeys')
const { arrayToJsonPath } = require('./utils/parsing/arrayToJsonPath')
/* Utils - paths */
const { findLineByPath } = require('./utils/paths/findLineForKey')
const { configFileType } = require('./utils/paths/fileType')
const { normalizeIgnorePaths, compileIgnorePaths, shouldIgnorePath } = require('./utils/paths/ignorePaths')
/* Utils - regex */
const { combineRegexes, funcRegex, fileRefSyntax, textRefSyntax } = require('./utils/regex')
/* Utils - strings */
const formatFunctionArgs = require('./utils/strings/formatFunctionArgs')
const { splitByComma } = require('./utils/strings/splitByComma')
const { splitCsv } = require('./utils/strings/splitCsv')
const { replaceAll } = require('./utils/strings/replaceAll')
const { getTextAfterOccurrence, findNestedVariable } = require('./utils/strings/textUtils')
const { ensureQuote, isSurroundedByQuotes, startsWithQuotedPipe } = require('./utils/strings/quoteUtils')
const { splitOnPipe, splitOnTopLevelPipe } = require('./utils/strings/splitOnPipe')
const { didYouMean } = require('./utils/strings/didYouMean')
const { findEnclosingVariable, findParentVariable, isFallbackSlot, isWholeFallbackItem, isPathSlot, variableSpans } = require('./utils/strings/bracketMatcher')
const { encodeFilterArg, unwrapFilterArg, isResolvedFilterArg } = require('./utils/filters/filterArgs')
const { validateOneOf } = require('./utils/filters/oneOf')
// Metadata, display and setup modules are required where used; plain config loads never need them
/* Utils - ui */
const { logDiagnosticHeader: logHeader } = require('./utils/ui/logs')
/* Utils - validation */
const { warnIfNotFound, isValidValue } = require('./utils/validation/warnIfNotFound')
const {
  assertCustomFunctionsAllowed,
  assertCustomResolversAllowed,
  assertSafeConfigInput,
  normalizeSafetyPolicy,
} = require('./utils/security/safetyPolicy')
const { ConfigoramaError } = require('./errors')
/* Utils - variables */
const cleanVariable = require('./utils/variables/cleanVariable')
const appendDeepVariable = require('./utils/variables/appendDeepVariable')
const { extractVariableWrapper, getFallbackString, verifyVariable, buildVariableSyntax } = require('./utils/variables/variableUtils')
const { findNestedVariables } = require('./utils/variables/findNestedVariables')
/* Resolvers */
const getValueFromString = require('./resolvers/valueFromString')
const getValueFromNumber = require('./resolvers/valueFromNumber')
const getValueFromEnv = require('./resolvers/valueFromEnv')
const getValueFromOptions = require('./resolvers/valueFromOptions')
const getValueFromSls = require('./resolvers/valueFromSls')
const getValueFromParam = require('./resolvers/valueFromParam')
const getValueFromCron = require('./resolvers/valueFromCron')
const getValueFromEval = require('./resolvers/valueFromEval')
const { encodeValue: encodeValueForEval } = require('./resolvers/valueFromEval')
const getValueFromIf = require('./resolvers/valueFromIf')
const createGitResolver = require('./resolvers/valueFromGit')
const { getValueFromFile: getValueFromFileResolver } = require('./resolvers/valueFromFile')
/* Parsers */
/* Functions */
const md5Function = require('./functions/md5')

/**
 * Maintainer's notes:
 *
 * This is a tricky class to modify and maintain.  A few rules on how it works...
 *
 * 1. All variable populations occur in generations.  Each of these generations resolves each
 *   present variable in the given object or property (i.e. terminal string properties and/or
 *   property parts) once.  This is to say that recursive resolutions should not be made.  This is
 *   because cyclic references are allowed [i.e. ${self:} and the like]) and doing so leads to
 *   dependency and dead-locking issues.  This leads to a problem with deep value population (i.e.
 *   populating ${self:foo.bar} when ${self:foo} has a value of {opt:bar}).  To pause that, one must
 *   pause population, noting the continued depth to traverse.  This motivated "deep" variables.
 *   Original issue #4687
 */

const deepRefSyntax = RegExp(/(\${)?deep:\d+(\.[^}]+)*()}?/)
const deepIndexReplacePattern = new RegExp(/^deep:|(\.[^}]+)*$/g)
const deepIndexPattern = /deep\:(\d*)/
const deepPrefixReplacePattern = /(?:^deep:)\d+\.?/g
// TODO update file regex ^file\((~?[a-zA-Z0-9._\-\/, ]+?)\)
// To match file(asyncValue.js, lol) input params
const selfRefSyntax = RegExp(/^self:/g)
/**
 * Whether a value is an unresolved variable kept as text (allowUnresolvedVariables)
 * @param {any} value
 * @returns {boolean}
 */
function isPassthrough(value) {
  return typeof value === 'string' && hasEncodedUnknown(value)
}

/**
 * Error text for a call to an unknown function, with the closest name or the filter form
 * @param {string} name - Function name as written
 * @param {string} variable - The variable, e.g. ${concat('a', 'b')}
 * @param {{ functions: Record<string, Function>, filters: Record<string, Function>, varPrefix: string, varSuffix: string }} instance
 * @returns {string}
 */
function unknownFunctionMessage(name, variable, instance) {
  const functions = Object.keys(instance.functions)
  let hint = ''
  if (instance.filters[name]) {
    hint = `\n"${name}" is a filter, not a function. Filters go after a value: ${instance.varPrefix}'value' | ${name}${instance.varSuffix}`
  } else {
    const close = didYouMean(name, functions)
    if (close) hint = `\nDid you mean "${close}"?`
  }
  return `Unknown function "${name}" in ${variable}${hint}\nAvailable functions: ${functions.join(', ')}. Add your own with the "functions" option.`
}

// Resolvers that look a key or name up, so get it decoded (see getValueFromSource)
const KEY_LOOKUP_TYPES = new Set(['self', 'env', 'options', 'opt', 'dot.prop'])
const logLines = '─────────────────────────────────────────────────'
const evalIfPattern = /\b(eval|if)\s*\(/
// Marks a function call still to run. It starts with a private-use char (U+E000) so no config
// value can look like it
const FUNCTION_MARKER = '\uE000function '
const functionPrefixPattern = new RegExp(`^${FUNCTION_MARKER}`)
const innerFunctionPattern = new RegExp(`(?<!^)${FUNCTION_MARKER}`)

let DEBUG = process.argv.includes('--debug') ? true : false
let VERBOSE = process.argv.includes('--verbose') ? true : false
// DEBUG = true
let DEBUG_TYPE = false

class Configorama {
  constructor(fileOrObject, opts) {
    if (!opaque.currentContext()) return opaque.withContext(() => new Configorama(fileOrObject, opts))
    this._encodingContext = opaque.currentContext()
    /* CLI-only by default. Library consumers should not get process-level signal handlers. */
    if (opts && opts.handleSignalEvents && !opts.sync) {
      handleSignalEvents()
    }
  
    const options = { ...cloneDeep(opts || {}), signal: opts && opts.signal }
    this.loadContext = require('./utils/loadContext')(fileOrObject, options)
    this.budget = require('./utils/resolutionBudget').createBudget(options)
    this.loadContext.budget = this.budget
    this._encodingContext.budget = this.budget
    this.budget.check()
    options.options = this.loadContext.options
    // Setup wizard is explicit opt-in: the CLI translates --setup/`setup` into options.setup
    this.setupMode = options.setup === true
    // Set opts to pass into JS file calls
    this.settings = Object.assign({}, {
      // Allow unknown ${xyz:...} syntax where xyz is not a registered resolver
      // Can be: false | true | ['ssm', 'cf', ...]
      allowUnknownVariableTypes: false,
      // Allow undefined to be an end result
      allowUndefinedValues: false,
      // Allow known variable types that can't be resolved to pass through
      // Can be: false | true | ['param', 'file', 'env', ...]
      // Note: Does not apply to self: or dotprop refs - those always error
      allowUnresolvedVariables: false,
      // Return metadata
      returnMetadata: false,
      // Return preResolvedVariableDetails
      returnPreResolvedVariableDetails: false,
      // Suppress env-stage-loader's normal dotenv loading logs by default.
      // CLI users can still see them with --verbose or dotEnvSilent: false.
      dotEnvSilent: !VERBOSE,
      dotEnvDebug: false,
      // Glob-like path patterns whose values should be left verbatim.
      // Useful for embedded languages that also use ${...}, such as
      // CloudFormation Fn::Sub, inline Lambda code, and CloudFront functions.
      ignorePaths: [],
      skipResolutionPaths: [],
      safeMode: false,
    }, options)

    // Backward compat: allowUnknownVars -> allowUnknownVariableTypes
    if (options.allowUnknownVars !== undefined && options.allowUnknownVariableTypes === undefined) {
      this.settings.allowUnknownVariableTypes = options.allowUnknownVars
    }
    // Backward compat: allowUnknownVariables -> allowUnknownVariableTypes
    if (options.allowUnknownVariables !== undefined && options.allowUnknownVariableTypes === undefined) {
      this.settings.allowUnknownVariableTypes = options.allowUnknownVariables
    }

    this.safetyPolicy = normalizeSafetyPolicy(this.settings, {
      configDir: options.configDir || (typeof fileOrObject === 'string' ? getConfigFileDirectory(fileOrObject) : process.cwd())
    })

    assertCustomResolversAllowed(options.variableSources, this.safetyPolicy)
    assertCustomFunctionsAllowed(options.functions, this.safetyPolicy)

    // Merge legacy allowUnknownParams and allowUnknownFileRefs into allowUnresolvedVariables
    let unresolvedSetting = this.settings.allowUnresolvedVariables
    if (unresolvedSetting !== true) {
      const specificTypes = Array.isArray(unresolvedSetting) ? [...unresolvedSetting] : []
      if (options.allowUnknownParams) specificTypes.push('param')
      if (options.allowUnknownFileRefs) specificTypes.push('file')
      if (specificTypes.length > 0) {
        unresolvedSetting = [...new Set(specificTypes)]
      }
    }
    this.settings.allowUnresolvedVariables = unresolvedSetting

    this.filterCache = Object.create(null)
    // Cache for originalValue lookups (perf: avoid repeated dotProp.get)
    this._originalValueCache = new Map()
    // Paths whose current value is a literal with no variables — skip rebuilding
    // their leaf object on every subsequent populateObjectImpl iteration.
    this._resolvedPaths = new Set()
    // Ignore-path decisions are constant for a run (patterns are fixed per
    // instance), so cache per path to skip repeated glob matching.
    this._ignorePathCache = new Map()
    // Cache raw file contents per absolute path so repeated ${file:...} refs
    // to the same file (e.g., merged twice into different keys) don't reread.
    this._fileContentCache = new Map()
    /** @type {Map<string, Set<string>>} file ref -> file refs found in what it expanded to */

    // rawOriginalConfig (a pre-preProcess snapshot) is only consumed by metadata
    // display paths. Skipping the cloneDeep when none of those paths are active
    // saves ~10-15ms per init.
    const showFound = this.settings.dynamicArgs && (this.settings.dynamicArgs.list || this.settings.dynamicArgs.info)
    this._needsRawClone = !!(
      this.settings.returnMetadata ||
      this.settings.returnPreResolvedVariableDetails ||
      VERBOSE || this.setupMode || showFound
    )

    this.foundVariables = []
    this.fileRefsFound = []

    // Track variable resolutions for metadata (keyed by path)
    this.resolutionTracking = Object.create(null)
    // Only track per-call metadata when returnMetadata is requested
    this._trackCalls = !!(this.settings.returnMetadata)

    // Detect file type early to determine default syntax
    let detectedFileType = null
    if (typeof fileOrObject === 'string') {
      detectedFileType = path.extname(fileOrObject).toLowerCase()
    }

    // Use $[...] syntax for HCL/Terraform files to avoid conflicts with Terraform's ${} syntax
    const isHclFile = detectedFileType === '.tf' || detectedFileType === '.hcl'
    const defaultExcludedPatterns = ['AWS', 'aws:', 'stageVariables']
    const defaultSyntax = isHclFile
      ? buildVariableSyntax('$[', ']', defaultExcludedPatterns)
      : buildVariableSyntax('${', '}', defaultExcludedPatterns)

    const varSyntax = options.syntax || defaultSyntax
    let varRegex
    if (typeof varSyntax === 'string') {
      varRegex = new RegExp(varSyntax, 'g')
    } else if (varSyntax instanceof RegExp) {
      varRegex = varSyntax
    }
    const variableSyntax = varRegex
    this.variableSyntax = variableSyntax
    // Non-global twin for cheap boolean checks: `.test()` on a global regex
    // would advance lastIndex between calls, and `.match()` on a global regex
    // allocates an array of every match. Use this whenever we only need truthy.
    this.variableSyntaxTest = new RegExp(variableSyntax.source, variableSyntax.flags.replace('g', ''))

    // Extract variable prefix/suffix from syntax regex for reconstructing variables
    const syntaxWrapper = extractVariableWrapper(variableSyntax.source)
    this.varPrefix = syntaxWrapper.prefix
    this.varSuffix = syntaxWrapper.suffix
    const escapedSuffix = this.varSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    this.varPrefixPattern = new RegExp('^' + this.varPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    this.varSuffixPattern = new RegExp(escapedSuffix + '$')
    this.varSuffixWithSpacePattern = new RegExp('\\s+' + escapedSuffix + '$')
    this.ignorePathPatterns = compileIgnorePaths(normalizeIgnorePaths(this.settings))

    // Set initial config object to populate
    if (typeof fileOrObject === 'object') {
      validateStructure(fileOrObject, options.resolutionLimits)
      // Store truly raw config before any preprocessing (only when needed)
      if (this._needsRawClone) {
        this.rawOriginalConfig = cloneDeep(fileOrObject)
      }
      // Preprocess: convert bare refs in if(), escape help() args
      // Skip fallback fixing for object configs (they handle bare refs differently)
      const processed = preProcess(fileOrObject, this.variableSyntax, this.variableTypes, { skipFallbackFix: true })
      // set config objects
      this.config = processed
      // Keep a copy
      this.originalConfig = cloneDeep(processed)
      // Set configPath for file references
      this.configPath = options.configDir || process.cwd()
    } else if (typeof fileOrObject === 'string') {
      assertSafeConfigInput(fileOrObject, this.safetyPolicy)
      // read and parse file
      const fileContents = fs.readFileSync(fileOrObject, 'utf-8')
      const fileDirectory = getConfigFileDirectory(fileOrObject)
      const fileType = path.extname(fileOrObject)

      this.configFilePath = fileOrObject
      // Set configFileType
      this.configFileType = fileType
      // Keep a copy of the original file contents
      this.originalString = fileContents
      // Set configPath for file references
      this.configPath = fileDirectory
      // Initialize config as null - will be populated in init
      this.config = null
      this.originalConfig = null
    }

    // Track promise resolution
    this.tracker = new PromiseTracker()
    this.budget.onClose = () => this.tracker.stop()

    // Variable Sources
    this.variableTypes = [
      /**
       * Environment variables
       * Usage:
       * ${env:Key}
       * ${env:KeyTwo, "fallbackValue"}
       */
      { ...getValueFromEnv, resolver: variable => getValueFromEnv.resolver(variable, this.loadContext.env) },
      /**
       * CLI flags
       * Usage:
       * ${opt:stage}
       * ${opt:other, "fallbackValue"}
       */
      getValueFromOptions,
      /**
       * Serverless stage (other sls: addresses pass through)
       * Usage:
       * ${sls:stage}
       */
      getValueFromSls,

      /**
       * Parameters
       * Usage:
       * ${param:domain}
       * ${param:key, "fallbackValue"}
       */
      getValueFromParam,

      /**
       * Cron expressions
       * Usage:
       * ${cron(every minute)}
       * ${cron(weekdays)}
       * ${cron(at 9:30)}
       */
      getValueFromCron,

      /**
       * Eval expressions
       * Usage:
       * ${eval(${self:valueTwo} > ${self:valueOne})}
       */
      getValueFromEval,

      /**
       * If expressions (alias for eval)
       * Usage:
       * ${if(${self:value} > 10 ? "big" : "small")}
       */
      getValueFromIf,

      /**
       * Self references
       * Usage:
       * ${otherKeyInConfig}
       * ${otherKeyInConfig, "fallbackValue"}
       * // or ${self:otherKeyInConfig}
       */
      {
        type: 'self',
        source: 'config',
        prefix: 'self',
        syntax: '${self:pathToKeyInConfig}',
        description: `Resolves values from the current config object. Supports sub-properties via :key lookup.`,
        match: selfRefSyntax,
        resolver: (varString, o, x, pathValue) => {
          return this.getValueFromSelf(varString, o, x, pathValue)
        },
      },
      /**
       * File references
       * Usage:
       * ${file(pathToFile.json)}
       * ${file(pathToFile.yml), "fallbackValue"}
       */
      {
        type: 'file',
        source: 'config',
        prefix: 'file',
        syntax: '${file(pathToFile.json)}',
        description: `Resolves values from files. Supports sub-properties via :key or .key lookup.`,
        match: fileRefSyntax,
        resolver: (varString, o, x, pathValue) => {
          // Inside ignore-path contexts (e.g. Fn::Sub) inline the file as raw text so
          // embedded CloudFormation refs survive and the body stays a string. Skip
          // raw mode when a :key/.key accessor is present — that needs a parsed value.
          const hasAccessor = /\)\s*[:.]/.test(varString)
          const asRawText = !!(pathValue && this.isIgnorePath(pathValue.path)) && !hasAccessor
          return this.getValueFromFile(varString, { asRawText, context: pathValue })
        },
      },


      {
        type: 'text',
        source: 'config',
        prefix: 'text',
        match: textRefSyntax,
        resolver: (varString, o, x, pathValue) => {
          return this.getValueFromFile(varString, { asRawText: true, context: pathValue })
        },
      },

      // Git refs
      createGitResolver(this.configPath),
      /* Internal Resolvers */
      // {
      //   match: funcRegex,
      //   resolver: (varString) => {
      //     return this.getValueFromFunction(varString)
      //   }
      // },
      /* Resolve string references */
      getValueFromString,
      /* Resolve deep references */
      {
        type: 'deep',
        internal: true,
        match: deepRefSyntax,
        resolver: (varString, o, x, pathValue) => {
          // console.log('>>>>>getValueFromDeep', varString)
          return this.getValueFromDeep(varString, pathValue)
        },
      },
      // Numbers
      getValueFromNumber,
    ]

    /* Nicer self: references. Match key in object */
    const fallThroughSelfMatcher = {
      type: 'dot.prop',
      source: 'config',
      match: (varString, fullObject, valueObject) => {
        /*
        console.log('fallThroughSelfMatcher varString', varString)
        console.log('fallThroughSelfMatcher valueObject', valueObject)
        console.log('fullObject', fullObject)
        /** */
        // items[1] / objs[0]['n'] are the same paths as items.1 / objs.0.n
        const keyPath = bracketsToDots(varString)
        /* its file ref so we need to shift lookup for self in nested files */
        if (valueObject.isFileRef) {
          // First check if property exists in the nested file's context (preferred)
          const nestedPath = [valueObject.path[0]].concat(keyPath)
          const nestedDotPath = nestedPath.join('.')
          if (dotProp.has(fullObject, nestedDotPath)) {
            // Property exists in nested context - return true to indicate match
            // (actual value resolution happens in resolver, not here)
            return true
          }
          // Fall back to top-level lookup
          if (dotProp.has(fullObject, keyPath)) {
            return true
          }
          return false
        }
        // console.log('fallthrough fullObject', fullObject)
        /* is simple ${whatever} reference in same file */
        const startOf = keyPath.split('.')
        // Use has() to properly check existence for falsy values
        return dotProp.has(fullObject, startOf[0])
      },
      resolver: (varString, options, config, pathValue) => {
        /*
        console.log('fallThroughSelfMatcher resolver', varString)
        console.log('fallThroughSelfMatcher options', options)
        console.log('fallThroughSelfMatcher config', config)
        console.log('fallThroughSelfMatcher pathValue', pathValue)
        /** */
        return this.getValueFromSelf(varString, options, config, pathValue)
      },
    }

    /* Apply user defined variable sources */
    if (options.variableSources) {
      
      // ensure each variable source has a type
      options.variableSources.forEach((v) => {
        if (!v.type) {
          console.error('Variable', v)
          throw new Error('Variable source must have a type')
        }
        if (!v.match || !v.resolver) {
          console.error('Variable', v)
          throw new Error('Variable source must have a match and resolver functions')
        }
      })

      this.variableTypes = this.variableTypes.concat(options.variableSources)
    }

    /* attach self matcher last */
    this.variableTypes = this.variableTypes.concat(/** @type {any} */ (fallThroughSelfMatcher))

    // const variablesKnownTypes = new RegExp(`^(${this.variableTypes.map((v) => v.prefix || v.type).join('|')}):`)
    const variablesKnownTypes = combineRegexes(
      /** @type {RegExp[]} */ (this.variableTypes
        .filter((v) => v.type !== 'string' && v.match instanceof RegExp)
        .map((v) => v.match))
    )
    this.variablesKnownTypes = variablesKnownTypes

    // Explicit configorama types that should still resolve inside ignore-path
    // contexts like Fn::Sub (self:, file, text, env, opt, cron, git, user sources, ...).
    // Excludes bare dot.prop refs (${foo}) — inside Fn::Sub those are CloudFormation
    // refs (${MyBucket}, ${AWS::Region}) and are left verbatim.
    this.subResolvableTypes = combineRegexes(
      /** @type {RegExp[]} */ (this.variableTypes
        .filter((v) => v.type !== 'string' && v.type !== 'dot.prop' && v.match instanceof RegExp)
        .map((v) => v.match))
    )

    // Build prefix lookup map for O(1) type detection (perf optimization)
    this._resolverByPrefix = new Map()
    for (const r of this.variableTypes) {
      const prefixes = r.prefixes || [r.prefix || r.type]
      for (const prefix of prefixes) {
        if (prefix && r.match instanceof RegExp && !r.internal) {
          this._resolverByPrefix.set(prefix + ':', r)
        }
      }
    }

    // this.allPatterns = combineRegexes(...this.variableTypes.map((v) => v.match))
    // console.log('this.allPatterns', this.allPatterns)
    // console.log('this.variablesKnownTypes', this.variablesKnownTypes)
    // process.exit(1)
    // Additional filters on values. ${thing | filterFunction}
    this.filters = {
      capitalize: (val) => {
        return capitalize(val)
      },
      toUpperCase: (val) => {
        if (typeof val === 'string') {
          return val.toUpperCase()
        } else if (Array.isArray(val)) {
          return val.map((v) => {
            return v.toUpperCase()
          })
        }
      },
      toLowerCase: (val) => {
        if (typeof val === 'string') {
          return val.toLowerCase()
        } else if (Array.isArray(val)) {
          return val.map((v) => {
            return v.toLowerCase()
          })
        }
      },
      toCamelCase: (val) => {
        return camelCase(val)
      },
      toKebabCase: (val) => {
        return kebabCase(val)
      },
      /* Type filters for coercion */
      toNumber: (val, from) => {
        const newVal = Number(val)
        return newVal
      },
      toString: (val) => {
        return String(val)
      },
      toBoolean: (val) => {
        return Boolean(val)
      },
      toJson: (val) => {
        return JSON.stringify(val)
      },
      toObject: (val) => {
        return require('./parsers/json5').parse(val)
      },
      /* Type validation filters */
      Number: (value) => {
        const n = Number(value)
        if (isNaN(n)) throw new Error(`Configorama Error: Expected Number, got "${value}"`)
        return n
      },
      Boolean: (value) => {
        if (typeof value === 'boolean') return value
        const v = String(value).toLowerCase()
        if (['true', '1', 'yes', 'on', 'enabled'].includes(v)) return true
        if (['false', '0', 'no', 'off', 'disabled'].includes(v)) return false
        throw new Error(`Configorama Error: Expected Boolean, got "${value}"`)
      },
      String: (value) => {
        if (value === undefined || value === null || value === 'null') return ''
        return String(value)
      },
      Array: (value) => {
        if (Array.isArray(value)) return value
        if (typeof value !== 'string') {
          throw new Error(`Configorama Error: Expected Array, got "${value}"`)
        }
        const trimmed = value.trim()
        if (!trimmed) return []
        try {
          const parsed = require('./parsers/json5').parse(trimmed)
          if (Array.isArray(parsed)) return parsed
          throw new Error('not-array')
        } catch (error) {
          if (trimmed.includes(',')) {
            return trimmed.split(',').map(item => item.trim()).filter(Boolean)
          }
          throw new Error(`Configorama Error: Expected Array, got "${value}"`)
        }
      },
      Object: (value) => {
        if (value && typeof value === 'object' && !Array.isArray(value)) return value
        if (typeof value !== 'string') {
          throw new Error(`Configorama Error: Expected Object, got "${value}"`)
        }
        try {
          const parsed = require('./parsers/json5').parse(value)
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
        } catch (error) {
          // Fall through to consistent error below.
        }
        throw new Error(`Configorama Error: Expected Object, got "${value}"`)
      },
      Json: (value) => {
        try {
          return typeof value === 'string' ? JSON.parse(value) : value
        } catch (e) {
          throw new Error(`Configorama Error: Invalid JSON in variable`)
        }
      },
      /* Help filter - identity function that preserves value but provides metadata for wizard */
      help: (value, helpText) => {
        // Identity function - returns value unchanged
        // The helpText argument is extracted during metadata collection for the wizard
        return value
      },
      oneOf: validateOneOf,
    }

    // Apply user defined filters
    if (options.filters) {
      this.filters = Object.fromEntries([...Object.entries(this.filters), ...Object.entries(options.filters)])
    }

    // (\|\s*(toUpperCase|toLowerCase|toCamelCase|toKebabCase|capitalize)\s*)+$
    // Updated to support function-style filters like help('text') with nested parens
    // Use a more permissive pattern that matches anything between parens including nested parens
    this.filterMatch = new RegExp(
      `(\\|\\s*(${Object.keys(this.filters).join('|')})(?:\\s*\\([^)]*(?:\\([^)]*\\))?[^)]*\\))?\\s*)+}?$`
    )
    // console.log('this.filterMatch', this.filterMatch)

    this.functions = {
      split: (value, delimiter, limit) => {
        const delimit = delimiter || ','
        const splitVal = split(value, delimit)
        return splitVal
      },
      join: (value, delimiter) => {
        if (isString(value)) {
          value = [value]
        }
        if (!isArray(value)) {
          throw new Error('value must be array for join() function')
        }
        const delimit = delimiter || ','
        return value.join(delimit)
      },
      /*
      Usage:
        ${length(var.hostnames)}
      */
      length: (value) => {
        // "${length(var.hostnames)}"
        if (typeof value === 'string' || Array.isArray(value)) {
          return value.length
        }
        if (typeof value === 'object') {
          return Object.keys(value).length
        }
      },
      merge: (value, otherValue) => {
        if (!value || !otherValue) {
          // throw new Error('missing value', value)
        }
        if (typeof value === 'string' && typeof otherValue === 'string') {
          return value + otherValue
        }
        if (isArray(value) && isArray(otherValue)) {
          return otherValue.concat(value)
        }
        return assign({}, value, otherValue)
      },
      upperKeys: (o) => {
        return Object.keys(o).reduce((c, k) => ((c[k.toUpperCase()] = o[k]), c), {}) // eslint-disable-line
      },
      md5: md5Function,
      // ServiceName@${replace(${ self : version }, /\\./gi, - )}
      // replace: (value, search, replace) => {
      //   return value.replace(search, replace)
      // },
    }

    // Apply user defined functions
    if (options.functions) {
      this.functions = Object.fromEntries([...Object.entries(this.functions), ...Object.entries(options.functions)])
    }

    // Names whose (...) argument list holds values to encode on substitution (filters + functions), so a
    // value's own commas/quotes survive arg parsing. Excludes resolvers (eval/if/cron/file/text) implicitly.
    this._callArgNames = new Set(
      [...Object.keys(this.filters), ...Object.keys(this.functions)].map((n) => n.toLowerCase())
    )

    this.deep = []
    this._deepOrigins = new Map()
    this.leaves = []
    this.callCount = 0
  }

  /**
   * Check if unresolved variables of a given type should pass through
   * @param {string} type - The resolver type (e.g., 'param', 'file', 'env')
   * @returns {boolean}
   */
  isUnresolvedAllowed(type) {
    const setting = this.settings.allowUnresolvedVariables
    if (setting === true) return true
    if (setting === false || setting === undefined) return false
    if (Array.isArray(setting) && setting.includes(type)) return true
    return false
  }

  /**
   * Suggest a likely-intended key for an unresolvable variable reference, e.g.
   * `${env:DATABSE}` -> `did you mean "env:DATABASE"?`. Compares the referenced key
   * against the keys that actually exist for that source (env vars, options, or
   * top-level config keys). Best-effort: returns '' if nothing is close.
   * @param {string} variableString - e.g. 'env:DATABSE', 'opt:stgae', 'self:databse'
   * @returns {string} A "did you mean" hint, or '' when there is no close match
   */
  suggestVariableFix(variableString) {
    try {
      const sep = variableString.indexOf(':')
      if (sep === -1) return ''
      const type = variableString.slice(0, sep).trim()
      const key = variableString.slice(sep + 1).trim()
      if (!key) return ''
      /** @type {string[]} */
      let candidates = []
      if (type === 'env') {
        candidates = Object.keys(process.env)
      } else if (type === 'opt') {
        candidates = Object.keys(this.options || {})
      } else if (type === 'self') {
        candidates = Object.keys(this.config || {})
      } else {
        return ''
      }
      // For dotted self paths, match on the first segment (the top-level key).
      const lookup = type === 'self' ? key.split('.')[0] : key
      const match = didYouMean(lookup, candidates, { threshold: 2 })
      if (!match || match === lookup) return ''
      const suggestion = type === 'self' && key.includes('.')
        ? `${type}:${key.replace(lookup, match)}`
        : `${type}:${match}`
      return `\nDid you mean "${suggestion}"?\n`
    } catch (err) {
      return ''
    }
  }

  /**
   * Extract type prefix from a variable string
   * @param {string} varString - Variable string like 'ssm:path/to/thing' or 'custom:value'
   * @returns {string|null} The type prefix or null if not found
   */
  extractTypePrefix(varString) {
    if (!varString || typeof varString !== 'string') return null
    const colonIndex = varString.indexOf(':')
    if (colonIndex === -1) return null
    return varString.substring(0, colonIndex)
  }

  /**
   * Check if unknown variable types should pass through
   * @param {string} varString - Variable string like 'ssm:path' or full '${ssm:path}'
   * @returns {boolean}
   */
  isUnknownTypeAllowed(varString) {
    const setting = this.settings.allowUnknownVariableTypes
    if (setting === false || setting === undefined) return false

    // Extract type prefix from variable string
    // Handle both 'ssm:path' and '${ssm:path}' formats
    let cleanVar = varString
    if (cleanVar.startsWith(this.varPrefix)) {
      cleanVar = cleanVar.slice(this.varPrefix.length)
    }
    if (cleanVar.endsWith(this.varSuffix)) {
      cleanVar = cleanVar.slice(0, -this.varSuffix.length)
    }
    const {classify,allowedForeign}=require('./utils/expressions/ownership')
    return allowedForeign(classify(cleanVar,{knownPrefixes:this._resolverByPrefix,prefix:this.varPrefix,suffix:this.varSuffix}),setting)
  }

  // ################
  // ## PUBLIC API ##
  // ################
  /**
   * Populate all variables in the service, conveniently remove and restore the service attributes
   * that confuse the population methods.
   * @param cliOpts An options hive to use for ${opt:...} variables.
   * @returns {Promise<any>} A promise resolving to the populated service.
   */
  async init(cliOpts) {
    if (opaque.currentContext() !== this._encodingContext) return opaque.runInContext(this._encodingContext, () => this.init(cliOpts))
    return this.budget.run(() => this._init(cliOpts))
  }
  async _init(cliOpts) {
    this.options = cloneDeep(cliOpts || this.loadContext.options)
    this.settings.options = this.options
    const configoramaOpts = this.settings

    const showFoundVariables = configoramaOpts && configoramaOpts.dynamicArgs && (configoramaOpts.dynamicArgs.list || configoramaOpts.dynamicArgs.info)
  

    // If we have a file path but no config yet, parse it now
    if (this.configFilePath && !this.config) {
      let configObject = await parseFileContents({
        contents: this.originalString,
        filePath: this.configFilePath,
        varRegex: this.variableSyntax,
        dynamicArgs: this.settings.dynamicArgs,
        loadContext: this.loadContext,
        moduleCacheMode: this.settings.moduleCacheMode
      })
      // An empty or comment-only YAML file parses to undefined/null: it is an empty config
      if (configObject === undefined || configObject === null) {
        configObject = {}
      }
      validateStructure(configObject, { ...this.settings.resolutionLimits, source: this.configFilePath })
      this.configFileContents = ''
      if (VERBOSE || showFoundVariables || this.settings.returnPreResolvedVariableDetails || this.setupMode) {
        this.configFileContents = fs.readFileSync(this.configFilePath, 'utf8')
      }
      /*
      console.log('before preprocess', configObject)
      /** */
      // Store truly raw config before any preprocessing (only when needed)
      if (this._needsRawClone) {
        this.rawOriginalConfig = cloneDeep(configObject)
      }

      const markdownBodyKey = getBodyContentKey(configObject)
      if (markdownBodyKey !== undefined) {
        this._markdownContent = configObject[markdownBodyKey]
        this._markdownContentKey = markdownBodyKey
        delete configObject[markdownBodyKey]
      }

      /* Preprocess step here - escapes ${} in help() args, fixes malformed fallbacks */
      configObject = preProcess(configObject, this.variableSyntax, this.variableTypes)
      /*
      console.log('after preprocess', configObject)
      /** */
      //process.exit(1)


      this.config = configObject
      this.originalConfig = cloneDeep(configObject)
    }

    if (VERBOSE) {
      logHeader('Config Input before processing')
      console.error()
      require('./utils/ui/deep-log').deepDebug(decodeLiteralBracesDeep(this.originalConfig))
      console.error()
    }

    const variableSyntax = this.variableSyntax
    const variablesKnownTypes = this.variablesKnownTypes

    if (VERBOSE || showFoundVariables || this.settings.returnPreResolvedVariableDetails || this.setupMode) {
      // Metadata is collected from encoded text (quoted { } $); decode once for display and callers
      const encodedMetadata = this.collectVariableMetadata()
      const metadata = decodeForDisplay(encodedMetadata)
      const shownOriginalConfig = decodeLiteralBracesDeep(this.originalConfig)

      const enrich = decodeForDisplay(await require('./utils/parsing/enrichMetadata')(
        encodedMetadata,
        this.resolutionTracking,
        this.variableSyntax,
        this.fileRefsFound,
        this.originalConfig,
        this.configFilePath,
        Object.keys(this.filters),
        undefined, // resolvedConfig not available yet
        this.settings.options,
        this.variableTypes
      ))

      if (showFoundVariables) {
        const deepLog = require('./utils/ui/deep-log').deepDebug
        deepLog('metadata', metadata)
        deepLog('enrich', enrich)
      }

      const variableData = metadata.variables
      const uniqueVariables = metadata.uniqueVariables
      const varKeys = Object.keys(variableData)
      const uniqueVarKeys = Object.keys(uniqueVariables)

      if (this.settings.returnPreResolvedVariableDetails) {
        return Object.assign({}, {
          resolved: false,
          originalConfig: shownOriginalConfig
        }, enrich)
      }

      if (!varKeys.length) {
        require('./display').displayNoVariablesFound(this.configFilePath, variableSyntax, this.variableTypes)
      }

      const lines = this.configFileContents ? this.configFileContents.split('\n') : []
      const fileType = this.configFileType
      const configFilePath = this.configFilePath

      const displayParams = { lines, fileType, configFilePath, uniqueVariables, uniqueVarKeys }

      require('./display').displayVariableDetails({
        varKeys, variableData, uniqueVariables,
        varPrefixPattern: this.varPrefixPattern,
        varSuffixPattern: this.varSuffixPattern,
        lines, fileType, configFilePath,
      })

      require('./display').displayUniqueVariables(displayParams)

      require('./display').displayConfigurableVariables(displayParams)


      // WALK through CLI prompt when setup mode is active
      if (this.setupMode) {
        logHeader('Setup Mode')
        // deepLog('enrich', enrich)
        const setupResult = await require('./utils/setup/setupEngine').runSetup(this.configFilePath || this.config, this.settings, {
          analysis: Object.assign({ originalConfig: shownOriginalConfig }, enrich),
        })
        this.setupRequirements = setupResult.requirements

        // Summary shows only answered groups, sensitive values redacted
        const displayInputs = {}
        for (const [group, values] of Object.entries(setupResult.redactedAnswers)) {
          if (Object.keys(values).length > 0) {
            displayInputs[group] = values
          }
        }

        logHeader('User Inputs Summary')
        console.error()
        console.error(JSON.stringify(displayInputs, null, 2))

        // Apply user inputs to options, environment, and config
        const setupEnv = { ...this.loadContext.env }
        require('./utils/setup/applyAnswers').applyAnswers({ options: this.options, env: setupEnv, config: this.config }, setupResult.answers)
        this.loadContext.env = Object.freeze(setupEnv)
        if (this.settings.dotEnvMode !== 'isolated') Object.assign(process.env, setupEnv)

        console.error()
        logHeader('Resolving Configuration')
        console.error()

        // process.exit(1)

        // Continue with normal resolution flow using the new values
        // Don't exit - let it fall through to resolve the config
      }
    
      /* Exit early if list or info flag is set */
      if (showFoundVariables) {
        return Promise.resolve(decodeLiteralBracesDeep(this.config))
      }
    }

    const originalConfig = this.originalConfig


    const useDotEnv = this.originalConfig.useDotenv || this.originalConfig.useDotEnv
    if ((useDotEnv && useDotEnv === true) || this.settings.useDotEnvFiles) {
      if (this.safetyPolicy.blockDotEnv) {
        throw new ConfigoramaError('blocked_by_safe_mode', 'Dotenv loading is blocked in safe mode', {
          surface: 'dotenv',
          configPath: this.configFilePath,
        })
      }
      let providerStage
      /* has hardcoded stage */
      if (
        this.originalConfig && this.originalConfig.provider && 
        this.originalConfig.provider.stage && !this.variableSyntaxTest.test(this.originalConfig.provider.stage)
      ) {
        providerStage = this.originalConfig.provider.stage
      }
      const stage = cliOpts.stage || providerStage || this.loadContext.env.NODE_ENV || 'dev'
      require('./utils/loadDotenv')(this.loadContext, this.settings, stage)
    }

    /* If no variables found just return early. The raw text can hide a variable whose quoted
       literal holds braces (${opt:x, '{a}'}); preprocessing encoded those, so check that too. */
    const hasNoVariables = this.originalString &&
      !this.variableSyntaxTest.test(this.originalString) &&
      !this.variableSyntaxTest.test(JSON.stringify(this.config))
    if (hasNoVariables) {
      if (this._markdownContent !== undefined) {
        this.originalConfig[this._markdownContentKey] = this._markdownContent
      }
      return Promise.resolve(this.originalConfig)
    }

    /* Parse variables */
    return this.initialCall(() => {
      return Promise.resolve()
        .then(() => {
          return this.populateObjectImpl(this.config).finally(() => {
            this.budget.check()
            // TODO populate function values here?
            // console.log('Final Config', this.config)
            // console.log(this.deep)
            const transform = this.runFunction.bind(this)
            const varSyntax = this.variableSyntax
            const leaves = this.leaves
            const filters = this.filters
            // console.log('leaves two', leaves)
            // Traverse resolved object and run functions
            // console.log('this.config', this.config)
            walkAndUpdate(this.config, function (rawValue) {
              /* Pass through unknown variables */
              if (!configoramaOpts.allowUndefinedValues && typeof rawValue === 'undefined') {
                const configValuePath = displayPath(this.path)
                /*
                console.log(this.path)
                /** */
                const ogValue = this.path.reduce((node, key) => node == null ? undefined : node[key], originalConfig)
                const varDisplay = ogValue ? `"${ogValue}" variable` : 'variable'

                const leaf = leaves.find((l) => encodePathIdentity(l.path) === encodePathIdentity(this.path))
                // if (leaf) {
                //   deepLog('leaf', leaf)
                // }
                const errorMessage = `
  Config error:\n
  Path "${configValuePath}" resolved to "undefined".\n
  Verify the ${varDisplay} in config at "${configValuePath}".\n
  ${leaf ? `See:\n  ${configValuePath}: ${leaf.originalSource} ` : ''}
  ${leaf && leaf.isFileRef ? `\n  The error could be deeper in the referenced file at ${configValuePath.replace(leaf.originalValuePath || configValuePath, '').replace(/^\./, '')} key.\n` : ''}`
                throw new Error(errorMessage)
              }
              if (typeof rawValue === 'string') {
                // console.log('rawValue', rawValue)
                /* Process inline functions like merge() */
                if (rawValue.match(functionPrefixPattern)) {
                  // console.log('RAW FUNCTION', rawFunction)
                  const withoutPrefix = rawValue.split(FUNCTION_MARKER).join('')
                  // Separate the function call from any trailing filters (paren-aware, so pipes inside the
                  // args are left alone). Run the BARE call — otherwise runFunction keeps the ` | filter`
                  // text and it leaks into the result — then apply the filters to that result below.
                  const pipeParts = splitOnPipe(withoutPrefix)
                  const rawValueNoFilters = pipeParts[0].trim()
                  const filterNames = pipeParts.slice(1)
                    .map(f => f.trim().replace(/\}$/, '').split('(')[0].trim())
                    .filter(Boolean)
                  // console.log('funcString', rawValueNoFilters)
                  const func = cleanVariable(rawValueNoFilters, varSyntax, true, `init ${this.callCount}`)
                  const funcVal = transform(func)

                  // Helper to get property from value (works on objects, arrays, and primitives)
                  const getProp = (val, path) => {
                    if (val == null) return undefined
                    // For primitives (string, number), access property directly
                    if (typeof val !== 'object') {
                      // Handle single property like 'length'
                      if (!path.includes('.')) return val[path]
                      // Handle path like 'foo.bar' - not applicable for primitives
                      return undefined
                    }
                    return dotProp.get(val, path)
                  }

                  let finalValue = funcVal

                  // Check for array index access: [N] optionally followed by .property
                  const indexMatch = rawValueNoFilters.match(/[)\}]\s*\[(\d+)\](?:\.([\w.]+))?$/)
                  if (indexMatch && Array.isArray(funcVal)) {
                    const index = parseInt(indexMatch[1], 10)
                    const propPath = indexMatch[2]
                    finalValue = funcVal[index]
                    if (propPath && finalValue != null) {
                      finalValue = getProp(finalValue, propPath)
                    }
                  } else {
                    // Check for property access: .foo.bar after function close
                    const propMatch = rawValueNoFilters.match(/[)\}]\s*\.([\w.]+)$/)
                    if (propMatch && typeof funcVal === 'object') {
                      finalValue = dotProp.get(funcVal, propMatch[1])
                    }
                  }

                  // Apply filters in sequence
                  for (const filterName of filterNames) {
                    if (filters[filterName]) {
                      finalValue = filters[filterName](finalValue)
                    }
                  }

                  this.update(finalValue)
                }

                /* fix for file(JS-ref.js, raw) to keep parens and inline code */
                if (hasParenthesesPlaceholder(rawValue)) {
                  rawValue = decodeJsSyntax(rawValue)
                  this.update(rawValue)
                }

                /* Allow for unknown variables to pass through */
                if (hasEncodedUnknown(rawValue)) {
                  const newValues = decodeUnknown(rawValue)
                  // console.log('>>>> newValues', newValues)
                  this.update(newValues)
                }
              }
            })

            walkAndUpdate(this.config, function (value) {
              if (typeof value === 'string') this.update(opaque.decodeAll(value))
            })

            if (DEBUG) {
              console.error(`Variable process ran ${this.callCount} times`)
              // console.log('FINAL Value', this.config)
              // console.log(this.deep)
            }
          })
        })
        .then(() => {
          // console.log('this.config', this.config)
          /* Final post-processing here */
          if (this.settings.mergeKeys && this.config) {
            this.config = mergeByKeys(this.config, '', this.settings.mergeKeys)
          }
          if (VERBOSE) {
            logHeader('Resolved Configuration value')
            console.error()
            require('./utils/ui/deep-log').deepDebug(this.config)
            console.error()
          }
          // Re-attach markdown body content after variable resolution
          if (this._markdownContent !== undefined) {
            this.config[this._markdownContentKey] = this._markdownContent
          }
          return this.config
        })
    })
  }

  /**
   * Collect metadata about all variables found in the configuration
   * @returns {object} Metadata object containing variables, fileRefs, and summary
   */
  collectVariableMetadata() {
    // Return cached metadata if already computed
    if (this._cachedMetadata) {
      return this._cachedMetadata
    }

    this._cachedMetadata = require('./metadata').collectVariableMetadata({
      variableSyntax: this.variableSyntax,
      variablesKnownTypes: this.variablesKnownTypes,
      variableTypes: this.variableTypes,
      filterMatch: this.filterMatch,
      configFilePath: this.configFilePath,
      // Use rawOriginalConfig for metadata display (truly original, no escaping). Its quoted
      // { } $ are encoded like the resolved config's so variables are matched whole; callers
      // decode the collected metadata once.
      displayConfig: this.rawOriginalConfig
        ? encodeQuotedLiteralsDeep(this.rawOriginalConfig, this.varPrefix, this.varSuffix)
        : this.originalConfig,
      originalConfig: this.originalConfig,
      varSuffix: this.varSuffix,
      varSuffixWithSpacePattern: this.varSuffixWithSpacePattern,
      ignorePathPatterns: this.ignorePathPatterns,
    })

    return this._cachedMetadata
  }
  /**
   * Populate the variables in the given object.
   * @param objectToPopulate The object to populate variables within.
   * @returns {Promise<any>} A promise resolving to the in-place populated object.
   */
  populateObject(objectToPopulate) {
    return this.initialCall(() => this.populateObjectImpl(objectToPopulate))
  }
  populateObjectImpl(objectToPopulate) {
    this.budget.pass()
    this.callCount = this.callCount + 1

    if (DEBUG) {
      require('./utils/ui/deep-log').deepDebug(`objectToPopulate called ${this.callCount} times`, objectToPopulate)
      // process.exit(0)
    }

    const leaves = this.getProperties(objectToPopulate, true, objectToPopulate)
    this.leaves = leaves
    // console.log('leaves', leaves)
    const signature = JSON.stringify(leaves.filter(leaf => typeof leaf.value === 'string').map(leaf => [leaf.path, leaf.value]))
    const progress = `${signature}:${this.deep.length}:${this.tracker.getSettled().length}`
    if (this._lastProgress === progress && leaves.some(leaf => typeof leaf.value === 'string' && this.variableSyntaxTest.test(leaf.value))) throw new ConfigoramaError('resolution_no_progress', 'Configuration resolution stopped making progress')
    this._lastProgress = progress
    const populations = this.populateVariables(leaves)
    // console.log("FILL LEAVES", populations)

    if (populations.length === 0) {
      if (DEBUG) console.error('Config Population Finished')
      return Promise.resolve(objectToPopulate)
    }

    return this.assignProperties(objectToPopulate, populations).then(() => {
      return this.populateObjectImpl(objectToPopulate)
    })
  }

  // #######################
  // ## PROPERTY HANDLING ##
  // #######################
  isIgnorePath(pathValue) {
    if (!this.ignorePathPatterns.length) return false
    const key = encodePathIdentity(isArray(pathValue) ? pathValue : lookupPathSegments(String(pathValue)))
    const cached = this._ignorePathCache.get(key)
    if (cached !== undefined) return cached
    const result = shouldIgnorePath(pathValue, this.ignorePathPatterns)
    this._ignorePathCache.set(key, result)
    return result
  }
  // True when the value has a configorama-typed token that resolves even inside an
  // ignore-path (self:/file/text/env/opt/cron/git/custom) — i.e. not just bare/CFN refs.
  hasSubResolvableToken(value) {
    if (typeof value !== 'string') return false
    const matches = this.getMatches(value)
    if (!isArray(matches)) return false
    return matches.some((m) => this.subResolvableTypes.test(m.variable))
  }
  shouldSkipResolution(pathValue, value) {
    if (!this.isIgnorePath(pathValue)) return false
    // Under an ignore path (Fn::Sub etc.) keep resolving configorama's own typed
    // refs; only skip when nothing but bare/CFN refs remain.
    return !this.hasSubResolvableToken(value)
  }

  /**
   * The declaration of a terminal property.  This declaration includes the path and value of the
   * property.
   * Example Input:
   * {
   *   foo: {
   *     bar: 'baz'
   *   }
   * }
   * Example Result:
   * [
   *   {
   *     path: ['foo', 'bar']
   *     value: 'baz
   *   }
   * ]
   * @typedef {Object} TerminalProperty
   * @property {String[]} path The path to the terminal property
   * @property {Date|RegExp|String} value The value of the terminal property
   */
  /**
   * Generate an array of objects noting the terminal properties of the given root object and their
   * paths
   * @param root The object to generate a terminal property path/value set for
   * @param current The current part of the given root that terminal properties are being sought
   * within
   * @param [context] An array containing the path to the current object root (intended for internal
   * use)
   * @param [results] An array of current results (intended for internal use)
   * @returns {TerminalProperty[]} The terminal properties of the given root object, with the path
   * and value of each
   */
  getProperties(root, atRoot, current, _context, _results) {
    let context = _context
    if (!context) context = []
    let results = _results
    if (!results) results = []

    const addContext = (value, key) => {
      return this.getProperties(root, false, value, context.concat(key), results)
    }
    if (isArray(current)) {
      for (const key of Object.keys(current)) addContext(current[key], key)
    } else if (isObject(current) && !isDate(current) && !isRegExp(current) && !isFunction(current)) {
      if (atRoot || current !== root) {
        mapValues(current, addContext)
      }
    } else {
      // Compute path once, then skip work for paths already known to be fully resolved.
      const cacheKey = encodePathIdentity(context)
      if (this._resolvedPaths.has(cacheKey)) {
        return results
      }
      // TODO Add values to leaves here
      const leaf = {
        origin: originAt(this.loadContext, context, this.configFilePath),
        path: context,
        value: current,
      }
      // console.log('this.originalConfig', this.originalConfig)

      // Check cache first (perf: avoid repeated dotProp.get calls)
      let originalValue
      let originalValuePath
      if (this._originalValueCache.has(cacheKey)) {
        const cached = this._originalValueCache.get(cacheKey)
        originalValue = cached.value
        originalValuePath = cached.originalValuePath
      } else {
        // Walk down originalConfig once using the path array directly. Avoids
        // dotProp.get's path-segmenting work and the previous O(depth²) loop
        // that re-joined and re-walked parent paths.
        const ancestorValues = []
        let node = this.originalConfig
        let fullPathReached = true
        for (let i = 0; i < context.length; i++) {
          if (node == null || typeof node !== 'object') {
            fullPathReached = false
            break
          }
          node = node[context[i]]
          ancestorValues.push(node)
        }

        const lastIdx = ancestorValues.length - 1
        originalValue = fullPathReached ? ancestorValues[lastIdx] : undefined

        if (!originalValue) {
          // Same semantics as the previous "recurse up" loop: walk from the
          // deepest non-full ancestor toward the root, take the first truthy
          // ancestor as originalValue, and update originalValuePath each time
          // we see a defined ancestor along the way.
          const startIdx = fullPathReached ? lastIdx - 1 : lastIdx
          for (let i = startIdx; i >= 0; i--) {
            const ancestor = ancestorValues[i]
            if (typeof ancestor !== 'undefined') {
              originalValuePath = i > 0 ? context.slice(0, i + 1).join('.') : context[0]
              originalValue = ancestor
              if (ancestor) break
            }
          }
        }
        this._originalValueCache.set(cacheKey, { value: originalValue, originalValuePath })
      }
      if (originalValuePath) {
        leaf.originalValuePath = originalValuePath
        leaf.currentConfig = this.config
      }
      leaf.originalSource = originalValue

      // Check if we have existing resolution history from previous iterations
      const pathKey = encodePathIdentity(context)
      if (this.resolutionTracking[pathKey] && this.resolutionTracking[pathKey].resolutionHistory) {
        leaf.resolutionHistory = this.resolutionTracking[pathKey].resolutionHistory
      } else {
        leaf.resolutionHistory = []
      }

      if (originalValue && isString(originalValue)) {
        const varString = cleanVariable(originalValue, this.variableSyntax, true, `getProperties ${this.callCount}`)
        if (varString.match(fileRefSyntax)) {
          leaf.isFileRef = true
        }
      }
      // Pre-compute hasVar so populateVariables doesn't have to re-test every leaf
      // every iteration. Non-string values can never contain a variable.
      leaf.hasVar = isString(current) && this.variableSyntaxTest.test(current)
      results.push(leaf)
    }
    return results
  }
  /**
   * @typedef {TerminalProperty} TerminalPropertyPopulated
   * @property {Object} populated The populated value of the value at the path
   */
  /**
   * Populate the given terminal properties, returning promises to do so
   * @param properties The terminal properties to populate
   * @returns {Promise<TerminalPropertyPopulated[]>[]} The promises that will resolve to the
   * populated values of the given terminal properties
   */
  populateVariables(properties) {
    // console.log('properties', properties)
    // hasVar was precomputed in getProperties — no need to re-test the regex here.
    // Properties whose value is defined and lacks a variable are terminally
    // resolved: record their path so getProperties can skip them on the next
    // iteration. Undefined-valued leaves stay eligible — the final
    // undefined-detection traverse still needs to find them in this.leaves.
    let variables = properties.filter((property) => {
      if (property.hasVar) return true
      if (property.value !== undefined) {
        const p = property.path
        this._resolvedPaths.add(encodePathIdentity(p))
      }
      return false
    })
    /* Leave opaque paths verbatim. These often contain non-configorama
       `${...}` syntax from CloudFormation, JavaScript, shell, VTL, etc. */
    variables = variables.filter((property) => {
      return !this.shouldSkipResolution(property.path, property.value)
    })
    /*
    console.log(`variables at call count ${this.callCount}`, variables)
    /** */
    /* Exclude git messages from being processed */
    // Was failing on git msgs like "xyz cron:pattern to cron(pattern) for improved clarity"
    if (this.callCount > 1) {
      // filter out git vars
      variables = variables.filter(property => {
        if (property.originalSource && typeof property.originalSource === 'string') {
          return !property.originalSource.startsWith('${git:')
        }
        return true
      })
    }
    return map(variables, (valueObject) => {
      // console.log('valueObject', valueObject)
      return this.populateValue(valueObject, false, '_populateVariables').then((populated) => {
        return assign({}, valueObject, { populated: populated.value })
      })
    })
  }
  /**
   * Assign the populated values back to the target object
   * @param target The object to which the given populated terminal properties should be applied
   * @param populations The fully populated terminal properties
   * @returns {Promise<void>} resolving when changes have been applied to the given target
   */
  assignProperties(target, populations) {
    // eslint-disable-line class-methods-use-this
    return Promise.all(populations).then((results) => {
      return results.forEach((result) => {
        if(result.nextOrigin && (typeof result.value !== 'string' || this.isWholeReference(result.value))) {
          this.loadContext.origins.set(encodePathIdentity(result.path),result.nextOrigin)
        }
        if (result.value !== result.populated) {
          set(target, result.path, result.populated)
        }
        // If the populated value is defined and no longer contains a variable,
        // mark this path resolved so getProperties skips it on subsequent
        // iterations. Undefined means resolution failed — keep it eligible so
        // the final undefined-detection traverse still has a leaf to reference.
        const populated = result.populated
        if (populated !== undefined && (typeof populated !== 'string' || !this.variableSyntaxTest.test(populated))) {
          const p = result.path
          this._resolvedPaths.add(encodePathIdentity(p))
        }
      })
    })
  }
  // ##################
  // ## MATCH/RENDER ##
  // ##################
  /**
   * @typedef {Object} MatchResult
   * @property {String} match The original property value that matched the variable syntax
   * @property {String} variable The cleaned variable string that specifies the origin for the
   * property value
   * @property {Number} index Where the match starts in the property value. The same text can
   * occur more than once, each in its own context (e.g. inside a fallback list or not)
   */
  /**
   * Get matches against the configured variable syntax
   * @param property The property value to attempt extracting matches from
   * @returns {Object|String|MatchResult[]} The given property or the identified matches
   */
  getMatches(property) {
    if (typeof property !== 'string') return property
    const syntax=scanExpression(property,{prefix:this.varPrefix,suffix:this.varSuffix})
    const refs=expressionReferences(syntax)
    const matches=refs.filter(node=>node.complete&&!refs.some(child=>child.start>node.start&&child.end<=node.end))
      .filter(node=>{const match=node.raw.match(this.variableSyntax);return !!match&&match[0]===node.raw})
      .sort((a,b)=>a.start-b.start)
    if(!matches.length)return property
    return matches.map(node=>({match:node.raw,variable:property.slice(node.contentStart,node.contentEnd).trim(),index:node.start}))
  }
  /**
   * A fallback only runs when everything before it came up empty. Variables resolve innermost
   * first, so a nested fallback item (${spy:x} in ${env:SET, ${spy:x}}) would otherwise run before
   * its list is read. For each such match, resolve the plain items before it in order; when one
   * has a value, the whole list is replaced by it and the fallback never runs. Lists with filters,
   * or earlier items that are still variables, take the normal path.
   * @param {MatchResult[]} matches - Matches found in the property
   * @param {any} valueObject - The value object being populated
   * @returns {Promise<Array<MatchResult & { presolved?: any }>>} Matches, a short-circuited list in place of its items
   */
  shortCircuitFallbacks(matches, valueObject) {
    const property = valueObject.value
    if (typeof property !== 'string' || !matches.length) return Promise.resolve(matches)
    const prefix = this.varPrefix
    const suffix = this.varSuffix
    // Spans close innermost first, so the first span around a match is its parent
    const parsed = scanExpression(property,{prefix,suffix})
    const spans = expressionReferences(parsed).filter(n=>n.complete).sort((a,b)=>a.end-b.end||b.start-a.start)
    /**
     * @typedef {{ start: number, text: string, filters: string[], commas: number[], outcome: Promise<{ found: boolean, index?: number, value?: any }> }} List
     * @type {Map<number, List|null>}
     */
    const lists = new Map()
    /**
     * Read a fallback list once: where its items split, its filters, and the first of its leading
     * plain items that has a value (resolved in order, stopping at the first that isn't plain)
     * @param {{ start: number, end: number }} span
     * @returns {List|null}
     */
    const readList = (span) => {
      if (lists.has(span.start)) return /** @type {List|null} */ (lists.get(span.start))
      const text = property.slice(span.start, span.end)
      const body = text.slice(prefix.length, text.length - suffix.length)
      // A function call's commas separate arguments, not fallbacks
      if (/^\s*[A-Za-z_][\w.]*\s*\(/.test(body)) { lists.set(span.start, null); return null }
      // Filters after the list (${a, ${b} | Number}) apply to whichever item wins
      const [inner, ...filters] = splitOnTopLevelPipe(body, prefix, suffix)
      if (filters.some((f) => f.includes(prefix))) { lists.set(span.start, null); return null }
      const node=expressionReferences(parsed).find(n=>n.start===span.start)
      const commas=(node.commas||[]).map(at=>at-span.start-prefix.length).filter(at=>at<inner.length)
      const items = [0, ...commas.map((c) => c + 1)].map((from, k) => inner.slice(from, k < commas.length ? commas[k] : inner.length).trim())
        // Bare items after the first arrive wrapped (env:X -> ${env:X}); a simple one is still plain
        .map((item) => {
          const bare = item.slice(prefix.length, item.length - suffix.length)
          const simple = item.startsWith(prefix) && item.endsWith(suffix) && !bare.includes(prefix) && !bare.includes(suffix)
          return simple ? bare.trim() : item
        })
      const isPlain = (/** @type {string} */ item) => !!item && !item.includes(prefix) && (isEncodedJson(item) ||
        !!item.match(this.variablesKnownTypes) || isSurroundedByQuotes(item) || /^-?\d+(\.\d+)?$/.test(item))
      /**
       * @param {number} i
       * @returns {Promise<{ found: boolean, index?: number, value?: any }>}
       */
      const firstValue = (i) => {
        // The last item is the list's own fallback of last resort, resolved on the normal path
        if (i >= items.length - 1 || !isPlain(items[i])) return Promise.resolve({ found: false })
        // An item already resolved and encoded into this list is its value
        const pending = isEncodedJson(items[i]) ? Promise.resolve(items[i])
          : this.getValueFromSource(items[i], valueObject, 'lazyFallback', text, span.start)
        return pending.then((result) => {
          const value = (isResolutionRecord(result)) ? result.value : result
          if (isString(value) && this.variableSyntaxTest.test(value)) return { found: false }
          if (isValidValue(value) && !isPassthrough(value)) return { found: true, index: i, value: reviveDates(parseEncodedJson(value)) }
          return firstValue(i + 1)
        })
      }
      const outcome = firstValue(0).then((found) => {
        if(found.found)this.recordFallbackSelection(valueObject, text, found.index, items.length)
        if (!found.found || !filters.length) return found
        return Promise.resolve(this.applyFilters(found.value, filters.map((f) => f.trim()), valueObject.path))
          .then((value) => Object.assign({}, found, { value }))
      })
      const list = { start: span.start, text, filters, commas, outcome }
      lists.set(span.start, list)
      return list
    }
    const checks = matches.map((m) => {
      const span = spans.find((sp) => sp.start < m.index && sp.end >= m.index + m.match.length)
      const list = span ? readList(span) : null
      if (!list) return null
      // Which item of the list the match is: the number of top-level commas before it
      const at = m.index - list.start - prefix.length
      const item = list.commas.filter((c) => c < at).length
      return item > 0 ? { list, item } : null
    })
    return Promise.all(checks.map((c) => c ? c.list.outcome : null)).then((outcomes) => {
      // A list with a value before a match replaces every match inside it, once
      /** @type {Map<number, { text: string, start: number, value: any }>} */
      const replaced = new Map()
      checks.forEach((c, i) => {
        const outcome = outcomes[i]
        if (c && outcome && outcome.found && /** @type {number} */ (outcome.index) < c.item && !replaced.has(c.list.start)) {
          replaced.set(c.list.start, { text: c.list.text, start: c.list.start, value: outcome.value })
        }
      })
      if (!replaced.size) return matches
      /** @type {Array<MatchResult & { presolved?: any }>} */
      const result = []
      const added = new Set()
      for (const m of matches) {
        const list = [...replaced.values()].find((l) => m.index >= l.start && m.index + m.match.length <= l.start + l.text.length)
        if (!list) {
          result.push(m)
        } else if (!added.has(list.start)) {
          added.add(list.start)
          result.push({
            match: list.text,
            variable: cleanVariable(list.text, this.variableSyntax, true, `shortCircuitFallbacks ${this.callCount}`),
            index: list.start,
            presolved: list.value,
          })
        }
      }
      return result
    })
  }
  /**
   * Populate the given matches, returning an array of Promises which will resolve to the populated
   * values of the given matches
   * @param {MatchResult[]} matches The matches to populate
   * @returns {Promise[]} Promises for the eventual populated values of the given matches
   */
  populateMatches(matches, valueObject, root) {
    // console.log('populateMatches matches', matches)
    return map(matches, (match) => {
      if ('presolved' in match) return Promise.resolve(match.presolved)
      return this.splitAndGet(match.variable, valueObject, root, match.match, match.index)
    })
  }
  /**
   * Render the given matches and their associated results to the given value
   * @param value The value into which to render the given results
   * @param matches The matches on the given value where the results are to be rendered
   * @param results The results that are to be rendered to the given value
   * @returns {*} The populated value with the given results rendered according to the given matches
   */
  renderMatches(valueObject, matches, results) {
    /*
    console.log('valueObject', valueObject)
    console.log('RENDER', matches)
    console.log('RESULTS', results)
    /** */

    /* Attach data to valueObject for parent details */
    if (matches.length === 1) {
      valueObject.currentVarDetails = matches[0]
      valueObject.currentVarDetails.result = results[0]
    }

    // Initialize resolution history if needed
    if (!valueObject.resolutionHistory) {
      valueObject.resolutionHistory = []
      valueObject._historyKeys = new Set()
    }

    let result = valueObject.value
    for (let i = 0; i < matches.length; i += 1) {
      warnIfNotFound(matches[i].variable, results[i], {
        patterns: {
          env: getValueFromEnv.match,
          opt: getValueFromOptions.match,
          self: selfRefSyntax,
          file: fileRefSyntax,
          deep: deepRefSyntax,
          text: textRefSyntax
        },
        debug: DEBUG
      })

      // Extract metadata from result if present
      let actualResult = results[i]
      let resolverType = undefined
      if (isResolutionRecord(results[i])) {
        if (results[i].__internal_metadata) {
          actualResult = results[i].value
          resolverType = results[i].__resolverType
        } else if (results[i].__internal_only_flag) {
          actualResult = results[i]
          resolverType = results[i].__resolverType
        }
      }

      // Extract clean result to avoid circular references
      let cleanResult = actualResult
      if (isResolutionRecord(actualResult)) {
        cleanResult = actualResult.value
      }

      let valueBeforeResolution = result

      if (isResolutionRecord(valueBeforeResolution)) {
        valueBeforeResolution = valueBeforeResolution.value
      }

      const finalResult = decodeEncodedValue(cleanResult)

      // Track this resolution step in history
      const historyEntry = {}

      historyEntry.match = matches[i].match
      historyEntry.variable = matches[i].variable
      if (resolverType) {
        historyEntry.variableType = resolverType
      }
      historyEntry.result = finalResult

      const isDeepResult = typeof finalResult === 'string' && finalResult.match(/^\$\{deep:\d+\}$/)

      if (isDeepResult) {
        historyEntry.resultAfterDeep = 'TBD'
      }

      historyEntry.resultType = typeof finalResult
      if (historyEntry.resultType === 'string' && typeof cleanResult === 'string' && hasEncodedUnknown(cleanResult)) {
        historyEntry.variableType = 'encodedUnknown'
      }
      historyEntry.valueBeforeResolution = valueBeforeResolution
      historyEntry.from = 'renderMatches'
      if (isDeepResult) {
        historyEntry.resultIsDeep = true
      }

      if (finalResult !== cleanResult) {
        historyEntry.resultEncoded = cleanResult
      }
    

    

      // Check if variable has fallback values (comma-separated)
      const variableParts = splitByComma(matches[i].variable)
      if (variableParts.length > 1) {
        historyEntry.hasFallback = true
        historyEntry.valueBeforeFallback = variableParts[0]
        historyEntry.fallbackValues = variableParts.slice(1).map((fallback) => {
          const trimmedFallback = fallback.trim()
          // Check if it's a variable reference
          const isVariable = this.variableSyntaxTest.test(trimmedFallback) || this.variablesKnownTypes.test(trimmedFallback)
          const fallbackData = {
            isVariable: !!isVariable,
            fullMatch: trimmedFallback,
            variable: trimmedFallback,
          }

          // If it's a literal string/number, parse it
          if (!isVariable) {
            // Check if it's a quoted string
            if (/^["'].*["']$/.test(trimmedFallback)) {
              fallbackData.stringValue = trimmedFallback.replace(/^["']|["']$/g, '')
              fallbackData.isResolvedFallback = true
            } else if (/^-?\d+(\.\d+)?$/.test(trimmedFallback)) {
              // It's a number
              fallbackData.numberValue = parseFloat(trimmedFallback)
              fallbackData.isResolvedFallback = true
            } else {
              fallbackData.stringValue = trimmedFallback
              fallbackData.isResolvedFallback = true
            }
          } else {
            // Extract variableType from variable references
            const varTypeMatch = trimmedFallback.match(this.variablesKnownTypes)
            if (varTypeMatch && varTypeMatch[1]) {
              fallbackData.variableType = varTypeMatch[1]
            }
          }

          return fallbackData
        })
      }

      // Only add to history if not a duplicate (same match + variable)
      // Use Set for O(1) lookup instead of O(n) array scan
      const historyKey = `${historyEntry.match}|${historyEntry.variable}`
      if (!valueObject._historyKeys) {
        valueObject._historyKeys = new Set()
      }
      if (!valueObject._historyKeys.has(historyKey)) {
        valueObject._historyKeys.add(historyKey)
        valueObject.resolutionHistory.push(historyEntry)
      }

      // Process the match
      let valueToPop = results[i]
      // TODO refactor this. __internal_only_flag needed to stop clash with sync/async file resolution
      if (isResolutionRecord(results[i])) {
        valueToPop = results[i].value
      }
      // Copies of the same variable text can resolve differently (one inside a fallback
      // list, one not). Then replace only this copy; later passes resolve the others.
      const hasDifferingCopy = matches.some((m, j) => {
        return j !== i && m.match === matches[i].match && !isSameResult(results[j], results[i])
      })
      result = this.populateVariable(valueObject, matches[i].match, valueToPop, matches[i].index, hasDifferingCopy)
      /*
      console.log('> valueToPop', valueToPop)
      console.log('> valueObject', valueObject)
      console.log('populateVariable r', result)
      console.log(this.deep)
      /** */
    }

    // Save resolution history to tracking map for persistence across iterations
    if (valueObject.path && valueObject.path.length) {
      const pathKey = encodePathIdentity(valueObject.path)
      if (!this.resolutionTracking[pathKey]) {
        this.resolutionTracking[pathKey] = {
          path: displayPath(valueObject.path),
          pathSegments: valueObject.path.map(String),
          pathIdentity: pathKey,
          originalPropertyString: valueObject.originalSource,
          resolvedPropertyValue: undefined,
          calls: []
        }
      }
      this.resolutionTracking[pathKey].resolutionHistory = valueObject.resolutionHistory
    }

    return result
  }

  // ######################
  // ## VALUE RESOLUTION ##
  // ######################
  /**
   * Populate the given value, recursively if root is true
   * @param valueObject The value to populate variables within
   * @param root Whether the caller is the root populater and thereby whether to recursively
   * populate
   * @returns {Promise<any>} A promise that resolves to the populated value, recursively if root
   * is true
   */
  populateValue(valueObject, root, caller) {
    if (DEBUG) {
      console.error('─────────────────────────────────────────────▶')
      console.error('>>>>>>>> populateValue', caller)
      console.error(valueObject)
    }
    const property = valueObject.value
    if (this.shouldSkipResolution(valueObject.path, property)) {
      return Promise.resolve(property)
    }
    const matches = this.getMatches(property)
    /*
    console.log('populateValue matches', matches)
    /** */
    if (!isArray(matches)) {
      return Promise.resolve(property)
    }
    let lazyMatches = matches
    return this.shortCircuitFallbacks(matches, valueObject)
      .then((checked) => {
        lazyMatches = checked
        return Promise.all(this.populateMatches(lazyMatches, valueObject, root))
      })
      .then((results) => {
        // console.log('populateMatches results', results)
        return this.renderMatches(valueObject, lazyMatches, results)
      })
      .then((result) => {
        // console.log('renderMatches result', result)
        if (root && isArray(matches)) {
          return this.populateValue({
            value: result.value,
            resolutionHistory: result.resolutionHistory || valueObject.resolutionHistory || []
          }, root, 'self populateValue')
        }
        return result
      })
  }
  /**
   * Populate variables in the given property.
   * @param propertyToPopulate The property to populate (replace variables with their values).
   * @returns {Promise.<TResult>|*} A promise resolving to the populated result.
   */

  // populateProperty(propertyToPopulate) {
  //   console.log('propertyToPopulate', propertyToPopulate)
  //   return this.initialCall(() => this.populateValue({value: propertyToPopulate}, true))
  // }

  /**
   * Split the cleaned variable string containing one or more comma delimited variables and get a
   * final value for the entirety of the string
   * @param variable The variable string to split and get a final value for
   * @param property The original property string the given variable was extracted from
   * @param {number} [matchIndex] Where originalVar starts in the property value
   * @returns {Promise} A promise resolving to the final value of the given variable
   */
  splitAndGet(variable, valueObject, root, originalVar, matchIndex) {
    if (DEBUG) {
      console.error('>>>>>>>> Split and Get', variable)
      console.error('valueObject', valueObject)
      console.error('root', root)
    }
    /* requires node 8.11+
    if (valueObject.value.match(innerFunctionPattern)) {
      // valueObject.value = valueObject.value.replace(/(?<!^)> function /, '')
      // valueObject.value = valueObject.value.replace(/^> function /, '')
      // valueObject.value = `> function ${valueObject.value}`
    }*/

    const parts = splitByComma(variable, this.variableSyntax)
    if (DEBUG) {
      console.error('splitAndGet parts', parts)
      console.error('splitAndGet parts variable:', variable)
      console.error('splitAndGet parts originalVar:', originalVar)
      console.error('splitAndGet parts current valueObject:', valueObject)
      console.error('splitAndGet All parts:', parts)
      console.error('-----')
    }
    if (parts.length <= 1) {
      return this.getValueFromSource(parts[0], valueObject, 'splitAndGet', originalVar, matchIndex)
    }
    // More than 2 parts, so we need to overwrite
    return this.overwrite(parts, valueObject, originalVar, matchIndex)
  }
  /**
   * Populate a given property, given the matched string to replace and the value to replace the
   * matched string with.
   * @param {object} valueObject The value object containing the property to populate
   * @param {any} valueObject.value The property to replace the matched string with the value.
   * @param {string[]} [valueObject.path] The path to the value in the config.
   * @param {string} [valueObject.originalSource] The original source string.
   * @param {string} [valueObject.originalValuePath] Ancestor where a container was expanded.
   * @param {Array} [valueObject.resolutionHistory] History of resolution steps.
   * @param matchedString The string in the given property that was matched and is to be replaced.
   * @param valueToPopulate The value to replace the given matched string in the property with.
   * @param {number} [matchIndex] Where matchedString starts in the property
   * @param {boolean} [onlyThisCopy] Replace only the copy at matchIndex instead of every copy
   * @returns {{value: any, path?: string[], originalSource?: string, resolutionHistory?: Array, __internal_only_flag?: boolean, caller?: string, count?: number}} The populated property object
   */
  populateVariable(valueObject, matchedString, valueToPopulate, matchIndex, onlyThisCopy) {
    let property = valueObject.value
    /**
     * Replace every copy of the matched text, or only the copy at matchIndex
     * @param {string} replaceThis - Text to replace
     * @param {string} withThis - Replacement text
     * @param {string} inThis - Text to replace within
     * @returns {string} Text with the replacement made
     */
    const replaceMatch = (replaceThis, withThis, inThis) => {
      const isAtIndex = onlyThisCopy && typeof matchIndex === 'number' &&
        replaceThis === matchedString &&
        inThis.slice(matchIndex, matchIndex + replaceThis.length) === replaceThis
      if (!isAtIndex) return replaceAll(replaceThis, withThis, inThis)
      return inThis.slice(0, matchIndex) + withThis + inThis.slice(matchIndex + replaceThis.length)
    }
    /**
     * Whether the match at matchIndex is a whole fallback item of the variable around it
     * (${env:X, ${self:y}}), not the start of a longer item (${env:X, ${self:y}-z}) where a
     * whole-value token would be glued to the rest of the text and never decoded
     * @returns {boolean}
     */
    const isFallbackItemHere = () => {
      if (typeof matchIndex !== 'number' || property.slice(matchIndex, matchIndex + matchedString.length) !== matchedString) return false
      const parent = findParentVariable(property, matchedString, this.varPrefix, this.varSuffix, matchIndex)
      return !!parent && isWholeFallbackItem(parent.text, matchedString, this.varPrefix, this.varSuffix)
    }
    /**
     * Whether the match at matchIndex starts a fallback item without being all of it
     * (${env:X, ${self:y}-z}): its value is composed into the item's text
     * @returns {boolean}
     */
    const isPartOfFallbackItemHere = () => {
      if (typeof matchIndex !== 'number' || property.slice(matchIndex, matchIndex + matchedString.length) !== matchedString) return false
      const parent = findParentVariable(property, matchedString, this.varPrefix, this.varSuffix, matchIndex)
      return !!parent && isFallbackSlot(parent.text, matchedString, this.varPrefix, this.varSuffix) &&
        !isWholeFallbackItem(parent.text, matchedString, this.varPrefix, this.varSuffix)
    }
    /**
     * Whether the match is an argument of an eval()/if() expression directly around it, where values
     * are quoted and booleans stay bare. An if() elsewhere in the property (${env:X, ${if(...)}}) doesn't count
     * @returns {boolean}
     */
    const parentIsEvalOrIf = () => {
      if (typeof property !== 'string') return false
      if (typeof matchIndex !== 'number' || property.slice(matchIndex, matchIndex + matchedString.length) !== matchedString) {
        return evalIfPattern.test(property)
      }
      const parent = findParentVariable(property, matchedString, this.varPrefix, this.varSuffix, matchIndex)
      return !!parent && /^\s*(?:eval|if)\s*\(/.test(parent.text.slice(this.varPrefix.length))
    }
    /**
     * Put a fallback item's value in as one encoded token, decoded when that fallback wins, so nothing
     * in it (| , quotes, edge whitespace, a numeric or boolean look) is re-read as syntax. The token
     * belongs to this copy only; other copies of the match get `plain`.
     * @param {any} value - The resolved value
     * @param {string} plain - Text for the other copies
     * @returns {string} The property with the token in place
     */
    const withFallbackToken = (value, plain) => {
      const at = /** @type {number} */ (matchIndex)
      /** @param {string} text */
      const others = (text) => onlyThisCopy ? text : replaceAll(matchedString, plain, text)
      return others(property.slice(0, at)) + encodeJsonForVariable(value) + others(property.slice(at + matchedString.length))
    }
    // console.log('init property', property)

    if (DEBUG) {
      console.error('────────START populateVar──────────────')
      console.error('populateVariable: valueObject', valueObject)
      console.error('populateVariable: valueToPopulate', valueToPopulate)
      console.error('populateVariable: typeof valueToPopulate', typeof valueToPopulate)
      console.error(`populateVariable: path "${valueObject.path}"`)
      console.error(`populateVariable: value \`${valueObject.value}\``)
      console.error(`populateVariable: originalSource \`${valueObject.originalSource}\``)
      console.error('populateVariable: property', property)
      console.error('populateVariable: matchedString', matchedString)
      if (valueObject.resolutionHistory && valueObject.resolutionHistory.length > 0) {
        console.error('populateVariable: resolutionHistory', JSON.stringify(valueObject.resolutionHistory, null, 2))
      }
    }

    const originalSrc = (!valueObject.originalValuePath && typeof valueObject.originalSource === 'string') ? valueObject.originalSource : ''
    const originalSyntax=scanExpression(originalSrc,{prefix:this.varPrefix,suffix:this.varSuffix})
    const originalRoot=expressionReferences(originalSyntax).find(n=>n.complete&&n.raw.trim()===originalSrc.trim())
    const ownFilters=originalRoot?originalSyntax.nodes.filter(n=>n.parentId===originalRoot.id&&n.kind==='Filter'):[]
    const hasFilters=ownFilters.length>0
    let foundFilters=ownFilters.map(n=>n.raw.trim()).filter(Boolean)
    // console.log('foundFilters', foundFilters)

    // total replacement
    if (property === matchedString) {
      if (DEBUG_TYPE) console.error('DEBUG_TYPE total replacement')
      const v = valueObject.value || ''
      property = valueToPopulate
      // console.log('hasFilters', hasFilters)
      // console.log('valueToPopulate', valueToPopulate)
      /* Check resolution history for parent details */
      if (valueObject.resolutionHistory && valueObject.resolutionHistory.length) {
        const currentDetails = valueObject.resolutionHistory[valueObject.resolutionHistory.length - 1]
        
        // get 2nd to last item in resolution history
        const parentDetails = valueObject.resolutionHistory[valueObject.resolutionHistory.length - 2]
        /*
        console.log('currentDetails', currentDetails)
        console.log('parentDetails', parentDetails)
        /** */

        /* Convert a fallback number to string, unless a filter made it a number (${a, env:N | toNumber}) */
        const hasFilters = splitOnPipe(cleanVariable(matchedString, this.variableSyntax, true, 'populateVariable filters')).length > 1
        if (currentDetails && !hasFilters &&
          currentDetails.resultType === 'number' && 
          parentDetails && parentDetails.resultType === 'string' && 
          parentDetails.result.match(/^\d+$/) && parentDetails.variableType === 'env'
        ) {
          if (Number(parentDetails.result) === currentDetails.result) {
            property = String(valueToPopulate)
          }
        }

      }

      // Preserve a new deep reference: its private origin belongs to the newly
      // selected value. Expanding the previous deep source loses that provenance.
    // partial replacement, string
    } else if (isString(valueToPopulate)) {
      if (DEBUG_TYPE) console.error('DEBUG_TYPE isString')
      // if (property.match(/^> function /g)) {
      //
      //   const innerFunc = /> function (\w+)\s*\(((?:[^()]+)*)?\s*\)\s*/
      //   const match = property.match(innerFunc)
      //   const rep = (match) ? match[0].replace(/> function /, '') : property
      //   console.log('REPLACE', property)
      //   console.log('xxxx', rep)
      //   console.log('valueToPopulate', valueToPopulate)
      // }

      let currentMatchedString = matchedString
      /* Address fall through values if found */
      if (hasEncodedUnknown(valueToPopulate)) {
        const decoded = decodeUnknown(valueToPopulate)
        if (decoded === property) {
          currentMatchedString = valueObject.value
        }
      }
      /*
      console.log('>------')
      console.log('isString og matchedString', matchedString)
      console.log('isString replaceThis: matchedString', currentMatchedString)
      console.log('isString withThis: valueToPopulate', valueToPopulate)
      console.log('isString decode:', decodeUnknown(valueToPopulate))
      console.log('isString inThis: property', property)
      console.log('isString currentMatchedString', currentMatchedString)
      console.log('>------')
      /** */

      // For eval/if expressions, string values need quotes unless already quoted
      // BUT don't quote strings that contain variable refs (they need further resolution)
      if (parentIsEvalOrIf() && !this.variableSyntaxTest.test(valueToPopulate)) {
        const matchIdx = property.indexOf(currentMatchedString)
        const charBefore = matchIdx > 0 ? property[matchIdx - 1] : ''
        // Always escape quotes in values for eval/if context
        valueToPopulate = valueToPopulate.replace(/"/g, '\\"')
        if (charBefore !== '"' && charBefore !== "'") {
          // Not already quoted, wrap in quotes for eval
          valueToPopulate = `"${valueToPopulate}"`
        }
      }
      // Encode a fully-resolved string arg to a filter/function call so its own commas/quotes survive arg
      // parsing. Skip values that are still a DEFERRED representation — a variable/deep placeholder
      // (${deep:N}, an object arg mid-resolution) or a `> function` marker (a nested function not yet run).
      // Encoding those would wrap the eventual value in a ResolvedFilterArg / preserve the `> function`
      // prefix and leak it into the outer call's result.
      // A nested function call (${split(...)} as an argument of join(...)) resolves to its own call
      // text, run later with the outer call; it must stay a call, not become a quoted string.
      const deferredCall = funcRegex.exec(valueToPopulate)
      const isDeferredCall = !!deferredCall &&
        !!(this.functions[deferredCall[1]] || this.functions[deferredCall[1].toLowerCase()]) &&
        currentMatchedString.trim() === `${this.varPrefix}${valueToPopulate}${this.varSuffix}`
      if (
        isNestedCallArgument(property, currentMatchedString, this._callArgNames, this.varPrefix, this.varSuffix) &&
        !this.variableSyntaxTest.test(valueToPopulate) &&
        !valueToPopulate.match(deepRefSyntax) &&
        !valueToPopulate.match(functionPrefixPattern) &&
        !isDeferredCall
      ) {
        valueToPopulate = encodeFilterArg(valueToPopulate)
      }
      // A finished fallback item goes in whole as a token. Elsewhere inside another variable the value's
      // own { } $ are plain text: encode them so they can't end or break that variable. They are
      // decoded when that variable's text becomes a value.
      if (currentMatchedString === matchedString && isFallbackItemHere() && !this.variableSyntaxTest.test(valueToPopulate)) {
        property = withFallbackToken(valueToPopulate, valueToPopulate)
      } else {
        if (currentMatchedString === matchedString && typeof matchIndex === 'number') {
          const enclosing = findEnclosingVariable(property, matchedString, this.varPrefix, this.varSuffix, matchIndex)
          if (enclosing && enclosing !== matchedString) {
            const parent = findParentVariable(property, matchedString, this.varPrefix, this.varSuffix, matchIndex)
            valueToPopulate = encodeStrayVariableChars(valueToPopulate, this.varPrefix, this.varSuffix, {
              commas: isFallbackSlot(enclosing, matchedString, this.varPrefix, this.varSuffix),
              // A key pasted into a path (${self:map.${opt:k}}) is one key, whatever it holds
              path: !!parent && !this.variableSyntaxTest.test(valueToPopulate) &&
                isPathSlot(parent.text, matchedString, this.varPrefix, this.varSuffix),
            })
          }
        }
        property = replaceMatch(currentMatchedString, valueToPopulate, property)
      }
      // console.log('property replaceAll', property)

      // if (property.match(/^> function /g)) {
      //   console.log('REPLACE after', property)
      // }

    // partial replacement, number
    } else if (isNumber(valueToPopulate)) {
      if (DEBUG_TYPE) console.error('DEBUG_TYPE isNumber')
      const replacementValue = (isNestedFilterArgument(property, matchedString, this.varPrefix, this.varSuffix) || isNestedCallArgument(property, matchedString, this._callArgNames, this.varPrefix, this.varSuffix))
        ? encodeFilterArg(valueToPopulate)
        : String(valueToPopulate)
      property = replaceMatch(matchedString, replacementValue, property)
      // TODO This was temp fix for array value mismatch from filters. This fixes filterInner: ${commas | split(${self:inner}, 2) }
      // } else if (isArray(valueToPopulate) && valueToPopulate.length === 1) {
      //  property = replaceAll(matchedString, String(valueToPopulate[0]), property)
    } else if (isObject(valueToPopulate)) {
      if (DEBUG_TYPE) console.error('DEBUG_TYPE isObject')

      // For eval/if expressions, encode objects to avoid {} breaking variable syntax
      const isEvalOrIf = parentIsEvalOrIf()
      if (isEvalOrIf) {
        const encoded = encodeValueForEval(valueToPopulate)
        property = replaceMatch(matchedString, encoded, property)
      } else {
        // A Date composed into text reads as its ISO timestamp, not a quoted JSON string
        const objStr = (valueToPopulate instanceof Date) ? valueToPopulate.toISOString() : JSON.stringify(valueToPopulate)
        /* Check if variable inside another variable. E.g. ${env:${self:someObject}} that resolves to ${env:{...}} */
        const enclosingVar = (typeof matchIndex === 'number')
          ? findEnclosingVariable(property, matchedString, this.varPrefix, this.varSuffix, matchIndex)
          : null
        const isNestedInVariable = enclosingVar ? enclosingVar !== matchedString : (
          property.trim() !== matchedString.trim() &&
          property.indexOf(matchedString) !== -1 &&
          this.variableSyntaxTest.test(matchedString) &&
          this.variableSyntaxTest.test(property)
        )
        // Only encode for file() or text() references where JSON braces break regex matching,
        // or for a fallback item (${opt:x, ${self:obj}}), decoded when that fallback wins
        const isFileOrTextRef = /\bfile\s*\(|\btext\s*\(/.test(property)
        const isFallbackItem = isNestedInVariable &&
          isInFallbackSlot(property, matchedString, matchIndex, this.varPrefix, this.varSuffix)
        if ((isNestedFilterArgument(property, matchedString, this.varPrefix, this.varSuffix) || isNestedCallArgument(property, matchedString, this._callArgNames, this.varPrefix, this.varSuffix))) {
          property = replaceMatch(matchedString, encodeFilterArg(valueToPopulate), property)
        } else if (isNestedInVariable && (isFileOrTextRef || isFallbackItem)) {
          // Encode object as base64 to avoid breaking variable syntax with nested braces.
          // Dates are tagged so they come back as Dates when decoded
          const encodedObj = encodeJsonForVariable(tagDates(valueToPopulate))
          property = replaceMatch(matchedString, encodedObj, property)
        } else if (isNestedInVariable) {
          const isVar = /^\${[a-zA-Z0-9_]+:/.test(property)
          if (isVar) {
            throw new Error(
              `Invalid variable syntax "${property}" resolves to "${replaceAll(matchedString, objStr, property)}"`,
            )
          }
          property = replaceMatch(matchedString, objStr, property)
        } else {
          // console.log('OBJECT MATCH', `"${objStr}"`)
          property = replaceMatch(matchedString, objStr, property)
        }
      }
      // console.log('property', property)
      // TODO run functions here
      // console.log('other new prop', property)

    // partial replacement, boolean fallback item: keep it a boolean until its fallback list picks a winner
    } else if (typeof valueToPopulate === 'boolean' && isFallbackItemHere()) {
      if (DEBUG_TYPE) console.error('DEBUG_TYPE isBoolean fallback item')
      property = withFallbackToken(valueToPopulate, String(valueToPopulate))

    // partial replacement, boolean (eval/if keeps the bare true/false; a compose gets the stringified value)
    } else if (typeof valueToPopulate === 'boolean' && (parentIsEvalOrIf() || isPartOfFallbackItemHere() ||
      !isInsideOuterVariable(property, matchedString, this.varPrefix, this.varSuffix))) {
      // A boolean composed into literal text or a filter arg is stringified (flag=${b} -> "flag=true"), and
      // eval/if get the bare true/false. But when the match sits INSIDE an outer ${...} that is NOT eval/if
      // (a fallback like ${env:X, ${self:flag}}), leave it to the fallback handler below so the boolean's
      // TYPE is preserved once that fallback is selected.
      if (DEBUG_TYPE) console.error('DEBUG_TYPE isBoolean')
      const replacementValue = (isNestedFilterArgument(property, matchedString, this.varPrefix, this.varSuffix) || isNestedCallArgument(property, matchedString, this._callArgNames, this.varPrefix, this.varSuffix))
        ? encodeFilterArg(valueToPopulate)
        : String(valueToPopulate)
      property = replaceMatch(matchedString, replacementValue, property)

    // partial replacement, null inside eval/if expressions
    } else if (valueToPopulate === null && parentIsEvalOrIf()) {
      if (DEBUG_TYPE) console.error('DEBUG_TYPE isNull in eval/if')
      property = replaceMatch(matchedString, '__NULL__', property)

    } else {
      if (DEBUG_TYPE) console.error('DEBUG_TYPE else')
      let missingValue = matchedString

      if (matchedString.match(deepRefSyntax)) {
        const deepIndex = matchedString.split(':')[1].replace(this.varSuffixPattern, '')
        const i = Number(deepIndex)
        missingValue = this.deep[i]
      }

      // The fallback list belongs to the variable directly around this match, not to other
      // variables or literal text around it (${a} ${opt:x, ${self:nope}, 'z'}), nor to an
      // outer variable further up (${env:A, ${env:C, ${env:D}, ${self:v}}}).
      const parentVar = (typeof property === 'string' && typeof matchIndex === 'number')
        ? findParentVariable(property, matchedString, this.varPrefix, this.varSuffix, matchIndex)
        : null
      const enclosingVar = parentVar ? parentVar.text : null
      const isPartOfProperty = !!enclosingVar && enclosingVar !== property
      /**
       * Put the enclosing variable's next fallback in place of that variable, keeping
       * the text around it
       * @param {any} fallback - The fallback value or variable string
       * @returns {any} The property with the fallback in place
       */
      const withFallback = (fallback) => {
        if (!isPartOfProperty || !parentVar) return fallback
        return property.slice(0, parentVar.start) + String(fallback) + property.slice(parentVar.start + parentVar.text.length)
      }

      // A missing fallback item drops out of its list; the items before it and any filters
      // after the list stay (${a, ${b} | Number} -> ${a | Number}). A list always keeps its first item.
      if (parentVar && typeof matchIndex === 'number' && isFallbackSlot(parentVar.text, matchedString, this.varPrefix, this.varSuffix)) {
        const at = matchIndex - parentVar.start
        const before = parentVar.text.slice(0, at).trimEnd()
        const after = parentVar.text.slice(at + matchedString.length)
        if (before.endsWith(',')) {
          const rebuilt = before.slice(0, -1) + after
          return resolutionRecord({
            value: property.slice(0, parentVar.start) + rebuilt + property.slice(parentVar.start + parentVar.text.length),
            path: valueObject.path,
            originalSource: valueObject.originalSource,
            resolutionHistory: valueObject.resolutionHistory || [],
            __internal_only_flag: true,
            caller: 'missingFallbackItem',
          })
        }
      }

      const cleanVar = cleanVariable(
        isPartOfProperty ? enclosingVar : property,
        this.variableSyntax,
        true,
        `populateVariable fallback ${this.callCount}`
      )
      const cleanVarNoFilters = splitOnPipe(cleanVar)[0]
      const splitVars = splitByComma(cleanVarNoFilters)
      const nestedVar = findNestedVariable(splitVars, valueObject.originalSource)

      if (nestedVar) {
        const fallbackStr = getFallbackString(splitVars, nestedVar)
        if (!this.isUnknownTypeAllowed(nestedVar)) {
          verifyVariable(nestedVar, valueObject, this.variableTypes, this.config)
        }

        return resolutionRecord({
          value: withFallback(fallbackStr),
          path: valueObject.path,
          originalSource: valueObject.originalSource,
          resolutionHistory: valueObject.resolutionHistory || [],
          // set __internal_only_flag to note this is object we make not a resolved value
          __internal_only_flag: true,
          caller: 'nestedVar',
        })
      }

      // If allowUnresolvedVariables and there are fallbacks, use the fallback
      if (this.settings.allowUnresolvedVariables && splitVars.length > 1) {
        const nextFallback = splitVars[1].trim()
        // Strip trailing variable suffix (handles }, }}, >, ]], etc.)
        const nextFallbackClean = nextFallback.replace(this.varSuffixPattern, '')
        const isQuotedString = /^['"].*['"]$/.test(nextFallbackClean)
        const isNumeric = /^-?\d+(\.\d+)?$/.test(nextFallbackClean)
        if (isQuotedString || isNumeric) {
          const strValue = nextFallbackClean.replace(/^['"]|['"]$/g, '')
          // Convert to number if it's a numeric fallback
          /** @type {string|number} */
          const staticValue = isNumeric ? Number(strValue) : strValue
          return {
            value: withFallback(staticValue),
            path: valueObject.path,
            originalSource: valueObject.originalSource,
            resolutionHistory: valueObject.resolutionHistory || [],
          }
        }
        // Next fallback is another variable
        const remainingContent = splitVars.slice(1).join(', ').replace(this.varSuffixPattern, '')
        const remainingFallbacks = this.varPrefix + remainingContent + this.varSuffix
        return resolutionRecord({
          value: withFallback(remainingFallbacks),
          path: valueObject.path,
          originalSource: valueObject.originalSource,
          resolutionHistory: valueObject.resolutionHistory || [],
          __internal_only_flag: true,
          caller: 'allowUnresolvedVariables-fallback',
        })
      }

      const currentPath = displayPath(valueObject.path)

      const errorMessage = `
Missing Value ${missingValue} - ${matchedString}
\nMake sure the property is being passed in correctly
\nFor variable:
\n${currentPath}: ${valueObject.originalSource}
`
      throw new Error(errorMessage)
    }

    if (property && typeof property === 'string') {
      // console.log('property', property)
      let prop = cleanVariable(
        property, 
        this.variableSyntax, 
        true, 
        `populateVariable string ${this.callCount}`,
        // true // recursive
      )
      
      // Double processing needed for `${eval(${self:three} > ${self:four})}`
      if (prop.startsWith(this.varPrefix)) {
        prop = cleanVariable(prop, this.variableSyntax, true, `populateVariable string ${this.callCount}`)
      }
      
      // console.log('prop', prop)
      if (property.match(functionPrefixPattern) && prop) {
        // console.log('func prop', property)
        // console.log('Prop', prop)
      }
      const func = funcRegex.exec(property)
      // console.log('func', func)
      if (func && property.match(functionPrefixPattern)) {
        /* IMPORTANT fix `finalProp` for nested function reference
          nestedOne: 'hi'
          nestedTwo: ${merge('nice', 'wow')}
          mergeNested: ${merge('lol', ${nestedTwo})}
        */
        const finalProp = property.match(innerFunctionPattern) ? prop : property

        return {
          value: finalProp, // prop to fix nested ¯\_(ツ)_/¯
          path: valueObject.path,
          originalSource: valueObject.originalSource,
          resolutionHistory: valueObject.resolutionHistory || [],
          // set __internal_only_flag to note this is object we make not a resolved value
          // __internal_only_flag: true
        }
      }
      // TODO fix this ref
      // ${file(../async.js, lol hi there, ${self:normalKey})}
      // ^ passes through and matches file ref

      /* check for git:remote('whatever'). Sub functions that clash
      let funcNameHasColon = false
      if (func) {
        const subFunction = subFunctionRegex.exec(property)
        console.log('subFunction', subFunction)
        if (subFunction) {
          funcNameHasColon = true
        }
      }
      */

      if (
        /* Not another variable reference */
        !this.variableSyntaxTest.test(prop)
        &&
        /* Not file or text refs */
        !prop.match(fileRefSyntax)
        && !prop.match(textRefSyntax)
        /* Not eval/if refs */
        && !prop.match(getValueFromEval.match)
        && !prop.match(getValueFromIf.match)
        // AND is not multiline value
        && (func && prop.split('\n').length < 3)
        // Only tag as function if the function name is actually registered
        // Prevents resolved values like git messages "fix(scope)" from being treated as functions
        && (func[1] && (this.functions[func[1]] || this.functions[func[1].toLowerCase()]))) {
        // console.log('IS FUNCTION')
        /* if matches function signature like ${merge('foo', 'bar')}
          rewrite the variable to run the function after inputs resolved
        */
        const rep = property.replace(functionPrefixPattern, '')
        // The function runs in the final pass, which applies any filters to its RESULT. Rebuild the string
        // as the bare call plus this value's filters (from foundFilters) so the final pass can find and
        // apply them — a filter stripped during resolution (e.g. md5's) would otherwise be lost.
        const repFn = splitOnPipe(rep)[0].trim()
        const filterSuffix = (foundFilters && foundFilters.length)
          ? ' ' + foundFilters.map((f) => `| ${f}`).join(' ')
          : ''
        property = `${FUNCTION_MARKER}${repFn}${filterSuffix}`
      }
      // if (prop.match(/\s\|/)) {
      //   console.log('HAS FILTER')
      //   const rep = property.replace(/FILTERSTART\|/g, '')
      //   const newer = rep.replace('|', 'FILTERSTART|')
      //   property = newer
      // }
    }

    // console.log('foundFilters', foundFilters)

    let runFilters = false
    if (typeof valueToPopulate === 'number' && foundFilters.length && !this.variableSyntaxTest.test(property)) {
      // The !variableSyntaxTest guard (mirroring the string branch) stops a number being substituted as a
      // nested filter ARGUMENT (`${self:a | trunc(${n})}`, n a number) from running the filter on the still
      // unresolved property `${self:a | trunc(...)}` before `self:a` resolves.
      runFilters = true
    } else if (
      typeof valueToPopulate === 'string' &&
      !valueToPopulate.match(deepRefSyntax) &&
      foundFilters.length &&
      !this.variableSyntaxTest.test(property)
    ) {
      runFilters = true
    }
    // A function call defers to the final pass, which runs the function and applies the filters to its
    // RESULT. Applying them here would run the filter on the `> function name(args)` expression text
    // (e.g. uppercasing md5('hello') into MD5('HELLO')), corrupting the call and dropping the filter.
    if (typeof property === 'string' && property.match(functionPrefixPattern)) {
      runFilters = false
    }
    /* Apply filters if found */
    //console.log('> property', property)
    if (runFilters) {
      // If filter cache exists we need to remove filter that have already been run
      if (this.filterCache[encodePathIdentity(valueObject.path || [])]) {
        foundFilters = foundFilters.filter((filter) => {
          return !this.filterCache[encodePathIdentity(valueObject.path || [])].includes(filterCacheKey(filter, this.config))
        })
      }
      property = this.applyFilters(property, foundFilters, valueObject.path)
      // console.log('NEW PROPERTY', property)
      // console.log('typeof property', typeof property)
    }
    // console.log('filterCache', this.filterCache)
    // console.log('XXXX property', typeof property)
    // console.log('XXXX path', valueObject.path)
    // console.log('XXXX originalSource', valueObject.originalSource)
    // console.log('end property', property)
    return resolutionRecord({
      value: property,
      path: valueObject.path,
      originalSource: valueObject.originalSource,
      resolutionHistory: valueObject.resolutionHistory || [],
      __internal_only_flag: true, // set __internal_only_flag to note this is object we make not a resolved value
      caller: 'end',
      count: this.callCount,
    })
  }
  /**
   * Run filters on a value and record them in the path's filter cache so the same
   * filters are not run again on the populated value
   * @param {any} value - The value to filter
   * @param {string[]} filters - Filter expressions, e.g. ['toUpperCase', "split(',')"]
   * @param {string[]} [pathValue] - Config path the value belongs to
   * @returns {any} The filtered value
   */
  applyFilters(value, filters, pathValue) {
    if (isPassthrough(value)) {
      // An unknown type (${ssm:x}, ${cf:x}) gets its value later, outside configorama, so a filter
      // here would run on the wrong text: an error. A known type left unresolved
      // (allowUnresolvedVariables) has no value to filter yet: the filter is skipped
      const kept = findUnknownValues(value).map(({ value: b64 }) => Buffer.from(b64, 'base64').toString('utf8'))
      const resolvedLater = kept.filter((v) => this.isUnknownTypeAllowed(v))
      if (!resolvedLater.length) return value
      const names = filters.map((f) => parseFilter(f, this.config).name).join(', ')
      const at = pathValue ? ` at "${[].concat(pathValue).join('.')}"` : ''
      throw new Error(`Filter ${names} can't run on "${decodeUnknown(value)}"${at}: it still holds ` +
        `${resolvedLater.join(', ')}, which is resolved later, outside configorama. ` +
        'Remove the filter or give that variable a value first.')
    }
    const filtered = filters.reduce((acc, filter) => {
      const { name, args } = parseFilter(filter, this.config)
      if (typeof this.filters[name] !== 'function') throw new Error(`Filter "${name}" not found`)
      const newVal = args && args.length > 0
        ? this.filters[name](acc, ...args)
        : this.filters[name](acc)
      // console.log('PROPERTY', newVal)
      return newVal
    }, value)
    const cacheKey = encodePathIdentity(pathValue || [])
    this.filterCache[cacheKey] = (this.filterCache[cacheKey] || []).concat(filters.map((f) => filterCacheKey(f, this.config)))
    return filtered
  }
  // ###############
  // ## VARIABLES ##
  // ###############
  /**
   * Resolve the given variable string that expresses a series of fallback values in case the
   * initial values are not valid, resolving each variable and resolving to the first valid value.
   * @param variableStrings The overwrite string of variables to populate and choose from.
   * @param valueObject The value object
   * @param originalVar The original variable string
   * @param {number} [matchIndex] Where originalVar starts in valueObject.value
   * @returns {Promise<any>} A promise resolving to the first validly populating variable
   *  in the given variable strings string.
   */
  overwrite(variableStrings, valueObject, originalVar, matchIndex) {
    const propertyString = valueObject.value
    /*
    console.log('overwrite variableStrings', variableStrings)
    console.log('overwrite valueObject', valueObject)
    console.log('overwrite originalVar', originalVar)
    // process.exit(1)
    /** */

    // Filters written after the last fallback (${a, 'b' | f}) apply to whichever value wins,
    // so resolve the last item without them and apply them to the winner below
    const lastIndex = variableStrings.length - 1
    const [lastValue, ...trailingFilters] = splitOnPipe(variableStrings[lastIndex])
    if (trailingFilters.length) {
      variableStrings = variableStrings.slice(0, lastIndex).concat(lastValue.trim())
    }

    if (variableStrings.length === 2) {
      const firstValue = variableStrings[0]
      const secondValue = variableStrings[1]
      if (
        isString(firstValue) && firstValue.match(this.variablesKnownTypes) 
        && isString(secondValue) && !secondValue.match(this.variablesKnownTypes) && !this.variableSyntaxTest.test(secondValue)
      ) {
        if (!isSurroundedByQuotes(secondValue) && !/^-?\d+(\.\d+)?$/.test(secondValue) && !startsWithQuotedPipe(secondValue)) {
          variableStrings = [firstValue, ensureQuote(secondValue)]
        }
        // console.log('new overwrite variableStrings', variableStrings)
      }
    }

    // console.log('propertyString', typeof propertyString)
    /**
     * Resolve one item of the list
     * @param {any} variableString
     * @returns {Promise<any>}
     */
    const resolveItem = (variableString) => {
      // An item already resolved and encoded into this list (a fallback value) is its value
      if (isString(variableString) && isEncodedJson(variableString.trim())) return Promise.resolve(variableString.trim())
      // This runs on nested variable resolution
      return this.getValueFromSource(variableString, valueObject, 'overwrite', originalVar, matchIndex)
    }
    /**
     * Resolve items in order and stop at the first real value, or at one that is still a variable
     * (resolved in a later pass): a fallback only runs, or fails, when everything before it came up
     * empty. Items not reached stay undefined.
     * @param {number} index
     * @param {any[]} values
     * @returns {Promise<any[]>}
     */
    const resolveInOrder = (index, values) => {
      if (index >= variableStrings.length) return Promise.resolve(values)
      return resolveItem(variableStrings[index]).then((value) => {
        values[index] = value
        const plain = (isResolutionRecord(value)) ? value.value : value
        if (isValidValue(plain) || (isString(plain) && this.variableSyntaxTest.test(plain))) { this.recordFallbackSelection(valueObject, originalVar, index, variableStrings.length); return values }
        return resolveInOrder(index + 1, values)
      })
    }

    return resolveInOrder(0, new Array(variableStrings.length).fill(undefined)).then((values) => {
      let deepProperties = 0
      // console.log('overwrite values', valuesToUse)
      // Extract actual values from metadata objects
      const extractedValues = values.map((value) => {
        if (isResolutionRecord(value)) {
          return value.value
        }
        return value
      })

      // Build deep variable parts for reconstruction
      const deepVariableParts = variableStrings.slice()

      extractedValues.forEach((value, index) => {
        // console.log('───────────────────────────────> value', value)
        if (isString(value) && this.variableSyntaxTest.test(value)) {
          deepProperties += 1
          // console.log('makeDeepVariable overwrite', value)
          const deepVariable = this.makeDeepVariable(value, 'via overwrite', isResolutionRecord(values[index]) ? values[index].sourceOrigin : valueObject.nextOrigin || valueObject.origin)
          // console.log('deepVariable', deepVariable)
          const newValue = cleanVariable(deepVariable, this.variableSyntax, true, `overwrite ${this.callCount}`)
          // console.log(`overwrite newValue ${variableStrings[index]}`, newValue)
          // Store the deep ref for this part
          deepVariableParts[index] = newValue
        }
      })

      if (deepProperties > 0) {
        // Reconstruct a minimal variable string with deep refs, not the full outer string
        const filterSuffix = trailingFilters.map((f) => ` | ${f.trim()}`).join('')
        const reconstructed = this.varPrefix + deepVariableParts.join(', ') + filterSuffix + this.varSuffix
        return Promise.resolve(reconstructed)
      }
      // First valid value, else undefined. A fallback value arrives encoded; decode it back. An item kept
      // unresolved (allowUnresolvedVariables) is a value too: it is left for a later resolver
      const winner = reviveDates(parseEncodedJson(extractedValues.find(isValidValue)))
      if (winner === undefined || !trailingFilters.length) return Promise.resolve(winner)
      return Promise.resolve(this.applyFilters(winner, trailingFilters.map((f) => f.trim()), valueObject.path))
    })
  }

  // ####################
  // ## SOURCE GETTERS ##
  // ####################
  /**
   * Given any variable string, return the value it should be populated with.
   * @param variableString The variable string to retrieve a value for.
   * @param valueObject The value object
   * @param caller The caller name
   * @param originalVar The original variable string
   * @param {number} [matchIndex] Where originalVar starts in valueObject.value
   * @returns {Promise<any>} A promise resolving to the given variables value.
   */
  getValueFromSource(variableString, valueObject, caller, originalVar, matchIndex) {
    // console.log('getValueFromSrc caller', caller)
    const propertyString = valueObject.value
    const pathValue = valueObject.path
    // Keep display labels separate from cache/dependency identity.
    const pathJoined = pathValue && pathValue.length ? displayPath(pathValue) : null
    const pathIdentity = encodePathIdentity(pathValue || [])
    const origin=valueObject.origin || originAt(this.loadContext,pathValue,this.configFilePath)
    const requestIdentity=origin.authoredFile?JSON.stringify([origin.authoredFile,variableString]):variableString
    const reuseTracked = (key) => this.tracker.get(key, propertyString).then((record) => {
      this.budget.check()
      if (isResolutionRecord(record) && record.appliedFilters) {
        this.filterCache[pathIdentity] = (this.filterCache[pathIdentity] || []).concat(record.appliedFilters.map(f => filterCacheKey(f, this.config)))
      }
      if (isResolutionRecord(record) && record.sourceOrigin && !record.fileAsRawText && /^file\(/.test(variableString)) {
        const lineage = record.sourceOrigin.lineage || []
        const selectionIdentity = lineage[lineage.length - 1]
        if (selectionIdentity && (origin.lineage || []).includes(selectionIdentity)) {
          const files = (origin.lineage || []).concat(selectionIdentity).map(identity => JSON.parse(identity)[0])
          throw new Error('Circular file reference detected: ' + files.join(' -> '))
        }
      }
      if(isResolutionRecord(record)&&record.sourceOrigin)valueObject.nextOrigin=record.sourceOrigin
      return record
    })


    // Track every call to getValueFromSource for metadata
    if (this._trackCalls && pathJoined) {
      const pathKey = pathIdentity
      if (!this.resolutionTracking[pathKey]) {
        this.resolutionTracking[pathKey] = {
          path: pathJoined,
          pathSegments: pathValue.map(String),
          pathIdentity,
          originalPropertyString: propertyString,
          resolvedPropertyValue: undefined,
          calls: []
        }
      }

      // this.resolutionTracking[pathKey].resolutionHistory = this.resolutionTracking[pathKey].resolutionHistory || []

      // const isDuplicate = this.resolutionTracking[pathKey].resolutionHistory.some(entry =>
      //   entry.variableString === variableString
      // )

      // if (!isDuplicate) {
      //   this.resolutionTracking[pathKey].resolutionHistory.push({
      //     variableString: variableString,
      //     propertyString: propertyString,
      //     caller: caller,
      //     lol: 'what'
      //   })
      // }


      this.resolutionTracking[pathKey].calls.push({
        variableString: variableString,
        propertyString: propertyString,
        caller: caller
      })
    }

    // console.log('getValueFromSrc propertyString', propertyString)
    // console.log(`tracker contains ${variableString}`, this.tracker.contains(requestIdentity))

    // Cycle detection: track dependencies and check for cycles
    const fromPath = pathJoined
    // Extract target path from variableString (e.g., 'self:b' → 'b', 'b.c' → 'b.c')
    let toPath = variableString
    if (variableString.startsWith('self:')) {
      toPath = variableString.slice(5)
    }
    // For cycle detection, only track self-references
    if (fromPath && (variableString.startsWith('self:') || !variableString.includes(':'))) {
      // A value can't contain itself: o.k referencing o would expand forever
      const targetPath = bracketsToDots(toPath.trim())
      const targetSegments = lookupPathSegments(toPath.trim())
      if (targetPath && targetSegments.length < pathValue.length && targetSegments.every((segment, i) => segment === String(pathValue[i]))) {
        return Promise.reject(new Error(
          `Circular variable dependency detected: ${fromPath} → ${targetPath} (a value can't reference the object that contains it)`
        ))
      }
      // Dependency identity must distinguish a literal 'a.b' key from a.b.
      const fromKey = encodePathIdentity(pathValue)
      const toKey = encodePathIdentity(targetSegments)
      if (this.tracker.wouldCreateCycle(fromKey, toKey)) {
        const cyclePath = this.tracker.getCyclePath(fromKey, toKey).map((key) => displayPath(decodePathIdentity(key)))
        return Promise.reject(new Error(
          `Circular variable dependency detected: ${cyclePath.join(' → ')}`
        ))
      }
      this.tracker.addDependency(fromKey, toKey)
    }

    // Reuse a variable already resolved elsewhere in the config — but not inside an
    // ignore path (Fn::Sub etc.): there bare refs (${foo}) must stay verbatim, and the
    // shared result from a plain string would bypass the ignore-path check below.
    const inIgnorePath = this.isIgnorePath(pathValue)
    const trackedVariable = requestIdentity
    if (!inIgnorePath && this.tracker.contains(requestIdentity)) {
      // console.log('try to get', variableString)
      return reuseTracked(requestIdentity)
    }

    let newHasFilter
    // Else lookup value from various sources
    if (DEBUG) {
      console.error(`>>>>> getValueFromSrc() caller - ${caller}`)
      console.error('getValueFromSource originalVar', originalVar)
      console.error('getValueFromSource variableString:', variableString)
      console.error('getValueFromSource propertyString:', propertyString)
      console.error('getValueFromSource pathValue:', valueObject.path)
      console.error('getValueFromSource valueObject:', valueObject)
      console.error('-----')
    }

    // A filter delimiter is a single `|` that is NOT part of `||` (logical OR) and NOT inside parens
    // (eval expressions, filter args). splitOnPipe encodes exactly that, so it detects filters whether or
    // not the pipe has surrounding whitespace (`${a|up}`, `${a| up}` and `${a | up}` all count) while
    // leaving eval's `||`/bitwise `|` alone. Detect on the CURRENT variable, not the whole property value:
    // a filtered variable NESTED inside eval parens (`${eval(${self:a | Number} + 1)}`) has its own pipe
    // that a paren-aware scan of the whole value would wrongly treat as inside-parens and miss.
    const filters = splitOnPipe(variableString).length > 1
    let promiseKey
    if (filters) {
      const string = cleanVariable(propertyString, this.variableSyntax, true, `getValueFromSrc filter ${this.callCount}`)
      // console.log('string', string)
      const deeperValue = getTextAfterOccurrence(string, variableString)
      // console.log('deeperValue', deeperValue)
      // console.log('filters', filters)
      // console.log('variableString', variableString)
      promiseKey = splitOnPipe(deeperValue).length > 1 ? deeperValue : undefined

      // Filters belong to the CURRENT variable (variableString), NOT the whole property value
      // (propertyString/string). When a filtered var sits next to other vars or literal text —
      // `${a | toUpperCase}-${b}-suffix` — the whole value carries extra `}`/`${`/text that
      // splitOnPipe(string) would fold into the filter name. Split the individual variable instead.
      const t = splitOnPipe(variableString)
      // console.log('variableString', variableString)
      // console.log('valueObject', valueObject)
      // console.log('t', t)
      const _filter = t
        .filter((value, index, arr) => {
          return index > 0
        })
        .map((f) => {
          return trim(f)
          // TODO refactor this. This is a temp fix for filters with nested vars.
          .replace(this.varSuffixPattern, '')
        })
      // console.log('filters to run', _filter)

      newHasFilter = _filter
      // If current variable string has no pipes, it has no filters
      if (!variableString.match(/\|/)) {
        newHasFilter = null
      }
      // console.log('newHasFilter', newHasFilter)
      variableString = trim(t[0])
    }

    /** @type {Function|undefined} */
    let resolverFunction
    let resolverType
    let found = false

    // Fast path: try prefix lookup first for O(1) detection of common types
    const colonIdx = variableString.indexOf(':')
    if (colonIdx !== -1) {
      const prefix = variableString.slice(0, colonIdx + 1)
      const resolver = this._resolverByPrefix.get(prefix)
      if (resolver && resolver.match instanceof RegExp && variableString.match(resolver.match)) {
        resolverFunction = resolver.resolver
        resolverType = resolver.type || 'unknown'
        found = true
      }
    }

    // Fallback: loop over all variable types
    if (!found) {
      found = this.variableTypes.some(/**
       * @param {{ match: RegExp | ((varString: string, config: any, valueObject: any) => boolean), resolver: Function, type?: string }} r
       * @param {number} i
       */ (r, i) => {
        if (r.match instanceof RegExp && variableString.match(r.match)) {
          // set resolver function
          resolverFunction = r.resolver
          resolverType = r.type || 'unknown'
          return true
        } else if (typeof r.match === 'function') {
          // TODO finalize match API
          if (r.match(variableString, this.config, valueObject)) {
            // set resolver function
            resolverFunction = r.resolver
            resolverType = r.type || 'unknown'
            return true
          }
        }
        return false
      })
    }
    /*
    // console.log('found variable resolver', found)
    // console.log('resolverFunction', resolverFunction)
    /** */

    // Inside ignore-path contexts (Fn::Sub, inline code, VTL templates, ...) leave bare
    // refs (${foo}) and CloudFormation refs (${MyBucket}, ${AWS::Region}) verbatim: there
    // they belong to CloudFormation / the embedded language, and resolving them against
    // the config could inline the wrong value. Explicitly typed refs (self:, file, text,
    // env, opt, cron, eval, git, custom, string, number) still resolve, as Serverless does.
    if (inIgnorePath && (!found || resolverType === 'dot.prop')) {
      return Promise.resolve(encodeUnknown(originalVar || this.varPrefix + variableString + this.varSuffix))
    }
    // Types that do resolve inside ignore paths (self:, opt, env, file, ...) can share the
    // result tracked for the same variable elsewhere, as they do outside ignore paths.
    if (inIgnorePath && this.tracker.contains(trackedVariable)) {
      return reuseTracked(trackedVariable)
    }

    // A call to a function that doesn't exist (${concat('a', 'b')}) is a mistake, not text to keep.
    // Only generic resolvers (a quoted string, a bare path) would take it, and they'd return it as text
    const call = /^\s*([A-Za-z_$][\w$]*)\s*\(/.exec(variableString)
    if (call && (!found || resolverType === 'string' || resolverType === 'dot.prop') &&
      !this.functions[call[1]] && !this.functions[call[1].toLowerCase()]) {
      throw new Error(unknownFunctionMessage(call[1], `${this.varPrefix}${variableString}${this.varSuffix}`, this))
    }
    if (!found) {
      const ownership=require('./utils/expressions/ownership').classify(variableString,{knownPrefixes:this._resolverByPrefix,prefix:this.varPrefix,suffix:this.varSuffix})
      if(ownership.kind==='foreign') {
        if(this.isUnknownTypeAllowed(variableString))return Promise.resolve(encodeUnknown(originalVar || this.varPrefix+variableString+this.varSuffix))
        throw new Error(`Unknown variable source "${ownership.type}": invalid variable syntax. Variable: "${variableString}" not found`)
      }
    }
    if (found && resolverFunction) {
      /*
      console.log(`----------Resolver [${resolverType}]----------------------`)
      console.log(`Resolver TYPE [${resolverType}]`, caller)
      console.log('WITH INPUTS ▼')
      console.log('variableString: ', variableString)
      console.log('this.options:   ', this.options)
      console.log('this.config:    ', this.config)
      console.log('valueObject:    ', valueObject)
      // process.exit(1)
      /** */
      // A key or name pasted in from another variable arrives encoded (${self:map.${opt:k}}); lookups
      // get it back as written. Literal resolvers decode their own text later
      const lookupString = KEY_LOOKUP_TYPES.has(resolverType) ? decodeLiteralBraces(variableString) : variableString
      // TODO finalize resolverFunction API
      const valuePromise = Promise.resolve().then(() => resolverFunction(
        lookupString,
        this.options,
        this.config,
        valueObject,
      )).then((val) => {
        this.budget.check()
        // Update the last call with the resolved value
        if (this._trackCalls && pathJoined) {
          const pathKey = pathIdentity
          if (this.resolutionTracking[pathKey] && this.resolutionTracking[pathKey].calls.length) {
            // Find the most recent call for this variableString
            for (let i = this.resolutionTracking[pathKey].calls.length - 1; i >= 0; i--) {
              if (this.resolutionTracking[pathKey].calls[i].variableString === variableString) {
                const v = (isResolutionRecord(val)) ? val.value : val
                this.resolutionTracking[pathKey].calls[i].resolvedValue = v
                this.resolutionTracking[pathKey].calls[i].resolverType = resolverType
                break
              }
            }
          }
        }

        // console.log('VALUE', val)
        // For eval/if resolvers, null is a valid intentional result (e.g., ternary false branch)
        const isEvalOrIfResolver = resolverType === 'eval' || resolverType === 'if'
        if (
          (val === null && !isEvalOrIfResolver) ||
          typeof val === 'undefined' ||
          (isResolutionRecord(val) && val.value === undefined && this.isUnresolvedAllowed(resolverType)) ||
          /* match deep refs as empty {}, they need resolving via functions */
          (typeof val === 'object' && isEmpty(val) && variableString.match(/deep\:/))
        ) {
          
          const cleanV = cleanVariable(propertyString, this.variableSyntax, true, `getValueFromSrc resolverFunction ${this.callCount}`)
          // console.log('variableString', variableString)
          // console.log('cleanV', cleanV)
          // console.log('nestedVars', nestedVars)
          const valueCount = splitByComma(cleanV)

          if (variableString.match(/deep\:/)) {
            // return Promise.resolve(this.getValueFromDeep(variableString))
            const deepIndex = variableString.match(deepIndexPattern)
            const deepRef = variableString.replace(deepPrefixReplacePattern, '')
            // console.log('deepRef', deepRef)
            // console.log('deepIndexMatch', deepIndex)
            if (deepIndex[1] && this.deep.length) {
              const deepIndexValue = this.deep[parseInt(deepIndex[1])]
              // console.log('deepIndexValue', deepIndexValue)
              // console.log('FINAL', `${deepIndexValue}.${deepRef}`)
              if (deepIndexValue) {
                // console.log('> RESOLVER RETURN newValue 1', `${deepIndexValue}.${deepRef}`)
                return Promise.resolve(`${deepIndexValue}.${deepRef}`)
              }
            }
          }
          // console.log('valueCount', valueCount)
          // TODO throw on empty values?
          // No fallback value found AND this is undefined, throw error
          const nestedVars = findNestedVariables(propertyString, this.variableSyntax, this.variablesKnownTypes, undefined, this.variableTypes)
          // console.log('nestedVars', nestedVars)
          const noNestedVars = nestedVars.length < 2

          // Check if this unresolved variable type should pass through
          const isFileRef = variableString.match(fileRefSyntax)
          const isParamRef = variableString.match(getValueFromParam.match)

          // Params pass through entirely (including fallbacks) for third-party resolution
          if (isParamRef && this.isUnresolvedAllowed('param')) {
            return Promise.resolve(encodeUnknown(propertyString))
          }

          const isUnresolvedAllowed =
            this.isUnresolvedAllowed(resolverType) || (isFileRef && this.isUnresolvedAllowed('file'))

          if (isUnresolvedAllowed) {
            // A missing earlier slot must still let the next fallback run.
            if(caller==='overwrite' && originalVar) {
              const slots=splitByComma(cleanVariable(originalVar,this.variableSyntax,true,'unresolved fallback'),this.variableSyntax)
              const slot=slots.findIndex(item=>item.trim()===variableString.trim())
              if(slot>=0 && slot<slots.length-1)return undefined
            }
            // Check if outer expression has fallbacks we can use
            if (valueCount.length > 1) {
              const primaryVar = valueCount[0]
              // If the unresolvable variableString is used INSIDE the primary var,
              // return undefined to trigger the outer fallback mechanism
              if (primaryVar.includes(variableString)) {
                return Promise.resolve(undefined)
              }
            }
            // Encode only the unknown variable, not the entire string
            return Promise.resolve(encodeUnknown(originalVar && cleanVariable(originalVar,this.variableSyntax,true,'unresolved source').trim()===variableString.trim() ? originalVar : this.varPrefix + variableString + this.varSuffix))
          }

          if (valueCount.length === 1 && noNestedVars) {
            let lineInfo = ''
            if (this.originalString && this.configFilePath && valueObject.path) {
              const ext = configFileType(this.configFilePath)
              if (ext === '.yml' || ext === '.yaml' || ext === '.json' || ext === '.env') {
                const rawLines = this.originalString.split('\n')
                const lineNum = findLineByPath(arrayToJsonPath(valueObject.path), rawLines, ext)
                if (lineNum) lineInfo = ` at line ${lineNum},`
              }
            }
            const configFilePathMsg = (this.configFilePath) ? `\nIn file ${this.configFilePath}${lineInfo} ` : ''
            const fromLine = (propertyString !== valueObject.originalSource) ? `\n  From   "${valueObject.originalSource}"\n` : ''

            const suggestion = this.suggestVariableFix(variableString)
            throw new Error(`Unable to resolve config variable "${propertyString}".\n${configFilePathMsg}at location ${valueObject.path ? `"${arrayToJsonPath(valueObject.path)}"` : 'n/a'}${fromLine}${suggestion}
\nFix this reference, your inputs and/or provide a valid fallback value.
\nExample of setting a fallback value: \${${variableString}, "fallbackValue"\}\n`)
          }
          // console.log('> RESOLVER RETURN newValue 2', val)
          // no value resolved but fallback value exists, keep moving on
          return Promise.resolve(val)
        }
        /*
        // console.log('------')
        // console.log('propertyString', propertyString)
        // console.log('resolved val', val)
        // console.log('------')
        // console.log('newHasFilter', newHasFilter)
        /** */
        // No filters found. return value
        if (!newHasFilter) {
          // console.log('no newHasFilter', val, valueObject)
          // console.log('> RESOLVER RETURN newValue 3', val, originalVar)
          // Wrap value with resolverType metadata for resolution tracking
          // But don't wrap if it's already an internal flag object
          if (isResolutionRecord(val)) {
            // Attach resolverType to existing internal object
            val.__resolverType = resolverType
            return Promise.resolve(val)
          }
          return Promise.resolve(resolutionRecord({
            value: val,
            __resolverType: resolverType,
            __variableString: variableString,
            __internal_metadata: true
          }))
        }

        const newUse = newHasFilter.reduce((acc, currentFilter, i) => {
          const { name, args } = parseFilter(currentFilter, this.config)
          if (!this.filters[name]) {
            throw new Error(`Filter "${name}" not found`)
          }
          return acc.concat({
            filter: this.filters[name],
            filterName: name,
            // Full filter string (e.g. `append('X')`) — the key the populateVariable dedupe compares
            // against. Caching only filterName let an arg-bearing filter escape dedupe and run twice.
            filterString: currentFilter,
            args: args
          })
        }, [])
        // console.log('pathValue', pathValue)
        // console.log('propertyString', propertyString)
        // console.log('newUse', newUse)

        // If the filtered variable settled to a value that STILL holds unresolved variables (a compose or a
        // fallback expression reached e.g. through `${env:X, self:composeVar}`), the deep resolver hands back
        // that half-resolved value. Applying the filter here would run it on placeholder text.
        // Fully resolve that value first (recursively, with NO path so it can't re-enter this path and cycle),
        // THEN apply the filters. A re-entrancy guard prevents pathological recursion. A lone nested variable
        // / ${deep:N} placeholder is excluded — that is handled by the carry-over below.
        const settledValue = (isResolutionRecord(val) && typeof val.value === 'string') ? val.value : null
        // A lone ${deep:N} placeholder is handled by the carry-over below; everything else that still holds
        // unresolved variables must be fully resolved before filtering. That covers a compose with literal
        // text (${a}-${b}) AND a fallback expression still carrying a ${deep:N} (${env:MISSING, deep:2}),
        // reached through a fallback-to-compose — where the settled value is a single ${...} with no outer
        // literal, so the "literal around vars" test alone would miss it and the filter would run on the
        // raw placeholder text (leaking DEEP:N).
        const isLoneDeepPlaceholder = settledValue !== null && /^\$\{\s*deep:\d+\s*\}$/.test(settledValue.trim())
        const settledIsCompose = settledValue !== null && !isLoneDeepPlaceholder &&
          this.variableSyntaxTest.test(settledValue) &&
          (settledValue.replace(this.variableSyntax, '').trim() !== '' || !!settledValue.match(/deep:/))
        if (settledIsCompose) {
          this._filterDeferKeys = this._filterDeferKeys || new Set()
          const deferKey = JSON.stringify([valueObject.path || [], settledValue, newHasFilter])
          if (!this._filterDeferKeys.has(deferKey)) {
            this._filterDeferKeys.add(deferKey)
            return this.populateValue({ value: settledValue }, true, 'getValueFromSrc filter-defer').then(
              (resolvedObj) => {
                this._filterDeferKeys.delete(deferKey)
                const resolved = (isResolutionRecord(resolvedObj)) ? resolvedObj.value : resolvedObj
                const filtered = newUse.reduce((acc, c) => {
                  const tv = (isResolutionRecord(acc)) ? acc.value : acc
                  if (typeof c.filter !== 'function') return tv
                  // Record in filterCache (like the regular reduce) so populateVariable's dedup won't
                  // re-apply this filter to the whole assembled value — e.g. lit-${self:cc | up} where the
                  // filter would otherwise run again on "lit-VALUE-GOOSE".
                  this.filterCache[pathIdentity] = (this.filterCache[pathIdentity] || []).concat(filterCacheKey(c.filterString, this.config))
                  return c.args ? c.filter(tv, ...c.args) : c.filter(tv)
                }, resolved)
                return resolutionRecord({ value: filtered, appliedFilters: newHasFilter, __resolverType: resolverType, __variableString: variableString, __internal_metadata: true })
              },
              (err) => { this._filterDeferKeys.delete(deferKey); return Promise.reject(err) },
            )
          }
        }
        if (typeof val === 'string' && val.match(/deep:/)) {
          // The variable resolved to a nested variable/compose, captured as a ${deep:N} placeholder.
          // If the filtered variable IS the whole value (`${a | f}`), leave the placeholder alone — the
          // filters apply to the fully-resolved value downstream. If it is only PART of a composite
          // (`${a | f}-${b}-x`), the value can't be filtered as a whole, so carry THIS variable's filters
          // onto the placeholder (`${deep:N | f}`) to run once the ref resolves. Built from newHasFilter
          // (this variable's own filters), NOT from propertyString — which folds in the adjacent vars/text
          // and mangled the carry-over. (Previously gated on `newHasFilter[1]`, which dropped a single
          // filter through a composite entirely.)
          const rawMatches = propertyString.match(this.variableSyntax) || []
          const isLoneVariable = rawMatches.length === 1 && rawMatches[0] === propertyString.trim()
          if (isLoneVariable) {
            return Promise.resolve(val)
          }
          const filterSuffix = newHasFilter.map((currentFilter) => `| ${trim(currentFilter)}`).join(' ')
          const deepValueWithFilters = val.replace(this.varSuffixPattern, ` ${filterSuffix}${this.varSuffix}`)
          // console.log('deepValueWithFilters', deepValueWithFilters)
          return Promise.resolve(deepValueWithFilters)
        }
        /* Loop over filters used and produce new value */
        const newValue = newUse.reduce((a, c) => {
          // Fix for async value resolution. That code file refs returns object with .value
          // (a && ...) guards a null accumulator — a prior filter may have returned null (typeof null
          // is 'object'), which would otherwise crash reading .__internal_only_flag.
          const theValue = isResolutionRecord(a) ? a.value : a
          if (typeof c.filter !== 'function') {
            return theValue
          }
          if (c.args) {
            this.filterCache[pathIdentity] = (this.filterCache[pathIdentity] || []).concat(filterCacheKey(c.filterString, this.config))
            return c.filter(theValue, ...c.args)
          }
          this.filterCache[pathIdentity] = (this.filterCache[pathIdentity] || []).concat(filterCacheKey(c.filterString, this.config))
          return c.filter(theValue)
        }, val)
        // console.log('> RESOLVER RETURN newValue', newValue)
        // console.log('> RESOLVER RETURN newValue 5', newValue)
        // Wrap value with resolverType metadata for resolution tracking
        // But don't wrap if it's already an internal flag object
        if (isResolutionRecord(newValue)) {
          // Attach resolverType to existing internal object
          newValue.__resolverType = resolverType
          return Promise.resolve(newValue)
        }
        return Promise.resolve(resolutionRecord({
          value: newValue,
          appliedFilters: newHasFilter,
          __resolverType: resolverType,
          __variableString: variableString,
          __internal_metadata: true
        }))
      })

      const ownedValuePromise=valuePromise.then(record=>{
        if(!valueObject.nextOrigin)return record
        if(isResolutionRecord(record)){if(!record.sourceOrigin)record.sourceOrigin=valueObject.nextOrigin;return record}
        return resolutionRecord({value:record,sourceOrigin:valueObject.nextOrigin})
      })
      // console.log('valuePromise', valuePromise)
      // console.log(`----------End Resolver [${resolverType}]-------------------`)
      // console.log('newHasFilter', newHasFilter)
      // TODO do something with func here?
      return this.tracker.add(variableString, ownedValuePromise, propertyString, newHasFilter, origin.authoredFile ? requestIdentity : promiseKey)
    }

    // console.log('fall thru variableString', variableString)

    /* fall through case with self refs */
    if (variableString) {
      // console.log('before clean propertyString', propertyString, variableString)
      // A fallback can only come from the matched variable or a variable enclosing it
      // (${empty, ${x}, 'fb'}). Literal text outside every variable (e.g. CloudFormation
      // `{"${Ns}",Path}`) may contain commas that are not fallback separators.
      // The list is the variable directly around this one, not an outer one further up
      // (${a, ${b, ${length(x)}}}: the list of length(x) is ${b, ${length(x)}})
      const parentVar = (typeof originalVar === 'string' && originalVar && typeof matchIndex === 'number')
        ? findParentVariable(propertyString, originalVar, this.varPrefix, this.varSuffix, matchIndex)
        : null
      const enclosingVar = parentVar ? parentVar.text : (typeof originalVar === 'string' && originalVar)
        ? findEnclosingVariable(propertyString, originalVar, this.varPrefix, this.varSuffix, matchIndex)
        : null
      const fallbackSource = enclosingVar || propertyString
      // The parent's list holds this variable's fallbacks only when the variable is one of its
      // items (${env:X, ${sls:stage}}). Nested in an item's text ('sl-${sls:stage}') it has none.
      const parentListIsOwnFallback = !parentVar ||
        isFallbackSlot(parentVar.text, String(originalVar), this.varPrefix, this.varSuffix)
      const clean = cleanVariable(
        fallbackSource,
        this.variableSyntax, 
        true, 
        `getValueFromSrc self ${this.callCount}`
      )
      // TODO @DWELLS cleanVariable makes fallback values with spaces have no spaces
      // console.log('AFTER cleanVariable', clean)
      // console.log(typeof clean)
      const cleanClean = splitOnPipe(clean)[0]
      // console.log('cleanCleanVariable', cleanClean)
      if (funcRegex.exec(cleanClean)) {
        const valuePromise = Promise.resolve(cleanClean)
        return this.tracker.add(cleanClean, valuePromise, propertyString, newHasFilter)
      }

      const split = splitByComma(cleanClean)
      // console.log('split', split)
      // console.log('typeof split', typeof split)
      // @TODO refactor this. USE FILTER [ 'commas', 'split("-"' ] is wrong
      let fallbackValue
      if (!parentListIsOwnFallback) {
        fallbackValue = undefined
      } else if (split.length === 2 || split.length === 3) {
        fallbackValue = split[1]
      } else if (clean.match(/\|/)) {
        fallbackValue = split[0]
      }

      // TODO this should be new in memory resolutionHistory probably?
      // A nested variable may come from a substituted value (an env value of '${x}'), so it can
      // be in the enclosing variable's current text without being in the original source
      const isInsideAnotherVariable = !!enclosingVar && enclosingVar !== originalVar
      const nestedVar = parentListIsOwnFallback ? (findNestedVariable(split, valueObject.originalSource) ||
        (isInsideAnotherVariable ? findNestedVariable(split, enclosingVar) : undefined)) : undefined
      // console.log('nestedVar', nestedVar)

      if (nestedVar) {
        if (!this.isUnknownTypeAllowed(nestedVar)) {
          verifyVariable(nestedVar, valueObject, this.variableTypes, this.config)
        }
        const fallbackStr = getFallbackString(split, nestedVar)
        return this.getValueFromSource(variableString, {
          value: fallbackStr,
          path: valueObject.path,
        }, 'nestedVar', originalVar)
      }

      // TODO verify we need this still with file(file.js, param)
      // remove trailing ) for file fallback
      if (cleanClean.match(fileRefSyntax)) {
        // console.log('REPLACE', fallbackValue)
        fallbackValue = fallbackValue.replace(/\)$/, '')
        if (fallbackValue) {
          // recurse on fallback and check again
          return this.getValueFromSource(`${variableString})`, {
            value: propertyString,
          }, 'cleanClean.match(fileRefSyntax)', originalVar, matchIndex)
        }
      }
      // const fallbackValue = split[1]
      // console.log('variableString', variableString)
      // console.log('propertyString', propertyString)
      // console.log('fallbackValue', fallbackValue)

      if (variableString === fallbackValue) {
        // A bare word used as its own fallback is literal only in this fallback list, so
        // don't cache it under the variable name where another key's ${word} would find it
        return Promise.resolve(decodeLiteralBraces(fallbackValue))
      }
      /*
      console.log('what is fallbackValue', fallbackValue)
      console.log('typeof fallbackValue', typeof fallbackValue)
      /** */
      // has fallback but needs deeper lookup. Call getValueFromSrc again
      if (fallbackValue) {
        if (DEBUG) console.error('fallbackValue', fallbackValue)
        // console.log('fallbackValue', fallbackValue)
        // recurse on fallback and check again
        return this.getValueFromSource(
          fallbackValue,
          valueObject,
          // Object.assign({}, valueObject, { value: propertyString }),
          // {
          //   value: propertyString,
          //   path: valueObject.path,
          //   originalSource: valueObject.originalSource,
          //   ahh:true
          // },
          'fallbackValue',
          originalVar,
          matchIndex,
        ).then((res) => {
          // console.log('res', res)
          // console.log('typeof res', typeof res)
          return res
        })
      }
    }

    // Variable NOT FOUND. Warn user
    const key = pathJoined || 'na'
    const errorMessage = [
      `Invalid variable reference syntax`,
      `Key: "${key}"`,
      `Variable: "${variableString}" from ${propertyString} not found`,
    ]

    // Default value used for self variable
    // Only show this error if the variable itself (not a parent fallback) is a self-reference with a fallback
    const isSelfReference = !variableString.match(/^(env|opt|file|text|cron|eval|git):/)
    if (isSelfReference && variableString.match(/,/)) {
      errorMessage.push('\n Default values for self referenced values are not allowed')
      errorMessage.push(`\n Fix the ${propertyString} variable`)
    }
    
    let allowSpecialCase = false
    /* handle special cases for cloudformation ${Sub} values */
    if (this.originalConfig && key.endsWith('Fn::Sub')) {
      if (this.settings.verifySubReferences) {
        const params = this.originalConfig.Parameters || (this.originalConfig.resources || {}).Parameters
        const resources = this.originalConfig.Resources || (this.originalConfig.resources || {}).Resources
        /* Cloudformation Resource References */
        if (resources && resources[variableString]) {
          allowSpecialCase = true
        } else if (params && params[variableString]) {
          allowSpecialCase = true
        } else if (variableString === 'ApiGatewayRestApi') {
          // Allow for "hidden" cloudformation variables, set by sls framework
          allowSpecialCase = true
        } else if (variableString === 'HttpApi') {
          // Allow for "hidden" cloudformation variables, set by sls framework
          allowSpecialCase = true
        }
      } else {
        // Default let any sub references pass through
        allowSpecialCase = true
      }
    }
    /* Todo handle stage variables */



    /* Pass through unknown variable types. Checks this variable, not the whole property: a */
    /* passthrough nested in a known variable's fallback ('${env:X, 'sl-${sls:stage}'}') qualifies */
    if (allowSpecialCase || this.isUnknownTypeAllowed(variableString)) {
      // Return only the encoded current variable, not the whole propertyString.
      // The caller substitutes this value at the matched position; returning the
      // full property would re-insert the surrounding context (including this
      // variable) and cause exponential string growth on subsequent passes.
      return Promise.resolve(encodeUnknown(originalVar || this.varPrefix + variableString + this.varSuffix))
    }

    const message = errorMessage.join('\n')
    const notFoundPromise = Promise.reject(new Error(message))

    return this.tracker.add(variableString, notFoundPromise, propertyString, newHasFilter, requestIdentity)
  }
  getValueFromSelf(variableString, o, x, data) {
    /*
    console.log('getValueFromSelf variableString', variableString)
    /** */
    // console.log('self data', data)
    // Everything after the source prefix is the path; a key can hold a colon (${self:map.${opt:k}})
    const colon = variableString.indexOf(':')
    const variable = colon !== -1 && variableString.slice(colon + 1) ? variableString.slice(colon + 1) : variableString
    const valueToPopulate = this.config
    // items[1] / objs[0]['n'] are the same paths as items.1 / objs.0.n
    let deepProperties = bracketsToDots(variable).split('.').filter((property) => property)
    // console.log('self deep', deepProperties)
    // console.log('self valueToPopulate', valueToPopulate)

    /* its file ref so we need to shift lookup for self in nested files */
    if (data.isFileRef) {
      // First check if property exists in the nested file's context (preferred for file refs)
      const nestedPath = [data.path[0]].concat(deepProperties)
      const nestedDotPath = nestedPath.join('.')
      if (dotProp.has(valueToPopulate, nestedDotPath)) {
        // Property exists in nested context, prefer it over top-level
        deepProperties = nestedPath
      }
      // Otherwise, keep deepProperties as-is to try top-level lookup
    }

    const origin=originAt(this.loadContext,deepProperties,this.configFilePath)
    return this.getDeeperValue(deepProperties, valueToPopulate, origin).then((res) => {
      if(data.path&&origin.authoredFile)data.nextOrigin=origin

      /*
      console.log('self getDeeperValue variableString', variableString)
      console.log('self getDeeperValue result', res)
      /** */
      return res
    })
  }
  /**
   * Resolve a file() ref, remembering expansions for circular reference detection
   * @param {string} variableString - The file ref, e.g. file(./x.yml):key
   * @param {object} [options] - Resolver options (asRawText, context)
   * @returns {Promise<any>} The file's value
   */
  async getValueFromFile(variableString, options) {
    const context = { ...options.context, nextOrigin: undefined }
    const ctx = {
      configPath: this.configPath,
      authoredRoot: this.configFilePath,
      fileRefsFound: this.fileRefsFound,
      variableSyntax: this.variableSyntax,
      variablesKnownTypes: this.variablesKnownTypes,
      variableTypes: this.variableTypes,
      opts: this.settings,
      env: this.loadContext.env,
      loadContext: this.loadContext,
      originalConfig: this.originalConfig,
      config: this.config,
      getDeeperValue: (segments, value) => this.getDeeperValue(segments, value, context.nextOrigin || context.origin),
      fileRefSyntax: fileRefSyntax,
      textRefSyntax: textRefSyntax,
      varPrefix: this.varPrefix,
      varSuffix: this.varSuffix,
      fileContentCache: this._fileContentCache,
      safetyPolicy: this.safetyPolicy
    }
    const value = await getValueFromFileResolver(ctx, variableString, { ...options, context })
    this.budget.check()
    validateStructure(value, this.settings.resolutionLimits)
    options.context.nextOrigin = context.nextOrigin
    if (value == null) return value
    return resolutionRecord({ value, sourceOrigin: context.nextOrigin, fileAsRawText: options.asRawText })
  }
  getValueFromDeep(variableString, pathValue) {
    const variable = this.getVariableFromDeep(variableString)
    const deepRef = variableString.replace(deepPrefixReplacePattern, '')
    /*
    console.log("GET getValueFromDeep", variableString)
    console.log('deepRef', (deepRef) ? deepRef : '- no deepRef')
    console.log('getValueFromDeep variable', variable)
    /** */
    // Resolve the deep value with the right source for filter scoping. Normally the outer
    // originalSource is preserved so a trailing filter on a simple indirection (${self:ref | filter},
    // whose value is itself a variable) still applies. But when the outer (minus its trailing filter)
    // holds more than one variable — a NESTED variable, e.g. ${map.${selector} | filter} — this deep
    // ref is a selector inside a larger lookup; the filter applies to the lookup's result, not the
    // selector. In that case resolve against the deep's own source so the outer filter can't fold on.
    const outerSource = pathValue && typeof pathValue.originalSource === 'string' ? pathValue.originalSource : undefined
    const deepRefIsSelector = typeof outerSource === 'string' &&
      outerSource.replace(this.filterMatch, '').split(this.varPrefix).length > 2
    const valueObject = {
      value: variable,
      origin: this._deepOrigins.get(Number(variableString.replace(deepIndexReplacePattern, ''))) || pathValue && (pathValue.nextOrigin || pathValue.origin),
      path: pathValue ? pathValue.path : undefined,
      originalSource: deepRefIsSelector ? variable : outerSource,
      resolutionHistory: pathValue ? pathValue.resolutionHistory : []
    }
    let ret = this.populateValue(valueObject, undefined, 'getValueFromDeep').then(record=>{
      if(valueObject.nextOrigin){if(pathValue)pathValue.nextOrigin=valueObject.nextOrigin;if(isResolutionRecord(record))record.sourceOrigin=valueObject.nextOrigin}
      return record
    })
    if (deepRef.length) {
      // if there is a deep reference remaining
      ret = ret.then((result) => {
        // console.log('DEEP RESULT', result)
        if (isString(result.value) && this.variableSyntaxTest.test(result.value)) {
          // console.log('makeDeepVariable getValueFromDeep', result.value)
          const deepVariable = this.makeDeepVariable(result.value, 'via getValueFromDeep', valueObject.nextOrigin || valueObject.origin)
          return Promise.resolve(appendDeepVariable(deepVariable, deepRef))
        }
        return this.getDeeperValue(deepRef.split('.'), result.value, valueObject.nextOrigin || valueObject.origin)
      })
    }
    return ret
  }

  // ############################
  // ## DEEP VARIABLE HANDLING ##
  // ############################
  getVariableFromDeep(variableString) {
    const index = variableString.replace(deepIndexReplacePattern, '')
    // const index = this.getDeepIndex(variableString)
    /*
    console.log('FIND INDEX', index)
    console.log(this.deep, this.deep[index])
    /** */
    return this.deep[index]
  }
  recordFallbackSelection(valueObject, expression, index, length) {
    if(!valueObject.path)return
    const identity=encodePathIdentity(valueObject.path)
    const tracking=this.resolutionTracking[identity] || (this.resolutionTracking[identity]={path:displayPath(valueObject.path),pathSegments:valueObject.path.map(String),pathIdentity:identity,calls:[]})
    if(!tracking.fallbackSelections)tracking.fallbackSelections=[]
    const selection={expression,index,branches:Array.from({length},(_,itemIndex)=>({itemIndex,outcome:itemIndex===index?'selected':itemIndex>index?'skipped':'missing'}))}
    if(!tracking.fallbackSelections.some(item=>item.expression===expression&&item.index===index))tracking.fallbackSelections.push(selection)
  }
  isWholeReference(value) {
    const parsed = scanExpression(value, {prefix: this.varPrefix, suffix: this.varSuffix})
    return parsed.nodes.some(node => node.kind === 'Reference' && node.complete && node.raw.trim() === value.trim())
  }
  makeDeepVariable(variable, caller, origin = undefined) {
    const originIdentity = JSON.stringify(origin)
    let index = this.deep.findIndex((item, candidate) => variable === item && JSON.stringify(this._deepOrigins.get(candidate)) === originIdentity)
    if (index < 0) {
      // console.log('this.deep.push', variable)
      index = this.deep.push(variable) - 1
      if(origin)this._deepOrigins.set(index, origin)
    }
    // console.log("makeDeepVariable SET INDEX", index)
    const variableContainer = variable.match(this.variableSyntax)[0]
    const variableString = cleanVariable(
      variableContainer, 
      this.variableSyntax, 
      true, 
      `makeDeepVariable ${this.callCount}`
    )
    const deepVar = variableContainer.replace(variableString, `deep:${index}`)
    /*
    console.log('MAKE DEEP', variable, caller)
    console.log('this.deep', this.deep)
    console.log('variableContainer', variable)
    console.log('variableString', variableString)
    console.log('deepVar', deepVar)
    // process.exit(1)
    /** */
    return deepVar
  }
  /**
   * Get a value that is within the given valueToPopulate.  The deepProperties specify what value
   * to retrieve from the given valueToPopulate.  The trouble is that anywhere along this chain a
   * variable can be discovered.  If this occurs, to avoid cyclic dependencies, the resolution of
   * the deep value from the given valueToPopulate must be halted.  The discovered variable is thus
   * set aside into a "deep variable" (see makeDeepVariable).  The indexing into the given
   * valueToPopulate is then resolved with a replacement ${deep:${index}.${remaining.properties}}
   * variable (e.g. ${deep:1.foo}).  This pauses the population for continuation during the next
   * generation of evaluation (see getValueFromDeep)
   * @param deepProperties The "path" of properties to follow in obtaining the deeper value
   * @param valueToPopulate The value from which to obtain the deeper value
   * @returns {Promise} A promise resolving to the deeper value or to a `deep` variable that
   * will later resolve to the deeper value
   */
  getDeeperValue(deepProperties, valueToPopulate, origin = undefined) {
    /*
    console.log('deepProperties', deepProperties)
    console.log('valueToPopulate', valueToPopulate)
    /** */
    const veryDeep = deepProperties.reduce(async (reducedValueParam, subProperty) => {
      let reducedValue = await reducedValueParam
      // console.log('reducedValue', reducedValue)
      // console.log(typeof reducedValue)
      // console.log('subProperty', `"${subProperty}"`)

      if (isString(reducedValue) && reducedValue.match(deepRefSyntax)) {
        // build mode
        reducedValue = appendDeepVariable(reducedValue, subProperty)
      } else {
        // get mode
        if (typeof reducedValue === 'undefined') {
          // was reducedValue = {}
          // Adding internal flag signals this value is unknown
          reducedValue = resolutionRecord({
            value: undefined,
            path: undefined,
            originalSource: undefined,
            // set __internal_only_flag to note this is object we make not a resolved value
            __internal_only_flag: true,
            caller: 'getDeeperValue',
          })
        } else if (subProperty !== '' || (typeof reducedValue === 'object' && '' in reducedValue)) {
          try {
            // if JSON parse it
            reducedValue = JSON.parse(reducedValue)
          } catch (e) {}

          reducedValue = reducedValue[subProperty]
        } else if (isString(reducedValue)) {
          try {
            // if JSON parse it
            reducedValue = JSON.parse(reducedValue)
          } catch (e) {}

          reducedValue = reducedValue[subProperty]
        }
        if (typeof reducedValue === 'string' && this.variableSyntaxTest.test(reducedValue)) {
          // console.log('makeDeepVariable reducedValue', reducedValue)
          reducedValue = this.makeDeepVariable(reducedValue, 'via getDeeperValue', origin)
        }
      }
      // console.log('fin', reducedValue)
      return Promise.resolve(reducedValue)
    }, Promise.resolve(valueToPopulate))

    return veryDeep
  }

  // ###############
  // ## UTILITIES ##
  // ###############
  initialCall(func) {
    this.deep = []
    this._deepOrigins = new Map()
    // Progress reporting is a debug-only aid; the tracker still coordinates
    // promises and detects cycles regardless.
    this.tracker.start(DEBUG)
    return func().finally(() => {
      this.tracker.stop()
      this.deep = []
    this._deepOrigins = new Map()
    })
  }
  runFunction(variableString, depth = 0) {
    this.loadContext.budget.visit(depth)
    // console.log('runFunction', variableString)
    /* If json object value return it */
    if (variableString.match(/^\s*{/) && variableString.match(/}\s*$/)) {
      return variableString
    }
    // console.log('runFunction', variableString)
    const hasFunc = funcRegex.exec(variableString)
    // TODO finish Function handling. Need to move this down below resolver to resolve inner refs first
    // console.log('hasFunc', hasFunc)
    // Skip special expressions (cron, eval, if) - these aren't user functions
    if (!hasFunc || hasFunc && (hasFunc[1] === 'cron' || hasFunc[1] === 'eval' || hasFunc[1] === 'if')) {
      return variableString
    }
    // Skip file/text when they match resolver regex OR contain encoded passthrough values
    // Malformed patterns (with %, \, etc) should still error
    const hasPassthrough = hasEncodedUnknown(variableString)
    if (hasFunc[1] === 'file' && (variableString.match(fileRefSyntax) || hasPassthrough)) {
      return variableString
    }
    if (hasFunc[1] === 'text' && (variableString.match(textRefSyntax) || hasPassthrough)) {
      return variableString
    }
    // test for object
    const functionName = hasFunc[1]
    const rawArgs = hasFunc[2]
    // TODO @DWELLS. Loop through all raw args and parse to correct datatype
    // argument is object
    let argsToPass
    if (rawArgs && rawArgs.match(/^{([^}]+)}$/)) {
      // console.log('OBJECT', hasFunc[2])
      // TODO use JSON5
      argsToPass = [JSON.parse(rawArgs)]
    } else {
      // Split on any comma (not just `, `) so `merge('a','b')` works like `merge('a', 'b')`. Variable args
      // are base64-encoded on substitution (isNestedCallArgument), so a value containing commas — e.g.
      // ${sep} resolving to `,` in split(${s}, ${sep}) — is protected and only true separator commas split.
      const splitter = splitCsv(rawArgs, ',', { protectVariables: true })
      // console.log('splitter', splitter)
      // Recursively evaluate any nested function calls in arguments
      const evaluatedArgs = splitter.map((arg) => {
        if (typeof arg === 'string' && funcRegex.test(arg)) {
          return this.runFunction(arg, depth + 1)
        }
        return arg
      })
      // Unwrap encoded args to their raw value — functions like merge() do Object.assign on their args and
      // would otherwise spread a ResolvedFilterArg wrapper's ({value, __resolvedFilterArg}) into the result.
      argsToPass = formatFunctionArgs(evaluatedArgs).map(unwrapFilterArg)
    }
    // console.log('argsToPass runFunction', argsToPass)
    // TODO check for camelCase version. | toUpperCase messes with function name
    const theFunction = this.functions[functionName] || this.functions[functionName.toLowerCase()]

    if (!theFunction) {
      throw new Error(`Function "${functionName}" not found`)
    }

    const funcValue = theFunction(...argsToPass)
    // A call's result is data. Do not interpret function-looking text returned
    // by merge()/split()/custom functions as another call.
    if (variableString.trim() === hasFunc[0].trim()) return funcValue
    // console.log('funcValue', funcValue)
    // console.log('typeof funcValue', typeof funcValue)
    let replaceVal = funcValue
    if (typeof funcValue === 'string') {
      const replaceIt = variableString.replace(hasFunc[0], () => funcValue)
      replaceVal = cleanVariable(replaceIt, this.variableSyntax, true, `runFunction ${this.callCount}`)
    }

    // If wrapped in outer function, recurse
    const hasMoreFunctions = funcRegex.exec(replaceVal)
    if (hasMoreFunctions) {
      if (replaceVal === variableString) throw new ConfigoramaError('resolution_no_progress', 'Function expression made no progress')
      return this.runFunction(replaceVal, depth + 1)
    }
    return replaceVal
  }
}

module.exports = Configorama
