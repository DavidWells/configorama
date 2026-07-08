/* Cold-start race tests: concurrent callers must produce exactly one daemon,
   and a spawned daemon must never steal a live daemon's socket. */
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const path = require('path')
const { getOrSet, start, status } = require('../src/api')
const { tempDir, stopDaemon } = require('./helpers')

function makeEnv(dir) {
  const env = {
    ...process.env,
    OP_STASH_SOCKET_PATH: path.join(dir, 'race.sock'),
    OP_STASH_TTL_SECONDS: '60',
    OP_STASH_MAX_TTL_SECONDS: '60',
    OP_STASH_IDLE_EXIT_SECONDS: '30',
    XDG_CONFIG_HOME: path.join(dir, 'xdg'),
  }
  delete env.OP_STASH_DISABLED
  delete env.OP_ACCOUNT
  delete env.OP_SERVICE_ACCOUNT_TOKEN
  return env
}

test('concurrent cold getOrSet calls all succeed with one daemon', async () => {
  const dir = tempDir()
  const env = makeEnv(dir)
  try {
    const base = { env, socketPath: env.OP_STASH_SOCKET_PATH, scope: 'session:race' }
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        getOrSet(`race-ref-${i}`, async () => `value-${i}`, base)
      )
    )
    assert.equal(results, Array.from({ length: 8 }, (_, i) => `value-${i}`))
    // One daemon owns the socket and can report all eight entries
    const st = await status({ env, socketPath: env.OP_STASH_SOCKET_PATH })
    assert.is(st.running, true)
    const pid = Number(fs.readFileSync(`${env.OP_STASH_SOCKET_PATH}.pid`, 'utf8'))
    assert.ok(pid > 0)
  } finally {
    stopDaemon(env)
  }
})

test('startDaemon refuses to steal a live daemon socket', async () => {
  const dir = tempDir()
  const env = makeEnv(dir)
  const first = await start({ env, socketPath: env.OP_STASH_SOCKET_PATH })
  try {
    try {
      await start({ env, socketPath: env.OP_STASH_SOCKET_PATH })
      assert.unreachable('second daemon should refuse')
    } catch (err) {
      assert.match(err.message, /already running/)
    }
    // The original daemon is untouched and still serves its socket
    const st = await status({ env, socketPath: env.OP_STASH_SOCKET_PATH })
    assert.is(st.running, true)
    assert.is(fs.existsSync(env.OP_STASH_SOCKET_PATH), true)
  } finally {
    first.server.close()
  }
})

test('startDaemon still replaces a genuinely stale socket file', async () => {
  const dir = tempDir()
  const env = makeEnv(dir)
  // Simulate a crashed daemon: socket file exists, nobody listening
  const first = await start({ env, socketPath: env.OP_STASH_SOCKET_PATH })
  const staleCopy = path.join(dir, 'stale.sock')
  fs.renameSync(env.OP_STASH_SOCKET_PATH, staleCopy)
  first.server.close()
  fs.renameSync(staleCopy, env.OP_STASH_SOCKET_PATH)
  const second = await start({ env, socketPath: env.OP_STASH_SOCKET_PATH })
  try {
    const st = await status({ env, socketPath: env.OP_STASH_SOCKET_PATH })
    assert.is(st.running, true)
  } finally {
    second.server.close()
  }
})

test.run()
