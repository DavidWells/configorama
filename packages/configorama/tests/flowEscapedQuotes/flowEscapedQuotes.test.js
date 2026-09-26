/* Variables inside YAML flow collections whose quoted scalars contain escaped quotes */
/* (\" in double quotes, '' in single quotes) resolve without injected quotes/errors. */
/* eslint-disable no-template-curly-in-string */
const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const fixture = path.join(__dirname, 'flowEscapedQuotes.yml')

/** @type {Record<string, any>} */
let config

test('resolves fixture', async () => {
  config = await configorama(fixture, { configDir: __dirname, allowUnknownVars: true, options: {} })
  assert.type(config, 'object')
})

test('escaped double quotes around a var in a flow sequence', () => {
  assert.equal(config.flow, ['"A/dev"', 'b'])
})

test('escaped backslash closes the double-quoted element; bare var still wrapped', () => {
  assert.equal(config.flowBackslash, ['a\\', 'dev'])
})

test("'' escape inside a single-quoted flow element", () => {
  assert.equal(config.flowSingle, ["it's dev"])
})

test("bare var after a single-quoted element containing ''", () => {
  assert.equal(config.flowSingleThenBare, ["it's", 'dev'])
})

test('escaped double quotes in a flow object; bare var still wrapped', () => {
  assert.equal(config.flowObj, { a: '"A/dev"', b: 'dev' })
})

test.run()
