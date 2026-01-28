// Parses config file contents based on file extension
const fs = require('fs')
const path = require('path')
const YAML = require('../../parsers/yaml')
const TOML = require('../../parsers/toml')
const INI = require('../../parsers/ini')
const JSON5 = require('../../parsers/json5')
const HCL = require('../../parsers/hcl')
const { executeTypeScriptFileSync } = require('../../parsers/typescript')
const { executeESMFileSync } = require('../../parsers/esm')
const cloudFormationSchema = require('./cloudformationSchema')

const DEFAULT_VAR_SYNTAX = '\\${((?!AWS|stageVariables)[ ~:a-zA-Z0-9=+!@#%*<>?._\'",|\\-\\/\\(\\)\\\\]+?)}'

/**
 * @typedef {Object} ParseOptions
 * @property {string} contents - Raw file contents to parse
 * @property {string} filePath - Full file path (used for extension detection and error messages)
 * @property {RegExp} [varRegex] - Variable syntax regex (defaults to configorama syntax)
 * @property {Object|Function} [dynamicArgs] - Arguments passed to JS/TS function exports
 */

/**
 * Parse file contents based on file extension
 * @param {ParseOptions} options
 * @returns {Object} Parsed configuration object
 */
function parseFileContents({ contents, filePath, varRegex, dynamicArgs }) {
  const fileType = path.extname(filePath)
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
          throw result.error
        }
        configObject = result.data
      } else {
        // Re-throw non-YAML errors (e.g., TypeError from null/undefined contents)
        throw err
      }
    }
  } else if (fileType.match(/\.(toml|tml)/i)) {
    configObject = TOML.parse(contents)
  } else if (fileType.match(/\.(ini)/i)) {
    configObject = INI.parse(contents)
  } else if (fileType.match(/\.(json|json5|jsonc)/i)) {
    configObject = JSON5.parse(contents)
  } else if (fileType.match(/\.(tf|hcl)$/i) || filePath.match(/\.tf\.json$/i)) {
    // Handle Terraform HCL files (.tf, .hcl) and Terraform JSON (.tf.json)
    if (filePath.match(/\.tf\.json$/i)) {
      // .tf.json files are just JSON
      configObject = JSON5.parse(contents)
    } else {
      // .tf and .hcl files need HCL parsing
      configObject = HCL.parse(contents, path.basename(filePath))
    }
  } else if (fileType.match(/\.(md|mdx|markdown|mdown|mkdn|mkd|mdwn|markdn|mdtxt|mdtext)/i)) {
    const { extractFrontmatter } = require('../../parsers/markdown')
    const { frontmatterContent, content, format } = extractFrontmatter(contents)

    if (!frontmatterContent) {
      configObject = {}
    } else if (format === 'toml') {
      configObject = TOML.parse(frontmatterContent)
    } else if (format === 'json') {
      configObject = JSON5.parse(frontmatterContent)
    } else {
      const ymlText = YAML.preProcess(frontmatterContent)
      configObject = YAML.parse(ymlText)
    }
    const bodyContent = content.replace(/^\n+|\n+$/g, '')
    if (configObject.hasOwnProperty('_content')) {
      console.warn('configorama: frontmatter key "_content" conflicts with reserved body content key. Body stored as "_body" instead.')
      configObject._body = bodyContent
    } else {
      configObject._content = bodyContent
    }
  // TODO detect js syntax and use appropriate parser
  } else if (fileType.match(/\.(js|cjs)/i)) {
    let jsFile
    try {
      jsFile = require(filePath)
      if (typeof jsFile !== 'function') {
        configObject = jsFile
      } else {
        let jsArgs = dynamicArgs || {}
        if (jsArgs && typeof jsArgs === 'function') {
          jsArgs = jsArgs()
        }
        // console.log('jsArgs', jsArgs)
        configObject = jsFile(jsArgs)
      }
    } catch (err) {
      throw new Error(err)
    }
  } else if (fileType.match(/\.(ts|tsx|mts|cts)/i)) {
    try {
      let jsArgs = dynamicArgs || {}
      if (jsArgs && typeof jsArgs === 'function') {
        jsArgs = jsArgs()
      }
      configObject = executeTypeScriptFileSync(filePath, { dynamicArgs })
      if (configObject.config) {
        configObject = (typeof configObject.config === 'function') ? configObject.config(jsArgs) : configObject.config
      } else if (configObject.default) {
        configObject = (typeof configObject.default === 'function') ? configObject.default(jsArgs) : configObject.default
      } else if (typeof configObject === 'function') {
        configObject = configObject(jsArgs)
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
      configObject = executeESMFileSync(filePath, { dynamicArgs })
      if (configObject.config) {
        configObject = (typeof configObject.config === 'function') ? configObject.config(jsArgs) : configObject.config
      } else if (configObject.default) {
        configObject = (typeof configObject.default === 'function') ? configObject.default(jsArgs) : configObject.default
      } else if (typeof configObject === 'function') {
        configObject = configObject(jsArgs)
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
  parseFile
}
