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
process.env.FOO = 'bar'

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

test('yamlFullFile -> ${file("./_ymlfull.yml")}', () => {
  assert.equal(config.yamlFullFile, ymlContents)
})

test('yamlFullFileNoPath -> ${file(_ymlfull.yml)}', () => {
  assert.equal(config.yamlFullFileNoPath, ymlContents)
})

test('yamlFullFileNestedRef -> ${file(./_yml${self:normalKey}.yml)}', () => {
  assert.equal(config.yamlFullFileNestedRef, ymlContents)
})

test("yamlFullFileMissing -> ${file(./_madeup-file.yml), 'yamlFullFileMissingDefaultValue'}", () => {
  assert.equal(config.yamlFullFileMissing, 'yamlFullFileMissingDefaultValue')
})

test('yamlPartialTopLevelKey -> ${file(./_ymlpartial.yml):topLevel}', () => {
  assert.equal(config.yamlPartialTopLevelKey, 'topLevelValue')
})

test('yamlPartialTopLevelKeyNoPath -> ${file(_ymlpartial.yml):topLevel}', () => {
  assert.equal(config.yamlPartialTopLevelKeyNoPath, 'topLevelValue')
})

test('yamlPartialSecondLevelKey -> ${file(./_ymlpartial.yml):nested.value}', () => {
  assert.equal(config.yamlPartialSecondLevelKey, '1leveldown')
})

test('yamlPartialThirdLevelKey -> ${file(./_ymlpartial.yml):nested.again.value}', () => {
  assert.equal(config.yamlPartialThirdLevelKey, '2levelsdown')
})

test('yamlPartialThirdLevelKeyNoPath -> ${file(_ymlpartial.yml):nested.again.value}', () => {
  assert.equal(config.yamlPartialThirdLevelKeyNoPath, '2levelsdown')
})

test('yamlPartialArrayRef -> ${file(./_ymlpartial.yml):array.1}', () => {
  assert.equal(config.yamlPartialArrayRef, 'one')
})

test('yamlPartialArrayObjectRef -> ${file(./_ymlpartial.yml):arrayTwo.1.object}', () => {
  assert.equal(config.yamlPartialArrayObjectRef, { key: 'helloTwo' })
})

test('yamlPartialArrayObjectRefValue -> ${file(./_ymlpartial.yml):arrayTwo.1.object.key}', () => {
  assert.equal(config.yamlPartialArrayObjectRefValue, 'helloTwo')
})

test('jsonFullFile -> ${file(./_jsonfull.json)}', () => {
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

test("jsonFullFileMissing -> ${file(./_madeup-file.json), 'jsonFullFileMissingDefaultValue'}", () => {
  assert.equal(config.jsonFullFileMissing, 'jsonFullFileMissingDefaultValue')
})

test('jsonPartialTopLevelKey -> ${file(./_jsonpartial.json):topLevel}', () => {
  assert.equal(config.jsonPartialTopLevelKey, 'topLevelValueJson')
})

test('jsonPartialSecondLevelKey -> ${file(./_jsonpartial.json):nested.value}', () => {
  assert.equal(config.jsonPartialSecondLevelKey, '1leveldownJson')
})

test('jsonPartialThirdLevelKey -> ${file(./_jsonpartial.json):nested.again.value}', () => {
  assert.equal(config.jsonPartialThirdLevelKey, '2levelsdownJson')
})

test('jsonPartialArrayRef -> ${file(./_jsonpartial.json):array.0}', () => {
  assert.equal(config.jsonPartialArrayRef, 'zero')
})

test('stageSpecificViaFlag -> ${file(./config.${opt:stage}.json)}', () => {
  assert.equal(config.stageSpecificViaFlag, {
    'CREDS': 'dev creds here'
  })
})

test('stageSpecificViaEnvVar -> ${file(./config.${env:MY_ENV_VAR}.json)}', () => {
  assert.equal(config.stageSpecificViaEnvVar, {
    'CREDS': 'prod creds here'
  })
})

test('stageSpecificViaFlagTwo -> ${file(./config.${opt:otherFlag}.json)}', () => {
  assert.equal(config.stageSpecificViaFlagTwo, {
    'CREDS': 'prod creds here'
  })
})

test('stageSpecificViaInlineStage -> ${file(./config.${self:inlineStage}.json)}', () => {
  assert.equal(config.stageSpecificViaInlineStage, {
    'CREDS': 'other creds here'
  })
})

test('stageSpecificViaInlineStageShortHand -> ${file(./config.${inlineStage}.json)}', () => {
  assert.equal(config.stageSpecificViaInlineStageShortHand, {
    'CREDS': 'other creds here'
  })
})

test("singleQuotes -> ${file('./config.${opt:stage}.json')}", () => {
  assert.equal(config.singleQuotes, {
    'CREDS': 'dev creds here'
  })
})

test('doubleQuotes -> ${file("./config.${opt:otherFlag}.json")}', () => {
  assert.equal(config.doubleQuotes, {
    'CREDS': 'prod creds here'
  })
})

test('noQuotes -> ${file(./config.${opt:stage}.json)}', () => {
  assert.equal(config.noQuotes, {
    'CREDS': 'dev creds here'
  })
})

test('additionalValues -> ${file(./async.js, ${env:MY_SECRET}, ${self:normalKey})}', () => {
  assert.equal(config.additionalValues, 'asyncval')
})

test('additionalValuesTWO -> ${file(./async.js, ${env:MY_SECRET}, ${self:normalKey})}', () => {
  assert.equal(config.additionalValuesTWO, 'asyncval')
})

test('tsAsyncValue -> ${file(./async-value.ts)}', () => {
  assert.equal(config.tsAsyncValue, 'async-ts-value')
})

test('tsAsyncValueDotProp -> ${file(./async-value-dot-prop.ts)}', () => {
  assert.equal(config.tsAsyncValueDotProp, {
    my: {
      value: 'async-ts-value-dot-prop'
    }
  })
})

test('tsSyncValue -> ${file(./sync-value.ts)}', () => {
  assert.equal(config.tsSyncValue, {
    syncValue: 'sync-ts-value',
    computedValue: config.tsSyncValue.computedValue // Just verify it exists
  })
  assert.ok(config.tsSyncValue.computedValue > 0)
})

test('tsWithArgs -> ${file(./async-value.ts, ${env:MY_SECRET}, ${self:normalKey})}', () => {
  assert.equal(config.tsWithArgs, 'async-ts-value')
})

test('esmAsyncValue -> ${file(./async-value.mjs)}', () => {
  assert.equal(config.esmAsyncValue, 'esmAsyncVal')
})

test('esmAsyncValueDotProp -> ${file(./async-value-dot-prop.mjs)}', () => {
  assert.equal(config.esmAsyncValueDotProp, {
    nested: {
      value: 'esmNestedValue'
    },
    another: 'esmAnotherValue'
  })
})

test('esmSyncValue -> ${file(./sync-value.mjs)}', () => {
  assert.equal(config.esmSyncValue, 'esmSyncVal')
})

test('esmWithArgs -> ${file(./async-value.mjs, ${env:MY_SECRET}, ${self:normalKey})}', () => {
  assert.equal(config.esmWithArgs, 'esmAsyncVal')
})

test.run()
