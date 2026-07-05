// Dotenv writer - safe persistence of env answers with managed-block merge support
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { writeDotenv, MANAGED_BLOCK_START, MANAGED_BLOCK_END } = require('../../src/utils/setup/writeDotenv')

let counter = 0
function tmpTarget() {
  counter += 1
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'write-dotenv-')), `out-${counter}.env`)
}

test('writes plain values raw and returns written keys', () => {
  const target = tmpTarget()
  const result = writeDotenv(target, { API_KEY: 'abc123', REGION: 'us-east-1' })

  const content = fs.readFileSync(target, 'utf8')
  assert.ok(content.includes('API_KEY=abc123'))
  assert.ok(content.includes('REGION=us-east-1'))
  assert.equal(result.keys, ['API_KEY', 'REGION'])
  assert.is(result.path, target)
})

test('quotes unsafe values so they round-trip', () => {
  const target = tmpTarget()
  writeDotenv(target, {
    SPACED: 'hello world',
    DOLLARED: 'pa$$word',
    QUOTED: `it's here`,
    MULTILINE: 'line one\nline two',
  })
  const content = fs.readFileSync(target, 'utf8')

  assert.ok(content.includes(`SPACED='hello world'`), 'spaces single-quoted')
  assert.ok(content.includes(`DOLLARED='pa$$word'`), 'dollar signs single-quoted, no expansion')
  assert.ok(content.includes(`QUOTED="it's here"`), 'single quotes fall back to double quotes')
  assert.ok(content.includes(`MULTILINE="line one\\nline two"`), 'newlines escaped in double quotes')
})

test('refuses invalid key names before touching the file', () => {
  const target = tmpTarget()
  assert.throws(
    () => writeDotenv(target, { 'BAD-KEY': 'x', GOOD: 'y' }),
    /BAD-KEY/
  )
  assert.not.ok(fs.existsSync(target), 'no file created on validation failure')
})

test('creates files with 0600 permissions', () => {
  const target = tmpTarget()
  writeDotenv(target, { KEY: 'value' })
  const mode = fs.statSync(target).mode & 0o777
  assert.is(mode, 0o600)
})

test('refuses existing file without merge or force', () => {
  const target = tmpTarget()
  fs.writeFileSync(target, 'EXISTING=1\n')
  assert.throws(() => writeDotenv(target, { KEY: 'value' }), /exists/)
  assert.is(fs.readFileSync(target, 'utf8'), 'EXISTING=1\n', 'file untouched')
})

test('force overwrites the whole file', () => {
  const target = tmpTarget()
  fs.writeFileSync(target, 'EXISTING=1\n')
  writeDotenv(target, { KEY: 'value' }, { force: true })
  const content = fs.readFileSync(target, 'utf8')
  assert.not.ok(content.includes('EXISTING'), 'old content gone')
  assert.ok(content.includes('KEY=value'))
})

test('merge appends a managed block to an existing unmanaged file', () => {
  const target = tmpTarget()
  fs.writeFileSync(target, 'EXISTING=1\n')
  writeDotenv(target, { KEY: 'value' }, { merge: true })
  const content = fs.readFileSync(target, 'utf8')

  assert.ok(content.startsWith('EXISTING=1\n'), 'existing content preserved')
  assert.ok(content.includes(MANAGED_BLOCK_START))
  assert.ok(content.includes('KEY=value'))
  assert.ok(content.includes(MANAGED_BLOCK_END))
})

test('merge replaces only the managed block', () => {
  const target = tmpTarget()
  const before = [
    'TOP=keep',
    MANAGED_BLOCK_START,
    'OLD=stale',
    MANAGED_BLOCK_END,
    'BOTTOM=keep',
    '',
  ].join('\n')
  fs.writeFileSync(target, before)

  writeDotenv(target, { NEW: 'fresh' }, { merge: true })
  const content = fs.readFileSync(target, 'utf8')

  assert.ok(content.includes('TOP=keep'), 'content above block preserved')
  assert.ok(content.includes('BOTTOM=keep'), 'content below block preserved')
  assert.ok(content.includes('NEW=fresh'))
  assert.not.ok(content.includes('OLD=stale'), 'old block content replaced')
  assert.is(content.split(MANAGED_BLOCK_START).length, 2, 'exactly one block')
})

test('merge creates the file with a managed block when missing', () => {
  const target = tmpTarget()
  writeDotenv(target, { KEY: 'value' }, { merge: true })
  const content = fs.readFileSync(target, 'utf8')
  assert.ok(content.includes(MANAGED_BLOCK_START))
  assert.ok(content.includes('KEY=value'))
})

test('merge fails without editing on multiple managed blocks', () => {
  const target = tmpTarget()
  const before = [
    MANAGED_BLOCK_START, 'A=1', MANAGED_BLOCK_END,
    MANAGED_BLOCK_START, 'B=2', MANAGED_BLOCK_END, '',
  ].join('\n')
  fs.writeFileSync(target, before)

  assert.throws(() => writeDotenv(target, { KEY: 'v' }, { merge: true }), /managed block/)
  assert.is(fs.readFileSync(target, 'utf8'), before, 'file untouched')
})

test('merge fails without editing on incomplete marker pair', () => {
  const target = tmpTarget()
  const before = [MANAGED_BLOCK_START, 'A=1', ''].join('\n')
  fs.writeFileSync(target, before)

  assert.throws(() => writeDotenv(target, { KEY: 'v' }, { merge: true }), /managed block/)
  assert.is(fs.readFileSync(target, 'utf8'), before, 'file untouched')
})

test.run()
