/**
 * Tests for getFullFilePath.js - file path resolution with findUp support
 */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const fs = require('fs')
const getFullPath = require('./getFullFilePath')
const { resolveFilePath, resolveFilePathFromMatch } = require('./getFullFilePath')

// ==========================================
// Test directory setup/teardown
// ==========================================

const testDir = path.join(__dirname, '_test-getFullFilePath')
const subDir = path.join(testDir, 'subdir')
const deepDir = path.join(subDir, 'deepdir')

test.before(() => {
  // Cleanup any existing test directory
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true })
  }

  // Create directory structure:
  // _test-getFullFilePath/
  //   config.yml         <- file at root
  //   subdir/
  //     local.yml        <- file in subdir
  //     deepdir/
  //       (empty - for testing findUp from here)
  fs.mkdirSync(testDir, { recursive: true })
  fs.mkdirSync(subDir, { recursive: true })
  fs.mkdirSync(deepDir, { recursive: true })

  // Create test files
  fs.writeFileSync(path.join(testDir, 'config.yml'), 'root: true')
  fs.writeFileSync(path.join(subDir, 'local.yml'), 'local: true')
})

test.after(() => {
  // Cleanup
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true })
  }
})

// ==========================================
// resolveFilePath - basic functionality
// ==========================================

test('resolveFilePath - returns file when it exists at computed path', () => {
  const result = resolveFilePath('./config.yml', testDir)
  assert.is(result, path.join(testDir, 'config.yml'))
})

test('resolveFilePath - handles absolute paths', () => {
  const absolutePath = path.join(testDir, 'config.yml')
  const result = resolveFilePath(absolutePath, '/some/other/path')
  assert.is(result, absolutePath)
})

test('resolveFilePath - returns computed path when file does not exist', () => {
  const result = resolveFilePath('./nonexistent.yml', testDir)
  assert.is(result, path.join(testDir, 'nonexistent.yml'))
})

// ==========================================
// resolveFilePath - findUp with "./" prefix
// ==========================================

test('resolveFilePath - with "./" prefix triggers findUp and finds file in parent directory', () => {
  // From deepDir, look for config.yml which is in testDir (grandparent)
  const result = resolveFilePath('./config.yml', deepDir)
  const expected = path.join(testDir, 'config.yml')
  assert.is(result, expected)
})

test('resolveFilePath - with "./" prefix finds file in immediate parent', () => {
  // From deepDir, look for local.yml which is in subDir (parent)
  const result = resolveFilePath('./local.yml', deepDir)
  const expected = path.join(subDir, 'local.yml')
  assert.is(result, expected)
})

// ==========================================
// resolveFilePath - findUp WITHOUT "./" prefix (bug fix tests)
// ==========================================

test('resolveFilePath - bare filename should also trigger findUp', () => {
  // From deepDir, look for config.yml (bare filename) which is in testDir
  const result = resolveFilePath('config.yml', deepDir)
  const expected = path.join(testDir, 'config.yml')
  assert.is(result, expected,
    `Bare filename should trigger findUp. Got ${result} instead of ${expected}`)
})

test('resolveFilePath - bare filename finds file in immediate parent', () => {
  // From deepDir, look for local.yml (bare filename) which is in subDir
  const result = resolveFilePath('local.yml', deepDir)
  const expected = path.join(subDir, 'local.yml')
  assert.is(result, expected)
})

test('resolveFilePath - relative path without ./ prefix triggers findUp', () => {
  // Path like "subdir/file.yml" should also trigger findUp if not found
  const result = resolveFilePath('config.yml', deepDir)
  const expected = path.join(testDir, 'config.yml')
  assert.is(result, expected)
})

test('resolveFilePath - preserves directory structure when using findUp', () => {
  // Create additional structure for this test:
  // _test-getFullFilePath/
  //   config.yml           <- WRONG file
  //   utils/
  //     config.yml         <- CORRECT file
  //   subdir/deepdir/      <- searching from here
  const utilsDir = path.join(testDir, 'utils')
  fs.mkdirSync(utilsDir, { recursive: true })
  fs.writeFileSync(path.join(utilsDir, 'config.yml'), 'correct: true')

  // From deepDir, request "utils/config.yml" - should find testDir/utils/config.yml
  const result = resolveFilePath('utils/config.yml', deepDir)
  const expected = path.join(utilsDir, 'config.yml')
  assert.is(result, expected,
    `Should preserve 'utils/' directory and find utils/config.yml, not root config.yml. Got ${result}`)
})

// ==========================================
// getFullPath - wrapper function
// ==========================================

test('getFullPath - resolves file path using cwd', () => {
  const result = getFullPath('./config.yml', testDir)
  assert.is(result, path.join(testDir, 'config.yml'))
})

test('getFullPath - expands ~ to home directory', () => {
  const os = require('os')
  const result = getFullPath('~/somefile.yml', testDir)
  assert.ok(result.startsWith(os.homedir()))
})

// ==========================================
// resolveFilePathFromMatch - file() syntax parsing
// ==========================================

const fileRefSyntax = /^file\((~?[@\{\}\:\$a-zA-Z0-9._\-\/,'" =+]+?)\)/g

test('resolveFilePathFromMatch - extracts path from file() syntax', () => {
  const result = resolveFilePathFromMatch('file(./config.yml)', fileRefSyntax, testDir)
  assert.is(result.relativePath, './config.yml')
  assert.is(result.fullFilePath, path.join(testDir, 'config.yml'))
})

test('resolveFilePathFromMatch - handles quoted paths', () => {
  const result = resolveFilePathFromMatch("file('./config.yml')", fileRefSyntax, testDir)
  assert.is(result.relativePath, './config.yml')
})

test('resolveFilePathFromMatch - handles bare filename in file() syntax', () => {
  // This tests the bug fix - bare filename should work with findUp
  const result = resolveFilePathFromMatch('file(config.yml)', fileRefSyntax, deepDir)
  const expected = path.join(testDir, 'config.yml')
  assert.is(result.fullFilePath, expected,
    `file(config.yml) should find file via findUp. Got ${result.fullFilePath}`)
})

test.run()
