/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const { deepLog, createTrackingProxy, checkUnusedConfigValues } = require('../utils')

let config

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
    count: 25
  }

  try {
    const configFile = path.join(__dirname, 'aliasValues.yml')
    const configDir = path.dirname(configFile)

    const rawConfig = await configorama(configFile, {
      options: args,
      // configPath: configDir
    })

    config = createTrackingProxy(rawConfig)
    console.log(`-------------`)
    console.log(`Alias Values Test - Value count`, Object.keys(config).length)
    deepLog('config', config)
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

// Expected test data from src/test-data.json
const expectedTestData = {
  environment: "development",
  database: {
    host: "localhost",
    port: 5432,
    name: "test_db"
  },
  features: {
    enableLogging: true,
    enableMetrics: false
  }
}

// Expected app config from config/app-config.yml
const expectedAppConfig = {
  appName: "My Test App",
  version: "1.0.0",
  settings: {
    theme: "dark",
    language: "en",
    timeout: 30
  }
}

// Expected secrets from data/secrets.json
const expectedSecrets = {
  apiKey: "secret-api-key-123",
  dbPassword: "super-secret-password",
  tokens: {
    refresh: "refresh-token-abc",
    access: "access-token-xyz"
  }
}

test('normal file reference (control test)', () => {
  assert.equal(config.normalFileRef, expectedTestData)
})

test('alias JSON file full object > ${file(@alias/test-data.json)}', () => {
  assert.equal(config.aliasJsonFile, expectedTestData)
})

test('alias JSON property > ${file(@alias/test-data.json):database.host}', () => {
  assert.equal(config.aliasJsonProperty, "localhost")
})

test('alias JSON nested property > ${file(@alias/test-data.json):features.enableLogging}', () => {
  assert.equal(config.aliasJsonNestedProperty, true)
})

test('config alias YAML file > ${file(@config/app-config.yml)}', () => {
  assert.equal(config.configYmlFile, expectedAppConfig)
})

test('config alias YAML property > ${file(@config/app-config.yml):appName}', () => {
  assert.equal(config.configYmlProperty, "My Test App")
})

test('config alias YAML nested property > ${file(@config/app-config.yml):settings.theme}', () => {
  assert.equal(config.configYmlNestedProperty, "dark")
})

test('data alias JSON file > ${file(@data/secrets.json)}', () => {
  assert.equal(config.dataJsonFile, expectedSecrets)
})

test('data alias JSON property > ${file(@data/secrets.json):apiKey}', () => {
  assert.equal(config.dataJsonProperty, "secret-api-key-123")
})

test('data alias JSON nested property > ${file(@data/secrets.json):tokens.access}', () => {
  assert.equal(config.dataJsonNestedProperty, "access-token-xyz")
})

test('missing alias file with fallback > ${file(@alias/nonexistent.json), "default-value"}', () => {
  assert.equal(config.missingAliasFile, "default-value")
})

test('quoted alias > ${file("@config/app-config.yml"):version}', () => {
  assert.equal(config.quotedAlias, "1.0.0")
})

test.run()