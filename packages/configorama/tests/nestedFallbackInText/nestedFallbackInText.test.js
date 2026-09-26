/* A missing self-ref inside a fallback list (${opt:x, ${self:nope}, 'z'}) that sits */
/* inside a larger string: the fallback replaces only that variable, keeping the text. */
/* eslint-disable no-template-curly-in-string */
const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const fixture = path.join(__dirname, 'nestedFallbackInText.yml')

/** @type {Record<string, any>} */
let config

test('resolves fixture', async () => {
  config = await configorama(fixture, { configDir: __dirname, options: {} })
  assert.type(config, 'object')
})

test('text and var before the fallback are kept', () => {
  assert.is(config.afterVar, 'dev z')
})

test('number fallback composed into a string', () => {
  assert.is(config.numberAfterVar, 'dev-7')
})

test('literal text on both sides is kept', () => {
  assert.is(config.textAround, 'pre-z-post')
})

test('several missing refs in one fallback list', () => {
  assert.is(config.chained, 'dev/z')
})

test('two fallback lists with the same missing ref take their own fallback', () => {
  assert.is(config.twoInText, 'x/y')
})

test('controls: fallback var as the whole value keeps its type', () => {
  assert.is(config.whole, 'z')
  assert.is(config.wholeNumber, 7)
})

test('sync API: text around the fallback is kept', () => {
  const syncConfig = configorama.sync(fixture, { options: {} })
  assert.is(syncConfig.afterVar, 'dev z')
  assert.is(syncConfig.textAround, 'pre-z-post')
  assert.is(syncConfig.twoInText, 'x/y')
})

test.run()
