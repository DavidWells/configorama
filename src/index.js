const Configorama = require('./main')
const parsers = require('./parsers')
const enrichMetadata = require('./utils/enrichMetadata')

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

    // console.log('instance.fileRefsFound', instance.fileRefsFound)
    // console.log('instance.resolutionTracking', instance.resolutionTracking)
    // process.exit(1)

    // Enrich metadata with resolution tracking data collected during execution
    const enrichedMetadata = enrichMetadata(
      metadata, 
      instance.resolutionTracking, 
      instance.variableSyntax,
      instance.fileRefsFound
    )

    // Add resolvedPropertyValue to resolutionTracking
    const resolutionHistoryWithResolvedValues = {}
    for (const pathKey in instance.resolutionTracking) {
      const tracking = instance.resolutionTracking[pathKey]
      const keys = pathKey.split('.')
      let resolvedValue = config

      // Navigate to the resolved value in the config
      for (const key of keys) {
        if (resolvedValue && typeof resolvedValue === 'object') {
          resolvedValue = resolvedValue[key]
        } else {
          resolvedValue = undefined
          break
        }
      }

      resolutionHistoryWithResolvedValues[pathKey] = {
        ...tracking,
        resolvedPropertyValue: resolvedValue
      }
    }

    return {
      variableSyntax: instance.variableSyntax,
      variableTypes: instance.variableTypes,
      config,
      originalConfig: instance.originalConfig,
      metadata: enrichedMetadata,
      // Include resolution history per path for debugging and advanced use cases
      resolutionHistory: resolutionHistoryWithResolvedValues,
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
