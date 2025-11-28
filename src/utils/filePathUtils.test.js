// Tests for file path parsing and normalization utilities

const { test } = require('uvu')
const assert = require('uvu/assert')
const { normalizePath, extractFilePath, normalizeFileVariable } = require('./filePathUtils')

// normalizePath tests

test('normalizePath - returns null for deep: references', () => {
  assert.is(normalizePath('deep:1'), null)
  assert.is(normalizePath('some/deep:path'), null)
})

test('normalizePath - adds ./ prefix to bare paths', () => {
  assert.is(normalizePath('config.json'), './config.json')
  assert.is(normalizePath('path/to/file.yml'), './path/to/file.yml')
})

test('normalizePath - keeps ./ paths unchanged', () => {
  assert.is(normalizePath('./config.json'), './config.json')
  assert.is(normalizePath('./path/to/file.yml'), './path/to/file.yml')
})

test('normalizePath - keeps ../ paths unchanged', () => {
  assert.is(normalizePath('../config.json'), '../config.json')
  assert.is(normalizePath('../../path/to/file.yml'), '../../path/to/file.yml')
})

test('normalizePath - keeps absolute paths unchanged', () => {
  assert.is(normalizePath('/etc/config.json'), '/etc/config.json')
  assert.is(normalizePath('/home/user/file.yml'), '/home/user/file.yml')
})

test('normalizePath - keeps ~ paths unchanged', () => {
  assert.is(normalizePath('~/config.json'), '~/config.json')
  assert.is(normalizePath('~/.config/file.yml'), '~/.config/file.yml')
})

test('normalizePath - fixes .// to ./', () => {
  assert.is(normalizePath('.//config.json'), './config.json')
  assert.is(normalizePath('.//path/to/file.yml'), './path/to/file.yml')
})

// extractFilePath tests

test('extractFilePath - extracts path from file(...) format', () => {
  const result = extractFilePath('file(./config.json)')
  assert.is(result.filePath, './config.json')
})

test('extractFilePath - extracts path from ${file(...)} format', () => {
  const result = extractFilePath('${file(./config.json)}')
  assert.is(result.filePath, './config.json')
})

test('extractFilePath - extracts path from text(...) format', () => {
  const result = extractFilePath('text(./readme.txt)')
  assert.is(result.filePath, './readme.txt')
})

test('extractFilePath - extracts path from ${text(...)} format', () => {
  const result = extractFilePath('${text(./readme.txt)}')
  assert.is(result.filePath, './readme.txt')
})

test('extractFilePath - handles single-quoted paths', () => {
  const result = extractFilePath("file('./config.json')")
  assert.is(result.filePath, './config.json')
})

test('extractFilePath - handles double-quoted paths', () => {
  const result = extractFilePath('file("./config.json")')
  assert.is(result.filePath, './config.json')
})

test('extractFilePath - extracts first path when fallback present', () => {
  const result = extractFilePath("file(./env.yml, 'default')")
  assert.is(result.filePath, './env.yml')
})

test('extractFilePath - handles path with key accessor', () => {
  const result = extractFilePath('file(./env.yml):FOO')
  assert.is(result.filePath, './env.yml')
})

test('extractFilePath - handles complex fallback with key accessor', () => {
  const result = extractFilePath("file(./env.yml):SECRET, 'default-value'")
  assert.is(result.filePath, './env.yml')
})

test('extractFilePath - returns null for non-file patterns', () => {
  assert.is(extractFilePath('opt:stage'), null)
  assert.is(extractFilePath('${self:provider.stage}'), null)
  assert.is(extractFilePath('env:FOO'), null)
})

test('extractFilePath - returns null for empty input', () => {
  assert.is(extractFilePath(''), null)
})

test('extractFilePath - handles bare filename', () => {
  const result = extractFilePath('file(config.json)')
  assert.is(result.filePath, 'config.json')
})

// normalizeFileVariable tests

test('normalizeFileVariable - returns non-file strings unchanged', () => {
  assert.is(normalizeFileVariable('opt:stage'), 'opt:stage')
  assert.is(normalizeFileVariable('self:provider.stage'), 'self:provider.stage')
})

test('normalizeFileVariable - normalizes bare path in file()', () => {
  assert.is(normalizeFileVariable('file(config.json)'), 'file(./config.json)')
})

test('normalizeFileVariable - normalizes bare path in text()', () => {
  assert.is(normalizeFileVariable('text(readme.txt)'), 'text(./readme.txt)')
})

test('normalizeFileVariable - strips key accessor', () => {
  assert.is(normalizeFileVariable('file(./env.yml):FOO'), 'file(./env.yml)')
  assert.is(normalizeFileVariable('file(./config.json):nested.value'), 'file(./config.json)')
})

test('normalizeFileVariable - strips key accessor with array notation', () => {
  assert.is(normalizeFileVariable('file(./data.json):items[0]'), 'file(./data.json)')
})

test('normalizeFileVariable - removes quotes from path', () => {
  assert.is(normalizeFileVariable("file('./config.json')"), 'file(./config.json)')
  assert.is(normalizeFileVariable('file("./config.json")'), 'file(./config.json)')
})

test('normalizeFileVariable - handles combined normalization', () => {
  assert.is(normalizeFileVariable("file('config.json'):key"), 'file(./config.json)')
})

test('normalizeFileVariable - keeps ./ paths unchanged', () => {
  assert.is(normalizeFileVariable('file(./already-normalized.yml)'), 'file(./already-normalized.yml)')
})

test('normalizeFileVariable - keeps ../ paths unchanged', () => {
  assert.is(normalizeFileVariable('file(../parent/config.yml)'), 'file(../parent/config.yml)')
})

test.run()
