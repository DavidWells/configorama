/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const { deepLog, createTrackingProxy, checkUnusedConfigValues } = require('../utils')

let config

process.env.envNumber = 100
process.env.MY_SECRET = 'lol hi there'
process.env.MY_ENV_VAR = 'prod'

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
    otherFlag: 'prod',
    count: 25
  }

  try {
    const configFile = path.join(__dirname, 'fileValues.yml')

    const rawConfig = await configorama(configFile, {
      options: args
    })

    config = createTrackingProxy(rawConfig)
    console.log(`-------------`)
    console.log(`Value count`, Object.keys(config).length)
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

// from ymlfull
const ymlContents = {
  fullYml: 'fullYmlValue',
  fullYmlObject: {
    one: 'one',
    two: 'two'
  }
}

test('full yaml file reference > ${file(./_ymlfull.yml)}', () => {
  assert.equal(config.yamlFullFile, ymlContents)
})

test('full yaml file no path > ${file(_ymlfull.yml)}', () => {
  assert.equal(config.yamlFullFileNoPath, ymlContents)
})

test('yamlFullFileNestedRef > ${file(./_yml${self:normalKey}.yml)}', () => {
  assert.equal(config.yamlFullFileNestedRef, ymlContents)
})

test("yamlFullFileMissing > ${file(./_madeup-file.yml), 'yamlFullFileMissingDefaultValue'}", () => {
  assert.equal(config.yamlFullFileMissing, 'yamlFullFileMissingDefaultValue')
})

test('yamlPartialTopLevelKey', () => {
  assert.equal(config.yamlPartialTopLevelKey, 'topLevelValue')
})

test('yamlPartialTopLevelKeyNoPath', () => {
  assert.equal(config.yamlPartialTopLevelKeyNoPath, 'topLevelValue')
})

test('yamlPartialSecondLevelKey', () => {
  assert.equal(config.yamlPartialSecondLevelKey, '1leveldown')
})

test('yamlPartialThirdLevelKey', () => {
  assert.equal(config.yamlPartialThirdLevelKey, '2levelsdown')
})

test('yamlPartialThirdLevelKeyNoPath', () => {
  assert.equal(config.yamlPartialThirdLevelKeyNoPath, '2levelsdown')
})

test('yamlPartialArrayRef', () => {
  assert.equal(config.yamlPartialArrayRef, 'one')
})

test('yamlPartialArrayObjectRef', () => {
  assert.equal(config.yamlPartialArrayObjectRef, { key: 'helloTwo' })
})

test('yamlPartialArrayObjectRefValue', () => {
  assert.equal(config.yamlPartialArrayObjectRefValue, 'helloTwo')
})

test('jsonFullFile', () => {
  assert.equal(config.jsonFullFile, {
    fullJson: 'fullJsonValue',
    fullJsonObject: {
      foo: true,
      bar: 'zaz',
      opt: 'dev',
      optWithDefault: 'defaultOptFlag',
      envVar: 'fallback',
      envVarWithDefault: 'defaultEnvValue'
    }
  })
})

test('stageSpecificViaFlag', () => {
  assert.equal(config.stageSpecificViaFlag, {
    'CREDS': 'dev creds here'
  })
})

test('stageSpecificViaEnvVar', () => {
  assert.equal(config.stageSpecificViaEnvVar, {
    'CREDS': 'prod creds here'
  })
})

test('stageSpecificViaFlagTwo', () => {
  assert.equal(config.stageSpecificViaFlagTwo, {
    'CREDS': 'prod creds here'
  })
})

test('singleQuotes', () => {
  assert.equal(config.singleQuotes, {
    'CREDS': 'dev creds here'
  })
})

test('doubleQuotes', () => {
  assert.equal(config.doubleQuotes, {
    'CREDS': 'prod creds here'
  })
})

test('[typescript] AsyncValue', () => {
  assert.equal(config.tsAsyncValue, 'async-ts-value')
})

test.skip('[typescript] AsyncValueDotProp', () => {
  assert.equal(config.tsAsyncValueDotProp, 'async-ts-value-dot-prop')
})

test('[typescript] SyncValue', () => {
  assert.equal(config.tsSyncValue, {
    syncValue: 'sync-ts-value',
    computedValue: config.tsSyncValue.computedValue // Just verify it exists
  })
  assert.ok(config.tsSyncValue.computedValue > 0)
})

test('[typescript] WithArgs', () => {
  assert.equal(config.tsWithArgs, 'async-ts-value')
})

test('[esm] AsyncValue', () => {
  assert.equal(config.esmAsyncValue, 'esmAsyncVal')
})

test('[esm] AsyncValueDotProp', () => {
  assert.equal(config.esmAsyncValueDotProp, {
    nested: {
      value: 'esmNestedValue'
    },
    another: 'esmAnotherValue'
  })
})

test('[esm] SyncValue', () => {
  assert.equal(config.esmSyncValue, 'esmSyncVal')
})

test('[esm] WithArgs', () => {
  assert.equal(config.esmWithArgs, 'esmAsyncVal')
})

test.run()
