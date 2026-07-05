/* Tests for content-based config format detection */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { detectFormat, isFlatKeyValue } = require('./detectFormat')

/* JSON */
test('detects JSON object and array', () => {
  assert.is(detectFormat('{\n  "a": 1\n}'), '.json')
  assert.is(detectFormat('[\n  {"a": 1}\n]'), '.json')
})

/* TOML — structural markers win */
test('detects TOML by section headers and leading multiline string', () => {
  assert.is(detectFormat('[server.settings]\nname = "test"\nport = 3000'), '.toml')
  assert.is(detectFormat('[[items]]\nname = "a"'), '.toml')
  assert.is(detectFormat('"""\nmulti\n"""'), '.toml')
})

/* YAML */
test('detects YAML by document marker and mappings', () => {
  assert.is(detectFormat('---\nname: test'), '.yml')
  assert.is(detectFormat('name: test\nport: 3000'), '.yml')
})

test('YAML with template values still detects as YAML', () => {
  assert.is(detectFormat("name: ${env:APP_NAME, 'x'}\nport: 3000"), '.yml')
})

/* HCL */
test('detects terraform/HCL by keyword', () => {
  assert.is(detectFormat('variable "region" {\n  default = "us-east-1"\n}'), '.tf')
})

/* dotenv — flat key=value shape */
test('detects flat key=value (no space) as dotenv', () => {
  assert.is(detectFormat('FOO=bar\nBAZ=qux'), '.env')
})

test('detects key=value with template values as dotenv (syntax-agnostic)', () => {
  assert.is(detectFormat('stage=${option:stage}\nDB=${op:x}'), '.env')
  // custom variable syntax must not change detection
  assert.is(detectFormat('stage=$[option:stage]\nDB=$[op:x]'), '.env')
})

test('detects dotenv with comments and export prefixes', () => {
  assert.is(detectFormat('# comment\nexport TOKEN=abc\nURL=postgres://h/db;sslmode=require'), '.env')
})

test('a single non-assignment line disqualifies dotenv detection', () => {
  // has a YAML mapping mixed in -> not flat key=value -> YAML default
  assert.is(detectFormat('FOO=bar\nname: test'), '.yml')
})

test('empty or comment-only content is not dotenv', () => {
  assert.is(detectFormat('# just a comment\n'), '.yml')
  assert.is(detectFormat(''), '.yml')
})

/* isFlatKeyValue unit */
test('isFlatKeyValue recognizes assignment lines only', () => {
  assert.is(isFlatKeyValue('A=1\nB=2'), true)
  assert.is(isFlatKeyValue('export A=1\n# c\nB=2'), true)
  assert.is(isFlatKeyValue('A=1\nplain text line'), false)
  assert.is(isFlatKeyValue('name: value'), false)
  assert.is(isFlatKeyValue(''), false)
})

test.run()
