const { setOwn } = require('../objects')
const markdownBodyKeys = new WeakMap()
/** @param {Object} value @returns {string|undefined} */
function getBodyContentKey(value) { return markdownBodyKeys.get(value) }
// Parses config file contents based on file extension
const fs = require('fs')
const path = require('path')
const YAML = require('../../parsers/yaml')
// Other format parsers are required where used, so a config only loads its own format's parser
const { isEnvFile } = require('../paths/fileType')
const { detectFormat } = require('./detectFormat')
const cloudFormationSchema = require('./cloudformationSchema')

const DEFAULT_VAR_SYNTAX = '\\${((?!AWS|aws:|stageVariables)[ ~:a-zA-Z0-9=+!@#%*<>?._\'",|\\-\\/\\(\\)\\\\]+?)}'

/**
 * @typedef {Error & { mark?: { line?: number, column?: number }, original?: Error }} YamlError
 */

/**
 * Turn a cryptic js-yaml flow-collection error into an actionable configorama
 * message when the cause is a variable embedded in an unquoted flow entry
 * (e.g. `key: [arn/${env:X}]`). Returns the original error otherwise.
 * @param {YamlError} yamlErr - The YAMLException thrown by the parser
 * @param {string} contents - The original YAML source
 * @param {string} filePath - Path to the config file
 * @returns {Error} An enhanced error, or the original
 */
function enhanceYamlError(yamlErr, contents, filePath) {
  const isFlowError = /missed comma between flow collection entries|flow collection/i.test(yamlErr.message || '')
  const lineNum = yamlErr.mark && typeof yamlErr.mark.line === 'number' ? yamlErr.mark.line : -1
  if (!isFlowError || lineNum < 0) return yamlErr

  const lineText = String(contents).split(/\r?\n/)[lineNum]
  // Only rewrite when the offending line has a flow collection AND a variable that
  // is not already wrapped in quotes ('${...} or "${...}).
  const hasFlow = lineText && (lineText.indexOf('[') > -1 || lineText.indexOf('{') > -1)
  const hasUnquotedVar = lineText && /(^|[^'"])\$\{/.test(lineText)
  if (!hasFlow || !hasUnquotedVar) return yamlErr

  const loc = `${filePath}:${lineNum + 1}`
  const message = [
    'configorama: could not parse YAML — a variable is embedded in an unquoted flow collection entry.',
    '',
    `  ${loc}`,
    `    ${lineText.trim()}`,
    '',
    'Wrap the whole entry in quotes so it parses as a string:',
    "    key: ['arn:userpool/${env:POOL}']   # not   key: [arn:userpool/${env:POOL}]",
    '',
    `(YAML parser: ${String(yamlErr.message || '').split('\n')[0]})`
  ].join('\n')
  /** @type {YamlError} */
  const enhanced = new Error(message)
  enhanced.original = yamlErr
  return enhanced
}

const KNOWN_EXTENSIONS = new Set([
  '.yml', '.yaml', '.json', '.json5', '.jsonc',
  '.toml', '.tml', '.ini',
  '.tf', '.hcl',
  '.js', '.cjs', '.mjs', '.esm',
  '.ts', '.tsx', '.mts', '.cts',
  '.md', '.mdx', '.markdown', '.mdown', '.mkdn', '.mkd', '.mdwn', '.markdn', '.mdtxt', '.mdtext'
])

/**
 * @typedef {Object} ParseOptions
 * @property {string} contents - Raw file contents to parse
 * @property {string} filePath - Full file path (used for extension detection and error messages)
 * @property {RegExp} [varRegex] - Variable syntax regex (defaults to configorama syntax)
 * @property {Object|Function} [dynamicArgs] - Arguments passed to JS/TS function exports
 * @property {Object} [loadContext] - Load-local caches and environment
 * @property {'legacy'|'process'|'load'} [moduleCacheMode] - Executable module lifecycle
 */

/**
 * Parse file contents based on file extension
 * @param {ParseOptions} options
 * @returns {Object} Parsed configuration object
 */
function parseFileContents({ contents, filePath, varRegex, dynamicArgs, loadContext, moduleCacheMode }) {
  if (contents === null) {
    throw new Error(`Cannot parse "${filePath}": file contents are null`)
  }
  let fileType = path.extname(filePath)

  // Dotenv files have no extension (path.extname('.env') === ''), so detect
  // them by name before falling back to content sniffing.
  if (isEnvFile(filePath)) {
    fileType = '.env'
  } else if (!fileType || !KNOWN_EXTENSIONS.has(fileType.toLowerCase())) {
    // Content-based detection for extensionless or unrecognized files
    fileType = detectFormat(contents)
  }

  const regex = varRegex || new RegExp(DEFAULT_VAR_SYNTAX, 'g')
  let configObject

  if (fileType.match(/\.(yml|yaml)/i)) {
    try {
      const ymlText = YAML.preProcess(contents)
      configObject = YAML.parse(ymlText)
    } catch (err) {
      // Attempt to fix cloudformation refs for YAML syntax errors
      if (err.message && err.message.match(/YAMLException/)) {
        const ymlText = YAML.preProcess(contents)
        const result = YAML.load(ymlText, {
          filename: filePath,
          schema: cloudFormationSchema.schema,
        })
        if (result.error) {
          throw enhanceYamlError(result.error, contents, filePath)
        }
        configObject = result.data
      } else {
        // Re-throw non-YAML errors (e.g., TypeError from null/undefined contents)
        throw err
      }
    }
  } else if (fileType.match(/\.(toml|tml)/i)) {
    configObject = require('../../parsers/toml').parse(contents)
  } else if (fileType.match(/\.(ini)/i)) {
    configObject = require('../../parsers/ini').parse(contents)
  } else if (fileType === '.env') {
    configObject = require('../../parsers/dotenv').parse(contents)
  } else if (fileType.match(/\.(json|json5|jsonc)/i)) {
    configObject = require('../../parsers/json5').parse(contents)
  } else if (fileType.match(/\.(tf|hcl)$/i) || filePath.match(/\.tf\.json$/i)) {
    // Handle Terraform HCL files (.tf, .hcl) and Terraform JSON (.tf.json)
    if (filePath.match(/\.tf\.json$/i)) {
      // .tf.json files are just JSON
      configObject = require('../../parsers/json5').parse(contents)
    } else {
      // .tf and .hcl files need HCL parsing
      configObject = require('../../parsers/hcl').parse(contents, path.basename(filePath))
    }
  } else if (fileType.match(/\.(md|mdx|markdown|mdown|mkdn|mkd|mdwn|markdn|mdtxt|mdtext)/i)) {
    const { extractFrontmatter } = require('../../parsers/markdown')
    const { frontmatterContent, content, format } = extractFrontmatter(contents)

    if (!frontmatterContent) {
      configObject = {}
    } else if (format === 'toml') {
      configObject = require('../../parsers/toml').parse(frontmatterContent)
    } else if (format === 'json') {
      configObject = require('../../parsers/json5').parse(frontmatterContent)
    } else {
      const ymlText = YAML.preProcess(frontmatterContent)
      configObject = YAML.parse(ymlText)
    }
    const bodyContent = content.replace(/^\n+|\n+$/g, '')
    let bodyKey = '_content'
    if (Object.prototype.hasOwnProperty.call(configObject, bodyKey)) {
      bodyKey = '_body'
      let index = 1
      while (Object.prototype.hasOwnProperty.call(configObject, bodyKey)) bodyKey = `_body_${index++}`
      console.warn(`configorama: frontmatter key "_content" conflicts with reserved body content key. Body stored as "${bodyKey}" instead.`)
    }
    setOwn(configObject, bodyKey, bodyContent)
    markdownBodyKeys.set(configObject, bodyKey)
  // TODO detect js syntax and use appropriate parser
  } else if (fileType.match(/\.(js|cjs)/i)) {
    let jsFile
    try {
      jsFile = require('../loadExecutable')(filePath, loadContext, moduleCacheMode)
      if (typeof jsFile !== 'function') {
        configObject = jsFile
      } else {
        let jsArgs = dynamicArgs || {}
        if (jsArgs && typeof jsArgs === 'function') {
          jsArgs = jsArgs()
        }
        // console.log('jsArgs', jsArgs)
        configObject = jsFile(jsArgs, { env: loadContext && loadContext.env, environment: loadContext && loadContext.env })
      }
    } catch (err) {
      throw err
    }
  } else if (fileType.match(/\.(ts|tsx|mts|cts)/i)) {
    try {
      let jsArgs = dynamicArgs || {}
      if (jsArgs && typeof jsArgs === 'function') {
        jsArgs = jsArgs()
      }
      configObject = require('../loadExecutable')(filePath, loadContext, moduleCacheMode)
      if (configObject.config) {
        configObject = (typeof configObject.config === 'function') ? configObject.config(jsArgs, { env: loadContext && loadContext.env, environment: loadContext && loadContext.env }) : configObject.config
      } else if (configObject.default) {
        configObject = (typeof configObject.default === 'function') ? configObject.default(jsArgs, { env: loadContext && loadContext.env, environment: loadContext && loadContext.env }) : configObject.default
      } else if (typeof configObject === 'function') {
        configObject = configObject(jsArgs, { env: loadContext && loadContext.env, environment: loadContext && loadContext.env })
      }
      // console.log('parseFileContents configObject', configObject)
    } catch (err) {
      throw new Error(`Failed to execute TypeScript file ${filePath}: ${err.message}`)
    }
  } else if (fileType.match(/\.(mjs|esm)/i)) {
    try {
      let jsArgs = dynamicArgs || {}
      if (jsArgs && typeof jsArgs === 'function') {
        jsArgs = jsArgs()
      }
      configObject = require('../loadExecutable')(filePath, loadContext, moduleCacheMode)
      if (configObject.config) {
        configObject = (typeof configObject.config === 'function') ? configObject.config(jsArgs, { env: loadContext && loadContext.env, environment: loadContext && loadContext.env }) : configObject.config
      } else if (configObject.default) {
        configObject = (typeof configObject.default === 'function') ? configObject.default(jsArgs, { env: loadContext && loadContext.env, environment: loadContext && loadContext.env }) : configObject.default
      } else if (typeof configObject === 'function') {
        configObject = configObject(jsArgs, { env: loadContext && loadContext.env, environment: loadContext && loadContext.env })
      }
      // console.log('parseFileContents ESM configObject', configObject)
    } catch (err) {
      throw new Error(`Failed to execute ESM file ${filePath}: ${err.message}`)
    }
  }

  return configObject
}

/**
 * @typedef {Object} ParseFileOptions
 * @property {RegExp} [varRegex] - Variable syntax regex (defaults to configorama syntax)
 * @property {Object|Function} [dynamicArgs] - Arguments passed to JS/TS function exports
 * @property {Object} [loadContext] - Load-local caches and environment
 * @property {'legacy'|'process'|'load'} [moduleCacheMode] - Executable module lifecycle
 */

/**
 * Read and parse a config file
 * @param {string} filePath - Path to the config file
 * @param {ParseFileOptions} [opts]
 * @returns {Object} Parsed configuration object
 */
function parseFile(filePath, opts = {}) {
  const contents = fs.readFileSync(filePath, 'utf8')
  return parseFileContents({
    contents,
    filePath,
    varRegex: opts.varRegex,
    dynamicArgs: opts.dynamicArgs
  })
}

module.exports = {
  parseFileContents,
  getBodyContentKey,
  parseFile
}
