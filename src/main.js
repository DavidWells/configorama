const os = require('os')
const path = require('path')
const fs = require('fs')
const enrichMetadata = require('./utils/enrichMetadata')
const { normalizePath, extractFilePath, resolveInnerVariables } = require('./utils/filePathUtils')
/* // disable logs to find broken tests
console.log = () => {}
// process.exit(1)
/** */

const promiseFinallyShim = require('promise.prototype.finally').shim()
// @TODO only import lodash we need

const findUp = require('find-up')
const traverse = require('traverse')
const dotProp = require('dot-prop')
const chalk = require('./utils/chalk')
const { resolveAlias } = require('./utils/resolveAlias')
const { resolveFilePathFromMatch } = require('./utils/getFullFilePath')

/* Default Value resolvers */
const getValueFromString = require('./resolvers/valueFromString')
const getValueFromNumber = require('./resolvers/valueFromNumber')
const getValueFromEnv = require('./resolvers/valueFromEnv')
const getValueFromOptions = require('./resolvers/valueFromOptions')
const getValueFromCron = require('./resolvers/valueFromCron')
const getValueFromEval = require('./resolvers/valueFromEval')
const createGitResolver = require('./resolvers/valueFromGit')
/* Default File Parsers */
const YAML = require('./parsers/yaml')
const TOML = require('./parsers/toml')
const INI = require('./parsers/ini')
const JSON5 = require('./parsers/json5')
/* functions */
const md5Function = require('./functions/md5')

/* Utility/helpers */
const cleanVariable = require('./utils/cleanVariable')
const appendDeepVariable = require('./utils/appendDeepVariable')
const isValidValue = require('./utils/isValidValue')
const PromiseTracker = require('./utils/PromiseTracker')
const handleSignalEvents = require('./utils/handleSignalEvents')
const formatFunctionArgs = require('./utils/formatFunctionArgs')
const trimSurroundingQuotes = require('./utils/trimSurroundingQuotes')
const deepLog = require('./utils/deep-log')
const { splitByComma } = require('./utils/splitByComma')
const {
  isArray, isString, isNumber, isObject, isDate, isRegExp, isFunction,
  isEmpty, trim, camelCase, kebabCase, capitalize, split, map, mapValues,
  assign, set, cloneDeep
} = require('./utils/lodash')
const { parseFileContents } = require('./utils/parse')
const { splitCsv } = require('./utils/splitCsv')
const { replaceAll } = require('./utils/replaceAll')
const { getTextAfterOccurrence, findNestedVariable } = require('./utils/textUtils')
const { getFallbackString, verifyVariable } = require('./utils/variableUtils')
const { encodeUnknown, decodeUnknown } = require('./utils/encoders/unknown-values')
const { decodeEncodedValue } = require('./utils/encoders')
const { encodeJsSyntax, decodeJsSyntax, hasParenthesesPlaceholder } = require('./utils/encoders/js-fixes')
const { mergeByKeys } = require('./utils/mergeByKeys')
const { arrayToJsonPath } = require('./utils/arrayToJsonPath')
const { findNestedVariables } = require('./utils/find-nested-variables')
const { makeBox, makeStackedBoxes } = require('@davidwells/box-logger')
const { logHeader } = require('./utils/logs')
const { createEditorLink } = require('./utils/createEditorLink')
const { runConfigWizard } = require('./utils/configWizard')
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
const fileRefSyntax = RegExp(/^file\((~?[@\{\}\:\$a-zA-Z0-9._\-\/,'" ]+?)\)/g)
const textRefSyntax = RegExp(/^text\((~?[@\{\}\:\$a-zA-Z0-9._\-\/,'" ]+?)\)/g)
// TODO update file regex ^file\((~?[a-zA-Z0-9._\-\/, ]+?)\)
// To match file(asyncValue.js, lol) input params
const envRefSyntax = RegExp(/^env:/g)
const optRefSyntax = RegExp(/^opt:/g)
const selfRefSyntax = RegExp(/^self:/g)
const funcRegex = /(\w+)\s*\(((?:[^()]+)*)?\s*\)\s*/
const funcStartOfLineRegex = /^(\w+)\s*\(((?:[^()]+)*)?\s*\)\s*/
const subFunctionRegex = /(\w+):(\w+)\s*\(((?:[^()]+)*)?\s*\)\s*/
const base64WrapperRegex = /\[_\[([A-Za-z0-9+/=\s]*)\]_\]/g
const logLines = '─────────────────────────────────────────────────'

let DEBUG = process.argv.includes('--debug') ? true : false
let VERBOSE = process.argv.includes('--verbose') ? true : false
let SETUP_MODE = process.argv.includes('--setup') ? true : false
// DEBUG = true
let DEBUG_TYPE = false
const ENABLE_FUNCTIONS = true

function combineRegexes(regexes) {
  // Extract the pattern from each RegExp and join with OR operator
  const patterns = regexes.map(regex => {
    // Get source pattern string without flags
    return regex.source
  }).filter(Boolean)
  // Join patterns with the OR operator and create new RegExp
  return new RegExp(`(${patterns.join('|')})`)
}

/**
 * Preprocess config to fix malformed fallback references
 * @param {Object} configObject - The parsed configuration object
 * @param {RegExp} variableSyntax - The variable syntax regex to use
 * @returns {Object} The preprocessed configuration object
 */
function preProcess(configObject, variableSyntax) {
  // Known reference prefixes that should be wrapped in ${}
  const refPrefixes = ['self:', 'opt:', 'env:', 'file:', 'text:', 'deep:']

  /**
   * Fix malformed fallback references in a string
   * @param {string} str - String potentially containing variables
   * @returns {string} String with fixed fallback references
   */
  function fixFallbacksInString(str) {
    if (typeof str !== 'string') return str

    let result = str
    // result = result.replace(/\$\{self:/g, '${')
    let changed = true

    // Keep iterating until no more changes (to handle nested variables)
    while (changed) {
      changed = false

      // Find innermost ${...} blocks (ones that don't contain other ${)
      let i = 0
      while (i < result.length) {
        if (result[i] === '$' && result[i + 1] === '{') {
          const start = i
          let braceCount = 1
          let j = i + 2

          // Find the matching closing brace by counting { and }
          while (j < result.length && braceCount > 0) {
            if (result[j] === '{') {
              braceCount++
            } else if (result[j] === '}') {
              braceCount--
            }
            j++
          }

          if (braceCount === 0) {
            const end = j
            const match = result.substring(start, end)
            const content = result.substring(start + 2, end - 1)

            // Only process if there's a comma (indicating fallback syntax)
            if (content.includes(',')) {
              // Split by comma
              const parts = splitByComma(content, variableSyntax)

              if (parts.length > 1) {
                // Check if the first part has nested ${} - if so, skip this (process inner ones first)
                const firstPart = parts[0]
                if (firstPart.includes('${')) {
                  i = start + 2 // Move past ${ to find inner variables
                  continue
                }

                // Check each part after the first (these are fallback values)
                const fixed = parts.map((part, index) => {
                  if (index === 0) {
                    return part // Keep the main reference as-is
                  }

                  const trimmed = part.trim()

                  // Check if this looks like a reference but is not wrapped
                  const looksLikeRef = refPrefixes.some(prefix => trimmed.startsWith(prefix))
                  const alreadyWrapped = trimmed.startsWith('${') && trimmed.endsWith('}')

                  if (looksLikeRef && !alreadyWrapped) {
                    return ` \${${trimmed}}`
                  }

                  return ` ${trimmed}`
                })

                const replacement = `\${${fixed.join(',')}}`
                if (replacement !== match) {
                  result = result.substring(0, start) + replacement + result.substring(end)
                  changed = true
                  break // Restart search from beginning
                }
              }
            }

            i = start + 2 // Move past ${ to continue searching for nested variables
          } else {
            i++
          }
        } else {
          i++
        }
      }
    }

    return result
  }

  /**
   * Recursively traverse and fix the config object
   */
  function traverseAndFix(obj) {
    if (typeof obj === 'string') {
      return fixFallbacksInString(obj)
    }

    if (Array.isArray(obj)) {
      return obj.map(item => traverseAndFix(item))
    }

    if (obj !== null && typeof obj === 'object') {
      const result = {}
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          result[key] = traverseAndFix(obj[key])
        }
      }
      return result
    }

    return obj
  }

  return traverseAndFix(configObject)
}

class Configorama {
  constructor(fileOrObject, opts) {
    /* attach sig events on async calls */
    if (opts && !opts.sync) {
      handleSignalEvents()
    }
  
    const options = opts || {}
    // Set opts to pass into JS file calls
    this.opts = Object.assign({}, {
      // Allow for unknown variable syntax to pass through without throwing errors
      allowUnknownVars: false,
      // Allow undefined to be an end result.
      allowUndefinedValues: false,
      // Allow unknown file refs to pass through without throwing errors
      allowUnknownFileRefs: false,
      // Return metadata
      returnMetadata: false,
      // Return preResolvedVariableDetails
      returnPreResolvedVariableDetails: false,
    }, options)

    this.filterCache = {}

    this.foundVariables = []
    this.fileRefsFound = []

    // Track variable resolutions for metadata (keyed by path)
    this.resolutionTracking = {}

    const defaultSyntax = '\\${((?!AWS|stageVariables)[ ~:a-zA-Z0-9=+!@#%*<>?._\'",|\\-\\/\\(\\)\\\\]+?)}'
  
    const varSyntax = options.syntax || defaultSyntax
    let varRegex
    if (typeof varSyntax === 'string') {
      varRegex = new RegExp(varSyntax, 'g')
      // this.variableSyntax = /\${((?!AWS)([ ~:a-zA-Z0-9=+!@#%*<>?._'",|\-\/\(\)\\]+?|(\w+)\s*\(((?:[^()]+)*)?\s*\)\s*))}/
    } else if (varSyntax instanceof RegExp) {
      varRegex = varSyntax
    }
    // console.log('varRegex', varRegex)
    const variableSyntax = varRegex
    this.variableSyntax = variableSyntax

    // Set initial config object to populate
    if (typeof fileOrObject === 'object') {
      // set config objects
      this.config = fileOrObject
      // Keep a copy
      this.originalConfig = cloneDeep(fileOrObject)
      // Set configPath for file references
      this.configPath = options.configDir || process.cwd()
    } else if (typeof fileOrObject === 'string') {
      // read and parse file
      const fileContents = fs.readFileSync(fileOrObject, 'utf-8')
      const fileDirectory = path.dirname(path.resolve(fileOrObject))
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

    // Variable Sources
    this.variableTypes = [
      /**
       * Environment variables
       * Usage:
       * ${env:Key}
       * ${env:KeyTwo, "fallbackValue"}
       */
      getValueFromEnv,
      /**
       * CLI flags
       * Usage:
       * ${opt:stage}
       * ${opt:other, "fallbackValue"}
       */
      getValueFromOptions,

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
       * Self references
       * Usage:
       * ${otherKeyInConfig}
       * ${otherKeyInConfig, "fallbackValue"}
       * // or ${self:otherKeyInConfig}
       */
      {
        type: 'self',
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
        prefix: 'file',
        syntax: '${file(pathToFile.json)}',
        description: `Resolves values from files. Supports sub-properties via :key lookup.`,
        match: fileRefSyntax,
        resolver: (varString, o, x, pathValue) => {
          return this.getValueFromFile(varString, { context: pathValue })
        },
      },


      {
        type: 'text',
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
      match: (varString, fullObject, valueObject) => {
        /*
        console.log('fallThroughSelfMatcher varString', varString)
        console.log('fallThroughSelfMatcher valueObject', valueObject)
        console.log('fullObject', fullObject)
        /** */
        /* its file ref so we need to shift lookup for self in nested files */
        if (valueObject.isFileRef) {
          const exists = dotProp.get(fullObject, varString)
          // console.log('fallThroughSelfMatcher exists', exists)
          if (!exists) {
            // @ Todo make recursive
            const deepProperties = [valueObject.path[0]].concat(varString)
            const dotPropPath = deepProperties.join('.')
            const deeperExists = dotProp.get(fullObject, dotPropPath)
            // console.log('fallThroughSelfMatcher deeper', deeperExists)
            return deeperExists
          }
        }
        // console.log('fallthrough fullObject', fullObject)
        /* is simple ${whatever} reference in same file */
        const startOf = varString.split('.')
        return fullObject[startOf[0]]
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
          console.log('Variable', v)
          throw new Error('Variable source must have a type')
        }
        if (!v.match || !v.resolver) {
          console.log('Variable', v)
          throw new Error('Variable source must have a match and resolver functions')
        }
      })

      this.variableTypes = this.variableTypes.concat(options.variableSources)
    }

    /* attach self matcher last */
    this.variableTypes = this.variableTypes.concat(fallThroughSelfMatcher)

    // const variablesKnownTypes = new RegExp(`^(${this.variableTypes.map((v) => v.prefix || v.type).join('|')}):`)
    const variablesKnownTypes = combineRegexes(
      this.variableTypes.filter((v) => v.type !== 'string').map((v) => v.match)
    )
    this.variablesKnownTypes = variablesKnownTypes

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
        return JSON5.parse(val)
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
        if (['true', '1', 'yes', 'on'].includes(v)) return true
        if (['false', '0', 'no', 'off'].includes(v)) return false
        throw new Error(`Configorama Error: Expected Boolean, got "${value}"`)
      },
      String: (value) => {
        if (value === undefined || value === null || value === 'null') return ''
        return String(value)
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
    }

    // Apply user defined filters
    if (options.filters) {
      this.filters = Object.assign({}, this.filters, options.filters)
    }

    // (\|\s*(toUpperCase|toLowerCase|toCamelCase|toKebabCase|capitalize)\s*)+$
    // Updated to support function-style filters like help('text') with nested parens
    // Use a more permissive pattern that matches anything between parens including nested parens
    this.filterMatch = new RegExp(`(\\|\\s*(${Object.keys(this.filters).join('|')})(?:\\s*\\([^)]*(?:\\([^)]*\\))?[^)]*\\))?\\s*)+}?$`)
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
      math: () => {},
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
      this.functions = Object.assign({}, this.functions, options.functions)
    }

    this.deep = []
    this.leaves = []
    this.callCount = 0
  }

  initialCall(func) {
    this.deep = []
    this.tracker.start()
    return func().finally(() => {
      this.tracker.stop()
      this.deep = []
    })
  }

  /**
   * Populate all variables in the service, conveniently remove and restore the service attributes
   * that confuse the population methods.
   * @param cliOpts An options hive to use for ${opt:...} variables.
   * @returns {Promise.<TResult>|*} A promise resolving to the populated service.
   */
  async init(cliOpts) {
    this.options = cliOpts || {}
    const configoramaOpts = this.opts

    const showFoundVariables = configoramaOpts && configoramaOpts.dynamicArgs && (configoramaOpts.dynamicArgs.list || configoramaOpts.dynamicArgs.info)

    // If we have a file path but no config yet, parse it now
    if (this.configFilePath && !this.config) {
      let configObject = await parseFileContents(
        this.originalString,
        this.configFileType,
        this.configFilePath,
        this.variableSyntax,
        this.opts
      )
      this.configFileContents = ''
      if (VERBOSE || showFoundVariables || this.opts.returnPreResolvedVariableDetails) {
        this.configFileContents = fs.readFileSync(this.configFilePath, 'utf8')
      }
      /*
      console.log('before preprocess', configObject)
      /** */
      /* Preprocess step here */
      configObject = preProcess(configObject, this.variableSyntax)
      /*
      console.log('after preprocess', configObject)
      /** */
      //process.exit(1)

      this.config = configObject
      this.originalConfig = cloneDeep(configObject)
    }

    if (VERBOSE) {
      logHeader('Config Input before processing')
      console.log()
      deepLog(this.originalConfig)
      console.log()
    }

    const variableSyntax = this.variableSyntax
    const variablesKnownTypes = this.variablesKnownTypes

    if (VERBOSE || showFoundVariables || this.opts.returnPreResolvedVariableDetails) {
      // Use collectVariableMetadata to get variable info (DRY - don't duplicate logic)
      const metadata = this.collectVariableMetadata()

      const enrich = enrichMetadata(
        metadata,
        this.resolutionTracking,
        this.variableSyntax,
        this.fileRefsFound,
        this.originalConfig,
        this.configFilePath,
        Object.keys(this.filters)
      )

      if (showFoundVariables) {
        /*
        deepLog('metadata', metadata)
        fs.writeFileSync(`metadata-${path.basename(this.configFilePath)}.json`, JSON.stringify(metadata, null, 2))
        deepLog('enrich', enrich)
        // process.exit(1)
        /** */
      }

      const variableData = metadata.variables
      const uniqueVariables = metadata.uniqueVariables
      const varKeys = Object.keys(variableData)
      const uniqueVarKeys = Object.keys(uniqueVariables)

      if (this.opts.returnPreResolvedVariableDetails) {
        return enrich
      }

      if (!varKeys.length) {
        logHeader('No Variables Found in Config')
        if (this.configFilePath) {
          console.log(`File: ${this.configFilePath}`)
        }
        
        console.log(`\nVariable syntax: `, variableSyntax)

        const varTypes = Object.keys(this.variableTypes)
        if (varTypes.length) {
          const exclude = ['dot.prop', 'deep']
          console.log('\nAllowed variable types:')
          varTypes.filter((v) => v.type !== 'dot.prop').forEach((v) => {
            const vData = this.variableTypes[v]
            if (exclude.includes(vData.type)) {
              return
            }
            console.log(`  - ${vData.type}: `, vData.match)
          })
        }
        console.log()
      }

      if (varKeys.length > 0) {
        const fileName = this.configFilePath ? ` in ${this.configFilePath}` : ''

        // Extract base variable name from varMatch key (e.g., '${env:FOO, default}' -> 'env:FOO')
        const getBaseVarName = (key) => key.replace(/^\$\{/, '').replace(/\}$/, '').split(',')[0].trim()

        logHeader(`Found ${varKeys.length} Variables${fileName}`)

        // deepLog('variableData', variableData)

        if (varKeys.length) {
          console.log()
          const longestKey = varKeys.reduce((acc, k) => {
            return Math.max(acc, k.length)
          }, 0)

          // Use uniqueVariables for simpler reference counting
          const referenceData = varKeys.map((k) => {
            const varName = getBaseVarName(k)
            const uniqueVar = uniqueVariables[varName]
            const refCount = uniqueVar ? uniqueVar.occurrences.length : variableData[k].length
            const placesWord = refCount > 1 ? 'places' : 'place'
            return `- ${k.padEnd(longestKey).padEnd(longestKey + 10)} referenced ${refCount} ${placesWord}`
          }).join('\n')

          console.log(`${referenceData}\n`)
        }

        logHeader('Variable Details')

        const lines = this.configFileContents ? this.configFileContents.split('\n') : []

        const indent = ''
        const boxes = varKeys.map((key, i) => {
          const variableInstances = variableData[key]
          // console.log('variableInstances', variableInstances)
          const firstInstance = variableInstances[0]

          // Get uniqueVariable data for description and other metadata
          const varName = getBaseVarName(key)
          const uniqueVar = uniqueVariables[varName]

          // Build display message from enriched metadata
          const spacing = '           '
          const titleText = `Variable:${spacing}`
          const VALUE_HEX = '#899499'
          const keyChalk = chalk.whiteBright
          const valueChalk = chalk.hex(VALUE_HEX)

          let varMsg = ''
          let requiredMessage = ''

          // Show required status from metadata
          if (firstInstance.isRequired) {
            requiredMessage = `${chalk.red.bold('[Required]')}`
          }

          // Show type filter if present (Boolean, String, Number, etc.)
          if (uniqueVar && uniqueVar.types && uniqueVar.types.length > 0) {
            const typeLabel = `${indent}${keyChalk('Type:'.padEnd(titleText.length, ' '))}`
            varMsg += `${typeLabel} ${valueChalk(uniqueVar.types.join(', '))}\n`
          }

          // Show description from uniqueVariables if available
          if (uniqueVar && uniqueVar.descriptions && uniqueVar.descriptions.length > 0) {
            const descText = `${indent}${keyChalk('Description:'.padEnd(titleText.length, ' '))}`
            const combinedDesc = uniqueVar.descriptions.join('. ')
            varMsg += `${descText} ${valueChalk(combinedDesc)}\n`
          }

    

          // Show default value from metadata
          if (typeof firstInstance.defaultValue !== 'undefined') {
            const defaultValueRender = firstInstance.defaultValue === '' ? '""' : firstInstance.defaultValue
            const defaultValueText = `${indent}${keyChalk('Default value:'.padEnd(titleText.length, ' '))}`
            varMsg += `${defaultValueText} ${valueChalk(defaultValueRender)}\n`
          }

          // Show default value source path from metadata
          if (firstInstance.defaultValueSrc) {
            varMsg += `${indent}${keyChalk('Default value path:'.padEnd(titleText.length, ' '))} `
            varMsg += `${valueChalk(firstInstance.defaultValueSrc)}\n`
          }

          // Show resolve order from metadata
          if (firstInstance.resolveOrder.length > 1) {
            varMsg += `${indent}${keyChalk('Resolve Order:'.padEnd(titleText.length, ' '))}`
            const resolveOrder = firstInstance.resolveOrder.join(', ')
            varMsg += ` ${valueChalk(resolveOrder)}\n`
          }

          // Show path(s) from metadata
          let locationRender = valueChalk(variableInstances[0].path)
          let locationLabel = `${indent}${keyChalk('Config Path:'.padEnd(titleText.length, ' '))}`
          let typeText = ''
          if (variableInstances.length > 1) {
            const pathIndent = ' '.repeat(titleText.length + 1)
            const pathItems = variableInstances.map((v, idx) => {
              // Show type filter per path if different
              if (uniqueVar && uniqueVar.occurrences.length > 1) {
                const occurrence = uniqueVar.occurrences.find(occ => occ.path === v.path)
                const pathType = occurrence && occurrence.type
                typeText = pathType ? ` ${chalk.dim(`Type: ${pathType}`)}` : ''
                const prefix = idx === 0 ? '' : `${indent}${pathIndent}`
                return `${prefix}${valueChalk(`- ${v.path}`)}${typeText}`
              }
              const prefix = idx === 0 ? '' : `${indent}${pathIndent}`
              return `${prefix}${valueChalk(`- ${v.path}`)}${typeText}`
            })
            locationRender = pathItems.join('\n')
            locationLabel = `${indent}${keyChalk('Config Paths:'.padEnd(titleText.length, ' '))}`
          } else {
            const pathType = firstInstance.type
            typeText = pathType ? ` ${chalk.dim(`Type: ${pathType}`)}` : ''
          }
          varMsg += `${locationLabel} ${locationRender}`

          // Find line number in config file based on format (YAML, TOML, JSON, INI)
          const configKey = firstInstance.key
          const line = lines.findIndex((line) => {
            const fileType = this.configFileType
            const escapedKey = configKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            // YAML: key: or key :
            if (fileType === '.yml' || fileType === '.yaml') {
              return new RegExp(`^\\s*${escapedKey}\\s*:`).test(line)
            }
            // TOML: key = or key=
            if (fileType === '.toml') {
              return new RegExp(`^\\s*${escapedKey}\\s*=`).test(line)
            }
            // JSON: "key": or "key" :
            if (fileType === '.json' || fileType === '.json5') {
              return new RegExp(`"${escapedKey}"\\s*:`).test(line)
            }
            // INI: key = or key=
            if (fileType === '.ini') {
              return new RegExp(`^\\s*${escapedKey}\\s*=`).test(line)
            }
            // JS/TS/ESM: key: or "key": or 'key': or `key`: or [`key`]:
            if (['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'].includes(fileType)) {
              return new RegExp(`(?:${escapedKey}|"${escapedKey}"|'${escapedKey}'|\`${escapedKey}\`|\\[\`${escapedKey}\`\\])\\s*:`).test(line)
            }
            // Default fallback: try YAML-style
            return line.includes(`${configKey}:`)
          })
          const lineNumber = line !== -1 ? line + 1 : 0


          return {
            content: {
              left: varMsg,
              backgroundColor: 'red',
              width: '100%',
            },
            title: {
              left: `▷ ${lineNumber ? createEditorLink(this.configFilePath, lineNumber, 1, key) : key}`,
              right: lineNumber ? createEditorLink(this.configFilePath, lineNumber, 1, `${requiredMessage} ${lineNumber ? `Line: ${lineNumber.toString().padEnd(2, ' ')}` : ''}`, 'gray') : '',
              center: typeText,
              paddingBottom: 1,
              paddingTop: (i === 0) ? 1 : 0,
              truncate: true,
            },
            width: '100%',
          }
        })

        console.log(makeStackedBoxes(boxes, {
          borderText: 'Variable Details. Click on titles to open in editor.',
          borderColor: 'gray',
          minWidth: '96%',
          borderStyle: 'bold',
          disableTitleSeparator: true,
        }))
        // process.exit(1)
      }


      // WALK through CLI prompt if --setup flag is set
      if (SETUP_MODE) {
        logHeader('Setup Mode')
        // deepLog('enrich', enrich)
        const userInputs = await runConfigWizard(enrich, this.originalConfig, this.configFilePath)

        console.log('\n')
        logHeader('User Inputs Summary')
        console.log(JSON.stringify(userInputs, null, 2))

        // TODO set values

        // Apply user inputs to options and environment
        if (userInputs.options) {
          Object.assign(this.opts, userInputs.options)
        }
        if (userInputs.env) {
          Object.assign(process.env, userInputs.env)
        }
        // Note: self references are in the config, so no need to apply them

        console.log()
        logHeader('Resolving Configuration')
        console.log()

        // process.exit(1)

        // Continue with normal resolution flow using the new values
        // Don't exit - let it fall through to resolve the config
      }
    
      /* Exit early if list or info flag is set */
      if (showFoundVariables) {
        process.exit(0)
      }
    }

    const originalConfig = this.originalConfig

    /* If no variables found just return early */
    if (this.originalString && !this.originalString.match(this.variableSyntax)) {
      return Promise.resolve(this.originalConfig)
    }

    const useDotEnv = this.originalConfig.useDotenv || this.originalConfig.useDotEnv
    if ((useDotEnv && useDotEnv === true) || this.opts.useDotEnvFiles) {
      let providerStage
      /* has hardcoded stage */
      if (
        this.originalConfig && this.originalConfig.provider && 
        this.originalConfig.provider.stage && !this.originalConfig.provider.stage.match(this.variableSyntax)
      ) {
        providerStage = this.originalConfig.provider.stage
      }
      const stage = cliOpts.stage || providerStage || process.env.NODE_ENV || 'dev'
      /* Load env variables into process.env */
      const values = require('env-stage-loader')({
        // silent: true,
        // debug: true,
        env: stage,
        // defaultEnv: 'prod',
        // ignoreFiles: ['.env']
      })
    }

    /* Parse variables */
    return this.initialCall(() => {
      return Promise.resolve()
        .then(() => {
          return this.populateObjectImpl(this.config).finally(() => {
            // TODO populate function values here?
            // console.log('Final Config', this.config)
            // console.log(this.deep)
            const transform = this.runFunction.bind(this)
            const varSyntax = this.variableSyntax
            const leaves = this.leaves
            // console.log('leaves two', leaves)
            // Traverse resolved object and run functions
            // console.log('this.config', this.config)
            traverse(this.config).forEach(function (rawValue) {
              /* Pass through unknown variables */
              if (!configoramaOpts.allowUndefinedValues && typeof rawValue === 'undefined') {
                const configValuePath = this.path.join('.')
                /*
                console.log(this.path)
                /** */
                const ogValue = dotProp.get(originalConfig, configValuePath)
                const varDisplay = ogValue ? `"${ogValue}" variable` : 'variable'

                const leaf = leaves.find((l) => l.path.join('.') === configValuePath)
                // if (leaf) {
                //   deepLog('leaf', leaf)
                // }
                const errorMessage = `
  Config error:\n
  Path "${configValuePath}" resolved to "undefined".\n
  Verify the ${varDisplay} in config at "${configValuePath}".\n
  ${leaf ? `See:\n  ${leaf.originalValuePath}: ${leaf.originalSource} ` : ''}
  ${leaf && leaf.isFileRef ? `\n  The error could be deeper in the referenced file at ${configValuePath.replace(leaf.originalValuePath, '').replace(/^\./, '')} key.\n` : ''}`
                throw new Error(errorMessage)
              }
              if (typeof rawValue === 'string') {
                // console.log('rawValue', rawValue)
                /* Process inline functions like merge() */
                if (ENABLE_FUNCTIONS && rawValue.match(/> function /)) {
                  // console.log('RAW FUNCTION', rawFunction)
                  const funcString = rawValue.replace(/> function /g, '')
                  // console.log('funcString', funcString)
                  const func = cleanVariable(funcString, varSyntax, true, `init ${this.callCount}`)
                  const funcVal = transform(func)
                  const hasObjectRef = rawValue.match(/\.\S*$/)
                  if (hasObjectRef && typeof funcVal === 'object') {
                    const objectPath = hasObjectRef[0].replace(/^\./, '')
                    // console.log('objectPath', objectPath)
                    /* get value from object and update  */
                    const valueFromObject = dotProp.get(funcVal, objectPath)
                    // console.log('valueFromObject', valueFromObject)
                    this.update(valueFromObject)
                  } else {
                    this.update(funcVal)
                  }
                }

                /* fix for file(JS-ref.js, raw) to keep parens and inline code */
                if (hasParenthesesPlaceholder(rawValue)) {
                  rawValue = decodeJsSyntax(rawValue)
                  this.update(rawValue)
                }

                /* Allow for unknown variables to pass through */
                if (rawValue.match(/>passthrough/)) {
                  const newValues = decodeUnknown(rawValue)
                  // console.log('>>>> newValues', newValues)
                  this.update(newValues)
                }
              }
            })

            if (DEBUG) {
              console.log(`Variable process ran ${this.callCount} times`)
              // console.log('FINAL Value', this.config)
              // console.log(this.deep)
            }
          })
        })
        .then(() => {
          // console.log('this.config', this.config)
          /* Final post-processing here */
          if (this.mergeKeys && this.config) {
            this.config = mergeByKeys(this.config, '', this.mergeKeys)
          }
          if (VERBOSE) {
            logHeader('Resolved Configuration value')
            console.log()
            deepLog(this.config)
            console.log()
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
    const variableSyntax = this.variableSyntax
    const variablesKnownTypes = this.variablesKnownTypes
    const variableTypes = this.variableTypes
    const filterMatch = this.filterMatch
    const configFilePath = this.configFilePath
    const originalConfig = this.originalConfig
    const foundVariables = []
    const variableData = {}
    const fileRefs = []
    const fileGlobPatterns = []
    const preResolvedPaths = new Set()
    const byConfigPath = []
    const referencesMap = new Map()
    let matchCount = 1

    traverse(this.originalConfig).forEach(function (rawValue) {
      if (typeof rawValue === 'string' && rawValue.match(variableSyntax)) {
        const configValuePath = this.path.join('.')
        /* Skip Fn::Sub variables */
        if (configValuePath.endsWith('Fn::Sub')) {
          return
        }

        const nested = findNestedVariables(
          rawValue, 
          variableSyntax, 
          variablesKnownTypes, 
          configValuePath, 
          variableTypes
        )

        const lastItem = nested[nested.length - 1]
        const lastKeyPath = this.path[this.path.length - 1]
        const itemKey = (lastKeyPath.match(/[\d+]$/)) ? `${this.path[this.path.length - 2]}[${lastKeyPath}]` : lastKeyPath

        // Extract filters from varMatch
        const originalSrc = lastItem.varMatch || ''
        const hasFilters = filterMatch && originalSrc.match(filterMatch)
        let foundFilters = []
        let keyWithoutFilters = originalSrc

        if (hasFilters) {
          // Extract filter names from the match (e.g., "| String}" -> ["String"])
          const filterPart = hasFilters[0].replace(/}?$/, '') // Remove trailing }
          foundFilters = filterPart
            .split('|')
            .map((filter) => filter.trim())
            .filter(Boolean)

          // Remove filters from the key (replace "| String}" with "}")
          // Also clean up any trailing whitespace before the closing brace
          keyWithoutFilters = originalSrc.replace(filterMatch, '}').replace(/\s+}$/, '}')
        }

        const key = keyWithoutFilters

        // Strip filters from resolveDetails
        const cleanedResolveDetails = nested.map(detail => {
          const cleaned = { ...detail }
          if (cleaned.varMatch && filterMatch) {
            const match = cleaned.varMatch.match(filterMatch)
            if (match) {
              cleaned.varMatch = cleaned.varMatch.replace(filterMatch, '').replace(/\s+$/, '') + '}'
            }
          }
          if (cleaned.variable && filterMatch) {
            const match = cleaned.variable.match(filterMatch)
            if (match) {
              cleaned.variable = cleaned.variable.replace(filterMatch, '').replace(/\s+$/, '')
            }
          }
          if (cleaned.varString && filterMatch) {
            const match = cleaned.varString.match(filterMatch)
            if (match) {
              cleaned.varString = cleaned.varString.replace(filterMatch, '').trim()
            }
          }
          // Also clean fallbackValues if present
          if (cleaned.fallbackValues && Array.isArray(cleaned.fallbackValues)) {
            cleaned.fallbackValues = cleaned.fallbackValues.map(fb => {
              const cleanedFb = { ...fb }
              if (cleanedFb.varMatch && filterMatch) {
                const match = cleanedFb.varMatch.match(filterMatch)
                if (match) {
                  cleanedFb.varMatch = cleanedFb.varMatch.replace(filterMatch, '').trim()
                }
              }
              if (cleanedFb.variable && filterMatch) {
                const match = cleanedFb.variable.match(filterMatch)
                if (match) {
                  cleanedFb.variable = cleanedFb.variable.replace(filterMatch, '').trim()
                }
              }
              if (cleanedFb.stringValue && filterMatch) {
                const match = cleanedFb.stringValue.match(filterMatch)
                if (match) {
                  cleanedFb.stringValue = cleanedFb.stringValue.replace(filterMatch, '').trim()
                }
              }
              return cleanedFb
            })
          }
          return cleaned
        })

        const varData = {
          path: configValuePath,
          key: itemKey,
          originalStringValue: rawValue,
          variable: keyWithoutFilters,
          variableWithFilters: originalSrc,
          isRequired: false,
          defaultValue: undefined,
          matchIndex: matchCount++,
          resolveOrder: [],
          resolveDetails: cleanedResolveDetails,
          ...(foundFilters.length > 0 && { filters: foundFilters }),
        }
        let defaultValueIsVar = false

        function calculateResolveOrder(item) {
          // Helper to strip filters from variable strings
          const stripFilters = (str) => {
            if (!str || !filterMatch) return str
            const match = str.match(filterMatch)
            if (match) {
              return str.replace(filterMatch, '').trim()
            }
            return str
          }

          if (item && item.fallbackValues) {
            let hasResolvedFallback
            const order = ([stripFilters(item.valueBeforeFallback)]).concat(item.fallbackValues.map((f, i) => {
              if (f.fallbackValues) {
                const [nestedOrder, nestedResolvedFallback] = calculateResolveOrder(f)
                if (!hasResolvedFallback && nestedResolvedFallback) {
                  hasResolvedFallback = nestedResolvedFallback
                }
                return nestedOrder
              }

              if (!hasResolvedFallback && f.isResolvedFallback) {
                hasResolvedFallback = stripFilters(f.stringValue)
              }
              if (f.isResolvedFallback) {
                hasResolvedFallback = stripFilters(f.stringValue)
              }

              if (!hasResolvedFallback && f.isVariable) {
                defaultValueIsVar = f
              }
              const valueStr = stripFilters(f.stringValue || f.variable)
              return `${valueStr}${f.isResolvedFallback ? ' (default)' : ''}`
            })).flat()

            return [order, hasResolvedFallback]
          }
          return [[stripFilters(item.variable)], undefined]
        }

        const [resolveOrder, hasResolvedFallback] = calculateResolveOrder(lastItem)
        varData.resolveOrder = resolveOrder

        if (defaultValueIsVar) {
          varData.defaultValueIsVar = defaultValueIsVar
        }

        if (typeof hasResolvedFallback !== 'undefined') {
          varData.defaultValue = hasResolvedFallback
        }

        if (typeof varData.defaultValue === 'undefined') {
          varData.isRequired = true
        }

        if (varData.resolveOrder.length > 1) {
          varData.hasFallback = true
        }

        // Extract file references
        nested.forEach((detail) => {
          // console.log('detail', detail)
          if (detail.variableType && (detail.variableType === 'file' || detail.variableType === 'text')) {
            const extracted = extractFilePath(detail.variable)
            if (extracted) {
              const normalizedPath = normalizePath(extracted.filePath)
              if (!normalizedPath) return

              // Handle variables in file paths - just record the pattern
              if (!fileRefs.includes(normalizedPath)) {
                fileRefs.push(normalizedPath)
              }

              // Check if path contains variables and create glob pattern
              const containsVariables = !!normalizedPath.match(variableSyntax)
              let globPattern
              if (containsVariables) {
                // Replace variable syntax ${...} with * for glob pattern
                globPattern = normalizedPath.replace(variableSyntax, '*')
                if (!fileGlobPatterns.includes(globPattern)) {
                  fileGlobPatterns.push(globPattern)
                }
              }

              // Try to pre-resolve inner variables from originalConfig
              let resolvedPath = normalizedPath
              let resolvedVarString = rawValue
              if (containsVariables) {
                const pathResult = resolveInnerVariables(normalizedPath, variableSyntax, originalConfig, dotProp.get)
                const varStringResult = resolveInnerVariables(rawValue, variableSyntax, originalConfig, dotProp.get)

                if (pathResult.didResolve) {
                  resolvedPath = normalizePath(pathResult.resolved) || pathResult.resolved
                  resolvedVarString = varStringResult.resolved
                  preResolvedPaths.add(resolvedPath)
                }
              }

              // Build byConfigPath entry
              const absolutePath = configFilePath
                ? path.resolve(path.dirname(configFilePath), resolvedPath)
                : resolvedPath
              const fileExists = configFilePath ? fs.existsSync(absolutePath) : false

              const configPathEntry = {
                location: configValuePath,
                filePath: absolutePath,
                relativePath: resolvedPath,
                originalVariableString: rawValue,
                resolvedVariableString: resolvedVarString,
                containsVariables,
                exists: fileExists,
              }
              if (globPattern) {
                configPathEntry.pattern = globPattern
              }
              byConfigPath.push(configPathEntry)

              // Build references entry (use resolvedPath as key when available)
              const refKey = resolvedPath
              if (!referencesMap.has(refKey)) {
                referencesMap.set(refKey, {
                  resolvedPath: refKey,
                  refs: [],
                })
              }
              const refEntry = referencesMap.get(refKey)
              refEntry.refs.push({
                location: configValuePath,
                value: normalizedPath,
                originalVariableString: rawValue,
              })
            }
          }
        })

        variableData[key] = (variableData[key] || []).concat(varData)
        foundVariables.push(rawValue)
      }
    })

    // Make foundVariables array unique
    const finalFoundVariables = [...new Set(foundVariables)]
    const varKeys = Object.keys(variableData)

    // Calculate summary using same logic as CLI display
    let requiredCount = 0
    let withDefaultsCount = 0
    varKeys.forEach((key) => {
      const instances = variableData[key]
      const firstInstance = instances[0]

      // Check if truly required using same logic as display code
      let isTrulyRequired = false
      if (typeof firstInstance.defaultValue === 'undefined') {
        // Check for self-references that resolve to config values
        let dotPropArr = []
        if (firstInstance.defaultValueIsVar && (
          firstInstance.defaultValueIsVar.variableType === 'self:' ||
          firstInstance.defaultValueIsVar.variableType === 'dot.prop'
        )) {
          dotPropArr = [firstInstance.defaultValueIsVar]
        }

        const hasDotPropOrSelf = instances.reduce((acc, v) => {
          // Only check the outermost variable (last in resolveDetails)
          if (v.resolveDetails && v.resolveDetails.length > 0) {
            const outermostDetail = v.resolveDetails[v.resolveDetails.length - 1]
            if (outermostDetail.variableType === 'dot.prop' || outermostDetail.variableType === 'self') {
              acc.push(outermostDetail)
            }
          }
          return acc
        }, dotPropArr)

        if (!hasDotPropOrSelf.length) {
          isTrulyRequired = true
        } else {
          // Check if the self-reference resolves to a value
          const cleanPath = hasDotPropOrSelf[0].variable.replace('self:', '')
          const dotPropValue = dotProp.get(this.originalConfig, cleanPath)
          if (typeof dotPropValue === 'undefined') {
            isTrulyRequired = true
          } else {
            // Enrich with default value from self-reference
            firstInstance.defaultValueSrc = cleanPath
            const niceString = typeof dotPropValue === 'object' ? JSON.stringify(dotPropValue) : dotPropValue
            const truncatedString = niceString.length > 100 ? niceString.substring(0, 90) + '...' : niceString
            firstInstance.defaultValue = truncatedString
            firstInstance.isRequired = false
          }
        }
      }

      // Update isRequired based on computed isTrulyRequired
      firstInstance.isRequired = isTrulyRequired

      if (isTrulyRequired) {
        requiredCount++
      } else {
        withDefaultsCount++
      }
    })

    return {
      variables: variableData,
      uniqueVariables: {},
      fileDependencies: {
        globPatterns: fileGlobPatterns,
        // all: fileRefs,
        dynamicPaths: fileRefs.filter(ref => ref.indexOf('*') !== -1 || ref.match(variableSyntax)),
        // Resolved paths: static paths + pre-resolved dynamic paths
        resolvedPaths: [
          ...fileRefs.filter(ref => ref.indexOf('*') === -1 && !ref.match(variableSyntax)),
          ...preResolvedPaths
        ],
        byConfigPath,
        references: Array.from(referencesMap.values()),
      },
      summary: {
        totalVariables: varKeys.length,
        requiredVariables: requiredCount,
        variablesWithDefaults: withDefaultsCount
      },
    }
  }
  runFunction(variableString) {
    // console.log('runFunction', variableString)
    /* If json object value return it */
    if (variableString.match(/^\s*{/) && variableString.match(/}\s*$/)) {
      return variableString
    }
    // console.log('runFunction', variableString)
    var hasFunc = funcRegex.exec(variableString)
    // TODO finish Function handling. Need to move this down below resolver to resolve inner refs first
    // console.log('hasFunc', hasFunc)
    if (!hasFunc || hasFunc && (hasFunc[1] === 'cron' || hasFunc[1] === 'eval')) {
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
      // TODO fix how commas + spaces are ned
      const splitter = splitCsv(rawArgs, ', ')
      // console.log('splitter', splitter)
      argsToPass = formatFunctionArgs(splitter)
    }
    // console.log('argsToPass runFunction', argsToPass)
    // TODO check for camelCase version. | toUpperCase messes with function name
    const theFunction = this.functions[functionName] || this.functions[functionName.toLowerCase()]

    if (!theFunction) throw new Error(`Function "${functionName}" not found`)

    const funcValue = theFunction(...argsToPass)
    // console.log('funcValue', funcValue)
    // console.log('typeof funcValue', typeof funcValue)
    let replaceVal = funcValue
    if (typeof funcValue === 'string') {
      const replaceIt = variableString.replace(hasFunc[0], funcValue)
      replaceVal = cleanVariable(replaceIt, this.variableSyntax, true, `runFunction ${this.callCount}`)
    }

    // If wrapped in outer function, recurse
    const hasMoreFunctions = funcRegex.exec(replaceVal)
    if (hasMoreFunctions) {
      return this.runFunction(replaceVal)
    }
    return replaceVal
  }
  // ############
  // ## OBJECT ##
  // ############
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
   * @property {Date|RegEx|String} The value of the terminal property
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
      map(current, addContext)
    } else if (isObject(current) && !isDate(current) && !isRegExp(current) && !isFunction(current)) {
      if (atRoot || current !== root) {
        mapValues(current, addContext)
      }
    } else {
      // TODO Add values to leaves here
      const leaf = {
        path: context,
        value: current,
      }
      const thePath = leaf.path.length > 1 ? leaf.path.join('.') : leaf.path[0]
      // console.log('thePath', thePath)
      // console.log('this.originalConfig', this.originalConfig)
      let originalValue = dotProp.get(this.originalConfig, thePath)
      // TODO @DWELLS make recursive
      if (!originalValue) {
        // Recurse up the tree until we find a value
        let currentPathArray = leaf.path.slice(0, -1)
        while (currentPathArray.length > 0 && !originalValue) {
          const currentPath = currentPathArray.length > 1 ? currentPathArray.join('.') : currentPathArray[0]
          // console.log('checking parent path:', currentPath)
          originalValue = dotProp.get(this.originalConfig, currentPath)
          if (typeof originalValue !== 'undefined') {
            leaf.originalValuePath = currentPath
            leaf.currentConfig = this.config
          }
          currentPathArray = currentPathArray.slice(0, -1)
        }
      }
      leaf.originalSource = originalValue

      // Check if we have existing resolution history from previous iterations
      const pathKey = thePath
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
      // dotProp.get(this.originalConfig, thePath)
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
    let variables = properties.filter((property) => {
      // Initial check if value has variable string in it
      return isString(property.value) && property.value.match(this.variableSyntax)
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
   * @returns {Promise<number>} resolving with the number of changes that were applied to the given
   * target
   */
  assignProperties(target, populations) {
    // eslint-disable-line class-methods-use-this
    return Promise.all(populations).then((results) => {
      return results.forEach((result) => {
        if (result.value !== result.populated) {
          set(target, result.path, result.populated)
        }
      })
    })
  }
  /**
   * Populate the variables in the given object.
   * @param objectToPopulate The object to populate variables within.
   * @returns {Promise.<TResult>|*} A promise resolving to the in-place populated object.
   */
  populateObject(objectToPopulate) {
    return this.initialCall(() => this.populateObjectImpl(objectToPopulate))
  }
  populateObjectImpl(objectToPopulate) {
    this.callCount = this.callCount + 1

    if (DEBUG) {
      deepLog(`objectToPopulate called ${this.callCount} times`, objectToPopulate)
      // process.exit(0)
    }

    const leaves = this.getProperties(objectToPopulate, true, objectToPopulate)
    this.leaves = leaves
    // console.log('leaves', leaves)
    const populations = this.populateVariables(leaves)
    // console.log("FILL LEAVES", populations)

    if (populations.length === 0) {
      if (DEBUG) console.log('Config Population Finished')
      return Promise.resolve(objectToPopulate)
    }

    return this.assignProperties(objectToPopulate, populations).then(() => {
      return this.populateObjectImpl(objectToPopulate)
    })
  }
  // ##############
  // ## PROPERTY ##
  // ##############
  /**
   * @typedef {Object} MatchResult
   * @property {String} match The original property value that matched the variable syntax
   * @property {String} variable The cleaned variable string that specifies the origin for the
   * property value
   */
  /**
   * Get matches against the configured variable syntax
   * @param property The property value to attempt extracting matches from
   * @returns {Object|String|MatchResult[]} The given property or the identified matches
   */
  getMatches(property) {
    if (typeof property !== 'string') return property
    const matches = property.match(this.variableSyntax)
    if (!matches || !matches.length) return property
    return map(matches, (match) => {
      // console.log('match', match)
      return {
        match: match,
        variable: cleanVariable(match, this.variableSyntax, true, `getMatches ${this.callCount}`),
      }
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
      return this.splitAndGet(match.variable, valueObject, root, match.match)
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
    }

    let result = valueObject.value
    for (let i = 0; i < matches.length; i += 1) {
      this.warnIfNotFound(matches[i].variable, results[i])

      // Extract metadata from result if present
      let actualResult = results[i]
      let resolverType = undefined
      if (results[i] && typeof results[i] === 'object') {
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
      if (actualResult && typeof actualResult === 'object' && actualResult.__internal_only_flag) {
        cleanResult = actualResult.value
      }

      let valueBeforeResolution = result

      if (typeof valueBeforeResolution === 'object' && valueBeforeResolution.__internal_only_flag) {
        valueBeforeResolution = valueBeforeResolution.value
      }

      const finalResult = decodeEncodedValue(cleanResult)

      // Track this resolution step in history
      const historyEntry = {}

      historyEntry.match = matches[i].match
      historyEntry.variable = matches[i].variable
      if (historyEntry.resultType === 'string' && historyEntry.result.match(/^>passthrough\[/)) {
        historyEntry.variableType = 'encodedUnknown'
      }
      if (resolverType) {
        historyEntry.variableType = resolverType
      }
      historyEntry.result = finalResult

      const isDeepResult = typeof finalResult === 'string' && finalResult.match(/^\$\{deep:\d+\}$/)

      if (isDeepResult) {
        historyEntry.resultAfterDeep = 'TBD'
      }

      historyEntry.resultType = typeof finalResult
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
          const isVariable = trimmedFallback.match(this.variableSyntax) || trimmedFallback.match(this.variablesKnownTypes)
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
      const isDuplicate = valueObject.resolutionHistory.some(entry =>
        entry.match === historyEntry.match &&
        entry.variable === historyEntry.variable
      )

      if (!isDuplicate) {
        valueObject.resolutionHistory.push(historyEntry)
      }

      // Process the match
      let valueToPop = results[i]
      // TODO refactor this. __internal_only_flag needed to stop clash with sync/async file resolution
      if (results[i] && typeof results[i] === 'object' && (results[i].__internal_only_flag || results[i].__internal_metadata)) {
        valueToPop = results[i].value
      }
      result = this.populateVariable(valueObject, matches[i].match, valueToPop)
      /*
      console.log('> valueToPop', valueToPop)
      console.log('> valueObject', valueObject)
      console.log('populateVariable r', result)
      console.log(this.deep)
      /** */
    }

    // Save resolution history to tracking map for persistence across iterations
    if (valueObject.path && valueObject.path.length) {
      const pathKey = valueObject.path.join('.')
      if (!this.resolutionTracking[pathKey]) {
        this.resolutionTracking[pathKey] = {
          path: pathKey,
          originalPropertyString: valueObject.originalSource,
          resolvedPropertyValue: undefined,
          calls: []
        }
      }
      this.resolutionTracking[pathKey].resolutionHistory = valueObject.resolutionHistory
    }

    return result
  }
  /**
   * Populate the given value, recursively if root is true
   * @param valueObject The value to populate variables within
   * @param root Whether the caller is the root populater and thereby whether to recursively
   * populate
   * @returns {PromiseLike<T>} A promise that resolves to the populated value, recursively if root
   * is true
   */
  populateValue(valueObject, root, caller) {
    if (DEBUG) {
      console.log('─────────────────────────────────────────────▶')
      console.log('>>>>>>>> populateValue', caller)
      console.log(valueObject)
    }
    const property = valueObject.value
    const matches = this.getMatches(property)
    /*
    console.log('populateValue matches', matches)
    /** */
    if (!isArray(matches)) {
      return Promise.resolve(property)
    }
    const populations = this.populateMatches(matches, valueObject, root)
    return Promise.all(populations)
      .then((results) => {
        // console.log('populateMatches results', results)
        return this.renderMatches(valueObject, matches, results)
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
   * @returns {Promise} A promise resolving to the final value of the given variable
   */
  splitAndGet(variable, valueObject, root, originalVar) {
    if (DEBUG) {
      console.log('>>>>>>>> Split and Get', variable)
      console.log('valueObject', valueObject)
      console.log('root', root)
    }
    /* requires node 8.11+
    if (valueObject.value.match(/(?<!^)> function /)) {
      // valueObject.value = valueObject.value.replace(/(?<!^)> function /, '')
      // valueObject.value = valueObject.value.replace(/^> function /, '')
      // valueObject.value = `> function ${valueObject.value}`
    }*/

    const parts = splitByComma(variable, this.variableSyntax)
    if (DEBUG) {
      console.log('splitAndGet parts', parts)
      console.log('splitAndGet parts variable:', variable)
      console.log('splitAndGet parts originalVar:', originalVar)
      console.log('splitAndGet parts current valueObject:', valueObject)
      console.log('splitAndGet All parts:', parts)
      console.log('-----')
    }
    if (parts.length <= 1) {
      return this.getValueFromSource(parts[0], valueObject, 'splitAndGet', originalVar)
    }
    // More than 2 parts, so we need to overwrite
    return this.overwrite(parts, valueObject, originalVar)
  }
  /**
   * Populate a given property, given the matched string to replace and the value to replace the
   * matched string with.
   * @param valueObject.value The property to replace the matched string with the value.
   * @param matchedString The string in the given property that was matched and is to be replaced.
   * @param valueToPopulate The value to replace the given matched string in the property with.
   * @returns {Promise.<TResult>|*} A promise resolving to the property populated with the given
   *  value for all instances of the given matched string.
   */
  populateVariable(valueObject, matchedString, valueToPopulate) {
    let property = valueObject.value
    // console.log('init property', property)

    if (DEBUG) {
      console.log('────────START populateVar──────────────')
      console.log('populateVariable: valueObject', valueObject)
      console.log('populateVariable: valueToPopulate', valueToPopulate)
      console.log('populateVariable: typeof valueToPopulate', typeof valueToPopulate)
      console.log(`populateVariable: path "${valueObject.path}"`)
      console.log(`populateVariable: value \`${valueObject.value}\``)
      console.log(`populateVariable: originalSource \`${valueObject.originalSource}\``)
      console.log('populateVariable: property', property)
      console.log('populateVariable: matchedString', matchedString)
      if (valueObject.resolutionHistory && valueObject.resolutionHistory.length > 0) {
        console.log('populateVariable: resolutionHistory', JSON.stringify(valueObject.resolutionHistory, null, 2))
      }
    }

    const originalSrc = valueObject.originalSource || ''
    const hasFilters = originalSrc.match(this.filterMatch)
    let foundFilters = []
    if (hasFilters) {
      foundFilters = hasFilters[1]
        .split('|')
        .map((filter) => filter.trim())
        .filter(Boolean)
    }
    // console.log('foundFilters', foundFilters)

    // total replacement
    if (property === matchedString) {
      if (DEBUG_TYPE) console.log('DEBUG_TYPE total replacement')
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

        /* Convert a fallback number to string */
        if (currentDetails && 
          currentDetails.resultType === 'number' && 
          parentDetails && parentDetails.resultType === 'string' && 
          parentDetails.result.match(/^\d+$/) && parentDetails.variableType === 'env'
        ) {
          if (Number(parentDetails.result) === currentDetails.result) {
            property = String(valueToPopulate)
          }
        }

      }

      /* Handle ${self:custom.ref, ''} with deep values */
      if (v.match(deepRefSyntax) && originalSrc.match(this.variableSyntax) && !v.match(/deep\:(\d*)\..*}$/)) {
        // console.log('deep ref syntax')
        // console.log('deep var', this.deep)
        // console.log('originalSrc', originalSrc)
        // console.log('value', v)
        let deepIndex = Number(v.match(deepIndexPattern)[1])
        let item = this.deep[deepIndex]

        if (item.match(deepRefSyntax)) {
          deepIndex = Number(item.match(deepIndexPattern)[1])
          item = this.deep[deepIndex]
        }
        property = this.deep[deepIndex]
        // console.log('NEW PROPERTY after deep ref', property)
      }
    // partial replacement, string
    } else if (isString(valueToPopulate)) {
      if (DEBUG_TYPE) console.log('DEBUG_TYPE isString')
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
      if (valueToPopulate.match(/>passthrough/)) {
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
      // Handle comma ${opt:stage, dev} and remove extra }
      if (
        currentMatchedString.match(this.variableSyntax) &&
        !valueToPopulate.match(this.variableSyntax) &&
        valueToPopulate.match(/}$/)
      ) {
        valueToPopulate = valueToPopulate.replace(/}$/, '')
      }

      property = replaceAll(currentMatchedString, valueToPopulate, property)
      // console.log('property replaceAll', property)

      // if (property.match(/^> function /g)) {
      //   console.log('REPLACE after', property)
      // }

    // partial replacement, number
    } else if (isNumber(valueToPopulate)) {
      if (DEBUG_TYPE) console.log('DEBUG_TYPE isNumber')
      property = replaceAll(matchedString, String(valueToPopulate), property)
      // TODO This was temp fix for array value mismatch from filters. This fixes filterInner: ${commas | split(${self:inner}, 2) }
      // } else if (isArray(valueToPopulate) && valueToPopulate.length === 1) {
      //  property = replaceAll(matchedString, String(valueToPopulate[0]), property)
    } else if (isObject(valueToPopulate)) {
      if (DEBUG_TYPE) console.log('DEBUG_TYPEisObject')

      const objStr = JSON.stringify(valueToPopulate)
      /* Check if variable inside another variable. E.g. ${env:${self:someObject}} that resolves to ${env:{...}} */
      if (
        property.trim() !== matchedString.trim() &&
        property.indexOf(matchedString) !== -1 &&
        matchedString.match(this.variableSyntax) &&
        property.match(this.variableSyntax)
      ) {
        const isVar = /^\${[a-zA-Z0-9_]+:/.test(property)
        if (isVar) {
          // console.log('INSIDE', property, matchedString)
          // console.log('isVar', isVar)
          throw new Error(
            `Invalid variable syntax "${property}" resolves to "${replaceAll(matchedString, objStr, property)}"`,
          )
        }
      }
      // console.log('OBJECT MATCH', `"${objStr}"`)
      property = replaceAll(matchedString, objStr, property) // .replace(/}$/, '').replace(/^\$\{/, '')
      // console.log('property', property)
      // TODO run functions here
      // console.log('other new prop', property)
    } else {
      if (DEBUG_TYPE) console.log('DEBUG_TYPE else')
      let missingValue = matchedString

      if (matchedString.match(deepRefSyntax)) {
        const deepIndex = matchedString.split(':')[1].replace('}', '')
        const i = Number(deepIndex)
        missingValue = this.deep[i]
      }

      const cleanVar = cleanVariable(
        property,
        this.variableSyntax,
        true,
        `populateVariable fallback ${this.callCount}`
      )
      const cleanVarNoFilters = cleanVar.split('|')[0]
      const splitVars = splitByComma(cleanVarNoFilters)
      const nestedVar = findNestedVariable(splitVars, valueObject.originalSource)

      if (nestedVar) {
        const fallbackStr = getFallbackString(splitVars, nestedVar)
        if (!this.opts.allowUnknownVars) {
          verifyVariable(nestedVar, valueObject, this.variableTypes, this.config)
        }

        return {
          value: fallbackStr,
          path: valueObject.path,
          originalSource: valueObject.originalSource,
          resolutionHistory: valueObject.resolutionHistory || [],
          // set __internal_only_flag to note this is object we make not a resolved value
          __internal_only_flag: true,
          caller: 'nestedVar',
        }
      }

      const currentPath = valueObject.path.join('.')

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
      if (prop.startsWith('${')) {
        prop = cleanVariable(prop, this.variableSyntax, true, `populateVariable string ${this.callCount}`)
      }
      
      // console.log('prop', prop)
      if (property.match(/^> function /g) && prop) {
        // console.log('func prop', property)
        // console.log('Prop', prop)
      }
      const func = funcRegex.exec(property)
      // console.log('func', func)
      if (func && property.match(/^> function /g)) {
        /* IMPORTANT fix `finalProp` for nested function reference
          nestedOne: 'hi'
          nestedTwo: ${merge('nice', 'wow')}
          mergeNested: ${merge('lol', ${nestedTwo})}
        */
        const finalProp = property.match(/(?<!^)> function /) ? prop : property

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
        !prop.match(this.variableSyntax)
        &&
        /* Not file or text refs */
        !prop.match(fileRefSyntax) 
        && !prop.match(textRefSyntax)
        /* Not eval refs */
        && !prop.match(getValueFromEval.match) 
        // AND is not multiline value
        && (func && prop.split('\n').length < 3)) {
        // console.log('IS FUNCTION')
        /* if matches function signature like ${merge('foo', 'bar')}
          rewrite the variable to run the function after inputs resolved
        */
        const rep = property.replace(/^> function /g, '')
        property = `> function ${rep}`
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
    if (typeof valueToPopulate === 'number' && foundFilters.length) {
      runFilters = true
    } else if (
      typeof valueToPopulate === 'string' && 
      !valueToPopulate.match(deepRefSyntax) && 
      foundFilters.length && 
      !property.match(this.variableSyntax)
    ) {
      runFilters = true
    }

    /* Apply filters if found */
    //console.log('> property', property)
    if (runFilters) {
      // If filter cache exists we need to remove filter that have already been run
      if (this.filterCache[valueObject.path]) {
        foundFilters = foundFilters.filter((filter) => {
          return !this.filterCache[valueObject.path].includes(filter)
        })
      }
      property = foundFilters.reduce((acc, filter) => {
        // Check if filter has function-style arguments
        const funcMatch = filter.match(/^(\w+)\((.*)\)$/)
        let filterName = filter
        let filterArgs = []

        if (funcMatch) {
          filterName = funcMatch[1]
          const rawArgs = funcMatch[2]
          if (rawArgs) {
            const splitter = splitCsv(rawArgs, ', ')
            filterArgs = formatFunctionArgs(splitter)
          }
        }

        const newVal = filterArgs.length > 0
          ? this.filters[filterName](acc, ...filterArgs, 'from populateVariable')
          : this.filters[filterName](acc, 'from populateVariable')
        // console.log('PROPERTY', newVal)
        return newVal
      }, property)
      this.filterCache[valueObject.path] = (this.filterCache[valueObject.path] || []).concat(foundFilters)
      // console.log('NEW PROPERTY', property)
      // console.log('typeof property', typeof property)
    }
    // console.log('filterCache', this.filterCache)
    // console.log('XXXX property', typeof property)
    // console.log('XXXX path', valueObject.path)
    // console.log('XXXX originalSource', valueObject.originalSource)
    // console.log('end property', property)
    return {
      value: property,
      path: valueObject.path,
      originalSource: valueObject.originalSource,
      resolutionHistory: valueObject.resolutionHistory || [],
      __internal_only_flag: true, // set __internal_only_flag to note this is object we make not a resolved value
      caller: 'end',
      count: this.callCount,
    }
  }
  // ###############
  // ## VARIABLES ##
  // ###############
  /**
   * Resolve the given variable string that expresses a series of fallback values in case the
   * initial values are not valid, resolving each variable and resolving to the first valid value.
   * @param variableStringsString The overwrite string of variables to populate and choose from.
   * @returns {Promise.<TResult>|*} A promise resolving to the first validly populating variable
   *  in the given variable strings string.
   */
  overwrite(variableStrings, valueObject, originalVar) {
    const propertyString = valueObject.value
    /*
    console.log('overwrite variableStrings', variableStrings)
    console.log('overwrite valueObject', valueObject)
    console.log('overwrite originalVar', originalVar)
    // process.exit(1)
    /** */

    if (variableStrings.length === 2) {
      const firstValue = variableStrings[0]
      const secondValue = variableStrings[1]
      if (
        isString(firstValue) && firstValue.match(this.variablesKnownTypes) 
        && isString(secondValue) && !secondValue.match(this.variablesKnownTypes) && !secondValue.match(this.variableSyntax)
      ) {
        if (!isSurroundedByQuotes(secondValue) && !/^-?\d+(\.\d+)?$/.test(secondValue) && !startsWithQuotedPipe(secondValue)) {
          variableStrings = [firstValue, ensureQuote(secondValue)]
        }
        // console.log('new overwrite variableStrings', variableStrings)
      }
    }

    // console.log('propertyString', typeof propertyString)
    const variableValues = variableStrings.map((variableString) => {
      // This runs on nested variable resolution
      return this.getValueFromSource(variableString, valueObject, 'overwrite', valueObject.originalSource)
    })

    // console.log('variableValues', variableValues)
    return Promise.all(variableValues).then((values) => {
      let deepPropertyStr = propertyString
      let deepProperties = 0
      // console.log('overwrite values', valuesToUse)
      // Extract actual values from metadata objects
      const extractedValues = values.map((value) => {
        if (value && typeof value === 'object' && (value.__internal_only_flag || value.__internal_metadata)) {
          return value.value
        }
        return value
      })
      extractedValues.forEach((value, index) => {
        // console.log('───────────────────────────────> value', value)
        if (isString(value) && value.match(this.variableSyntax)) {
          deepProperties += 1
          // console.log('makeDeepVariable overwrite', value)
          const deepVariable = this.makeDeepVariable(value, 'via overwrite')
          // console.log('deepVariable', deepVariable)
          const newValue = cleanVariable(deepVariable, this.variableSyntax, true, `overwrite ${this.callCount}`)
          // console.log(`overwrite newValue ${variableStrings[index]}`, newValue)
          // console.log('variableStrings', variableStrings)
          deepPropertyStr = deepPropertyStr.replace(variableStrings[index], newValue)
          // console.log('deepPropertyString', deepPropertyStr)
        }
      })
      return deepProperties > 0
        ? Promise.resolve(deepPropertyStr) // return deep variable replacement of original
        : Promise.resolve(extractedValues.find(isValidValue)) // resolve first valid value, else undefined
    })
  }
  /**
   * Given any variable string, return the value it should be populated with.
   * @param variableString The variable string to retrieve a value for.
   * @returns {Promise.<TResult>|*} A promise resolving to the given variables value.
   */
  getValueFromSource(variableString, valueObject, caller, originalVar) {
    // console.log('getValueFromSrc caller', caller)
    const propertyString = valueObject.value
    const pathValue = valueObject.path

    // Track every call to getValueFromSource for metadata
    if (pathValue && pathValue.length) {
      const pathKey = pathValue.join('.')
      if (!this.resolutionTracking[pathKey]) {
        this.resolutionTracking[pathKey] = {
          path: pathKey,
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
    // console.log(`tracker contains ${variableString}`, this.tracker.contains(variableString))
    if (this.tracker.contains(variableString)) {
      // console.log('try to get', variableString)
      return this.tracker.get(variableString, propertyString)
    }

    let newHasFilter
    // Else lookup value from various sources
    if (DEBUG) {
      console.log(`>>>>> getValueFromSrc() caller - ${caller}`)
      console.log('getValueFromSource originalVar', originalVar)
      console.log('getValueFromSource variableString:', variableString)
      console.log('getValueFromSource propertyString:', propertyString)
      console.log('getValueFromSource pathValue:', valueObject.path)
      console.log('getValueFromSource valueObject:', valueObject)
      console.log('-----')
    }

    const filters = propertyString.match(/\s\|/)
    let promiseKey
    // TODO match () or pipes |
    if (filters) {
      const string = cleanVariable(propertyString, this.variableSyntax, true, `getValueFromSrc filter ${this.callCount}`)
      // console.log('string', string)
      const deeperValue = getTextAfterOccurrence(string, variableString)
      // console.log('deeperValue', deeperValue)
      // console.log('filters', filters)
      // console.log('variableString', variableString)
      promiseKey = deeperValue.match(/\s\|/) ? deeperValue : undefined

      // TODO clean this up
      const t = variableString.split('|')
      // console.log('variableString', variableString)
      // console.log('valueObject', valueObject)
      // console.log('t', t)
      const _filter = string
        .split('|')
        .filter((value, index, arr) => {
          return index > 0
        })
        .map((f) => {
          return trim(f)
          // TODO refactor this. This is a temp fix for filters with nested vars.
          .replace(/}$/, '')
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

    let resolverFunction
    let resolverType
    /* Loop over variables and set getterFunction when match found. */
    const found = this.variableTypes.some((r, i) => {
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
    /*
    // console.log('found variable resolver', found)
    // console.log('resolverFunction', resolverFunction)
    /** */

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
      // TODO finalize resolverFunction API
      const valuePromise = resolverFunction(
        variableString,
        this.options,
        this.config,
        valueObject,
      ).then((val) => {
        // Update the last call with the resolved value
        if (pathValue && pathValue.length) {
          const pathKey = pathValue.join('.')
          if (this.resolutionTracking[pathKey] && this.resolutionTracking[pathKey].calls.length) {
            // Find the most recent call for this variableString
            for (let i = this.resolutionTracking[pathKey].calls.length - 1; i >= 0; i--) {
              if (this.resolutionTracking[pathKey].calls[i].variableString === variableString) {
                const v = (typeof val === 'object' && val.__internal_only_flag) ? val.value : val
                this.resolutionTracking[pathKey].calls[i].resolvedValue = v
                this.resolutionTracking[pathKey].calls[i].resolverType = resolverType
                break
              }
            }
          }
        }

        // console.log('VALUE', val)
        if (
          val === null ||
          typeof val === 'undefined' ||
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

          if (this.opts.allowUnknownFileRefs && variableString.match(fileRefSyntax)) {
            // Encode the unknown file variable to pass through resolution
            return Promise.resolve(encodeUnknown(propertyString))
          }

          if (valueCount.length === 1 && noNestedVars) {
            const configFilePathMsg = (this.configFilePath) ? `\nIn file ${this.configFilePath} ` : ''
            const fromLine = (propertyString !== valueObject.originalSource) ? `\n  From   "${valueObject.originalSource}"\n` : ''



            throw new Error(`Unable to resolve config variable "${propertyString}".\n${configFilePathMsg}at location ${valueObject.path ? `"${arrayToJsonPath(valueObject.path)}"` : 'n/a'}${fromLine}
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
          if (val && typeof val === 'object' && val.__internal_only_flag) {
            // Attach resolverType to existing internal object
            val.__resolverType = resolverType
            return Promise.resolve(val)
          }
          return Promise.resolve({
            value: val,
            __resolverType: resolverType,
            __variableString: variableString,
            __internal_metadata: true
          })
        }

        const newUse = newHasFilter.reduce((acc, currentFilter, i) => {
          // Check if filter has function-style arguments: filterName(arg1, arg2)
          const funcMatch = currentFilter.match(/^(\w+)\((.*)\)$/)
          let filterName = currentFilter
          let filterArgs = null

          if (funcMatch) {
            filterName = funcMatch[1]
            const rawArgs = funcMatch[2]
            // Parse arguments using the same logic as functions
            if (rawArgs) {
              const splitter = splitCsv(rawArgs, ', ')
              filterArgs = formatFunctionArgs(splitter)
            }
          }

          if (!this.filters[filterName]) {
            throw new Error(`Filter "${filterName}" not found`)
          }
          return acc.concat({
            filter: this.filters[filterName],
            filterName: filterName,
            args: filterArgs
          })
        }, [])
        // console.log('pathValue', pathValue)
        // console.log('propertyString', propertyString)
        // console.log('newUse', newUse)

        if (typeof val === 'string' && val.match(/deep:/)) {
          // TODO refactor the deep filter logic here. match | filter | filter..
          const allFilters = propertyString
            .replace(/}$/, '')
            .split('|')
            .reduce((acc, currentFilter, i) => {
              if (i === 0) {
                return acc
              }
              acc += `| ${trim(currentFilter)}`
              return acc
            }, '')
          // add filters to deep references if filter is used
          const deepValueWithFilters = newHasFilter[1] ? val.replace(/}$/, ` ${allFilters}}`) : val
          // console.log('deepValueWithFilters', deepValueWithFilters)
          // console.log('RESOLVER RETURN newValue 4', deepValueWithFilters)
          return Promise.resolve(deepValueWithFilters)
        }
        /* Loop over filters used and produce new value */
        const newValue = newUse.reduce((a, c) => {
          // Fix for async value resolution. That code file refs returns object with .value
          const theValue = typeof a === 'object' && a.__internal_only_flag ? a.value : a
          if (typeof c.filter !== 'function') {
            return theValue
          }
          if (c.args) {
            this.filterCache[pathValue] = (this.filterCache[pathValue] || []).concat(c.filterName)
            return c.filter(theValue, ...c.args, 'from getValueFromSrc with args')
          }
          this.filterCache[pathValue] = (this.filterCache[pathValue] || []).concat(c.filterName)
          return c.filter(theValue, 'from getValueFromSrc')
        }, val)
        // console.log('> RESOLVER RETURN newValue', newValue)
        // console.log('> RESOLVER RETURN newValue 5', newValue)
        // Wrap value with resolverType metadata for resolution tracking
        // But don't wrap if it's already an internal flag object
        if (newValue && typeof newValue === 'object' && newValue.__internal_only_flag) {
          // Attach resolverType to existing internal object
          newValue.__resolverType = resolverType
          return Promise.resolve(newValue)
        }
        return Promise.resolve({
          value: newValue,
          __resolverType: resolverType,
          __variableString: variableString,
          __internal_metadata: true
        })
      })

      // console.log('valuePromise', valuePromise)
      // console.log(`----------End Resolver [${resolverType}]-------------------`)
      // console.log('newHasFilter', newHasFilter)
      // TODO do something with func here?
      return this.tracker.add(variableString, valuePromise, propertyString, newHasFilter, promiseKey)
    }

    // console.log('fall thru variableString', variableString)

    /* fall through case with self refs */
    if (variableString) {
      // console.log('before clean propertyString', propertyString, variableString)
      const clean = cleanVariable(
        propertyString, 
        this.variableSyntax, 
        true, 
        `getValueFromSrc self ${this.callCount}`
      )
      // TODO @DWELLS cleanVariable makes fallback values with spaces have no spaces
      // console.log('AFTER cleanVariable', clean)
      // console.log(typeof clean)
      const cleanClean = clean.split('|')[0]
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
      if (split.length === 2 || split.length === 3) {
        fallbackValue = split[1]
      } else if (clean.match(/\|/)) {
        fallbackValue = split[0]
      }

      // TODO this should be new in memory resolutionHistory probably?
      const nestedVar = findNestedVariable(split, valueObject.originalSource)
      // console.log('nestedVar', nestedVar)

      if (nestedVar) {
        if (!this.opts.allowUnknownVars) {
          verifyVariable(nestedVar, valueObject, this.variableTypes, this.config)
        }
        const fallbackStr = getFallbackString(split, nestedVar)
        return this.getValueFromSource(variableString, {
          value: fallbackStr,
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
          }, 'cleanClean.match(fileRefSyntax)', originalVar)
        }
      }
      // const fallbackValue = split[1]
      // console.log('variableString', variableString)
      // console.log('propertyString', propertyString)
      // console.log('fallbackValue', fallbackValue)

      if (variableString === fallbackValue) {
        const valuePromise = Promise.resolve(fallbackValue)
        return this.tracker.add(fallbackValue, valuePromise, propertyString, newHasFilter)
      }
      /*
      console.log('what is fallbackValue', fallbackValue)
      console.log('typeof fallbackValue', typeof fallbackValue)
      /** */
      // has fallback but needs deeper lookup. Call getValueFromSrc again
      if (fallbackValue) {
        if (DEBUG) console.log('fallbackValue', fallbackValue)
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
        ).then((res) => {
          // console.log('res', res)
          // console.log('typeof res', typeof res)
          return res
        })
      }
    }

    // Variable NOT FOUND. Warn user
    const key = valueObject.path ? valueObject.path.join('.') : 'na'
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
      if (this.opts.verifySubReferences) {
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



    /* Pass through unknown variables */
    if (this.opts.allowUnknownVars || allowSpecialCase) {
      // console.log('allowUnknownVars propertyString', propertyString)
      const varMatches = propertyString.match(this.variableSyntax)
      let allowUnknownVars = propertyString
      /* If variables found, encode them for passthrough */
      if (varMatches && varMatches.length) {
        varMatches.forEach((m) => {
          allowUnknownVars = allowUnknownVars.replace(m, encodeUnknown(m))
        })
      }
      // console.log('allowUnknownVars propertyString:', propertyString)
      // console.log('allowUnknownVars:', allowUnknownVars)
      return Promise.resolve(allowUnknownVars)
    }

    const message = errorMessage.join('\n')
    const notFoundPromise = Promise.reject(new Error(message))

    return this.tracker.add(variableString, notFoundPromise, propertyString, newHasFilter)
  }
  getValueFromSelf(variableString, o, x, data) {
    /*
    console.log('getValueFromSelf variableString', variableString)
    /** */
    // console.log('self data', data)
    const split = variableString.split(':')
    const variable = split.length && split[1] ? split[1] : variableString
    const valueToPopulate = this.config
    let deepProperties = variable.split('.').filter((property) => property)
    // console.log('self deep', deepProperties)
    // console.log('self valueToPopulate', valueToPopulate)

    /* its file ref so we need to shift lookup for self in nested files */
    if (data.isFileRef) {
      const dotPropPath = deepProperties.length > 1 ? deepProperties.join('.') : deepProperties[0]
      const exists = dotProp.get(valueToPopulate, dotPropPath)
      // console.log('self exists', exists)
      if (!exists) {
        // @ Todo make recursive
        deepProperties = [data.path[0]].concat(deepProperties)
        // console.log('self fixed deepProperties', deepProperties)
      }
    }
    return this.getDeeperValue(deepProperties, valueToPopulate).then((res) => {
      /*
      console.log('self getDeeperValue variableString', variableString)
      console.log('self getDeeperValue result', res)
      /** */
      return res
    })
  }
  async getValueFromFile(variableString, options) {
    const opts = options || {}
    const syntax = opts.asRawText ? textRefSyntax : fileRefSyntax
    // console.log('From file', `"${variableString}"`)
    let matchedFileString = variableString.match(syntax)[0]
    // console.log('matchedFileString', matchedFileString)

    // Get function input params if any supplied https://regex101.com/r/qlNFVm/1
    // var funcParamsRegex = /(\w+)\s*\(((?:[^()]+)*)?\s*\)\s*/g
    var funcParamsRegex = /(\w+)\s*\(((?:[^()]+)*)?\s*\)/g
    // tighter (?<![.\w-])\b(\w+)\s*\(((?:[^()]+)*)?\s*\)\s*
    var hasParams = funcParamsRegex.exec(matchedFileString)

    let argsToPass = []
    if (hasParams) {
      const splitter = splitCsv(hasParams[2])
      const argsFound = splitter.map((arg) => {
        const cleanArg = trim(arg).replace(/^'|"/, '').replace(/'|"$/, '')
        return cleanArg
      })
      // console.log('argsFound', argsFound)

      // If function has more arguments than file path
      if (argsFound.length && argsFound.length > 1) {
        matchedFileString = argsFound[0]
        argsToPass = argsFound.filter((arg, i) => {
          return i !== 0
        })
      }
    }
    // console.log('argsToPass', argsToPass)

    const fileDetails = resolveFilePathFromMatch(matchedFileString, syntax, this.configPath)
    // console.log('fileDetails', fileDetails)

    const { fullFilePath, resolvedPath, relativePath } = fileDetails

    const exists = fs.existsSync(fullFilePath)

    this.fileRefsFound.push({
      // location: options.context.path.join('.'),
      filePath: fullFilePath,
      relativePath,
      resolvedVariableString: options.context.value,
      originalVariableString: options.context.originalSource,
      containsVariables: options.context.value !== options.context.originalSource,
      exists,
    })

    let fileExtension = resolvedPath.split('.')

    fileExtension = fileExtension[fileExtension.length - 1]

    // Validate file exists
    if (!exists) {
      const originalVar = options.context && options.context.originalSource

      const findNestedResult = findNestedVariables(
        originalVar,
        this.variableSyntax,
        this.variablesKnownTypes,
        options.context.path,
        this.variableTypes
      )
      // console.log('findNestedResult', findNestedResult)
      let hasFallback = false
      if (findNestedResult) {
        const varDetails = findNestedResult[0]
        // console.log('varDetails', varDetails)
        hasFallback = varDetails.hasFallback
      }

      // check if original var has fallback value
      // console.log('NO FILE FOUND', fullFilePath)
      // console.log('variableString', variableString)

      if (!hasFallback && !this.opts.allowUnknownFileRefs) {
        const errorMsg = makeBox({
          title: `File Not Found in ${originalVar}`,
          minWidth: '100%',
          text: `Variable ${variableString} cannot resolve due to missing file.

File not found ${fullFilePath}

Default fallback value will be used if provided.

${JSON.stringify(options.context, null, 2)}`,
    })
        console.log(errorMsg)
      }
      // TODO maybe reject. YAML does not allow for null/undefined values
      // return Promise.reject(new Error(errorMsg))
      return Promise.resolve(undefined)
    }

  

    let valueToPopulate

    const variableFileContents = fs.readFileSync(fullFilePath, 'utf-8')

    /* handle case for referencing raw JS files to inline them */
    if (argsToPass.length 
      && (argsToPass && argsToPass[0] && argsToPass[0].toLowerCase() === 'raw') 
      || opts.asRawText
    ) {
      // Encode foo() to foo__PH_PAREN_OPEN__) to avoid function collisions
      valueToPopulate = encodeJsSyntax(variableFileContents)
      return Promise.resolve(valueToPopulate)
    }

    // Process JS files
    if (fileExtension === 'js' || fileExtension === 'cjs') {
      // Possible alt importer tool https://github.com/humanwhocodes/module-importer
      const jsFile = require(fullFilePath)
      let returnValueFunction = jsFile
      // TODO change how exported functions are referenced
      const variableArray = variableString.split(':')

      if (variableArray[1]) {
        let jsModule = variableArray[1]
        jsModule = jsModule.split('.')[0]
        returnValueFunction = jsFile[jsModule]
      }

      if (typeof returnValueFunction !== 'function') {
        const errorMessage = `Invalid variable syntax when referencing file "${relativePath}".
Check if your javascript is exporting a function that returns a value.`
        return Promise.reject(new Error(errorMessage))
      }
      // TODO update what is passed into function

      const valueForFunction = {
        originalConfig: this.originalConfig,
        config: this.config,
        opts: this.opts,
      }
    
      valueToPopulate = returnValueFunction.call(jsFile, valueForFunction, ...argsToPass)

      return Promise.resolve(valueToPopulate).then((valueToPopulateResolved) => {
        let deepProperties = variableString.replace(matchedFileString, '')
        deepProperties = deepProperties.slice(1).split('.')
        deepProperties.splice(0, 1)
        // Trim prop keys for starting/trailing spaces
        deepProperties = deepProperties.map((prop) => {
          return trim(prop)
        })
        return this.getDeeperValue(deepProperties, valueToPopulateResolved).then((deepValueToPopulateResolved) => {
          if (typeof deepValueToPopulateResolved === 'undefined') {
            const errorMessage = `Invalid variable syntax when referencing file "${relativePath}".
Check if your javascript is returning the correct data.`
            return Promise.reject(new Error(errorMessage))
          }
          return Promise.resolve(deepValueToPopulateResolved)
        })
      })
    }

    if (fileExtension === 'ts') {
      const { executeTypeScriptFile } = require('./parsers/typescript')
      let returnValueFunction
      const variableArray = variableString.split(':')

      try {
        const tsFile = await executeTypeScriptFile(fullFilePath, { dynamicArgs: () => argsToPass })
        // console.log('fullFilePath', fullFilePath)
        // console.log('tsFile', tsFile)
        returnValueFunction = tsFile.config || tsFile.default || tsFile

        if (variableArray[1]) {
          let tsModule = variableArray[1]
          tsModule = tsModule.split('.')[0]
          returnValueFunction = tsFile[tsModule]
        }

        if (typeof returnValueFunction !== 'function') {
          const errorMessage = `Invalid variable syntax when referencing file "${relativePath}".
Check if your TypeScript is exporting a function that returns a value.`
          return Promise.reject(new Error(errorMessage))
        }

        const valueForFunction = {
          originalConfig: this.originalConfig,
          config: this.config,
          opts: this.opts,
        }

        valueToPopulate = returnValueFunction.call(tsFile, valueForFunction, ...argsToPass)

        return Promise.resolve(valueToPopulate).then((valueToPopulateResolved) => {
          let deepProperties = variableString.replace(matchedFileString, '')
          deepProperties = deepProperties.slice(1).split('.')
          deepProperties.splice(0, 1)
          // Trim prop keys for starting/trailing spaces
          deepProperties = deepProperties.map((prop) => {
            return trim(prop)
          })
          return this.getDeeperValue(deepProperties, valueToPopulateResolved).then((deepValueToPopulateResolved) => {
            if (typeof deepValueToPopulateResolved === 'undefined') {
              const errorMessage = `Invalid variable syntax when referencing file "${relativePath}".
Check if your TypeScript is returning the correct data.`
              return Promise.reject(new Error(errorMessage))
            }
            return Promise.resolve(deepValueToPopulateResolved)
          })
        })
      } catch (err) {
        return Promise.reject(new Error(`Error processing TypeScript file: ${err.message}`))
      }
    }

    if (fileExtension === 'mjs' || fileExtension === 'esm') {
      // Possible alt importer tool https://github.com/humanwhocodes/module-importer
      const { executeESMFile } = require('./parsers/esm')
      let returnValueFunction
      const variableArray = variableString.split(':')

      try {
        const esmFile = await executeESMFile(fullFilePath, { dynamicArgs: () => argsToPass })
        // console.log('ESM fullFilePath', fullFilePath)
        // console.log('ESM esmFile', esmFile, 'type:', typeof esmFile)
        returnValueFunction = esmFile.config || esmFile.default || esmFile

        if (variableArray[1]) {
          let esmModule = variableArray[1]
          esmModule = esmModule.split('.')[0]
          returnValueFunction = esmFile[esmModule]
        }

        if (typeof returnValueFunction !== 'function') {
          const errorMessage = `Invalid variable syntax when referencing file "${relativePath}".
Check if your ESM is exporting a function that returns a value.`
          return Promise.reject(new Error(errorMessage))
        }

        const valueForFunction = {
          originalConfig: this.originalConfig,
          config: this.config,
          opts: this.opts,
        }

        valueToPopulate = returnValueFunction.call(esmFile, valueForFunction, ...argsToPass)

        return Promise.resolve(valueToPopulate).then((valueToPopulateResolved) => {
          let deepProperties = variableString.replace(matchedFileString, '')
          deepProperties = deepProperties.slice(1).split('.')
          deepProperties.splice(0, 1)
          // Trim prop keys for starting/trailing spaces
          deepProperties = deepProperties.map((prop) => {
            return trim(prop)
          })
          return this.getDeeperValue(deepProperties, valueToPopulateResolved).then((deepValueToPopulateResolved) => {
            if (typeof deepValueToPopulateResolved === 'undefined') {
              const errorMessage = `Invalid variable syntax when referencing file "${relativePath}".
Check if your ESM is returning the correct data.`
              return Promise.reject(new Error(errorMessage))
            }
            return Promise.resolve(deepValueToPopulateResolved)
          })
        })
      } catch (err) {
        return Promise.reject(new Error(`Error processing ESM file: ${err.message}`))
      }
    }

    // Process everything except JS, TS, and ESM
    if (fileExtension !== 'js' && fileExtension !== 'ts' && fileExtension !== 'mjs' && fileExtension !== 'esm') {
      /* Read initial file */
      valueToPopulate = variableFileContents

      // File reference has :subKey lookup. Must dig deeper
      if (matchedFileString !== variableString) {
        if (fileExtension === 'yml' || fileExtension === 'yaml') {
          valueToPopulate = JSON.stringify(YAML.parse(valueToPopulate))
        }
        if (fileExtension === 'toml') {
          valueToPopulate = JSON.stringify(TOML.parse(valueToPopulate))
        }
        if (fileExtension === 'ini') {
          valueToPopulate = INI.toJson(valueToPopulate)
        }
        // console.log('deep', variableString)
        // console.log('matchedFileString', matchedFileString)
        let deepProperties = variableString.replace(matchedFileString, '')
        // TODO 2025-11-12 add file.path.support instead of just : 
        if (deepProperties.substring(0, 1) !== ':') {
          const errorMessage = `Invalid variable syntax when referencing file "${relativePath}" sub properties
Please use ":" to reference sub properties. ${deepProperties}`
          return Promise.reject(new Error(errorMessage))
        }
        deepProperties = deepProperties.slice(1).split('.')
        return this.getDeeperValue(deepProperties, valueToPopulate)
      }

      if (fileExtension === 'yml' || fileExtension === 'yaml') {
        valueToPopulate = YAML.parse(valueToPopulate)
        return Promise.resolve(valueToPopulate)
      }

      if (fileExtension === 'toml') {
        valueToPopulate = TOML.parse(valueToPopulate)
        return Promise.resolve(valueToPopulate)
      }

      if (fileExtension === 'ini') {
        valueToPopulate = INI.parse(valueToPopulate)
        return Promise.resolve(valueToPopulate)
      }

      if (fileExtension === 'json') {
        valueToPopulate = JSON.parse(valueToPopulate)
        return Promise.resolve(valueToPopulate)
      }
    }
    // console.log('fall thru', valueToPopulate)
    return Promise.resolve(valueToPopulate)
  }
  getVariableFromDeep(variableString) {
    const index = variableString.replace(deepIndexReplacePattern, '')
    // const index = this.getDeepIndex(variableString)
    /*
    console.log('FIND INDEX', index)
    console.log(this.deep, this.deep[index])
    /** */
    return this.deep[index]
  }
  getValueFromDeep(variableString, pathValue) {
    const variable = this.getVariableFromDeep(variableString)
    const deepRef = variableString.replace(deepPrefixReplacePattern, '')
    /*
    console.log("GET getValueFromDeep", variableString)
    console.log('deepRef', (deepRef) ? deepRef : '- no deepRef')
    console.log('getValueFromDeep variable', variable)
    /** */
    // Preserve path and originalSource information from pathValue
    const valueObject = {
      value: variable,
      path: pathValue ? pathValue.path : undefined,
      originalSource: pathValue ? pathValue.originalSource : undefined,
      resolutionHistory: pathValue ? pathValue.resolutionHistory : []
    }
    let ret = this.populateValue(valueObject, undefined, 'getValueFromDeep')
    if (deepRef.length) {
      // if there is a deep reference remaining
      ret = ret.then((result) => {
        // console.log('DEEP RESULT', result)
        if (isString(result.value) && result.value.match(this.variableSyntax)) {
          // console.log('makeDeepVariable getValueFromDeep', result.value)
          const deepVariable = this.makeDeepVariable(result.value, 'via getValueFromDeep')
          return Promise.resolve(appendDeepVariable(deepVariable, deepRef))
        }
        return this.getDeeperValue(deepRef.split('.'), result.value)
      })
    }
    return ret
  }
  makeDeepVariable(variable, caller) {
    // variable = variable.replace("dev", '"dev"')
    let index = this.deep.findIndex((item) => variable === item)
    if (index < 0) {
      // console.log('this.deep.push', variable)
      index = this.deep.push(variable) - 1
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
    // TODO debugging space removal. Seems like this helps
    // const deepVar = variableContainer.replace(/\s/g, '').replace(variableString, `deep:${index}`)
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
  getDeeperValue(deepProperties, valueToPopulate) {
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
          reducedValue = {
            value: undefined,
            path: undefined,
            originalSource: undefined,
            // set __internal_only_flag to note this is object we make not a resolved value
            __internal_only_flag: true,
            caller: 'getDeeperValue',
          }
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
        if (typeof reducedValue === 'string' && reducedValue.match(this.variableSyntax)) {
          // console.log('makeDeepVariable reducedValue', reducedValue)
          reducedValue = this.makeDeepVariable(reducedValue, 'via getDeeperValue')
        }
      }
      // console.log('fin', reducedValue)
      return Promise.resolve(reducedValue)
    }, Promise.resolve(valueToPopulate))

    return veryDeep
  }

  warnIfNotFound(variableString, valueToPopulate) {
    let variableTypeText
    if (variableString.match(envRefSyntax)) {
      variableTypeText = 'environment variable'
    } else if (variableString.match(optRefSyntax)) {
      variableTypeText = 'option'
    } else if (variableString.match(selfRefSyntax)) {
      variableTypeText = 'config attribute'
    } else if (variableString.match(fileRefSyntax)) {
      variableTypeText = 'file'
    } else if (variableString.match(deepRefSyntax)) {
      variableTypeText = 'deep'
    } else if (variableString.match(textRefSyntax)) {
      variableTypeText = 'text'
    }
    if (!isValidValue(valueToPopulate)) {
      // console.log("MISSING", variableString)
      // console.log(this.deep)
      // console.log(valueToPopulate)
      const notFoundMsg = `No ${variableTypeText} found to satisfy the '\${${variableString}}' variable. Attempting fallback value`
      if (DEBUG) {
        console.log(notFoundMsg)
      }
      // errors make fallbacks not function. throw new Error(errorMsg)
    }
    return valueToPopulate
  }
}

function ensureQuote(value, open = '"', close) {
  let i = -1
  const result = []
  const end = close || open
  if (typeof value === 'string') {
    return startChar(value, open) + value + endChar(value, end)
  }
  while (++i < value.length) {
    result[i] = startChar(value[i], open) + value[i] + endChar(value[i], end)
  }
  return result
}

function startChar(str, char) {
  return (str[0] === char) ? '' : char
}

function endChar(str, char) {
  return (str[str.length -1] === char) ? '' : char
}

function isSurroundedByQuotes(str) {
  if (!str || str.length < 2) return false
  const firstChar = str[0]
  const lastChar = str[str.length - 1]
  return (firstChar === "'" && lastChar === "'") || (firstChar === '"' && lastChar === '"')
}

function startsWithQuotedPipe(str) {
  // Matches either 'xyz' | or "xyz" |
  return /^(['"])(.*?)\1\s*\|/.test(str)
}

module.exports = Configorama
