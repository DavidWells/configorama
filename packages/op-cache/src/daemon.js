/* Unix socket daemon that stores op-cache secrets in memory only.
   Handles NDJSON cache requests and never executes the op CLI. */
const fs = require('fs')
const net = require('net')
const path = require('path')
const { SecretCache } = require('./cache')
const { encode, decode, validateRequest, MAX_LINE_BYTES } = require('./protocol')
const { DaemonUnavailableError } = require('./errors')
const pkg = require('../package.json')

/**
 * @param {object} config - Effective config
 * @param {object} [options] - { foreground }
 * @returns {Promise<object>} Server handle
 */
function startDaemon(config, options = {}) {
  return new Promise((resolve, reject) => {
    prepareSocket(config.socket_path)
    const cache = new SecretCache({ maxEntries: config.max_entries })
    let lastConnectionAt = Date.now()
    const server = net.createServer((socket) => {
      lastConnectionAt = Date.now()
      let buffer = ''
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8')
        if (Buffer.byteLength(buffer) > MAX_LINE_BYTES) {
          socket.end(encode({ type: 'error', message: 'Protocol message too large.' }))
          return
        }
        const index = buffer.indexOf('\n')
        if (index === -1) return
        const line = buffer.slice(0, index)
        handleLine(line, socket, cache, config, server)
      })
    })

    server.on('error', reject)
    server.listen(config.socket_path, () => {
      try {
        fs.chmodSync(config.socket_path, 0o600)
        fs.writeFileSync(pidPath(config.socket_path), String(process.pid), { mode: 0o600 })
      } catch (err) {
        server.close()
        return reject(err)
      }
      server.off('error', reject)
      const sweepTimer = setInterval(() => cache.sweep(), 1000)
      const idleTimer = setInterval(() => {
        if (cache.isEmpty() && Date.now() - lastConnectionAt >= config.idle_exit_seconds * 1000) {
          server.close()
        }
      }, 1000)
      const shutdown = () => server.close()
      const cleanup = () => {
        clearInterval(sweepTimer)
        clearInterval(idleTimer)
        process.removeListener('SIGTERM', shutdown)
        process.removeListener('SIGINT', shutdown)
        cleanupSocket(config.socket_path)
      }
      server.on('close', cleanup)
      process.once('SIGTERM', shutdown)
      process.once('SIGINT', shutdown)
      if (options.foreground && process.env.DEBUG) process.stderr.write(`op-cache: daemon listening on ${config.socket_path}\n`)
      resolve({ server, cache })
    })
  })
}

/**
 * @param {string} line - Request line
 * @param {net.Socket} socket - Socket
 * @param {SecretCache} cache - Cache
 * @param {object} config - Config
 * @param {net.Server} server - Server
 */
function handleLine(line, socket, cache, config, server) {
  try {
    const req = validateRequest(decode(line))
    if (req.type === 'get') {
      const value = cache.get(req.key)
      return socket.end(encode(value === undefined ? { type: 'miss' } : { type: 'hit', value }))
    }
    if (req.type === 'set') {
      const ttlSeconds = Math.min(req.ttlSeconds, config.max_ttl_seconds)
      cache.set(req.key, req.value, {
        ttlSeconds,
        scope: req.scope,
        ownerPid: req.ownerPid,
        refHash: req.refHash,
        accountHash: req.accountHash,
      })
      return socket.end(encode({ type: 'stored', ttlSeconds, clamped: ttlSeconds !== req.ttlSeconds }))
    }
    if (req.type === 'ping') {
      return socket.end(encode({
        type: 'pong',
        version: pkg.version,
        ttlSeconds: config.ttl_seconds,
        maxTtlSeconds: config.max_ttl_seconds,
        maxEntries: config.max_entries,
        idleExitSeconds: config.idle_exit_seconds,
      }))
    }
    if (req.type === 'clear') {
      return socket.end(encode({ type: 'cleared', removed: cache.clear(req.scope) }))
    }
    if (req.type === 'stats') {
      return socket.end(encode({ type: 'stats', ...cache.stats(req.scope) }))
    }
    if (req.type === 'shutdown') {
      socket.end(encode({ type: 'shutting_down' }), () => server.close())
    }
  } catch (err) {
    socket.end(encode({ type: 'error', message: err.message }))
  }
}

// sun_path caps Unix socket paths (~104 bytes on macOS, ~108 on Linux);
// over-long paths bind truncated and fail with misleading ENOENT errors.
const MAX_SOCKET_PATH_BYTES = 100

/**
 * @param {string} socketPath - Socket path
 */
function prepareSocket(socketPath) {
  if (Buffer.byteLength(socketPath) > MAX_SOCKET_PATH_BYTES) {
    throw new DaemonUnavailableError(`Socket path exceeds ${MAX_SOCKET_PATH_BYTES} bytes; Unix sockets require short paths. Set OP_CACHE_SOCKET_PATH to a shorter location: ${socketPath}`)
  }
  fs.mkdirSync(path.dirname(socketPath), { recursive: true })
  if (!fs.existsSync(socketPath)) return
  try {
    const stat = fs.statSync(socketPath)
    if (stat.isSocket()) fs.unlinkSync(socketPath)
    else throw new DaemonUnavailableError(`Refusing to remove non-socket path: ${socketPath}`)
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
}

function pidPath(socketPath) {
  return `${socketPath}.pid`
}

function cleanupSocket(socketPath) {
  for (const file of [socketPath, pidPath(socketPath)]) {
    try {
      fs.unlinkSync(file)
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
  }
}

module.exports = { startDaemon, pidPath, cleanupSocket }
