/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { findLineByPath } = require('../../src/utils/paths/findLineForKey')

// --- YAML tests ---

test('YAML: finds top-level key', () => {
  const lines = [
    'name: test',
    'port: 3000',
  ]
  assert.is(findLineByPath('name', lines, '.yml'), 1)
  assert.is(findLineByPath('port', lines, '.yml'), 2)
})

test('YAML: finds nested key via path walk', () => {
  const lines = [
    'server:',
    '  host: localhost',
    '  port: 8080',
    'database:',
    '  host: db.local',
  ]
  assert.is(findLineByPath('server.host', lines, '.yml'), 2)
  assert.is(findLineByPath('server.port', lines, '.yml'), 3)
  assert.is(findLineByPath('database.host', lines, '.yml'), 5)
})

test('YAML: finds deeply nested key', () => {
  const lines = [
    'resources:',
    '  Parameters:',
    '    GitHubRestriction:',
    '      Description: something',
    '      Type: String',
  ]
  assert.is(findLineByPath('resources.Parameters.GitHubRestriction.Description', lines, '.yml'), 4)
  assert.is(findLineByPath('resources.Parameters.GitHubRestriction.Type', lines, '.yml'), 5)
})

test('YAML: distinguishes repeated key names at different nesting levels', () => {
  const lines = [
    'a:',
    '  name: first',
    'b:',
    '  name: second',
  ]
  assert.is(findLineByPath('a.name', lines, '.yml'), 2)
  assert.is(findLineByPath('b.name', lines, '.yml'), 4)
})

test('YAML: returns 0 for non-existent path', () => {
  const lines = [
    'name: test',
  ]
  assert.is(findLineByPath('missing', lines, '.yml'), 0)
  assert.is(findLineByPath('name.sub', lines, '.yml'), 0)
})

// --- JSON tests ---

test('JSON: finds top-level key', () => {
  const lines = [
    '{',
    '  "name": "test",',
    '  "port": 3000',
    '}',
  ]
  assert.is(findLineByPath('name', lines, '.json'), 2)
  assert.is(findLineByPath('port', lines, '.json'), 3)
})

test('JSON: finds nested key via path walk', () => {
  const lines = [
    '{',
    '  "server": {',
    '    "host": "localhost",',
    '    "port": 8080',
    '  },',
    '  "database": {',
    '    "host": "db.local"',
    '  }',
    '}',
  ]
  assert.is(findLineByPath('server.host', lines, '.json'), 3)
  assert.is(findLineByPath('server.port', lines, '.json'), 4)
  assert.is(findLineByPath('database.host', lines, '.json'), 7)
})

// --- Edge cases ---

test('returns 0 for non-YAML/JSON file types', () => {
  const lines = ['name = "test"']
  assert.is(findLineByPath('name', lines, '.toml'), 0)
  assert.is(findLineByPath('name', lines, '.js'), 0)
})

test('returns 0 for empty input', () => {
  assert.is(findLineByPath('', ['name: test'], '.yml'), 0)
  assert.is(findLineByPath('name', [], '.yml'), 0)
  assert.is(findLineByPath('name', null, '.yml'), 0)
})

test('YAML: handles .yaml extension', () => {
  const lines = ['name: test']
  assert.is(findLineByPath('name', lines, '.yaml'), 1)
})

test.run()
