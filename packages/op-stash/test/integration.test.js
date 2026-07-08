const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const path = require('path')
const { read, stats, clear, status } = require('../src/api')
const { tempDir, fakeOp, cliEnv, runCli, stopDaemon } = require('./helpers')

test('programmatic API caches across calls and supports scoped stats/clear', async () => {
  const dir = tempDir()
  const fake = fakeOp(dir, { value: 'api-secret' })
  const env = cliEnv(dir, fake)
  try {
    const opts = { env, opPath: fake.bin, socketPath: env.OP_STASH_SOCKET_PATH, scope: 'session:a', fallbackToOp: false }
    assert.is(await read('op://vault/item/field', opts), 'api-secret')
    assert.is(await read('op://vault/item/field', opts), 'api-secret')
    assert.is(fake.calls(), 1)
    assert.is((await stats({ env, socketPath: env.OP_STASH_SOCKET_PATH, scope: 'session:a' })).entries, 1)
    assert.is((await clear({ env, socketPath: env.OP_STASH_SOCKET_PATH, scope: 'session:a' })).removed, 1)
  } finally {
    stopDaemon(env)
  }
})

test('fallbackToOp controls daemon failure behavior', async () => {
  const dir = tempDir()
  const fake = fakeOp(dir, { value: 'fallback-secret' })
  const socketPath = path.join(dir, 'not-a-socket')
  fs.writeFileSync(socketPath, 'x')
  const env = { ...cliEnv(dir, fake), OP_STASH_SOCKET_PATH: socketPath }
  try {
    await read('op://vault/item/field', { env, opPath: fake.bin, socketPath, fallbackToOp: false })
    assert.unreachable('should throw')
  } catch (err) {
    assert.match(err.message, /non-socket|socket/)
  }
  const value = await read('op://vault/item/field', { env, opPath: fake.bin, socketPath, fallbackToOp: true })
  assert.is(value, 'fallback-secret')
})

test('ttl sweep expires entries without another read', async () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = { ...cliEnv(dir, fake), OP_STASH_TTL_SECONDS: '1', OP_STASH_MAX_TTL_SECONDS: '1', OP_STASH_IDLE_EXIT_SECONDS: '5' }
  try {
    runCli(['read', 'op://vault/item/field'], env)
    assert.is(JSON.parse(runCli(['stats', '--json'], env).stdout).entries, 1)
    await new Promise((resolve) => setTimeout(resolve, 1600))
    assert.is(JSON.parse(runCli(['stats', '--json'], env).stdout).entries, 0)
  } finally {
    stopDaemon(env)
  }
})

test('idle daemon exits after cache empty', async () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = { ...cliEnv(dir, fake), OP_STASH_TTL_SECONDS: '1', OP_STASH_MAX_TTL_SECONDS: '1', OP_STASH_IDLE_EXIT_SECONDS: '1' }
  runCli(['read', 'op://vault/item/field'], env)
  await new Promise((resolve) => setTimeout(resolve, 2600))
  assert.is((await status({ env, socketPath: env.OP_STASH_SOCKET_PATH })).running, false)
})

test.run()
