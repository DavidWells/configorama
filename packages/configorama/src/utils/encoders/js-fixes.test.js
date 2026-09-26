/* Tests for encoding JSON objects into variable strings and decoding them back */
/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { encodeJsonForVariable, decodeJsonInVariable, parseEncodedJson, encodeJsonArgObjects } = require('./js-fixes')

test('encodeJsonForVariable - output has no braces and decodes back to the JSON text', () => {
  const encoded = encodeJsonForVariable({ a: 1, b: [1, 2] })
  assert.not.match(encoded, /[{}]/)
  assert.is(decodeJsonInVariable(encoded), '{"a":1,"b":[1,2]}')
})

test('decodeJsonInVariable - decodes encoded JSON inside surrounding text', () => {
  assert.is(decodeJsonInVariable(`x ${encodeJsonForVariable({ a: 1 })} y`), 'x {"a":1} y')
})

test('parseEncodedJson - a whole encoded value parses back to the object', () => {
  assert.equal(parseEncodedJson(encodeJsonForVariable({ k: 'v', n: 3 })), { k: 'v', n: 3 })
  assert.equal(parseEncodedJson(encodeJsonForVariable([1, 'a'])), [1, 'a'])
})

test('parseEncodedJson - anything else is returned unchanged', () => {
  const encoded = encodeJsonForVariable({ a: 1 })
  assert.is(parseEncodedJson(`x ${encoded}`), `x ${encoded}`)
  assert.is(parseEncodedJson('plain'), 'plain')
  assert.is(parseEncodedJson(5), 5)
  assert.is(parseEncodedJson('__JSON_B64__bm90IGpzb24=__'), '__JSON_B64__bm90IGpzb24=__')
})

test('encodeJsonArgObjects - encodes a JSON object passed as a call argument', () => {
  const out = encodeJsonArgObjects('${self:x | help({"a":1})}')
  assert.not.match(out.slice(2, -1), /[{}]/)
  assert.is(decodeJsonInVariable(out), '${self:x | help({"a":1})}')
})

test('encodeJsonArgObjects - braces inside a quoted string argument are not JSON', () => {
  assert.is(encodeJsonArgObjects('${eval("{" + "}")}'), '${eval("{" + "}")}')
  assert.is(encodeJsonArgObjects("${split('{a},{b}', ',')}"), "${split('{a},{b}', ',')}")
})

test('encodeJsonArgObjects - file() and text() paths are not JSON', () => {
  assert.is(encodeJsonArgObjects('${file(./br/{x}.json):k}'), '${file(./br/{x}.json):k}')
  assert.is(encodeJsonArgObjects('${text(./{x}.txt)}'), '${text(./{x}.txt)}')
})

test.run()
