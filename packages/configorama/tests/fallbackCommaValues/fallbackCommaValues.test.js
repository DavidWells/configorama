/* A fallback that resolves to a value containing commas is one value, not a list of */
/* more fallbacks. Regression: ${env:X, self:custom.list} with list "a,b,c" pasted the */
/* value back as ${env:X, a,b,c} and then failed looking up the variable "a".          */
/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { resolveYamlText } = require('../utils')
const { isFallbackSlot } = require('../../src/utils/strings/bracketMatcher')

const UNSET = 'CONFIGORAMA_FALLBACK_COMMA_UNSET'
const SET = 'CONFIGORAMA_FALLBACK_COMMA_SET'

const HEADER = `custom:
  vendors:
    dev: ''
    prod: hubspot,salesforce,amplitude
  list: a,b,c
  spaced: 'a, b , c'
  braces: 'x{y},z'
  quoted: "it's,here"
provider:
  stage: \${opt:stage, 'dev'}
`

/**
 * Resolve one value next to the shared header keys
 * @param {string} value - YAML value text for key v
 * @param {object} [settings] - configorama settings
 * @returns {Promise<any>} The resolved v
 */
async function resolveValue(value, settings) {
  const config = await resolveYamlText(`${HEADER}v: ${value}\n`, settings)
  return config.v
}

test.before.each(() => {
  delete process.env[UNSET]
  delete process.env[SET]
})

test('per-stage fallback with commas (the revenue-engine martech-catalog-api shape)', async () => {
  const value = `\${env:${UNSET}, self:custom.vendors.\${self:provider.stage}}`
  assert.is(await resolveValue(value, { options: { stage: 'prod' } }), 'hubspot,salesforce,amplitude')
  assert.is(await resolveValue(value, { options: { stage: 'dev' } }), '')
})

test('the env var still wins when set, commas and all', async () => {
  process.env[SET] = 'x,y'
  assert.is(await resolveValue(`\${env:${SET}, self:custom.list}`), 'x,y')
})

test('explicit nested form ${env:X, ${self:list}}', async () => {
  assert.is(await resolveValue(`\${env:${UNSET}, \${self:custom.list}}`), 'a,b,c')
})

test('opt: fallback with commas', async () => {
  assert.is(await resolveValue('${opt:vendors, self:custom.list}'), 'a,b,c')
  assert.is(await resolveValue('${opt:vendors, self:custom.list}', { options: { vendors: 'p,q' } }), 'p,q')
})

test('chained fallbacks reach the comma value intact', async () => {
  assert.is(await resolveValue(`\${env:${UNSET}, env:${UNSET}_2, self:custom.list}`), 'a,b,c')
})

test('spaces around the commas are kept', async () => {
  assert.is(await resolveValue(`\${env:${UNSET}, self:custom.spaced}`), 'a, b , c')
})

test('braces and quotes in a comma value stay literal', async () => {
  assert.is(await resolveValue(`\${env:${UNSET}, self:custom.braces}`), 'x{y},z')
  assert.is(await resolveValue(`\${env:${UNSET}, self:custom.quoted}`), "it's,here")
})

test('a comma value in composite text', async () => {
  assert.is(await resolveValue(`"vendors=\${env:${UNSET}, self:custom.list};"`), 'vendors=a,b,c;')
})

test('the comma value itself resolves unchanged without a fallback', async () => {
  assert.is(await resolveValue('${self:custom.list}'), 'a,b,c')
})

test('existing fallback-list syntax is unchanged', async () => {
  assert.is(await resolveValue(`\${env:${UNSET}, 'b,c'}`), 'b,c')
  assert.is(await resolveValue(`\${env:${UNSET}, self:custom.missing, 'd'}`), 'd')
  assert.is(await resolveValue(`\${env:${UNSET}, env:${UNSET}_2, 'e'}`), 'e')
})

test('isFallbackSlot: fallback positions of plain variables only, never function arguments', () => {
  assert.ok(isFallbackSlot('${env:X, ${self:y}}', '${self:y}', '${', '}'))
  assert.ok(isFallbackSlot('${env:X, env:Z, ${self:y}}', '${self:y}', '${', '}'))
  assert.not.ok(isFallbackSlot("${merge('a', ${self:y})}", '${self:y}', '${', '}'), 'function argument')
  assert.not.ok(isFallbackSlot('${self:obj.${self:k}}', '${self:k}', '${', '}'), 'key path, not a fallback')
  assert.not.ok(isFallbackSlot("${env:X, 'a,${self:y}'}", '${self:y}', '${', '}'), 'inside a quoted literal')
  assert.not.ok(isFallbackSlot('${self:y}', '${self:y}', '${', '}'))
})

test.run()
