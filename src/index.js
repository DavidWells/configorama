const Configorama = require('./main')
const parsers = require('./parsers')

module.exports.Configorama = Configorama

/**
 * Configorama async API
 * @param  {string|object} configPathOrObject - Path to config file or raw javascript config object
 * @param {object}  [settings] Information about the user.
 * @param {object}  [settings.options] - options to populate for ${opt:xyz}. These could be CLI flags
 * @param {string}  [settings.syntax] - Regex of variable syntax
 * @param {string}  [settings.configDir] - cwd of config. Needed if raw object passed in instead of file path
 * @param {array}   [settings.variableSources] - array of custom variable sources
 * @param {object}  [settings.filters] - Object of of custom filters
 * @param {object}  [settings.functions] - Object of of custom functions
 * @param {boolean} [settings.allowUnknownVars] - allow unknown variables to pass through without throwing errors
 * @param {boolean} [settings.allowUndefinedValues] - allow undefined values to pass through without throwing errors
 * @param {object|function} [settings.dynamicArgs] - values passed into .js config files if user using javascript config.
 * @param {boolean} [settings.returnMetadata] - return both config and metadata about variables found
 * @return {Promise} resolved configuration or {config, metadata} if returnMetadata is true
 */
module.exports = async (configPathOrObject, settings = {}) => {
  const instance = new Configorama(configPathOrObject, settings)
  const options = settings.options || {}
  const config = await instance.init(options)

  if (settings.returnMetadata) {
    const metadata = instance.collectVariableMetadata()
    const varKeys = Object.keys(metadata.variables)

    if (varKeys.length) {
      // Resolve each variable's details to populate afterInnerResolution
      for (const key of varKeys) {
        const variables = metadata.variables[key][0]

        if (variables.resolveDetails && variables.resolveDetails.length > 0) {
          for (const detail of variables.resolveDetails) {
            try {
              // Create a temp config with the variable and merge in resolved config for self: lookups
              const tempConfig = {
                ...config,
                _temp: detail.fullMatch
              }

              // Create a new instance with the same settings
              const tempInstance = new Configorama(tempConfig, {
                ...settings,
                configDir: instance.configDir,
              })

              // Resolve the variable
              const resolved = await tempInstance.init(options)

              // Store the resolved value as afterInnerResolution
              detail.afterInnerResolution = resolved._temp
            } catch (error) {
              // If resolution fails, check if we can extract intermediate resolution from error
              // Error messages often contain the intermediate resolved value
              // Extract it from patterns like: Value  "${file(./database-prod.json)}"
              const valueMatch = error.message.match(/Value\s+"([^"]+)"/)
              if (valueMatch && valueMatch[1]) {
                detail.afterInnerResolution = valueMatch[1]
              }
            }
          }
        }
      }

      // Build resolvedFileRefs array from afterInnerResolution values
      const resolvedFileRefs = []
      for (const key of varKeys) {
        const variables = metadata.variables[key][0]
        if (variables.resolveDetails && variables.resolveDetails.length > 0) {
          for (const detail of variables.resolveDetails) {
            if (detail.afterInnerResolution && typeof detail.afterInnerResolution === 'string') {
              // Check if this is a file() or text() reference
              const fileMatch = detail.afterInnerResolution.match(/^\$\{(?:file|text)\((.*?)\)/)
              if (fileMatch && fileMatch[1]) {
                let filePath = fileMatch[1].trim()
                // Remove quotes if present
                filePath = filePath.replace(/^['"]|['"]$/g, '')
                // Add to array if not already present
                if (!resolvedFileRefs.includes(filePath)) {
                  resolvedFileRefs.push(filePath)
                }
              }
            }
          }
        }
      }

      // Add resolvedFileRefs to metadata
      metadata.resolvedFileRefs = resolvedFileRefs
    }

    return {
      config,
      metadata
    }
  }

  return config
}

module.exports.sync = (configPathOrObject, settings = {}) => {
  const _settings = settings || {}
  if (_settings.dynamicArgs && typeof _settings.dynamicArgs === 'function') {
    throw new Error('Dynamic args must be serializable value for sync usage. Use Async instead')
  }
  if (!_settings.options) {
    const cliArgs = require('minimist')(process.argv.slice(2))
    _settings.options = cliArgs
  }
  const forceSync = require('sync-rpc')
  return forceSync(require.resolve('./sync'), _settings.variableSources)({
    filePath: configPathOrObject,
    settings: _settings
  })
}

// Export format utilities
module.exports.format = parsers
