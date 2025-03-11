const YAML = require('../parsers/yaml')
const TOML = require('../parsers/toml')
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
        configObject = jsFile(jsArgs)
      }
    } catch (err) {
      throw new Error(err)
    }
  }

  return configObject
}

module.exports = {
  parseFileContents
} 