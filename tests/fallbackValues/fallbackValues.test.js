/* eslint-disable no-template-curly-in-string */
import test from 'ava'
import path from 'path'
import configorama from '../../lib'

let config

process.env.envValue = 'env-value'
process.env.envValueTwo = 'three'

// This runs before all tests
test.before(async t => {
  const args = {
    stage: 'dev',
  }

  const configFile = path.join(__dirname, 'fallbackValues.yml')
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

test('fallback: ${empty, number}', (t) => {
  t.is(config.fallback, 10)
})

test('fallbackNumber: ${empty, 99}', (t) => {
  t.is(config.fallbackNumber, 99)
})

test('fallbackValue should have spaces', (t) => {
  t.is(config.fallbackValueSpaces, 'space is cool')
})

test('fallbackValue should have spaces from other variable', (t) => {
  t.is(config.fallbackValueSpacesTwo, 'I have spaces')
})

// TODO fix third fallback
// test("fallbackValueShouldBeThird: ${empty, ${alsoEmpty}, 'here it is'}", (t) => {
//   t.is(config.fallbackValueShouldBeThird, 'here it is')
// })

test('fallbackNumberZero: ${empty, 0}', (t) => {
  t.is(config.fallbackNumberZero, 0)
})

test("fallbackString: ${empty, 'ninety-nine'}", (t) => {
  t.is(config.fallbackString, 'ninety-nine')
})

test('fallbackStringTwo: ${empty, "_nine-nine_"}', (t) => {
  t.is(config.fallbackStringTwo, '_nine-nine_')
})

test('fallbackWithAtSign: ${empty, "foo@bar"}', (t) => {
  t.is(config.fallbackWithAtSign, 'foo@bar')
})

test('fallbackSelf: ${empty, number}', (t) => {
  t.is(config.fallbackSelf, 10)
})

test('fallbackSelfTwo: ${empty, ${value}}', (t) => {
  t.is(config.fallbackSelfTwo, 'xyz')
})

test('fallbackSelfThree: ${empty, ${self:valueTwo}}', (t) => {
  t.is(config.fallbackSelfThree, 'two')
})

test('fallbackEnv: ${empty, env:envValue}', (t) => {
  t.is(config.fallbackEnv, 'env-value')
})

test('fallbackEnvTwo: ${self:empty, ${env:envValue}}', (t) => {
  t.is(config.fallbackEnvTwo, 'env-value')
})

test('fallbackEnvThree: ${empty, ${env:envValueTwo}}', (t) => {
  t.is(config.fallbackEnvThree, 'three')
})

test('fallbackInFile:  ${empty, ${file(./config.json):KEY}}', (t) => {
  t.is(config.fallbackInFile, 'hi there')
})

test("fallbackInFileNested: ${empty, ${file(./config.${opt:stage, 'dev'}.json):KEY }}", (t) => {
  t.is(config.fallbackInFileNested, 'hi there dev')
})
