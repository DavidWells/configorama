const YAML = require('../parsers/yaml')
const TOML = require('../parsers/toml')
const INI = require('../parsers/ini')
const { executeTypeScriptFileSync } = require('../parsers/typescript')
const { executeESMFileSync } = require('../parsers/esm')
const cloudFormationSchema = require('./cloudformationSchema')

/**
 * Parse file contents based on file extension
 * @param {string} fileContents - Raw file contents to parse
 * @param {string} fileType - File extension (.yml, .yaml, .json, etc)
 * @param {string} filePath - Full file path (used for error messages)
 * @param {RegExp} varRegex - Variable syntax regex
 * @param {Object} opts - Additional options
 * @returns {Object} Parsed configuration object
 */
function parseFileContents(fileContents, fileType, filePath, varRegex, opts = {}) {
  let configObject

  if (fileType.match(/\.(yml|yaml)/)) {
    try {
      const ymlText = YAML.preProcess(fileContents, varRegex)
      configObject = YAML.parse(ymlText)
    } catch (err) {
      // Attempt to fix cloudformation refs
      if (err.message.match(/YAMLException/)) {
        const ymlText = YAML.preProcess(fileContents, varRegex)
        const result = YAML.load(ymlText, {
          filename: filePath,
          schema: cloudFormationSchema.schema,
        })
        if (result.error) {
          throw result.error
        }
        configObject = result.data
      }
    }
  } else if (fileType.match(/\.(toml)/)) {
    configObject = TOML.parse(fileContents)
  } else if (fileType.match(/\.(ini)/)) {
    configObject = INI.parse(fileContents)
  } else if (fileType.match(/\.(json)/)) {
    configObject = JSON.parse(fileContents)
  } else if (fileType.match(/\.(js)/)) {
    let jsFile
    try {
      jsFile = require(filePath)
      if (typeof jsFile !== 'function') {
        configObject = jsFile
      } else {
        let jsArgs = opts.dynamicArgs || {}
        if (jsArgs && typeof jsArgs === 'function') {
          jsArgs = jsArgs()
        }
        // console.log('jsArgs', jsArgs)
        configObject = jsFile(jsArgs)
      }
    } catch (err) {
      throw new Error(err)
    }
  } else if (fileType.match(/\.(ts|tsx)/)) {
    try {
      let jsArgs = opts.dynamicArgs || {}
      if (jsArgs && typeof jsArgs === 'function') {
        jsArgs = jsArgs()
      }
      configObject = executeTypeScriptFileSync(filePath, opts)
      if (configObject.config) {
        configObject = (typeof configObject.config === 'function') ? configObject.config(jsArgs) : configObject.config
      } else if (configObject.default) {
        configObject = (typeof configObject.default === 'function') ? configObject.default(jsArgs) : configObject.default
      }
      // console.log('parseFileContents configObject', configObject, opts)
    } catch (err) {
      throw new Error(`Failed to execute TypeScript file ${filePath}: ${err.message}`)
    }
  } else if (fileType.match(/\.(mjs|esm)/)) {
    try {
      let jsArgs = opts.dynamicArgs || {}
      if (jsArgs && typeof jsArgs === 'function') {
        jsArgs = jsArgs()
      }
      configObject = executeESMFileSync(filePath, opts)
      if (configObject.config) {
        configObject = (typeof configObject.config === 'function') ? configObject.config(jsArgs) : configObject.config
      } else if (configObject.default) {
        configObject = (typeof configObject.default === 'function') ? configObject.default(jsArgs) : configObject.default
      }
      // console.log('parseFileContents ESM configObject', configObject, opts)
    } catch (err) {
      throw new Error(`Failed to execute ESM file ${filePath}: ${err.message}`)
    }
  }

  return configObject
}

module.exports = {
  parseFileContents
} 