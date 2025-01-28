/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../lib')

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

  const configFile = path.join(__dirname, 'tomlFile.toml')
  config = await configorama(configFile, {
    options: args
  })
  console.log(`-------------`)
  console.log(`Value count`, Object.keys(config).length)
  console.log(config)
  console.log(`-------------`)
}

// Teardown function
const teardown = () => {
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

// from tomlfull
const tomlContents = {
  fullYml: 'fullTomlValue',
  fullYmlObject: {
    one: 'one',
    two: 'two'
  }
}

test('toml valueAsNumber', () => {
  assert.is(config.valueAsNumber, 1)
})

test('toml valueAsNumberVariable', () => {
  assert.is(config.valueAsNumberVariable, 5)
})

test('toml valueAsString', () => {
  assert.is(config.valueAsString, 'string value')
})

test('toml valueAsStringSingleQuotes', () => {
  assert.is(config.valueAsStringSingleQuotes, 'single quotes')
})

test('toml valueAsStringDoubleQuotes', () => {
  assert.is(config.valueAsStringDoubleQuotes, 'double quotes')
})

test('toml valueAsStringVariableSingleQuotes', () => {
  assert.is(config.valueAsStringVariableSingleQuotes, 'single-quotes-var')
})

test('toml valueAsStringVariableDoubleQuotes', () => {
  assert.is(config.valueAsStringVariableDoubleQuotes, 'double-quotes-var')
})

test('toml valueWithEqualSign', () => {
  assert.is(config.valueWithEqualSign, 'this=value=has=equal')
})

test('toml valueWithTwoFallbackValues', () => {
  assert.is(config.valueWithTwoFallbackValues, 1)
})

test('toml valueAsBoolean', () => {
  assert.is(config.valueAsBoolean, true)
})

test('full toml file reference > ${file(./_tomlfull.toml)}', () => {
  assert.equal(config.tomlFullFile, tomlContents)
})

test('full toml file no path > ${file(_tomlfull.toml)}', () => {
  assert.equal(config.tomlFullFileNoPath, tomlContents)
})

test('tomlFullFileNestedRef > ${file(./_toml${self:normalKey}.toml)}', () => {
  assert.equal(config.tomlFullFileNestedRef, tomlContents)
})

test("tomlFullFileMissing > ${file(./_madeup-file.toml), 'tomlFullFileMissingDefaultValue'}", () => {
  assert.equal(config.tomlFullFileMissing, 'tomlFullFileMissingDefaultValue')
})

test('tomlPartialTopLevelKey', () => {
  assert.equal(config.tomlPartialTopLevelKey, 'topLevelValue')
})

test('tomlPartialTopLevelKeyNoPath', () => {
  assert.equal(config.tomlPartialTopLevelKeyNoPath, 'topLevelValue')
})

test('tomlPartialSecondLevelKey', () => {
  assert.equal(config.tomlPartialSecondLevelKey, '1leveldown')
})

test('tomlPartialThirdLevelKey', () => {
  assert.equal(config.tomlPartialThirdLevelKey, '2levelsdown')
})

test('tomlPartialThirdLevelKeyNoPath', () => {
  assert.equal(config.tomlPartialThirdLevelKeyNoPath, '2levelsdown')
})

test('tomlPartialArrayRef', () => {
  assert.equal(config.tomlPartialArrayRef, 'one')
})

test('tomlPartialArrayObjectRef', () => {
  assert.equal(config.tomlPartialArrayObjectRef, { key: 'helloTwo' })
})

test('tomlPartialArrayObjectRefValue', () => {
  assert.equal(config.tomlPartialArrayObjectRefValue, 'helloTwo')
})

test.run()
