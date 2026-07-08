/* Builds opaque cache keys for 1Password references.
   Hashes account, op config, binary identity, scope, and ref client-side. */
const crypto = require('crypto')
const fs = require('fs')

const KEY_VERSION = 'v1'

/**
 * @param {string|undefined} explicit - Explicit account
 * @param {NodeJS.ProcessEnv} [env] - Environment object
 * @returns {string}
 */
function effectiveAccount(explicit, env = process.env) {
  if (explicit) return explicit
  return env.OP_ACCOUNT || ''
}

/**
 * @param {string} opPath - op binary path/name
 * @returns {string}
 */
function opIdentity(opPath) {
  try {
    return fs.realpathSync(opPath)
  } catch (err) {
    return opPath
  }
}

/**
 * @param {object} params - Key inputs
 * @returns {string}
 */
function cacheKey(params) {
  const parts = [
    KEY_VERSION,
    params.scope || '',
    params.account || '',
    params.configDir || '',
    opIdentity(params.opPath || 'op'),
    params.reference || '',
  ]
  return `sha256:${crypto.createHash('sha256').update(parts.join('\0')).digest('hex')}`
}

/**
 * @param {string} value - String to hash for stats metadata
 * @returns {string}
 */
function shortHash(value) {
  return crypto.createHash('sha256').update(value || '').digest('hex').slice(0, 16)
}

module.exports = { KEY_VERSION, effectiveAccount, cacheKey, opIdentity, shortHash }
