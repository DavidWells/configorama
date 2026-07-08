/* Tests for the getOrSet advanced integration API.
   Uses in-process daemons on temp sockets; producers are plain functions. */
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const path = require('path')
const { getOrSet, start } = require('../src/api')
const { shortHash } = require('../src/key')
const { tempDir, stopDaemon } = require('./helpers')

function makeEnv(dir, overrides = {}) {
  const env = {
    ...process.env,
    OP_STASH_SOCKET_PATH: path.join(dir, 'cache.sock'),
    OP_STASH_TTL_SECONDS: '60',
    OP_STASH_MAX_TTL_SECONDS: '60',
    OP_STASH_IDLE_EXIT_SECONDS: '30',
    XDG_CONFIG_HOME: path.join(dir, 'xdg'),
    ...overrides,
  }
  delete env.OP_STASH_DISABLED
  delete env.OP_ACCOUNT
  delete env.OP_SERVICE_ACCOUNT_TOKEN
  return env
}

function fakeStderr() {
  const chunks = []
  return { chunks, write(chunk) { chunks.push(String(chunk)); return true }, text: () => chunks.join('') }
}

function producerOf(values) {
  let calls = 0
  const fn = async () => {
    calls += 1
    return Array.isArray(values) ? values[Math.min(calls - 1, values.length - 1)] : values
  }
  fn.calls = () => calls
  return fn
}

async function withDaemon(env, opts, fn) {
  const handle = await start({ env, socketPath: env.OP_STASH_SOCKET_PATH, ...opts })
  try {
    return await fn(handle)
  } finally {
    handle.server.close()
  }
}

test('miss runs producer once and stores; hit does not run producer', async () => {
  const dir = tempDir()
  const env = makeEnv(dir)
  await withDaemon(env, {}, async () => {
    const producer = producerOf('resolved-value')
    const opts = { env, socketPath: env.OP_STASH_SOCKET_PATH, scope: 'session:a' }
    assert.is(await getOrSet('configorama-op://v1/abc', producer, opts), 'resolved-value')
    assert.is(await getOrSet('configorama-op://v1/abc', producer, opts), 'resolved-value')
    assert.is(producer.calls(), 1)
  })
})

test('validateCached rejection recomputes and overwrites the entry', async () => {
  const dir = tempDir()
  const env = makeEnv(dir)
  await withDaemon(env, {}, async () => {
    const opts = { env, socketPath: env.OP_STASH_SOCKET_PATH, scope: 'session:v' }
    await getOrSet('ref-v', producerOf('old-value'), opts)
    const second = producerOf('new-value')
    const stderr = fakeStderr()
    const rejected = await getOrSet('ref-v', second, { ...opts, stderr, validateCached: () => false })
    assert.is(rejected, 'new-value')
    assert.is(second.calls(), 1)
    // Overwrite proven: a passing validator now sees the new value with no producer call
    const third = producerOf('unused')
    assert.is(await getOrSet('ref-v', third, { ...opts, validateCached: () => true }), 'new-value')
    assert.is(third.calls(), 0)
    assert.ok(stderr.text().includes('failed validation'))
  })
})

test('validateCached rejection warns at most once per stderr stream', async () => {
  const dir = tempDir()
  const env = makeEnv(dir)
  await withDaemon(env, {}, async () => {
    const stderr = fakeStderr()
    const opts = { env, socketPath: env.OP_STASH_SOCKET_PATH, scope: 'session:w', stderr, validateCached: () => false }
    await getOrSet('ref-w', producerOf('v1'), opts)
    await getOrSet('ref-w', producerOf('v2'), opts)
    await getOrSet('ref-w', producerOf('v3'), opts)
    const notes = stderr.chunks.filter((c) => c.includes('failed validation'))
    assert.is(notes.length, 1)
  })
})

test('validateCached throwing behaves as rejection', async () => {
  const dir = tempDir()
  const env = makeEnv(dir)
  await withDaemon(env, {}, async () => {
    const opts = { env, socketPath: env.OP_STASH_SOCKET_PATH, scope: 'session:t' }
    await getOrSet('ref-t', producerOf('first'), opts)
    const second = producerOf('second')
    const value = await getOrSet('ref-t', second, { ...opts, validateCached: () => { throw new Error('boom') } })
    assert.is(value, 'second')
    assert.is(second.calls(), 1)
  })
})

test('producer rejection is not cached and surfaces the producer error', async () => {
  const dir = tempDir()
  const env = makeEnv(dir)
  await withDaemon(env, {}, async () => {
    const opts = { env, socketPath: env.OP_STASH_SOCKET_PATH, scope: 'session:e' }
    let failCalls = 0
    try {
      await getOrSet('ref-e', async () => { failCalls += 1; throw new Error('producer failed sanitized') }, opts)
      assert.unreachable('should throw')
    } catch (err) {
      assert.is(err.message, 'producer failed sanitized')
    }
    assert.is(failCalls, 1)
    const recovery = producerOf('recovered')
    assert.is(await getOrSet('ref-e', recovery, opts), 'recovered')
    assert.is(recovery.calls(), 1)
  })
})

test('non-string producer result throws and stores nothing', async () => {
  const dir = tempDir()
  const env = makeEnv(dir)
  await withDaemon(env, {}, async () => {
    const opts = { env, socketPath: env.OP_STASH_SOCKET_PATH, scope: 'session:n' }
    try {
      await getOrSet('ref-n', async () => 42, opts)
      assert.unreachable('should throw')
    } catch (err) {
      assert.match(err.message, /must return a string/)
    }
    const recovery = producerOf('string-now')
    assert.is(await getOrSet('ref-n', recovery, opts), 'string-now')
    assert.is(recovery.calls(), 1)
  })
})

test('daemon failure fails closed by default without running the producer', async () => {
  const dir = tempDir()
  const badSocket = path.join(dir, 'not-a-socket')
  fs.writeFileSync(badSocket, 'x')
  const env = makeEnv(dir, { OP_STASH_SOCKET_PATH: badSocket })
  const producer = producerOf('never')
  try {
    await getOrSet('ref-f', producer, { env, socketPath: badSocket, fallbackToOp: false })
    assert.unreachable('should throw')
  } catch (err) {
    assert.match(err.message, /socket/)
  }
  assert.is(producer.calls(), 0)
})

test('daemon failure with fallbackToOp runs producer and warns', async () => {
  const dir = tempDir()
  const badSocket = path.join(dir, 'not-a-socket')
  fs.writeFileSync(badSocket, 'x')
  const env = makeEnv(dir, { OP_STASH_SOCKET_PATH: badSocket })
  const stderr = fakeStderr()
  const producer = producerOf('direct-value')
  const value = await getOrSet('ref-f2', producer, { env, socketPath: badSocket, fallbackToOp: true, stderr })
  assert.is(value, 'direct-value')
  assert.is(producer.calls(), 1)
  assert.ok(stderr.text().includes('cache bypassed'))
})

test('ttl expiration causes producer to run again', async () => {
  const dir = tempDir()
  const env = makeEnv(dir, { OP_STASH_TTL_SECONDS: '1', OP_STASH_MAX_TTL_SECONDS: '1' })
  await withDaemon(env, { ttlSeconds: 1, maxTtlSeconds: 1 }, async () => {
    const producer = producerOf('short-lived')
    const opts = { env, socketPath: env.OP_STASH_SOCKET_PATH, scope: 'session:ttl' }
    await getOrSet('ref-ttl', producer, opts)
    await new Promise((resolve) => setTimeout(resolve, 1100))
    await getOrSet('ref-ttl', producer, opts)
    assert.is(producer.calls(), 2)
  })
})

test('scopes are isolated', async () => {
  const dir = tempDir()
  const env = makeEnv(dir)
  await withDaemon(env, {}, async () => {
    const producer = producerOf('scoped')
    const base = { env, socketPath: env.OP_STASH_SOCKET_PATH }
    await getOrSet('ref-s', producer, { ...base, scope: 'session:one' })
    await getOrSet('ref-s', producer, { ...base, scope: 'session:two' })
    assert.is(producer.calls(), 2)
  })
})

test('account, configDir, and opPath partition the cache key', async () => {
  const dir = tempDir()
  const env = makeEnv(dir)
  await withDaemon(env, {}, async () => {
    const producer = producerOf('partitioned')
    const base = { env, socketPath: env.OP_STASH_SOCKET_PATH, scope: 'session:p' }
    await getOrSet('ref-p', producer, base)
    await getOrSet('ref-p', producer, { ...base, account: 'other.1password.com' })
    await getOrSet('ref-p', producer, { ...base, configDir: path.join(dir, 'other-config') })
    await getOrSet('ref-p', producer, { ...base, opPath: path.join(dir, 'other-op') })
    assert.is(producer.calls(), 4)
    // Same dimensions again: all hits
    await getOrSet('ref-p', producer, base)
    assert.is(producer.calls(), 4)
  })
})

test('OP_STASH_DISABLED=1 runs producer directly and never touches the daemon', async () => {
  const dir = tempDir()
  const env = makeEnv(dir, { OP_STASH_DISABLED: '1' })
  env.OP_STASH_DISABLED = '1'
  const producer = producerOf('disabled-value')
  const value = await getOrSet('ref-d', producer, { env, socketPath: env.OP_STASH_SOCKET_PATH })
  assert.is(value, 'disabled-value')
  assert.is(producer.calls(), 1)
  assert.is(fs.existsSync(env.OP_STASH_SOCKET_PATH), false)
})

test('win32 runs producer directly and never touches a socket', async () => {
  const dir = tempDir()
  const env = makeEnv(dir)
  const producer = producerOf('win32-value')
  const value = await getOrSet('ref-w32', producer, { env, socketPath: env.OP_STASH_SOCKET_PATH, platform: 'win32' })
  assert.is(value, 'win32-value')
  assert.is(producer.calls(), 1)
  assert.is(fs.existsSync(env.OP_STASH_SOCKET_PATH), false)
})

test('ttl clamp warns at most once per stderr stream', async () => {
  const dir = tempDir()
  const env = makeEnv(dir, { OP_STASH_TTL_SECONDS: '60', OP_STASH_MAX_TTL_SECONDS: '60' })
  await withDaemon(env, { maxTtlSeconds: 1 }, async () => {
    const stderr = fakeStderr()
    const opts = { env, socketPath: env.OP_STASH_SOCKET_PATH, scope: 'session:c', stderr }
    await getOrSet('ref-c1', producerOf('a'), opts)
    await getOrSet('ref-c2', producerOf('b'), opts)
    const warnings = stderr.chunks.filter((c) => c.includes('ttl clamped'))
    assert.is(warnings.length, 1)
  })
})

test('set carries refHash and accountHash diagnostics', async () => {
  const dir = tempDir()
  const env = makeEnv(dir)
  await withDaemon(env, {}, async (handle) => {
    const opts = { env, socketPath: env.OP_STASH_SOCKET_PATH, scope: 'session:h', account: 'my.1password.com' }
    await getOrSet('configorama-op://v1/hashme', producerOf('x'), opts)
    const entries = [...handle.cache.map.values()]
    assert.is(entries.length, 1)
    assert.is(entries[0].refHash, shortHash('configorama-op://v1/hashme'))
    assert.is(entries[0].accountHash, shortHash('my.1password.com'))
  })
})

test('non-op:// refs are accepted; empty refs are rejected', async () => {
  const dir = tempDir()
  const env = makeEnv(dir)
  await withDaemon(env, {}, async () => {
    const producer = producerOf('any-ref')
    const opts = { env, socketPath: env.OP_STASH_SOCKET_PATH, scope: 'session:r' }
    assert.is(await getOrSet('configorama-op://v1/deadbeef', producer, opts), 'any-ref')
    try {
      await getOrSet('', producer, opts)
      assert.unreachable('should throw')
    } catch (err) {
      assert.match(err.message, /non-empty/)
    }
  })
})

test('auto-starts the daemon when none is running', async () => {
  const dir = tempDir()
  const env = makeEnv(dir)
  try {
    const producer = producerOf('spawned')
    const opts = { env, socketPath: env.OP_STASH_SOCKET_PATH, scope: 'session:spawn' }
    assert.is(await getOrSet('ref-spawn', producer, opts), 'spawned')
    assert.is(await getOrSet('ref-spawn', producer, opts), 'spawned')
    assert.is(producer.calls(), 1)
  } finally {
    stopDaemon(env)
  }
})

test.run()
