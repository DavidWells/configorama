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

// One warning per kind per stream. Production callers pass process.stderr,
// so this is once-per-process; test streams each warn once.
const warnedStreams = new WeakMap()

/**
 * @param {NodeJS.WritableStream|undefined} stderr - Warning stream
 * @param {string} kind - Warning category
 * @param {string} message - Warning text
 */
function warnOnce(stderr, kind, message) {
  if (!stderr) return
  let kinds = warnedStreams.get(stderr)
  if (!kinds) {
    kinds = new Set()
    warnedStreams.set(stderr, kinds)
  }
  if (kinds.has(kind)) return
  kinds.add(kind)
  stderr.write(message)
}

/**
 * @param {Function} producer - Async producer returning the value string
 * @returns {Promise<string>}
 */
async function produce(producer) {
  const value = await producer()
  if (typeof value !== 'string') throw new Error('op-cache getOrSet producer must return a string.')
  return value
}

/**
 * @param {Function} validate - Caller validator
 * @param {string} value - Cached value
 * @returns {boolean}
 */
function validateQuietly(validate, value) {
  try {
    return validate(value) !== false
  } catch (err) {
    return false
  }
}

/**
 * Get-or-compute: cache lookup where the miss producer is caller logic, not
 * `op read`. Advanced integration API for resolvers caching computed values.
 * fallbackToOp here means "on daemon failure, do the work directly" — the
 * fallback runs the producer; the name matches read for option continuity.
 * @param {string} cacheRef - Cache reference; any non-empty string
 * @param {Function} producer - Async producer invoked on miss; must return a string
 * @param {object} [opts] - Options ({ account, configDir, opPath, ttlSeconds, scope, fallbackToOp, validateCached, stderr, env })
 * @returns {Promise<string>}
 */
async function getOrSet(cacheRef, producer, opts = {}) {
  if (!cacheRef || typeof cacheRef !== 'string') throw new Error('op-cache getOrSet requires a non-empty cache reference string.')
  if (typeof producer !== 'function') throw new Error('op-cache getOrSet requires a producer function.')
  const env = opts.env || process.env
  const { config } = resolveConfig(optionFlags(opts), { env })
  const account = effectiveAccount(opts.account, env)
  if (env.OP_CACHE_DISABLED === '1' || opts.platform === 'win32' || process.platform === 'win32') {
    return produce(producer)
  }
  const scopeInfo = resolveScope(opts.scope || config.default_scope, { env })
  const key = cacheKey({ scope: scopeInfo.scope, account, configDir: opts.configDir, opPath: config.op_path, reference: cacheRef })
  const fallbackToOp = opts.fallbackToOp === true
  let daemonBroken = false
  let got
  try {
    await ensureDaemon(config, { stderr: opts.stderr })
    got = await request(config, { type: 'get', key, scope: scopeInfo.scope })
  } catch (err) {
    if (!fallbackToOp) throw err
    if (opts.stderr) opts.stderr.write(`op-cache: cache bypassed (${err.message}); resolving directly\n`)
    daemonBroken = true
  }
  if (!daemonBroken && got.type === 'hit') {
    if (!opts.validateCached || validateQuietly(opts.validateCached, got.value)) {
      return got.value
    }
    warnOnce(opts.stderr, 'validate-reject', 'op-cache: cached entry failed validation; recomputing and overwriting\n')
  }
  // Producer errors propagate untouched and the producer never runs twice:
  // only daemon get/set failures participate in the fallback path above/below.
  const value = await produce(producer)
  if (!daemonBroken) {
    try {
      const stored = await request(config, {
        type: 'set',
        key,
        value,
        scope: scopeInfo.scope,
        ttlSeconds: config.ttl_seconds,
        ownerPid: scopeInfo.ownerPid,
        refHash: shortHash(cacheRef),
        accountHash: shortHash(account),
      })
      if (stored.clamped) {
        warnOnce(opts.stderr, 'ttl-clamp', `op-cache: ttl clamped to ${stored.ttlSeconds}s by daemon max_ttl_seconds\n`)
      }
    } catch (err) {
      if (!fallbackToOp) throw err
      if (opts.stderr) opts.stderr.write(`op-cache: cache bypassed (${err.message}); value not stored\n`)
    }
  }
  return value
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

module.exports = { read, getOrSet, status, stats, clear, stop, start, ensureDaemon }
