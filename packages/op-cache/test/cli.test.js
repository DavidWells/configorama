const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const path = require('path')
const { tempDir, fakeOp, cliEnv, runCli, stopDaemon } = require('./helpers')
const { main } = require('../src/cli')

test('help prints usage', () => {
  const r = runCli(['--help'], process.env)
  assert.is(r.status, 0)
  assert.match(r.stdout, /Usage:/)
})

test('read prints only secret to stdout and hits cache on second process', () => {
  const dir = tempDir()
  const fake = fakeOp(dir, { value: 's3cret' })
  const env = cliEnv(dir, fake)
  try {
    const first = runCli(['read', 'op://vault/item/field'], env)
    assert.is(first.status, 0, first.stderr)
    assert.is(first.stdout, 's3cret\n')
    assert.is(fake.calls(), 1)
    const second = runCli(['read', 'op://vault/item/field'], env)
    assert.is(second.status, 0, second.stderr)
    assert.is(second.stdout, 's3cret\n')
    assert.is(fake.calls(), 1)
  } finally {
    stopDaemon(env)
  }
})

test('status stats clear stop json lifecycle', () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = cliEnv(dir, fake)
  try {
    const stopped = runCli(['status', '--json'], env)
    assert.equal(JSON.parse(stopped.stdout).running, false)
    runCli(['read', 'op://vault/item/field'], env)
    const status = JSON.parse(runCli(['status', '--json'], env).stdout)
    assert.is(status.running, true)
    const stats = JSON.parse(runCli(['stats', '--json'], env).stdout)
    assert.ok(Object.keys(stats).includes('entries'))
    assert.is(String(runCli(['stats'], env).stdout).includes('op://'), false)
    const clear = runCli(['clear'], env)
    assert.match(clear.stdout, /removed:/)
    assert.is(runCli(['stop'], env).status, 0)
    assert.match(runCli(['clear'], env).stdout, /daemon not running/)
  } finally {
    stopDaemon(env)
  }
})

test('ttl clamp warning stays on stderr', () => {
  const dir = tempDir()
  const fake = fakeOp(dir, { value: 'secret' })
  const env = cliEnv(dir, fake)
  try {
    const r = runCli(['read', 'op://vault/item/field', '--ttl', '1h'], env)
    assert.is(r.status, 0, r.stderr)
    assert.is(r.stdout, 'secret\n')
    assert.match(r.stderr, /ttl clamped/)
  } finally {
    stopDaemon(env)
  }
})

test('OP_CACHE_DISABLED bypasses daemon', () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = { ...cliEnv(dir, fake), OP_CACHE_DISABLED: '1' }
  const r = runCli(['read', 'op://vault/item/field'], env)
  assert.is(r.status, 0, r.stderr)
  assert.is(fake.calls(), 1)
  assert.is(fs.existsSync(path.join(dir, 'cache.sock')), false)
})

test('doctor and config-path are machine readable', () => {
  const dir = tempDir()
  const fake = fakeOp(dir)
  const env = { ...cliEnv(dir, fake), OP_SERVICE_ACCOUNT_TOKEN: 'dont-print-me' }
  const doctor = runCli(['doctor', '--json'], env)
  const json = JSON.parse(doctor.stdout)
  assert.is(json.serviceAccountTokenSet, true)
  assert.is(doctor.stdout.includes('dont-print-me'), false)
  const configPath = runCli(['config-path'], env)
  assert.match(configPath.stdout, /config\.json\n$/)
})

test('bad command exits nonzero with usage on stderr', () => {
  const r = runCli(['wat'], process.env)
  assert.is(r.status, 2)
  assert.match(r.stderr, /unknown command/)
})

test('win32 passthrough reports unavailable without touching socket for diagnostics', async () => {
  const out = []
  const err = []
  await main(['status', '--json'], {
    platform: 'win32',
    stdout: { write: (chunk) => out.push(String(chunk)) },
    stderr: { write: (chunk) => err.push(String(chunk)) },
  })
  const json = JSON.parse(out.join(''))
  assert.is(json.available, false)
  assert.is(json.platform, 'win32')
})

test.run()
