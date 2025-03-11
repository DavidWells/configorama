const Configorama = require('./main')
const parsers = require('./parsers')
const forceSync = require('sync-rpc')

module.exports.Configorama = Configorama

/**
 * Configorama async API
 * @param  {string|object} configPathOrObject - Path to config file or raw javascript config object
 * @param {object} [settings] Information about the user.
 * @param {object} [settings.options] - options to populate for ${opt:xyz}. These could be CLI flags
 * @param {string} [settings.syntax] - Regex of variable syntax
 * @param {string} [settings.configDir] - cwd of config. Needed if raw object passed in instead of file path
 * @param {array}  [settings.variableSources] - array of custom variable sources
 * @param {object|function} [settings.dynamicArgs] - values passed into .js config files if user using javascript config.
 * @return {Promise} resolved configuration
 */
module.exports = async (configPathOrObject, settings = {}) => {
  const instance = new Configorama(configPathOrObject, settings)
  const options = settings.options || {}
  const config = await instance.init(options)
  return config
}

module.exports.sync = (configPathOrObject, settings = {}) => {
  if (settings.dynamicArgs && typeof settings.dynamicArgs === 'function') {
    throw new Error('Dynamic args must be serializable value for sync usage. Use Async instead')
  }
  return forceSync(require.resolve('./sync'), settings.variableSources)({
    filePath: configPathOrObject,
    settings: settings
  })
}

// Export format utilities
module.exports.format = parsers
