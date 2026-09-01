/* eslint-disable no-template-curly-in-string */
// Regression: an escaped quote inside a quoted filter argument (`append('it\'s')`) left the surrounding
// quotes in place — trimSurroundingQuotes' body pattern excluded the quote char entirely, so a body with
// an escaped quote never matched. Allow escaped quotes in the body and unescape that quote char.
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const append = (v, s) => String(v) + String(s)

test('an escaped single quote inside a single-quoted argument', async () => {
  const out = await configorama({ a: 'x', r: "${self:a | append('it\\'s')}" }, { options: {}, filters: { append } })
  assert.is(out.r, "xit's")
})

test('an escaped double quote inside a double-quoted argument', async () => {
  const out = await configorama({ a: 'x', r: '${self:a | append("a\\"b")}' }, { options: {}, filters: { append } })
  assert.is(out.r, 'xa"b')
})

test('a plain quoted argument is unaffected', async () => {
  const out = await configorama({ a: 'x', r: "${self:a | append('yz')}" }, { options: {}, filters: { append } })
  assert.is(out.r, 'xyz')
})

test.run()
