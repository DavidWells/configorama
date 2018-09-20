/* eslint-disable no-template-curly-in-string */
import test from 'ava'
import path from 'path'
import Configorama from '../../lib'

let config

process.env.envNumber = 100

// This runs before all tests
test.before(async t => {
  const args = {
    stage: 'dev',
    otherFlag: 'prod',
    count: 25
    // empty: 'HEHEHE'
  }

  const configFile = path.join(__dirname, 'tomlFile.toml')
  const configorama = new Configorama(configFile)

  config = await configorama.init(args)
  console.log(`-------------`)
  console.log(`Value count`, Object.keys(config).length)
  console.log(config)
  console.log(`-------------`)
})

test.after(t => {
  console.log(`-------------`)
})

// from tomlfull
const tomlContents = {
  fullYml: 'fullTomlValue',
  fullYmlObject: {
    one: 'one',
    two: 'two'
  }
}

test('toml valueAsNumber', (t) => {
  t.is(config.valueAsNumber, 1)
})

test('toml valueAsNumberVariable', (t) => {
  t.is(config.valueAsNumberVariable, 5)
})

test('toml valueAsString', (t) => {
  t.is(config.valueAsString, 'string value')
})

test('toml valueAsStringSingleQuotes', (t) => {
  t.is(config.valueAsStringSingleQuotes, 'single quotes')
})

test('toml valueAsStringDoubleQuotes', (t) => {
  t.is(config.valueAsStringDoubleQuotes, 'double quotes')
})

test('toml valueAsStringVariableSingleQuotes', (t) => {
  t.is(config.valueAsStringVariableSingleQuotes, 'single-quotes-var')
})

test('toml valueAsStringVariableDoubleQuotes', (t) => {
  t.is(config.valueAsStringVariableDoubleQuotes, 'double-quotes-var')
})

test('toml valueWithEqualSign', (t) => {
  t.is(config.valueWithEqualSign, 'this=value=has=equal')
})

test('toml valueWithTwoFallbackValues', (t) => {
  t.is(config.valueWithTwoFallbackValues, 1)
})

test('toml valueAsBoolean', (t) => {
  t.is(config.valueAsBoolean, true)
})

test('full toml file reference > ${file(./_tomlfull.toml)}', (t) => {
  t.deepEqual(config.tomlFullFile, tomlContents)
})

test('full toml file no path > ${file(_tomlfull.toml)}', (t) => {
  t.deepEqual(config.tomlFullFileNoPath, tomlContents)
})

test('tomlFullFileNestedRef > ${file(./_toml${self:normalKey}.toml)}', (t) => {
  t.deepEqual(config.tomlFullFileNestedRef, tomlContents)
})

test("tomlFullFileMissing > ${file(./_madeup-file.toml), 'tomlFullFileMissingDefaultValue'}", (t) => {
  t.deepEqual(config.tomlFullFileMissing, 'tomlFullFileMissingDefaultValue')
})

test('tomlPartialTopLevelKey', (t) => {
  t.deepEqual(config.tomlPartialTopLevelKey, 'topLevelValue')
})

test('tomlPartialTopLevelKeyNoPath', (t) => {
  t.deepEqual(config.tomlPartialTopLevelKeyNoPath, 'topLevelValue')
})

test('tomlPartialTopLevelKeyNoPath', (t) => {
  t.deepEqual(config.tomlPartialTopLevelKeyNoPath, 'topLevelValue')
})

test('tomlPartialSecondLevelKey', (t) => {
  t.deepEqual(config.tomlPartialSecondLevelKey, '1leveldown')
})

test('tomlPartialThirdLevelKey', (t) => {
  t.deepEqual(config.tomlPartialThirdLevelKey, '2levelsdown')
})

test('tomlPartialThirdLevelKeyNoPath', (t) => {
  t.deepEqual(config.tomlPartialThirdLevelKeyNoPath, '2levelsdown')
})

test('tomlPartialArrayRef', (t) => {
  t.deepEqual(config.tomlPartialArrayRef, 'one')
})

test('tomlPartialArrayObjectRef', (t) => {
  t.deepEqual(config.tomlPartialArrayObjectRef, { key: 'helloTwo' })
})

test('tomlPartialArrayObjectRefValue', (t) => {
  t.deepEqual(config.tomlPartialArrayObjectRefValue, 'helloTwo')
})
