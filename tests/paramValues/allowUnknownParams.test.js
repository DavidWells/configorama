/* eslint-disable no-template-curly-in-string */
// Tests for allowUnknownParams option - allows unresolved param variables to pass through

const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

test('allowUnknownParams: false (default) - throws on unresolved param', async () => {
  const configFile = path.join(__dirname, 'allowUnknownParams.yml')
  try {
    await configorama(configFile, {
      options: { stage: 'prod' }
      // allowUnknownParams defaults to false
    })
    assert.unreachable('Should have thrown an error')
  } catch (err) {
    assert.ok(err.message.includes('param:dashboardSecret'), 'Error should mention unresolved param')
  }
})

test('allowUnknownParams: true - passes through unresolved param variables', async () => {
  const configFile = path.join(__dirname, 'allowUnknownParams.yml')
  const config = await configorama(configFile, {
    options: { stage: 'prod' },
    allowUnknownParams: true
  })

  // Resolved params should work
  assert.is(config.appDomain, 'myapp.com')
  assert.is(config.dbHost, 'prod-db.myapp.com')

  // Unresolved param should pass through as original syntax
  assert.is(config.dashboardSecret, '${param:dashboardSecret}')
  assert.is(config.anotherDashboardParam, '${param:anotherDashboardParam}')

  // Mixed resolved and unresolved in same string
  assert.is(config.mixedValue, 'domain=myapp.com,secret=${param:dashboardSecret}')
})

test('allowUnknownParams: true - param with fallback passes through for third-party resolution', async () => {
  const configFile = path.join(__dirname, 'allowUnknownParams.yml')
  const config = await configorama(configFile, {
    options: { stage: 'prod' },
    allowUnknownParams: true
  })

  // Entire expression passes through for third-party resolver (e.g., Serverless Dashboard)
  assert.is(config.paramWithFallback, "${param:notDefined, 'fallback-value'}")
})

test.run()
