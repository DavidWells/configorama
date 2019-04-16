const Configorama = require('./main')
const forceSync = require('sync-rpc')

module.exports.Configorama = Configorama

/**
 * Configorama async API
 * @param  {string|object} configPathOrObject - Path to config file or raw javascript config object
 * @param {Object} settings Information about the user.
 * @param {Object} settings.options - options to populate for ${opt:xyz}. These could be CLI flags
 * @param {String} settings.syntax - Regex of variable syntax
 * @param {String} settings.configDir - cwd of config. Needed if raw object passed in instead of file path
 * @param {Array}  settings.variableSources - array of custom variable sources
 * @return {Promise} resolved configuration
 */
module.exports = async (configPathOrObject, settings = {}) => {
  const instance = new Configorama(configPathOrObject, settings)
  const options = settings.options || {}
  const config = await instance.init(options)
  return config
}

module.exports.sync = (filePathOrObject, settings = {}) => {
  return forceSync(require.resolve('./async'))({
    filePath: filePathOrObject,
    settings: settings
  })
}
