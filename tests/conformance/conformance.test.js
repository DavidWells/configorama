/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const {
  assertGolden,
  runApi,
  runCli,
} = require('./harness')

const fixtureDir = path.join(__dirname, 'fixtures')

function comparable(config) {
  return {
    service: config.service,
    stage: config.stage,
    database: config.database,
  }
}

test('CLI audit output is golden-stable JSON', () => {
  const result = runCli(['audit', 'tests/security/fixtures/config.yml', '--error-format', 'json'])
  assert.is(result.status, 0)
  assertGolden('cli-audit-safe-json', result.stdout)
})

test('CLI graph output is golden-stable JSON', () => {
  const result = runCli(['graph', 'tests/security/fixtures/config.yml', '--format', 'json', '--error-format', 'json'])
  assert.is(result.status, 0)
  assertGolden('cli-graph-json', result.stdout)
})

test('API audit output is golden-stable', async () => {
  const result = await runApi(() => configorama.audit(path.join(__dirname, '../security/fixtures/config.yml'), { safeMode: true }))
  assert.is(result.ok, true)
  assertGolden('api-audit-safe-json', result.value)
})

test('cross-format equivalent configs resolve consistently where formats overlap', async () => {
  const files = [
    'equivalent.yml',
    'equivalent.json',
    'equivalent.toml',
    'equivalent.ini',
    'equivalent.hcl',
    'equivalent.md',
    'equivalent.js',
    'equivalent.ts',
  ]

  const envBackup = process.env.CONF_DB_HOST
  process.env.CONF_DB_HOST = 'db.internal'

  const outputs = {}
  try {
    for (const file of files) {
      const config = await configorama(path.join(fixtureDir, file), {
        options: {
          stage: 'prod',
          port: 6543,
          enabled: 'false',
        }
      })
      outputs[file] = comparable(config)
    }
  } finally {
    if (envBackup === undefined) delete process.env.CONF_DB_HOST
    else process.env.CONF_DB_HOST = envBackup
  }

  const baseline = outputs['equivalent.yml']
  for (const [file, output] of Object.entries(outputs)) {
    assert.equal(output, baseline, `${file} should match YAML comparable output`)
  }

  assertGolden('cross-format-equivalence', outputs)
})

test('cross-format differences are documented instead of hidden', async () => {
  const envBackup = process.env.CONF_DB_HOST
  process.env.CONF_DB_HOST = 'db.internal'

  try {
    const yaml = await configorama(path.join(fixtureDir, 'equivalent.yml'), {
      options: { stage: 'prod', port: 6543, enabled: 'false' }
    })
    const hcl = await configorama(path.join(fixtureDir, 'equivalent.hcl'), {
      options: { stage: 'prod', port: 6543, enabled: 'false' }
    })

    assertGolden('cross-format-differences', {
      hclBooleanFilter: {
        yamlEnabled: yaml.enabled,
        hclEnabled: hcl.enabled,
        status: 'documented',
        reason: 'HCL $[] variable parsing currently resolves the option value but does not apply the Boolean filter in this fixture.',
      }
    })
  } finally {
    if (envBackup === undefined) delete process.env.CONF_DB_HOST
    else process.env.CONF_DB_HOST = envBackup
  }
})

test.run()
