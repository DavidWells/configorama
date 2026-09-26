/* The same unresolvable var used both inside a fallback list and on its own in one */
/* value: each occurrence resolves in its own context instead of sharing one result. */
/* eslint-disable no-template-curly-in-string */
const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const fixture = path.join(__dirname, 'duplicateVarFallback.yml')

/** @type {Record<string, any>} */
let config

test('resolves fixture with unknown vars allowed', async () => {
  config = await configorama(fixture, { configDir: __dirname, allowUnknownVars: true, options: {} })
  assert.type(config, 'object')
})

test('fallback copy first: fallback applies only inside the fallback list', () => {
  assert.is(config.fallbackFirst, 'fb and ${Missing}')
})

test('fallback copy second: standalone copy stays, fallback copy falls through', () => {
  assert.is(config.fallbackSecond, '${Missing} and fb')
})

test('same var in two different fallback lists takes each list\'s own fallback', () => {
  assert.is(config.twoFallbacks, 'x y')
})

test('CloudFormation resource ref: fallback copy falls through, standalone copy passes through', () => {
  assert.is(config.cfnRefFallback, 'https://api.com/${ApiGatewayRestApi}')
})

test('unknown var next to a var with a missing self-ref fallback is kept', () => {
  assert.is(config.unknownThenFallback, '${Missing} z')
})

test('var with a bare-word fallback resolves the same next to other vars as alone', () => {
  assert.is(config.bareFallbackSingle, 'y')
  assert.is(config.unknownThenBareFallback, 'x y')
})

test('controls: unchanged behavior', () => {
  assert.is(config.missingTwice, '${Missing} and ${Missing}')
  assert.is(config.missingSingle, 'fb')
  assert.is(config.knownTwice, 'dev-dev')
  assert.is(config.knownThrice, 'dev/dev/dev')
})

test('AWS pseudo params (and vars wrapping them) are left verbatim', () => {
  assert.is(config.awsPseudoFirst, "${opt:nope, ${AWS::Region}, 'us-east-1'} and ${AWS::Region}")
  assert.is(config.awsPseudoSecond, "${AWS::Region} and ${opt:nope, ${AWS::Region}, 'us-east-1'}")
})

test('sync API: each occurrence resolves in its own context', () => {
  const syncConfig = configorama.sync(fixture, { allowUnknownVars: true, options: {} })
  assert.is(syncConfig.fallbackFirst, 'fb and ${Missing}')
  assert.is(syncConfig.fallbackSecond, '${Missing} and fb')
  assert.is(syncConfig.twoFallbacks, 'x y')
})

test.run()
