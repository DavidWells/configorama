/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const { createTrackingProxy, checkUnusedConfigValues } = require('../utils')

let config

// Setup function
const setup = async () => {
  const args = {
    stage: 'prod',
    // CLI params - these should have highest priority
    param: [
      'domain=cli-override.com',
      'special=cli-special-!@#$%'
    ]
  }

  const configFile = path.join(__dirname, 'paramValues.yml')
  try {
    const rawConfig = await configorama(configFile, {
      options: args
    })
    // Wrap config in tracking proxy
    config = createTrackingProxy(rawConfig)
    console.log(`-------------`)
    console.log(`Value count`, Object.keys(config).length)
    console.log(config)
    console.log(`-------------`)
  } catch (err) {
    console.error(`TEST ERROR ${__dirname}\n`, err)
    process.exit(1)
  }
}

// Teardown function
const teardown = () => {
  checkUnusedConfigValues(config)
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

test('CLI param overrides stage-specific param: ${param:domain}', () => {
  // CLI param should override prod stage param
  assert.is(config.appDomain, 'cli-override.com')
})

test('Fallback value when param not provided: ${param:apiKey, "default-api-key"}', () => {
  assert.is(config.apiKey, 'default-api-key')
})

test('Stage-specific param from config: ${param:dbHost}', () => {
  // Should get dbHost from prod stage
  assert.is(config.database.host, 'prod-db.myapp.com')
})

test('Default param fallback: ${param:dbPort, 5432}', () => {
  // dbPort not in prod stage, but IS in default stage params (3306)
  // So it should use default stage value, not the fallback in variable
  assert.is(config.database.port, 3306)
})

test('Database name with stage reference', () => {
  assert.is(config.database.name, 'myapp_prod')
})

test('Param used in URL construction: https://${param:domain}', () => {
  assert.is(config.baseUrl, 'https://cli-override.com')
})

test('Self-reference with param: ${baseUrl}/api', () => {
  assert.is(config.apiUrl, 'https://cli-override.com/api')
})

test('Environment param from stage: ${param:environment}', () => {
  assert.is(config.envSpecific, 'production-specific-value')
})

test('Nested param in object: config.url', () => {
  assert.is(config.config.url, 'cli-override.com')
})

test('Nested param in URL: config.fullUrl', () => {
  assert.is(config.config.fullUrl, 'https://cli-override.com/app')
})

test('Special characters in param value: ${param:special}', () => {
  assert.is(config.specialChars, 'cli-special-!@#$%')
})

test('Multiple params in connection string', () => {
  // dbPort comes from default stage (3306), not fallback
  assert.is(config.connectionString, 'Host=prod-db.myapp.com;Port=3306;Database=myapp')
})

test.run()
