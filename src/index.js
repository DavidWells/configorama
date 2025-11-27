const Configorama = require('./main')
const parsers = require('./parsers')
const enrichMetadata = require('./utils/enrichMetadata')

module.exports.Configorama = Configorama

/**
 * @typedef {Object} ConfigoramaSettings
 * @property {Object.<string, any>} [options] - options to populate for ${opt:xyz}. These could be CLI flags
 * @property {string} [syntax] - Regex of variable syntax
 * @property {string} [configDir] - cwd of config. Needed if raw object passed in instead of file path
 * @property {Array} [variableSources] - array of custom variable sources
 * @property {Object.<string, Function>} [filters] - Object of custom filters
 * @property {Object.<string, Function>} [functions] - Object of custom functions
 * @property {boolean} [allowUnknownVars] - allow unknown variables to pass through without throwing errors
 * @property {boolean} [allowUndefinedValues] - allow undefined values to pass through without throwing errors
 * @property {Object|Function} [dynamicArgs] - values passed into .js config files if user using javascript config
 * @property {boolean} [returnMetadata] - return both config and metadata about variables found
 */

/**
 * @typedef {Object} ConfigoramaResult
 * @property {string} variableSyntax - The variable syntax pattern used
 * @property {Object.<string, string>} variableTypes - Map of variable types found
 * @property {Object} config - The resolved configuration object
 * @property {Object} originalConfig - The original unresolved configuration
 * @property {Object} metadata - Metadata about variables found and resolved
 * @property {Object} resolutionHistory - Resolution history per path for debugging
 */

/**
 * Configorama async API
 * @param {string|Object} configPathOrObject - Path to config file or raw javascript config object
 * @param {ConfigoramaSettings} [settings={}] - Configuration settings
 * @returns {Promise<Object|ConfigoramaResult>} resolved configuration or {config, metadata} if returnMetadata is true
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
      instance.fileRefsFound,
      instance.originalConfig,
      instance.configFilePath,
      Object.keys(instance.filters)
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

/**
 * Configorama sync API
 * @param {string|Object} configPathOrObject - Path to config file or raw javascript config object
 * @param {ConfigoramaSettings} [settings={}] - Configuration settings
 * @returns {Object} resolved configuration object
 */
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

/**
 * Format utilities for parsing various config formats
 * @type {Object}
 */
module.exports.format = parsers
