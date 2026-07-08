/* Client-side daemon communication and lifecycle management.
   Only read paths auto-start the daemon; diagnostics never spawn. */
const fs = require('fs')
const net = require('net')
const { spawn } = require('child_process')
const { encode, decode } = require('./protocol')
const { DaemonUnavailableError, ProtocolError } = require('./errors')
const pkg = require('../package.json')

/**
 * @param {object} config - Config
 * @returns {Promise<object>}
 */
function ping(config) {
  return request(config, { type: 'ping' })
}

/**
 * @param {object} config - Config
 * @param {object} message - Request message
 * @returns {Promise<object>}
 */
function request(config, message) {
  return new Promise((resolve, reject) => {
    try {
      assertSafeSocket(config.socket_path)
    } catch (err) {
      return reject(err)
    }
    const socket = net.createConnection(config.socket_path)
    let buffer = ''
    socket.setTimeout(2000)
    socket.on('connect', () => socket.write(encode(message)))
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      const index = buffer.indexOf('\n')
      if (index !== -1) socket.end()
    })
    socket.on('timeout', () => {
      socket.destroy()
      reject(new DaemonUnavailableError('Timed out waiting for op-cache daemon.'))
    })
    socket.on('error', (err) => reject(new DaemonUnavailableError(`Could not connect to op-cache daemon: ${err.message}`)))
    socket.on('close', () => {
      if (!buffer) return
      try {
        const response = decode(buffer.split('\n')[0])
        if (response.type === 'error') reject(new ProtocolError(response.message))
        else resolve(response)
      } catch (err) {
        reject(err)
      }
    })
  })
}

/**
 * @param {object} config - Config
 * @param {object} [options] - { stderr }
 */
async function ensureDaemon(config, options = {}) {
  try {
    const pong = await ping(config)
    warnVersionMismatch(pong, options.stderr)
    return pong
  } catch (err) {
    if (/Unsafe op-cache socket/.test(err.message)) throw err
    spawnDaemon(config)
    const start = Date.now()
    while (Date.now() - start < 5000) {
      await sleep(50)
      try {
        const pong = await ping(config)
        warnVersionMismatch(pong, options.stderr)
        return pong
      } catch (pollErr) {
        // keep polling
      }
    }
    throw new DaemonUnavailableError('op-cache daemon failed to start within 5s.')
  }
}

/**
 * @param {object} config - Config
 */
function spawnDaemon(config) {
  const child = spawn(process.execPath, [require.resolve('./cli'), 'daemon'], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, OP_CACHE_SOCKET_PATH: config.socket_path },
  })
  child.unref()
}

/**
 * @param {string} socketPath - Path
 */
function assertSafeSocket(socketPath) {
  let stat
  try {
    stat = fs.statSync(socketPath)
  } catch (err) {
    throw new DaemonUnavailableError('op-cache daemon is not running.')
  }
  if (!stat.isSocket()) throw new DaemonUnavailableError(`Unsafe op-cache socket path is not a socket: ${socketPath}`)
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
    throw new DaemonUnavailableError(`Unsafe op-cache socket owner for ${socketPath}.`)
  }
  const mode = stat.mode & 0o777
  if (mode !== 0o600) throw new DaemonUnavailableError(`Unsafe op-cache socket permissions ${mode.toString(8)} for ${socketPath}; expected 600.`)
}

/**
 * @param {object} pong - Pong response
 * @param {NodeJS.WritableStream} [stderr] - stderr stream
 */
function warnVersionMismatch(pong, stderr) {
  if (pong && pong.version && pong.version !== pkg.version && stderr) {
    stderr.write(`op-cache: daemon version ${pong.version} differs from client version ${pkg.version}; run op-cache stop to reload\n`)
  }
}

/**
 * @param {number} ms - Milliseconds
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

module.exports = { request, ping, ensureDaemon, assertSafeSocket, warnVersionMismatch, sleep }
