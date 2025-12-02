const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const fs = require('fs')
const findUp = require('find-up')
const { resolveAlias, getAliases } = require('./resolveAlias')

// Mock config content
const mockConfig = {
  compilerOptions: {
    baseUrl: '.',
    paths: {
      '@components': ['src/components'],
      '@utils/*': ['src/utils/*'],
      '@shared/*': ['src/shared/*'],
      '@nested/foo/*': ['src/nested/foo/*'],
      '~zaz/*': ['src/zaz/*']
    }
  }
}

// Store original implementations
const originalReadFileSync = fs.readFileSync
const originalFindUpSync = findUp.sync

// Mock implementations
const mockFindUpSync = (filename) => {
  if (filename === 'tsconfig.json') {
    return '/project/tsconfig.json'
  }
  return null
}

const mockReadFileSync = () => JSON.stringify(mockConfig)

test.before.each(() => {
  // Reset mocks before each test
  findUp.sync = mockFindUpSync
  fs.readFileSync = mockReadFileSync
})

test.after(() => {
  // Restore original implementations
  fs.readFileSync = originalReadFileSync
  findUp.sync = originalFindUpSync
})

test('resolveAlias - exact match', () => {
  const result = resolveAlias('@components', '/project')
  assert.is(result, path.resolve('/project', 'src/components'))
})

test('resolveAlias - wildcard match', () => {
  const result = resolveAlias('@utils/helpers', '/project')
  assert.is(result, path.resolve('/project', 'src/utils/helpers'))
})

test('resolveAlias - nested alias', () => {
  const result = resolveAlias('@nested/foo/bar', '/project')
  assert.is(result, path.resolve('/project', 'src/nested/foo/bar'))
})

test('resolveAlias - special character alias', () => {
  const result = resolveAlias('~zaz/helpers', '/project')
  assert.is(result, path.resolve('/project', 'src/zaz/helpers'))
})

test('resolveAlias - no config file found', () => {
  findUp.sync = () => null
  const result = resolveAlias('@components', '/project')
  assert.is(result, '@components')
})

test('resolveAlias - no matching alias', () => {
  const result = resolveAlias('unknown/path', '/project')
  assert.is(result, 'unknown/path')
})

test('getAliases - returns correct alias information', () => {
  const result = getAliases('/project')
  assert.is(result.names.length, 5)
  assert.is(result.lookup.length, 5)
  
  // Check if all expected aliases are present
  const expectedNames = ['@components', '@utils', '@shared', '@nested/foo', '~zaz']
  expectedNames.forEach(name => {
    assert.ok(result.names.includes(name))
  })
})

test('getAliases - no config file found', () => {
  findUp.sync = () => null
  const result = getAliases('/project')
  assert.is(result.names.length, 0)
  assert.is(result.lookup.length, 0)
})

test.run() 