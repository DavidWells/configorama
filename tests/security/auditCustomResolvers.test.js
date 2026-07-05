/* eslint-disable no-template-curly-in-string */
/* Tests audit findings for custom resolvers
   Sensitive resolvers get a specific high finding; plain ones stay generic */
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const sensitiveSource = {
  type: 'vaulty',
  source: 'remote',
  sensitive: true,
  risk: 'remote_secret_read',
  description: 'Resolves values from FakeVault',
  match: /^vaulty:/,
  resolver: () => Promise.resolve('secret'),
}

const plainSource = {
  type: 'custom',
  match: /^custom:/,
  resolver: () => Promise.resolve('value'),
}

test('sensitive resolver yields a specific high-severity finding', async () => {
  const report = await configorama.audit(
    { value: '${vaulty:thing}' },
    { variableSources: [sensitiveSource] }
  )
  const finding = report.findings.find((entry) => entry.id === 'customResolver:vaulty')
  assert.ok(finding)
  assert.is(finding.severity, 'high')
  assert.is(finding.risk, 'remote_secret_read')
  assert.is(finding.sensitive, true)
  assert.is(finding.variableType, 'vaulty')
  assert.match(finding.message, /reads secret values/)
  assert.match(finding.message, /FakeVault/)
})

test('plain custom resolver keeps the generic custom_extension finding', async () => {
  const report = await configorama.audit(
    { value: '${custom:thing}' },
    { variableSources: [plainSource] }
  )
  const finding = report.findings.find((entry) => entry.id === 'customResolver:custom')
  assert.ok(finding)
  assert.is(finding.risk, 'custom_extension')
  assert.match(finding.message, /can execute user-provided code/)
  assert.is(finding.sensitive, undefined)
})

test('one finding per resolver, no double-reporting', async () => {
  const report = await configorama.audit(
    { value: '${vaulty:thing}' },
    { variableSources: [sensitiveSource] }
  )
  const findings = report.findings.filter((entry) => entry.id === 'customResolver:vaulty')
  assert.is(findings.length, 1)
})

test('summary counts include the sensitive high finding', async () => {
  const report = await configorama.audit(
    { value: '${vaulty:thing}' },
    { variableSources: [sensitiveSource] }
  )
  assert.ok(report.summary.high >= 1)
  assert.is(report.summary.total, report.findings.length)
})

test.run()
