/* eslint-disable no-template-curly-in-string */
/* Audit and safe-mode integration tests for the 1Password plugin
   Proves risk reporting without fetching and blocking during resolution */
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')
const createOnePasswordResolver = require('../../plugins/onepassword')

/**
 * execFile stub that records calls; audit paths must never reach it
 * @returns {{execFile: Function, calls: Array}} Stub and call log
 */
function trackingExecFile() {
  const calls = []
  function execFile(cmd, args, opts, cb) {
    calls.push({ cmd, args })
    cb(null, '', '')
  }
  return { execFile, calls }
}

test('audit reports op as high-risk remote_secret_read without fetching', async () => {
  const fake = trackingExecFile()
  const source = createOnePasswordResolver({
    refs: { npm: 'op://prod/npm/notesPlain' },
    execFile: fake.execFile,
  })
  const report = await configorama.audit(
    { token: '${op:npm.NPM_TOKEN}' },
    { variableSources: [source] }
  )

  const finding = report.findings.find((entry) => entry.id === 'customResolver:op')
  assert.ok(finding)
  assert.is(finding.severity, 'high')
  assert.is(finding.risk, 'remote_secret_read')
  assert.is(finding.sensitive, true)
  assert.match(finding.message, /1Password/)
  assert.is(fake.calls.length, 0)
})

test('no generic custom_extension double-report for op', async () => {
  const source = createOnePasswordResolver({ refs: {} })
  const report = await configorama.audit({ plain: 'value' }, { variableSources: [source] })
  const findings = report.findings.filter((entry) => entry.id === 'customResolver:op')
  assert.is(findings.length, 1)
  assert.is(findings[0].risk, 'remote_secret_read')
})

test('safe mode blocks op resolution by default', async () => {
  const fake = trackingExecFile()
  const source = createOnePasswordResolver({
    refs: { npm: 'op://prod/npm/notesPlain' },
    execFile: fake.execFile,
  })
  let caught
  try {
    await configorama({ token: '${op:npm.NPM_TOKEN}' }, { safeMode: true, variableSources: [source] })
  } catch (err) {
    caught = err
  }
  assert.ok(caught)
  assert.is(caught.code, 'blocked_by_safe_mode')
  assert.is(fake.calls.length, 0)
})

test('introspect registers the plugin without resolving secrets', async () => {
  const fake = trackingExecFile()
  const source = createOnePasswordResolver({
    refs: { npm: 'op://prod/npm/notesPlain' },
    execFile: fake.execFile,
  })
  const introspection = await configorama.introspect(
    { token: '${op:npm.NPM_TOKEN}' },
    { variableSources: [source] }
  )
  assert.ok(introspection)
  assert.is(fake.calls.length, 0)
})

test.run()
