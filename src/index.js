const Configorama = require('./main')
const parsers = require('./parsers')
const enrichMetadata = require('./utils/parsing/enrichMetadata')

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
 * @property {string[]} [mergeKeys] - keys to merge in arrays of objects
 * @property {Object.<string, string>} [filePathOverrides] - map of file paths to override
 */

/**
 * @template [T=any]
 * @typedef {Object} ConfigoramaResult
 * @property {RegExp} variableSyntax - The variable syntax pattern used
 * @property {Object.<string, any>} variableTypes - Map of variable types found
 * @property {T} config - The resolved configuration object
 * @property {Object} originalConfig - The original unresolved configuration
 * @property {Object} metadata - Metadata about variables found and resolved
 * @property {Object} resolutionHistory - Resolution history per path for debugging
 */

/**
 * Configorama async API
 * @template [T=any]
 * @param {string|Object} configPathOrObject - Path to config file or raw javascript config object
 * @param {ConfigoramaSettings} [settings] - Configuration settings
 * @returns {Promise<T | ConfigoramaResult<T>>} resolved configuration or {config, metadata} if returnMetadata is true
 */
module.exports = async (configPathOrObject, settings = {}) => {
  const instance = new Configorama(configPathOrObject, settings)
  const options = settings.options || {}
  const config = await instance.init(options)

  if (settings.returnMetadata) {
    const metadata = instance.collectVariableMetadata()

    // Enrich metadata with resolution tracking data collected during execution
    const enrichedMetadata = await enrichMetadata(
      metadata,
      instance.resolutionTracking,
      instance.variableSyntax,
      instance.fileRefsFound,
      instance.originalConfig,
      instance.configFilePath,
      Object.keys(instance.filters),
      config, // pass resolved config for post-resolution enrichment
      options,
      instance.variableTypes
    )

    // Collect custom metadata from variable sources that have collectMetadata
    if (settings.variableSources && Array.isArray(settings.variableSources)) {
      for (const source of settings.variableSources) {
        if (typeof source.collectMetadata === 'function') {
          const customData = source.collectMetadata()
          if (customData !== undefined && customData !== null) {
            // Use source.metadataKey if specified, otherwise default to `${type}References`
            const metadataKey = source.metadataKey || `${source.type}References`
            enrichedMetadata[metadataKey] = customData
          }
        }
      }
    }

    return {
      variableSyntax: instance.variableSyntax,
      variableTypes: instance.variableTypes,
      config,
      originalConfig: instance.originalConfig,
      metadata: enrichedMetadata,
      resolutionHistory: enrichedMetadata.resolutionHistory,
    }
  }

  return config
}

/**
 * Configorama sync API
 * @template [T=any]
 * @param {string|Object} configPathOrObject - Path to config file or raw javascript config object
 * @param {ConfigoramaSettings} [settings] - Configuration settings
 * @returns {T} resolved configuration object
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
 * Analyze config variables without resolving them
 * @param  {string|object} configPathOrObject - Path to config file or raw javascript config object
 * @param {object}  [settings] - Same settings as the main API
 * @return {Promise} Pre-resolved variable metadata
 */
module.exports.analyze = async (configPathOrObject, settings = {}) => {
  const instance = new Configorama(configPathOrObject, {
    ...settings,
    returnPreResolvedVariableDetails: true,
  })
  const options = settings.options || {}
  return instance.init(options)
}

/**
 * Format utilities for parsing various config formats
 * @type {Object}
 */
module.exports.format = parsers
