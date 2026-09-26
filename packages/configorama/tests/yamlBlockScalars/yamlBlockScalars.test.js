/* Variables inside YAML block scalars (| > and variants) resolve without the flow-  */
/* collection quote-wrapping injecting literal quotes into the block's literal text. */
/* eslint-disable no-template-curly-in-string */
const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const fixture = path.join(__dirname, 'yamlBlockScalars.yml')

/** @type {Record<string, any>} */
let config

test('resolves fixture', async () => {
  config = await configorama(fixture, { configDir: __dirname, allowUnknownVars: true, options: {} })
  assert.type(config, 'object')
})

test('escaped quotes around var in literal block', () => {
  assert.is(config.escapedInBlock, '[ "\\"A/dev\\"" ]\n')
})

test('backslash before var in strip-chomped literal block', () => {
  assert.is(config.backslashInBlock, '[ \\dev ]')
})

test('bare var in folded block', () => {
  assert.is(config.bareInFolded, '[ dev ]')
})

test('indentation indicator block', () => {
  assert.is(config.indentIndicator, '  [ dev ]\n')
})

test('!Sub literal block: Fn::Sub body stays verbatim, no quotes injected', () => {
  const expected = '{"metrics": [ [ { "expression": "SEARCH(\'{\\"SaaSLayer/RBAC/${self:provider.stackName}\\",Path} M=\\"x\\"\', \'Sum\', 60)" } ] ], "region": "${AWS::Region}"}\n'
  assert.equal(config.subBody, { 'Fn::Sub': expected })
})

test('tagged (!Base64 |) literal block', () => {
  assert.equal(config.userData, { 'Fn::Base64': 'echo [ dev ]\n' })
})

test('"- |" sequence item block', () => {
  assert.equal(config.seq, ['[ dev ]\n'])
})

test('flow array after blocks still resolves bare var', () => {
  assert.equal(config.flowAfter, ['dev', 'b'])
})

test.run()
