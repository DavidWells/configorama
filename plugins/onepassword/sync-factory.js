/* Factory entry for configorama.sync() workers
   Rebuilds the 1Password resolver from JSON-serializable options inside the sync worker */
const createOnePasswordResolver = require('./index')

/**
 * @param {object} options - JSON-round-tripped syncOptions ({ refs, account, configDir, skipResolution })
 * @returns {object} Variable source
 */
module.exports = function createSyncOnePasswordResolver(options = {}) {
  if (options.hasInjectedExecFile) {
    throw new Error('1Password resolver options are not serializable for sync usage. Remove the injected execFile or use the async API.')
  }
  const { hasInjectedExecFile, ...factoryOptions } = options
  return createOnePasswordResolver(factoryOptions)
}
