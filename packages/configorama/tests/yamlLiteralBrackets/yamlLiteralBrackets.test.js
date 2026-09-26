/* Brackets/braces that are literal text inside quoted or plain YAML scalars are not */
/* flow collections: vars inside them resolve without injected quotes or parse errors. */
/* eslint-disable no-template-curly-in-string */
const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const fixture = path.join(__dirname, 'yamlLiteralBrackets.yml')

/** @type {Record<string, any>} */
let config

test('resolves fixture', async () => {
  config = await configorama(fixture, { configDir: __dirname, options: {} })
  assert.type(config, 'object')
})

test('flow object var still resolves', () => {
  assert.equal(config.obj, { a: 'dev' })
})

test('braces inside a double-quoted scalar', () => {
  assert.is(config.quotedBrace, '{dev}')
})

test('braces inside a single-quoted scalar', () => {
  assert.is(config.singleQuotedBrace, 'x {dev} y')
})

test('braces mid plain scalar', () => {
  assert.is(config.plainBrace, 'pre {dev} post')
})

test('brackets mid plain scalar', () => {
  assert.is(config.plainBracket, 'pre [dev] post')
})

test('bracket attached to a word in a plain scalar', () => {
  assert.is(config.attachedBracket, 'echo a[dev]')
})

test('flow array still resolves bare var', () => {
  assert.equal(config.flowAfter, ['dev', 'b'])
})

test.run()
