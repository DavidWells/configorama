/* YAML preprocessing edge cases: flow collections, CloudFormation dynamic references, */
/* and line endings resolve to what the YAML means, via both async and sync APIs.     */
/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { resolveYamlText: resolveYaml } = require('../utils')

// ==========================================
// CloudFormation dynamic references ({{resolve:...}})
// ==========================================

test('dynamic references with regex-special chars keep their own text', async () => {
  const config = await resolveYaml(`obj: { a: 1 }
v: {{resolve:ssm:/my.param}}
w: {{resolve:ssm:/myXparam}}
x: {{resolve:ssm:/p+x}}
y: {{resolve:ssm:/ppx}}
z: {{resolve:ssm:/a$b}}
`)
  assert.is(config.v, '{{resolve:ssm:/my.param}}')
  assert.is(config.w, '{{resolve:ssm:/myXparam}}')
  assert.is(config.x, '{{resolve:ssm:/p+x}}')
  assert.is(config.y, '{{resolve:ssm:/ppx}}')
  assert.is(config.z, '{{resolve:ssm:/a$b}}')
})

test('dynamic reference on the last line without a trailing newline', async () => {
  const config = await resolveYaml('obj: { a: 1 }\nv: {{resolve:ssm:/p}}')
  assert.is(config.v, '{{resolve:ssm:/p}}')
})

test('dynamic reference without any key: { line in the file', async () => {
  const config = await resolveYaml('v: {{resolve:ssm:/p}}\n')
  assert.is(config.v, '{{resolve:ssm:/p}}')
})

test('already-quoted dynamic references are unchanged', async () => {
  const config = await resolveYaml(`obj: { a: 1 }
v: "{{resolve:ssm:/p}}"
w: '{{resolve:ssm:/q}}'
`)
  assert.is(config.v, '{{resolve:ssm:/p}}')
  assert.is(config.w, '{{resolve:ssm:/q}}')
})

// ==========================================
// CRLF line endings
// ==========================================

test('CRLF: block scalar content keeps its literal text', async () => {
  const config = await resolveYaml('stage: dev\r\nv: |\r\n  [ ${self:stage} ]\r\n  { a: ${self:stage} }\r\nobj: { a: 1 }\r\n')
  assert.is(config.v, '[ dev ]\n{ a: dev }\n')
  assert.equal(config.obj, { a: 1 })
})

test('CRLF: flow collections still get bare vars wrapped', async () => {
  const config = await resolveYaml('stage: dev\r\narr: [ ${self:stage}, b ]\r\nobj: { a: ${self:stage} }\r\n')
  assert.equal(config.arr, ['dev', 'b'])
  assert.equal(config.obj, { a: 'dev' })
})

// ==========================================
// Flow mappings in every value position
// ==========================================

test('flow mapping after an anchor', async () => {
  const config = await resolveYaml('stage: dev\nbase: &b { a: ${self:stage} }\n')
  assert.equal(config.base, { a: 'dev' })
})

test('flow mapping after a tag', async () => {
  const config = await resolveYaml('stage: dev\nbase: !!map { a: ${self:stage} }\n')
  assert.equal(config.base, { a: 'dev' })
})

test('flow mapping under a quoted key', async () => {
  const config = await resolveYaml('stage: dev\n"k": { a: ${self:stage} }\n')
  assert.equal(config.k, { a: 'dev' })
})

test('flow mapping as a sequence item', async () => {
  const config = await resolveYaml('stage: dev\nlist:\n  - { a: ${self:stage} }\n')
  assert.equal(config.list, [{ a: 'dev' }])
})

test('top-level flow mapping', async () => {
  const config = await resolveYaml('{ stage: dev, a: ${self:stage} }\n')
  assert.equal(config, { stage: 'dev', a: 'dev' })
})

// ==========================================
// Nested sequences and brackets inside quoted flow entries
// ==========================================

test('var next to a nested sequence', async () => {
  const config = await resolveYaml(`stage: dev
a: [ [], \${self:stage} ]
b: [ [ x ], \${self:stage} ]
c: [ \${self:stage}, [ x ] ]
d: [ [ \${self:stage}, [ \${self:stage} ] ] ]
`)
  assert.equal(config.a, [[], 'dev'])
  assert.equal(config.b, [['x'], 'dev'])
  assert.equal(config.c, ['dev', ['x']])
  assert.equal(config.d, [['dev', ['dev']]])
})

test('brackets and braces inside quoted flow entries', async () => {
  const config = await resolveYaml(`stage: dev
a: [ 'a]b', \${self:stage} ]
b: [ "a[b", \${self:stage} ]
c: { a: "}", b: \${self:stage} }
d: { a: "{", b: \${self:stage} }
e: { a: '{}', b: [ ']', \${self:stage} ] }
`)
  assert.equal(config.a, ['a]b', 'dev'])
  assert.equal(config.b, ['a[b', 'dev'])
  assert.equal(config.c, { a: '}', b: 'dev' })
  assert.equal(config.d, { a: '{', b: 'dev' })
  assert.equal(config.e, { a: '{}', b: [']', 'dev'] })
})

test('quoted flow entry with a bracket spanning lines', async () => {
  const config = await resolveYaml(`stage: dev
a: [ 'x [
  y', \${self:stage} ]
`)
  assert.equal(config.a, ['x [ y', 'dev'])
})

test('comments and apostrophes inside a multi-line flow sequence', async () => {
  const config = await resolveYaml(`stage: dev
a: [
  \${self:stage}, # a comment with ] and [ and \${self:stage}
  it's,
  { b: \${self:stage} }
]
`)
  assert.equal(config.a, ['dev', "it's", { b: 'dev' }])
})

test('unclosed bracket in a plain scalar does not swallow later flow collections', async () => {
  const config = await resolveYaml(`stage: dev
note: see [docs
arr: [ \${self:stage} ]
`)
  assert.is(config.note, 'see [docs')
  assert.equal(config.arr, ['dev'])
})

test('dynamic references inside flow collections', async () => {
  const config = await resolveYaml(`stage: dev
a: [ {{resolve:ssm:/p}}, \${self:stage} ]
b: { k: {{resolve:ssm:/q}}, v: \${self:stage} }
`)
  assert.equal(config.a, ['{{resolve:ssm:/p}}', 'dev'])
  assert.equal(config.b, { k: '{{resolve:ssm:/q}}', v: 'dev' })
})

test.run()
