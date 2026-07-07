/* Programmatic API for op-cache callers.
   Configorama's 1Password resolver consumes these module-level functions. */
const { resolveConfig } = require('./config')
const { resolveScope } = require('./scope')
const { cacheKey, effectiveAccount, shortHash } = require('./key')
const { readOp } = require('./op')
const { ensureDaemon, request, ping } = require('./client')
const { startDaemon } = require('./daemon')

/**
 * @param {string} ref - op:// reference
 * @param {object} [opts] - Read options
 * @returns {Promise<string>}
 */
async function read(ref, opts = {}) {
  if (!ref || !ref.startsWith('op://')) throw new Error(`Invalid 1Password reference: ${ref}`)
  const env = opts.env || process.env
  const { config } = resolveConfig(optionFlags(opts), { env })
  const account = effectiveAccount(opts.account, env)
  if (env.OP_CACHE_DISABLED === '1' || opts.platform === 'win32' || process.platform === 'win32') {
    return readOp(ref, config, { account, configDir: opts.configDir })
  }
  const scopeInfo = resolveScope(opts.scope || config.default_scope, { env })
  const key = cacheKey({ scope: scopeInfo.scope, account, configDir: opts.configDir, opPath: config.op_path, reference: ref })
  const fallbackToOp = opts.fallbackToOp === true
  try {
    await ensureDaemon(config, { stderr: opts.stderr })
    const got = await request(config, { type: 'get', key, scope: scopeInfo.scope })
    if (got.type === 'hit') return got.value
    const value = await readOp(ref, config, { account, configDir: opts.configDir })
    const stored = await request(config, {
      type: 'set',
      key,
      value,
      scope: scopeInfo.scope,
      ttlSeconds: config.ttl_seconds,
      ownerPid: scopeInfo.ownerPid,
      refHash: shortHash(ref),
      accountHash: shortHash(account),
    })
    if (stored.clamped && opts.stderr) {
      opts.stderr.write(`op-cache: ttl clamped to ${stored.ttlSeconds}s by daemon max_ttl_seconds\n`)
    }
    return value
  } catch (err) {
    if (!fallbackToOp) throw err
    if (opts.stderr) opts.stderr.write(`op-cache: cache bypassed (${err.message}); reading directly\n`)
    return readOp(ref, config, { account, configDir: opts.configDir })
  }
}

/**
 * @param {object} [opts] - Options
 * @returns {Promise<object>}
 */
async function status(opts = {}) {
  const { config } = resolveConfig(optionFlags(opts), { env: opts.env || process.env })
  if (opts.platform === 'win32' || process.platform === 'win32') return { running: false, platform: 'win32', available: false }
  try {
    const pong = await ping(config)
    return { running: true, available: true, socketPath: config.socket_path, daemon: pong }
  } catch (err) {
    return { running: false, available: true, socketPath: config.socket_path, error: err.message }
  }
}

/**
 * @param {object} [opts] - Options
 * @returns {Promise<object>}
 */
async function stats(opts = {}) {
  if (opts.platform === 'win32' || process.platform === 'win32') return { type: 'stats', entries: 0, hits: 0, misses: 0, available: false, platform: 'win32' }
  const { config } = resolveConfig(optionFlags(opts), { env: opts.env || process.env })
  const scopeInfo = opts.scope ? resolveScope(opts.scope, { env: opts.env || process.env }) : undefined
  return request(config, { type: 'stats', scope: scopeInfo && scopeInfo.scope })
}

/**
 * @param {object} [opts] - Options
 * @returns {Promise<object>}
 */
async function clear(opts = {}) {
  if (opts.platform === 'win32' || process.platform === 'win32') return { type: 'cleared', removed: 0, available: false, platform: 'win32' }
  const { config } = resolveConfig(optionFlags(opts), { env: opts.env || process.env })
  const scopeInfo = opts.scope ? resolveScope(opts.scope, { env: opts.env || process.env }) : undefined
  return request(config, { type: 'clear', scope: scopeInfo && scopeInfo.scope })
}

/**
 * @param {object} [opts] - Options
 * @returns {Promise<object>}
 */
async function stop(opts = {}) {
  if (opts.platform === 'win32' || process.platform === 'win32') return { type: 'stopped', available: false, platform: 'win32' }
  const { config } = resolveConfig(optionFlags(opts), { env: opts.env || process.env })
  return request(config, { type: 'shutdown' })
}

/**
 * @param {object} [opts] - Options
 * @returns {Promise<object>}
 */
async function start(opts = {}) {
  const { config } = resolveConfig(optionFlags(opts), { env: opts.env || process.env })
  return startDaemon(config, opts)
}

/**
 * @param {object} opts - Input opts
 * @returns {object}
 */
function optionFlags(opts) {
  return {
    socketPath: opts.socketPath,
    ttlSeconds: opts.ttlSeconds,
    maxTtlSeconds: opts.maxTtlSeconds,
    maxEntries: opts.maxEntries,
    opPath: opts.opPath,
    opTimeoutSeconds: opts.opTimeoutSeconds,
    idleExitSeconds: opts.idleExitSeconds,
    scope: opts.scope,
    configPath: opts.configPath,
  }
}

module.exports = { read, status, stats, clear, stop, start, ensureDaemon }
