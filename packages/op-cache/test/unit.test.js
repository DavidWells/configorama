const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { parseDurationSeconds } = require('../src/duration')
const { resolveScope } = require('../src/scope')
const { cacheKey, effectiveAccount } = require('../src/key')
const { SecretCache } = require('../src/cache')
const { encode, decode, validateRequest } = require('../src/protocol')
const { resolveConfig, resetConfigCache } = require('../src/config')
const { translateError } = require('../src/op')

test('duration parser accepts documented formats', () => {
  assert.is(parseDurationSeconds('30s'), 30)
  assert.is(parseDurationSeconds('5m'), 300)
  assert.is(parseDurationSeconds('1h'), 3600)
  assert.is(parseDurationSeconds('300'), 300)
  assert.is(parseDurationSeconds(42), 42)
})

test('duration parser rejects invalid values with accepted formats', () => {
  for (const value of ['0', '-1', '1.5', '1d', 'nope']) {
    try {
      parseDurationSeconds(value)
      assert.unreachable('should reject')
    } catch (err) {
      assert.match(err.message, /Accepted formats/)
    }
  }
})

test('scope resolver supports user, session, pid, ppid, and custom', () => {
  assert.equal(resolveScope('user'), { scope: 'user', ownerPid: undefined, kind: 'user' })
  assert.equal(resolveScope('session:abc'), { scope: 'session:abc', ownerPid: undefined, kind: 'session' })
  assert.equal(resolveScope('pid', { pid: 123 }), { scope: 'pid:123', ownerPid: 123, kind: 'pid' })
  assert.equal(resolveScope('ppid', { ppid: 99 }), { scope: 'ppid:99', ownerPid: 99, kind: 'ppid' })
  assert.equal(resolveScope('repo-x'), { scope: 'repo-x', ownerPid: undefined, kind: 'custom' })
})

test('session scope requires explicit session identity', () => {
  try {
    resolveScope('session', { env: {} })
    assert.unreachable('should reject')
  } catch (err) {
    assert.match(err.message, /OP_CACHE_SESSION/)
  }
  assert.is(resolveScope('session', { env: { OP_CACHE_SCOPE: 'general', OP_CACHE_SESSION: 'specific' } }).scope, 'session:specific')
})

test('cache key changes on each dimension and account precedence matches op-cache rust behavior', () => {
  const base = { scope: 'user', account: '', configDir: '', opPath: 'op', reference: 'op://vault/item/field' }
  const key = cacheKey(base)
  assert.is(cacheKey(base), key)
  assert.not.ok(cacheKey({ ...base, scope: 'x' }) === key)
  assert.not.ok(cacheKey({ ...base, account: 'a' }) === key)
  assert.not.ok(cacheKey({ ...base, configDir: '/tmp/op' }) === key)
  assert.not.ok(cacheKey({ ...base, opPath: '/bin/echo' }) === key)
  assert.not.ok(cacheKey({ ...base, reference: 'op://vault/item/other' }) === key)
  assert.is(effectiveAccount('explicit', { OP_ACCOUNT: 'env' }), 'explicit')
  assert.is(effectiveAccount(undefined, { OP_ACCOUNT: 'env' }), 'env')
  assert.is(effectiveAccount(undefined, { OP_ACCOUNT: '' }), '')
})

test('SecretCache expires, does not extend on hit, evicts LRU, and clears by scope', () => {
  let now = 1000
  const cache = new SecretCache({ maxEntries: 2, now: () => now })
  cache.set('a', 'A', { ttlSeconds: 1, scope: 'one' })
  assert.is(cache.get('a'), 'A')
  now = 2500
  assert.is(cache.get('a'), undefined)

  now = 1000
  cache.set('a', 'A', { ttlSeconds: 1, scope: 'one' })
  now = 1500
  assert.is(cache.get('a'), 'A')
  now = 2100
  assert.is(cache.get('a'), undefined)

  now = 1000
  cache.set('a', 'A', { ttlSeconds: 10, scope: 'one' })
  cache.set('b', 'B', { ttlSeconds: 10, scope: 'two' })
  assert.is(cache.get('a'), 'A')
  cache.set('c', 'C', { ttlSeconds: 10, scope: 'two' })
  assert.is(cache.get('b'), undefined)
  assert.is(cache.countByScope('two'), 1)
  assert.is(cache.clearScope('two'), 1)
  assert.is(cache.countByScope('one'), 1)
  assert.is(cache.isEmpty(), false)
  assert.is(cache.clear(), 1)
  assert.is(cache.isEmpty(), true)
})

test('protocol round-trips and validates shapes', () => {
  const req = { type: 'set', key: 'k', value: 'multi\nline', scope: 'user', ttlSeconds: 30 }
  assert.equal(validateRequest(decode(encode(req))), req)
  try {
    validateRequest({ type: 'bogus' })
    assert.unreachable('should reject')
  } catch (err) {
    assert.match(err.message, /Unknown/)
  }
})

test('config precedence is flags, env, file, defaults', () => {
  resetConfigCache()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-cache-config-'))
  const file = path.join(dir, 'config.json')
  fs.writeFileSync(file, JSON.stringify({ ttl_seconds: 10, max_entries: 10, op_path: 'file-op' }))
  const env = { OP_CACHE_TTL_SECONDS: '20', OP_CACHE_OP_PATH: 'env-op', TMPDIR: dir }
  const result = resolveConfig({ configPath: file, ttlSeconds: '30s' }, { env, useCache: false })
  assert.is(result.config.ttl_seconds, 30)
  assert.is(result.config.op_path, 'env-op')
  assert.is(result.config.max_entries, 10)
  assert.is(result.exists, true)
})

test('config handles absent file and invalid JSON', () => {
  resetConfigCache()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'op-cache-config-'))
  const missing = path.join(dir, 'missing.json')
  assert.ok(resolveConfig({ configPath: missing }, { env: { TMPDIR: dir }, useCache: false }).config.socket_path.includes('op-cache-'))
  const bad = path.join(dir, 'bad.json')
  fs.writeFileSync(bad, '{')
  try {
    resolveConfig({ configPath: bad }, { env: { TMPDIR: dir }, useCache: false })
    assert.unreachable('should reject')
  } catch (err) {
    assert.match(err.message, /Invalid op-cache config/)
    assert.match(err.message, /bad\.json/)
  }
})

test('op stderr translation reports missing fields as not found', () => {
  const err = translateError(
    "[ERROR] could not read secret 'op://vault/item/password': item 'vault/item' does not have a field 'password'",
    'op://vault/item/password'
  )
  assert.match(err.message, /field could not be found/)
  assert.match(err.message, /op:\/\/vault\/item\/password/)
})

test('daemon rejects over-long socket paths with a clear error', async () => {
  const { startDaemon } = require('../src/daemon')
  const longPath = '/tmp/' + 'x'.repeat(120) + '.sock'
  try {
    await startDaemon({ socket_path: longPath, max_entries: 10, idle_exit_seconds: 30 })
    assert.unreachable('should throw')
  } catch (err) {
    assert.match(err.message, /exceeds.*bytes.*OP_CACHE_SOCKET_PATH/s)
  }
})

test.run()
