/* Tests for the op CLI wrapper
   Uses injected execFile; never calls the real 1Password CLI */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { readSecretRef, getItem } = require('./op-cli')

/**
 * Build a fake execFile capturing calls and returning canned results
 * @param {object} behavior - { stdout, error, stderr }
 * @returns {{execFile: Function, calls: Array}} Fake and its call log
 */
function fakeExecFile(behavior = {}) {
  const calls = []
  function execFile(cmd, args, opts, cb) {
    calls.push({ cmd, args })
    if (behavior.error) {
      const err = Object.assign(new Error(behavior.error.message || 'fail'), behavior.error)
      err.stderr = behavior.stderr || ''
      return cb(err, '', behavior.stderr || '')
    }
    cb(null, behavior.stdout || '', '')
  }
  return { execFile, calls }
}

test('readSecretRef calls op read --no-newline <ref>', async () => {
  const fake = fakeExecFile({ stdout: 'secret-value' })
  const value = await readSecretRef('op://vault/item/field', { execFile: fake.execFile })
  assert.is(value, 'secret-value')
  assert.is(fake.calls[0].cmd, 'op')
  assert.equal(fake.calls[0].args, ['read', '--no-newline', 'op://vault/item/field'])
})

test('getItem calls op item get with json + reveal and parses stdout', async () => {
  const fake = fakeExecFile({ stdout: '{"id":"item-1","fields":[]}' })
  const item = await getItem('item-1', { execFile: fake.execFile })
  assert.equal(item, { id: 'item-1', fields: [] })
  assert.equal(fake.calls[0].args, ['item', 'get', 'item-1', '--format', 'json', '--reveal'])
})

test('vault, account, and configDir become CLI flags', async () => {
  const fake = fakeExecFile({ stdout: '{}' })
  await getItem('item-1', { execFile: fake.execFile, vault: 'vault-9', account: 'my', configDir: '/op/config' })
  assert.equal(fake.calls[0].args, [
    'item', 'get', 'item-1', '--format', 'json', '--reveal',
    '--vault', 'vault-9', '--account', 'my', '--config', '/op/config',
  ])
})

test('readSecretRef passes account and configDir but never vault', async () => {
  const fake = fakeExecFile({ stdout: 'v' })
  await readSecretRef('op://a/b/c', { execFile: fake.execFile, account: 'my', configDir: '/op/config', vault: 'ignored' })
  assert.equal(fake.calls[0].args, ['read', '--no-newline', 'op://a/b/c', '--account', 'my', '--config', '/op/config'])
})

test('ENOENT becomes missing-CLI error', async () => {
  const fake = fakeExecFile({ error: { code: 'ENOENT' } })
  try {
    await readSecretRef('op://a/b/c', { execFile: fake.execFile })
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /1Password CLI "op" was not found on PATH/)
  }
})

test('signin-ish failure becomes sanitized auth error', async () => {
  const fake = fakeExecFile({ error: { code: 1 }, stderr: '[ERROR] account is not signed in, run `op signin`, secret-hint-xyz' })
  try {
    await getItem('item-1', { execFile: fake.execFile })
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /Run op signin, unlock 1Password app integration, or configure OP_SERVICE_ACCOUNT_TOKEN/)
    assert.is(err.message.includes('secret-hint-xyz'), false)
  }
})

test('not-found failure becomes sanitized not-found error', async () => {
  const fake = fakeExecFile({ error: { code: 1 }, stderr: '[ERROR] "item-1" isn\'t an item in the "prod" vault, uuid-abc' })
  try {
    await getItem('item-1', { execFile: fake.execFile })
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /could not be found/)
    assert.is(err.message.includes('uuid-abc'), false)
  }
})

test('generic failure is sanitized without stderr', async () => {
  const fake = fakeExecFile({ error: { code: 1 }, stderr: 'weird internal failure with secret-material' })
  try {
    await getItem('item-1', { execFile: fake.execFile })
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.is(err.message.includes('secret-material'), false)
  }
})

test('malformed JSON from item get becomes sanitized parse error', async () => {
  const fake = fakeExecFile({ stdout: 'not-json secret-body' })
  try {
    await getItem('item-1', { execFile: fake.execFile })
    assert.unreachable('should have thrown')
  } catch (err) {
    assert.match(err.message, /Could not parse 1Password CLI output as JSON/)
    assert.is(err.message.includes('secret-body'), false)
  }
})

test.run()
