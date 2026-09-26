/* Unresolved (passthrough) vars must survive when literal text around them contains a comma, */
/* e.g. CloudFormation SEARCH('{"${Ns}",Path}') — the comma is not a fallback separator.       */
/* eslint-disable no-template-curly-in-string */
const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const fixture = path.join(__dirname, 'bracePassthrough.json')

/** @type {Record<string, string>} */
let config

test('resolves fixture with unknown vars allowed', async () => {
  config = await configorama(fixture, { configDir: __dirname, allowUnknownVars: true, options: {} })
  assert.type(config, 'object')
})

test('quoted var then comma inside braces is left verbatim', () => {
  assert.is(config.quotedCommaBrace, '{"${MetricsNs}",Path}')
})

test('quoted var then comma inside braces, followed by CFN pseudo param', () => {
  assert.is(config.quotedCommaBraceThenCfn, '{"${MetricsNs}",Path} ${AWS::Region}')
})

test('bare var then comma inside braces is left verbatim', () => {
  assert.is(config.bareCommaBrace, '{${MetricsNs},Path}')
})

test('comma in text after an unknown var is not a fallback', () => {
  assert.is(config.textAfterComma, '${MetricsNs}, trailing')
})

test('known var then comma inside braces resolves', () => {
  assert.is(config.resolvedCommaBrace, '{"dev",Path}')
})

test('real fallback followed by comma text resolves to fallback only', () => {
  assert.is(config.fallbackInText, 'pre-dev, post')
})

test('controls: brace-only, words, escaped quotes stay verbatim', () => {
  assert.is(config.braceOnly, '{${MetricsNs}}')
  assert.is(config.braceWords, '{a ${MetricsNs} b} ${AWS::Region}')
  assert.is(config.escapedQuotes, 'x "${MetricsNs}" y')
})

test('sync API: quoted var then comma inside braces is left verbatim', () => {
  const syncConfig = configorama.sync(fixture, { allowUnknownVars: true, options: {} })
  assert.is(syncConfig.quotedCommaBrace, '{"${MetricsNs}",Path}')
  assert.is(syncConfig.quotedCommaBraceThenCfn, '{"${MetricsNs}",Path} ${AWS::Region}')
})

test.run()
