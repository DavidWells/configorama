/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

let config

process.env.envNumber = 100

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
    otherFlag: 'prod',
    count: 25
    // empty: 'HEHEHE'
  }

  try {
    const configFile = path.join(__dirname, 'iniFile.ini')
    config = await configorama(configFile, {
      options: args
    })
    console.log(`-------------`)
    console.log(`Value count`, Object.keys(config).length)
    console.log(config)
    console.log(`-------------`)
  } catch (err) {
    console.log(`TEST ERROR ${__dirname}\n`, err)
    process.exit(1)
  }
}

// Teardown function
const teardown = () => {
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

// from inifull
const iniContents = {
  section: {
    fullIni: 'fullIniValue',
    fullIniObject: 'object-value'
  }
}

test('ini valueAsNumber', () => {
  assert.is(config.valueAsNumber, '1')
})

test('ini valueAsNumberVariable', () => {
  assert.is(config.valueAsNumberVariable, 5)
})

test('ini valueAsString', () => {
  assert.is(config.valueAsString, 'string value')
})

test('ini valueAsStringSingleQuotes', () => {
  assert.is(config.valueAsStringSingleQuotes, 'single quotes')
})

test('ini valueAsStringDoubleQuotes', () => {
  assert.is(config.valueAsStringDoubleQuotes, 'double quotes')
})

test('ini valueAsStringVariableSingleQuotes', () => {
  assert.is(config.valueAsStringVariableSingleQuotes, 'single-quotes-var')
})

test('ini valueAsStringVariableDoubleQuotes', () => {
  assert.is(config.valueAsStringVariableDoubleQuotes, 'double-quotes-var')
})

test('ini valueWithEqualSign', () => {
  assert.is(config.valueWithEqualSign, 'this=value=has=equal')
})

test('ini valueWithTwoFallbackValues', () => {
  assert.is(config.valueWithTwoFallbackValues, 1)
})

test('ini valueWithTwoFallbackValuesTwo', () => {
  assert.is(config.valueWithTwoFallbackValuesTwo, 1)
})

test('ini valueWithTwoFallbackValuesThree', () => {
  assert.is(config.valueWithTwoFallbackValuesThree, 1)
})

test('ini valueWithTwoFallbackValuesFour', () => {
  assert.is(config.valueWithTwoFallbackValuesFour, 2)
})

test('ini valueAsBoolean', () => {
  assert.is(config.valueAsBoolean, true)
})

test('full ini file reference > ${file(./_inifull.ini)}', () => {
  assert.equal(config.iniFullFile, iniContents)
})

test('full ini file no path > ${file(_inifull.ini)}', () => {
  assert.equal(config.iniFullFileNoPath, iniContents)
})

test('iniFullFileNestedRef > ${file(./_ini${self:normalKey}.ini)}', () => {
  assert.equal(config.iniFullFileNestedRef, iniContents)
})

test("iniFullFileMissing > ${file(./_madeup-file.ini), 'iniFullFileMissingDefaultValue'}", () => {
  assert.equal(config.iniFullFileMissing, 'iniFullFileMissingDefaultValue')
})

test('iniPartialTopLevelKey', () => {
  assert.equal(config.iniPartialTopLevelKey, 'topLevelValue')
})

test('iniPartialTopLevelKeyNoPath', () => {
  assert.equal(config.iniPartialTopLevelKeyNoPath, 'topLevelValue')
})

test('iniPartialSecondLevelKey', () => {
  assert.equal(config.iniPartialSecondLevelKey, '1leveldown')
})

test('iniPartialThirdLevelKey', () => {
  assert.equal(config.iniPartialThirdLevelKey, '2levelsdown')
})

test('iniPartialThirdLevelKeyNoPath', () => {
  assert.equal(config.iniPartialThirdLevelKeyNoPath, '2levelsdown')
})

test('ini section access', () => {
  assert.equal(config.database.host, 'localhost')
})

test('ini section with variables', () => {
  assert.equal(config.database.port, 25)
})

test('ini section with env fallback', () => {
  assert.is(config.database.envPort, '100')
})

test.run()