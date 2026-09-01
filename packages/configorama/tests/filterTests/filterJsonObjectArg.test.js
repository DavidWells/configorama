/* eslint-disable no-template-curly-in-string */
// Regression: a JSON object literal as a filter argument (`merge({"k":"v"})`) never resolved — the object's
// `{ }` collide with the ${...} variable delimiters (the matcher's char class excludes braces), so the whole
// value was left unmatched. The object is base64-encoded at pre-process time so the variable matches, then
// decoded when the argument is parsed. A nested variable's own braces (${x}, #{x}) must NOT be encoded.
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const merge = (v, o) => JSON.stringify(Object.assign({ _v: v }, o))
const pick = (v, o, k) => o[k]

test('a JSON object as a filter argument resolves', async () => {
  const out = await configorama({ a: 'x', r: '${self:a | merge({"k":"v"})}' }, { options: {}, filters: { merge } })
  assert.is(out.r, '{"_v":"x","k":"v"}')
})

test('a multi-key JSON object argument', async () => {
  const out = await configorama({ a: 'x', r: '${self:a | merge({"k":"v","n":"m"})}' }, { options: {}, filters: { merge } })
  assert.is(out.r, '{"_v":"x","k":"v","n":"m"}')
})

test('a JSON object with a numeric value', async () => {
  const out = await configorama({ a: 'x', r: '${self:a | merge({"n":5})}' }, { options: {}, filters: { merge } })
  assert.is(out.r, '{"_v":"x","n":5}')
})

test('a JSON object argument alongside a string argument', async () => {
  const out = await configorama({ a: 'x', r: '${self:a | pick({"x":"1","y":"2"}, y)}' }, { options: {}, filters: { pick } })
  assert.is(out.r, '2')
})

test('a nested variable inside a file path is unaffected by object encoding', async () => {
  // ${opt:s} must resolve normally; its braces are not a JSON object. File is missing, so the fallback wins.
  const out = await configorama({ r: '${file(./nope.${opt:s}.json), "d"}' }, { options: { s: 'dev' } })
  assert.is(out.r, 'd')
})

test.run()
