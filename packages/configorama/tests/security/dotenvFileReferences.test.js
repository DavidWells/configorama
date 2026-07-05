/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const configorama = require('../../src')

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-dotenv-'))
  fs.writeFileSync(path.join(dir, '.env'), 'API_KEY=secret-fixture-api-key\nTOKEN=secret-fixture-token\n')
  fs.writeFileSync(path.join(dir, '.env.production'), 'API_KEY=production-secret-fixture\n')
  return dir
}

test('metadata marks dotenv file references as sensitive by read scope', async () => {
  const dir = makeFixture()
  const result = await configorama({
    fullEnv: '${file(.env)}',
    apiKey: '${file(.env).API_KEY}',
    token: '${file(.env):TOKEN}',
    productionKey: '${file(.env.production).API_KEY}',
  }, {
    configDir: dir,
    returnMetadata: true,
  })

  const variables = result.metadata.uniqueVariables
  assert.is(variables['file(./.env)'].sensitive, true)
  assert.is(variables['file(./.env)'].sensitivityReason, 'dotenv_file')
  assert.is(variables['file(./.env)'].dotenvReadScope, 'full_file')
  assert.is(variables['file(./.env).API_KEY'].sensitive, true)
  assert.is(variables['file(./.env).API_KEY'].dotenvReadScope, 'key')
  assert.is(variables['file(./.env):TOKEN'].sensitive, true)
  assert.is(variables['file(./.env):TOKEN'].dotenvReadScope, 'key')
  assert.is(variables['file(./.env.production).API_KEY'].sensitive, true)
  assert.is(variables['file(./.env.production).API_KEY'].dotenvReadScope, 'key')
})

test('audit reports dotenv file references without leaking resolved values', async () => {
  const dir = makeFixture()
  const report = await configorama.audit({
    fullEnv: '${file(.env)}',
    apiKey: '${file(.env).API_KEY}',
    token: '${file(.env):TOKEN}',
  }, {
    configDir: dir,
    safeMode: true,
  })

  const fullRead = report.findings.find(finding => finding.variable === 'file(./.env)')
  const dotKey = report.findings.find(finding => finding.variable === 'file(./.env).API_KEY')
  const colonKey = report.findings.find(finding => finding.variable === 'file(./.env):TOKEN')

  assert.ok(fullRead)
  assert.is(fullRead.severity, 'medium')
  assert.is(fullRead.sensitive, true)
  assert.is(fullRead.dotenvReadScope, 'full_file')
  assert.ok(dotKey)
  assert.is(dotKey.severity, 'low')
  assert.is(dotKey.sensitive, true)
  assert.is(dotKey.dotenvReadScope, 'key')
  assert.ok(colonKey)
  assert.is(colonKey.severity, 'low')
  assert.is(colonKey.sensitive, true)
  assert.is(colonKey.dotenvReadScope, 'key')
  assert.not.match(JSON.stringify(report), /secret-fixture/)
})

test('audit classifies dotenv refs with custom variable syntax', async () => {
  const dir = makeFixture()
  const report = await configorama.audit({
    apiKey: '[[file(.env).API_KEY]]',
  }, {
    configDir: dir,
    syntax: configorama.buildVariableSyntax('[[', ']]'),
    safeMode: true,
  })

  const finding = report.findings.find(item => item.variable === 'file(./.env).API_KEY')
  assert.ok(finding)
  assert.is(finding.sensitive, true)
  assert.is(finding.sensitivityReason, 'dotenv_file')
  assert.is(finding.dotenvReadScope, 'key')
})

test.run()
