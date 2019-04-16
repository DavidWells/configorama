import test from 'ava'
import path from 'path'
import configorama from '../../lib'

let config

process.env.envReference = 'env var'

// This runs before all tests
test.before(async t => {
  const args = {
    stage: 'dev',
  }

  const configFile = path.join(__dirname, 'valueTypes.yml')
  config = await configorama(configFile, {
    options: args
  })
  console.log(`-------------`)
  console.log(`Value count`, Object.keys(config).length)
  console.log(config)
  console.log(`-------------`)
})

test.after(t => {
  console.log(`-------------`)
})

test('valueAsNumber', (t) => {
  t.is(config.valueAsNumber, 1)
})

test('valueAsNumberVariable', (t) => {
  t.is(config.valueAsNumberVariable, 5)
})

test('valueAsString', (t) => {
  t.is(config.valueAsString, 'string value')
})

test('valueAsStringSingleQuotes', (t) => {
  t.is(config.valueAsStringSingleQuotes, 'single quotes')
})

test('valueAsStringDoubleQuotes', (t) => {
  t.is(config.valueAsStringDoubleQuotes, 'double quotes')
})

test('valueAsStringVariableSingleQuotes', (t) => {
  t.is(config.valueAsStringVariableSingleQuotes, 'single-quotes-var')
})

test('valueAsStringVariableDoubleQuotes', (t) => {
  t.is(config.valueAsStringVariableDoubleQuotes, 'double-quotes-var')
})

test('valueWithEqualSign', (t) => {
  t.is(config.valueWithEqualSign, 'this=value=has=equal')
})

test('valueWithTwoFallbackValues', (t) => {
  t.is(config.valueWithTwoFallbackValues, 1)
})

test('valueAsBoolean', (t) => {
  t.is(config.valueAsBoolean, true)
})

test('selfReference', (t) => {
  t.is(config.selfReference, 'value')
})

test('envReference', (t) => {
  t.is(config.envReference, 'env var')
})

test('cliFlag', (t) => {
  t.is(config.cliFlag, 'dev')
})

test('cliFlagEmtpy', (t) => {
  t.is(config.cliFlagEmtpy, 'cliFlagEmtpyValue')
})

test('cliFlagComposed', (t) => {
  t.is(config.cliFlagComposed, 'dev-secret')
})

test('Composed objects', (t) => {
  t.is(config.resolvedDomainName, 'api-dev.my-site.com')
})
