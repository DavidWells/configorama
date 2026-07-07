/* Resolves op-cache configuration from flags, env, JSON config, and defaults.
   Caches process-level config while allowing per-call option overrides. */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { ConfigError } = require('./errors')
const { parseDurationSeconds } = require('./duration')

/** @type {import('fs')} */
const fsp = fs

/** @type {object|undefined} */
let cachedBase

/**
 * @param {NodeJS.ProcessEnv} [env] - Environment object
 * @returns {string} Config file path
 */
function configPath(env = process.env) {
  if (env.OP_CACHE_CONFIG) return env.OP_CACHE_CONFIG
  const base = env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  return path.join(base, 'op-cache', 'config.json')
}

/**
 * @param {NodeJS.ProcessEnv} [env] - Environment object
 * @returns {object} Default config
 */
function defaults(env = process.env) {
  const uid = typeof process.getuid === 'function' ? process.getuid() : 'user'
  const tmp = env.TMPDIR || os.tmpdir() || '/tmp'
  return {
    socket_path: path.join(tmp, `op-cache-${uid}.sock`),
    ttl_seconds: 300,
    max_ttl_seconds: 86400,
    max_entries: 1000,
    op_path: 'op',
    op_timeout_seconds: 30,
    default_scope: 'user',
    idle_exit_seconds: 1800,
  }
}

/**
 * @param {string} filePath - JSON config path
 * @returns {object}
 */
function readConfigFile(filePath) {
  if (!fsp.existsSync(filePath)) return {}
  try {
    const raw = fsp.readFileSync(filePath, 'utf8')
    if (!raw.trim()) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ConfigError(`Invalid op-cache config ${filePath}: expected a JSON object.`)
    }
    return parsed
  } catch (err) {
    if (err instanceof ConfigError) throw err
    throw new ConfigError(`Invalid op-cache config ${filePath}: ${err.message}`)
  }
}

/**
 * @param {NodeJS.ProcessEnv} env - Environment object
 * @returns {object}
 */
function envConfig(env) {
  const out = {}
  if (env.OP_CACHE_SOCKET_PATH) out.socket_path = env.OP_CACHE_SOCKET_PATH
  if (env.OP_CACHE_TTL_SECONDS) out.ttl_seconds = parseDurationSeconds(env.OP_CACHE_TTL_SECONDS, 'OP_CACHE_TTL_SECONDS')
  if (env.OP_CACHE_MAX_TTL_SECONDS) out.max_ttl_seconds = parseDurationSeconds(env.OP_CACHE_MAX_TTL_SECONDS, 'OP_CACHE_MAX_TTL_SECONDS')
  if (env.OP_CACHE_MAX_ENTRIES) out.max_entries = parsePositiveInt(env.OP_CACHE_MAX_ENTRIES, 'OP_CACHE_MAX_ENTRIES')
  if (env.OP_CACHE_OP_PATH) out.op_path = env.OP_CACHE_OP_PATH
  if (env.OP_CACHE_OP_TIMEOUT_SECONDS) out.op_timeout_seconds = parseDurationSeconds(env.OP_CACHE_OP_TIMEOUT_SECONDS, 'OP_CACHE_OP_TIMEOUT_SECONDS')
  if (env.OP_CACHE_IDLE_EXIT_SECONDS) out.idle_exit_seconds = parseDurationSeconds(env.OP_CACHE_IDLE_EXIT_SECONDS, 'OP_CACHE_IDLE_EXIT_SECONDS')
  if (env.OP_CACHE_SCOPE) out.default_scope = env.OP_CACHE_SCOPE
  return out
}

/**
 * @param {string|number} value - User integer value
 * @param {string} label - Error label
 * @returns {number}
 */
function parsePositiveInt(value, label) {
  const n = Number(value)
  if (Number.isInteger(n) && n > 0) return n
  throw new ConfigError(`Invalid ${label}: expected a positive integer.`)
}

/**
 * @param {object} config - Merged config
 * @returns {object}
 */
function normalizeConfig(config) {
  const out = { ...config }
  for (const key of ['ttl_seconds', 'max_ttl_seconds', 'max_entries', 'op_timeout_seconds', 'idle_exit_seconds']) {
    out[key] = parsePositiveInt(out[key], key)
  }
  if (!out.socket_path || typeof out.socket_path !== 'string') throw new ConfigError('Invalid socket_path: expected a non-empty string.')
  if (!out.op_path || typeof out.op_path !== 'string') throw new ConfigError('Invalid op_path: expected a non-empty string.')
  if (!out.default_scope || typeof out.default_scope !== 'string') throw new ConfigError('Invalid default_scope: expected a non-empty string.')
  return out
}

/**
 * @param {object} [flags] - CLI/API overrides
 * @param {object} [settings] - { env, useCache }
 * @returns {{config: object, path: string, exists: boolean}}
 */
function resolveConfig(flags = {}, settings = {}) {
  const env = settings.env || process.env
  const filePath = flags.configPath || configPath(env)
  let base
  if (settings.useCache !== false && cachedBase && !flags.configPath) {
    base = cachedBase
  } else {
    base = normalizeConfig({
      ...defaults(env),
      ...readConfigFile(filePath),
      ...envConfig(env),
    })
    if (settings.useCache !== false && !flags.configPath) cachedBase = base
  }

  const overrides = {}
  if (flags.socketPath) overrides.socket_path = flags.socketPath
  if (flags.ttlSeconds !== undefined) overrides.ttl_seconds = parseDurationSeconds(flags.ttlSeconds, 'ttl')
  if (flags.maxTtlSeconds !== undefined) overrides.max_ttl_seconds = parseDurationSeconds(flags.maxTtlSeconds, 'max ttl')
  if (flags.maxEntries !== undefined) overrides.max_entries = parsePositiveInt(flags.maxEntries, 'max entries')
  if (flags.opPath) overrides.op_path = flags.opPath
  if (flags.opTimeoutSeconds !== undefined) overrides.op_timeout_seconds = parseDurationSeconds(flags.opTimeoutSeconds, 'op timeout')
  if (flags.idleExitSeconds !== undefined) overrides.idle_exit_seconds = parseDurationSeconds(flags.idleExitSeconds, 'idle exit')
  if (flags.scope) overrides.default_scope = flags.scope

  const config = normalizeConfig({ ...base, ...overrides })
  return { config, path: filePath, exists: fsp.existsSync(filePath) }
}

function resetConfigCache() {
  cachedBase = undefined
}

module.exports = { configPath, defaults, resolveConfig, resetConfigCache, parsePositiveInt }
