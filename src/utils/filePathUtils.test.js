// Tests for file path parsing and normalization utilities

const { test } = require('uvu')
const assert = require('uvu/assert')
const { normalizePath, extractFilePath, normalizeFileVariable, resolveInnerVariables } = require('./filePathUtils')

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

// resolveInnerVariables tests

const variableSyntax = /\$\{([^}]+)\}/g
const getProp = (obj, path) => path.split('.').reduce((o, k) => o && o[k], obj)

test('resolveInnerVariables - returns unchanged when no variables', () => {
  const result = resolveInnerVariables('./config.json', variableSyntax, {}, getProp)
  assert.is(result.resolved, './config.json')
  assert.is(result.didResolve, false)
})

test('resolveInnerVariables - resolves self: variables from config', () => {
  const config = { stage: 'prod' }
  const result = resolveInnerVariables('./database-${self:stage}.json', variableSyntax, config, getProp)
  assert.is(result.resolved, './database-prod.json')
  assert.is(result.didResolve, true)
})

test('resolveInnerVariables - resolves dot.prop style variables', () => {
  const config = { stage: 'dev' }
  const result = resolveInnerVariables('./database-${stage}.json', variableSyntax, config, getProp)
  assert.is(result.resolved, './database-dev.json')
  assert.is(result.didResolve, true)
})

test('resolveInnerVariables - resolves nested config paths', () => {
  const config = { provider: { stage: 'test' } }
  const result = resolveInnerVariables('./db-${self:provider.stage}.json', variableSyntax, config, getProp)
  assert.is(result.resolved, './db-test.json')
  assert.is(result.didResolve, true)
})

test('resolveInnerVariables - resolves multiple variables', () => {
  const config = { stage: 'prod', region: 'us-east-1' }
  const result = resolveInnerVariables('./config-${self:stage}-${self:region}.json', variableSyntax, config, getProp)
  assert.is(result.resolved, './config-prod-us-east-1.json')
  assert.is(result.didResolve, true)
})

test('resolveInnerVariables - does not resolve if config value is a variable', () => {
  const config = { stage: '${opt:stage}' }
  const result = resolveInnerVariables('./database-${self:stage}.json', variableSyntax, config, getProp)
  assert.is(result.resolved, './database-${self:stage}.json')
  assert.is(result.didResolve, false)
})

test('resolveInnerVariables - does not resolve if config value is undefined', () => {
  const config = {}
  const result = resolveInnerVariables('./database-${self:stage}.json', variableSyntax, config, getProp)
  assert.is(result.resolved, './database-${self:stage}.json')
  assert.is(result.didResolve, false)
})

test('resolveInnerVariables - does not resolve env: or opt: variables', () => {
  const config = { stage: 'prod' }
  const result = resolveInnerVariables('./database-${env:STAGE}.json', variableSyntax, config, getProp)
  assert.is(result.resolved, './database-${env:STAGE}.json')
  assert.is(result.didResolve, false)
})

test('resolveInnerVariables - partial resolution fails completely', () => {
  const config = { stage: 'prod' }
  const result = resolveInnerVariables('./config-${self:stage}-${env:REGION}.json', variableSyntax, config, getProp)
  assert.is(result.resolved, './config-${self:stage}-${env:REGION}.json')
  assert.is(result.didResolve, false)
})

test.run()
