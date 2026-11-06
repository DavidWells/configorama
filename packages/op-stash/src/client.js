/* Client-side daemon communication and lifecycle management.
   Only read paths auto-start the daemon; diagnostics never spawn. */
const fs = require('fs')
const net = require('net')
const path = require('path')
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
      reject(new DaemonUnavailableError('Timed out waiting for op-stash daemon.'))
    })
    socket.on('error', (err) => reject(new DaemonUnavailableError(`Could not connect to op-stash daemon: ${err.message}`)))
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

// One in-flight ensure per socket path: parallel resolution of N variables
// must not spawn N daemons that race each other for the socket.
const ensuring = new Map()

/**
 * @param {object} config - Config
 * @param {object} [options] - { stderr }
 */
function ensureDaemon(config, options = {}) {
  const key = config.socket_path
  if (!ensuring.has(key)) {
    const inflight = ensureDaemonInner(config, options).finally(() => {
      ensuring.delete(key)
    })
    ensuring.set(key, inflight)
  }
  return ensuring.get(key)
}

/**
 * @param {object} config - Config
 * @param {object} [options] - { stderr }
 */
async function ensureDaemonInner(config, options = {}) {
  try {
    const pong = await ping(config)
    warnVersionMismatch(pong, options.stderr)
    return pong
  } catch (err) {
    if (/Unsafe op-stash socket/.test(err.message)) throw err
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
    throw new DaemonUnavailableError('op-stash daemon failed to start within 5s.')
  }
}

/**
 * @param {object} config - Config
 */
function spawnDaemon(config) {
  const child = spawn(process.execPath, [require.resolve('./cli'), 'daemon'], {
    detached: true,
    stdio: 'ignore',
    // The daemon outlives its spawner by up to idle_exit_seconds, and its
    // environment is visible to same-user processes (`ps -E`). Hand it only
    // what config resolution needs, never the caller's tokens or cloud creds,
    // and don't pin the caller's working directory.
    cwd: '/',
    env: daemonEnv(process.env, config),
  })
  child.unref()
}

// Variables the daemon needs to resolve the same config as its spawner.
const DAEMON_ENV_KEYS = ['PATH', 'HOME', 'TMPDIR', 'XDG_CONFIG_HOME', 'XDG_RUNTIME_DIR', 'LANG', 'DEBUG']

/**
 * Minimal environment for a spawned daemon: a fixed allowlist plus OP_STASH_*
 * settings (minus the client-only OP_STASH_DISABLED). Paths are made absolute
 * because the daemon runs from `/`.
 * @param {NodeJS.ProcessEnv} env - Spawner environment
 * @param {object} config - Effective config
 * @returns {NodeJS.ProcessEnv}
 */
function daemonEnv(env, config) {
  const out = {}
  for (const key of DAEMON_ENV_KEYS) {
    if (env[key] !== undefined) out[key] = env[key]
  }
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('OP_STASH_') && key !== 'OP_STASH_DISABLED' && value !== undefined) out[key] = value
  }
  if (out.OP_STASH_CONFIG) out.OP_STASH_CONFIG = path.resolve(out.OP_STASH_CONFIG)
  out.OP_STASH_SOCKET_PATH = path.resolve(config.socket_path)
  return out
}

/**
 * @param {string} socketPath - Path
 */
function assertSafeSocket(socketPath) {
  let stat
  try {
    stat = fs.statSync(socketPath)
  } catch (err) {
    throw new DaemonUnavailableError('op-stash daemon is not running.')
  }
  if (!stat.isSocket()) throw new DaemonUnavailableError(`Unsafe op-stash socket path is not a socket: ${socketPath}`)
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
    throw new DaemonUnavailableError(`Unsafe op-stash socket owner for ${socketPath}.`)
  }
  const mode = stat.mode & 0o777
  if (mode !== 0o600) throw new DaemonUnavailableError(`Unsafe op-stash socket permissions ${mode.toString(8)} for ${socketPath}; expected 600.`)
}

/**
 * @param {object} pong - Pong response
 * @param {NodeJS.WritableStream} [stderr] - stderr stream
 */
function warnVersionMismatch(pong, stderr) {
  if (pong && pong.version && pong.version !== pkg.version && stderr) {
    stderr.write(`op-stash: daemon version ${pong.version} differs from client version ${pkg.version}; run op-stash stop to reload\n`)
  }
}

/**
 * @param {number} ms - Milliseconds
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

module.exports = { request, ping, ensureDaemon, assertSafeSocket, warnVersionMismatch, sleep, daemonEnv }
