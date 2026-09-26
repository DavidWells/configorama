/* The sync API resolves in a long-lived worker process; each call must see the caller's */
/* current process.env and working directory, not the ones from when the worker started. */
/* eslint-disable no-template-curly-in-string */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-sync-env-'))
const envFile = path.join(dir, 'env.yml')
fs.writeFileSync(envFile, 'v: ${env:SYNC_ENV_LATE, "unset"}\n')

test.after(() => {
  delete process.env.SYNC_ENV_LATE
  fs.rmSync(dir, { recursive: true, force: true })
})

test('env set after the first sync call is seen by the next one', () => {
  delete process.env.SYNC_ENV_LATE
  assert.is(configorama.sync(envFile, { options: {} }).v, 'unset')
  process.env.SYNC_ENV_LATE = 'late'
  assert.is(configorama.sync(envFile, { options: {} }).v, 'late')
})

test('env removed after a sync call is gone for the next one', () => {
  process.env.SYNC_ENV_LATE = 'present'
  assert.is(configorama.sync(envFile, { options: {} }).v, 'present')
  delete process.env.SYNC_ENV_LATE
  assert.is(configorama.sync(envFile, { options: {} }).v, 'unset')
})

test('file refs resolve from the caller cwd at call time', () => {
  const sub = path.join(dir, 'sub')
  fs.mkdirSync(sub, { recursive: true })
  fs.writeFileSync(path.join(sub, 'data.json'), '{ "k": "from-sub" }')
  const original = process.cwd()
  try {
    configorama.sync(envFile, { options: {} })
    process.chdir(sub)
    const config = configorama.sync({ v: '${file(./data.json):k}' }, { options: {} })
    assert.is(config.v, 'from-sub')
  } finally {
    process.chdir(original)
  }
})

test.run()
