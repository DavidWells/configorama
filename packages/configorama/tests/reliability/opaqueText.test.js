const { test } = require('uvu')
const assert = require('node:assert/strict')
const configorama = require('../../src')
const opaque = require('../../src/utils/encoders/opaque')
const encoders = require('../../src/utils/encoders/js-fixes')
const { cases } = require('./cases')
const markers = ['\uE001', '\uE000passthrough[_[eA==]_]', '__CFG_C123__', '__JSON_B64__eyJhIjoxfQ==__', '__CONFIGORAMA_FILTER_ARG__:MQ~', '__CFG_U_00000000000000000000000000000000_0__']
test('private character remains literal', cases['private-character'].run)
for (const text of markers) test(`literal text ${JSON.stringify(text)} survives both APIs and metadata`, async () => {
  for (const resolve of [configorama, configorama.sync]) {
    const output = await resolve({ literal: text, fromOption: '${opt:v}', fallback: '${opt:absent, ${opt:v}}', compose: 'a${opt:v}b', alias: '${self:literal}' }, { options: { v: text }, returnMetadata: true })
    assert.deepEqual(output.config, { literal: text, fromOption: text, fallback: text, compose: `a${text}b`, alias: text })
    assert.equal(output.originalConfig.literal, text)
  }
})
test('unknown passthrough changes only references owned by the load', async () => {
  const text = `${markers.join(' ')} \${foreign:k}`
  assert.equal((await configorama({ text }, { allowUnknownVars: true })).text, text)
})
test('tokens are authorized only in their own context', async () => {
  let token
  opaque.withContext(() => { token = encoders.encodeJsonForVariable({ a: 1 }); assert.equal(encoders.parseEncodedJson(token).a, 1) })
  assert.equal(encoders.parseEncodedJson(token), token)
  assert.equal((await configorama({ v: token })).v, token)
})
test('overlapping loads keep their own tokens', async () => {
  const values = await Promise.all(['one}', 'two{', markers[0]].map(text => configorama({ v: '${opt:none, ${opt:v}}' }, { options: { v: text }, returnMetadata: true })))
  assert.deepEqual(values.map(x => x.config.v), ['one}', 'two{', markers[0]])
})
test('shrunk malformed expression never leaks filter tokens (seed 20260928 path 38:6:5:6:4:4)', async () => {
  for (const resolve of [configorama, configorama.sync]) {
    const result = await resolve({ out: 'merge(${opt:v}${' }, { options: { v: 'a|b, c' } })
    assert.equal(result.out, 'merge(a|b, c${')
  }
})
test('shrunk lenient malformed expression never leaks nested tokens (seed -1046542700 path 222:2:6:4:5)', async () => {
  for (const resolve of [configorama, configorama.sync]) {
    const out = 'merge(${env:CONFIGORAMA_NO_SUCH_FUZZ_KEY}${'
    assert.equal((await resolve({ out }, { allowUnresolvedVariables: true, allowUnknownVars: true })).out, out)
  }
})
test.run()
