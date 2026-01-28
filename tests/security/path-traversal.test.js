/* Security tests for path traversal prevention */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

const dirname = __dirname

// ============================================
// Path traversal attack prevention
// These tests document the library's behavior with malicious paths
// ============================================

test('path traversal - relative path with ../ uses fallback when file not found', async () => {
  const object = {
    value: '${file(./config/../../../nonexistent.json):key, "fallback"}'
  }

  const config = await configorama(object, {
    configDir: dirname
  })

  // Should use fallback when file not found
  assert.is(config.value, 'fallback')
})

test('path traversal - encoded path characters use fallback', async () => {
  // %2e%2e is not decoded to .., so the literal path doesn't exist
  const config = await configorama({
    value: '${file(./%2e%2e/%2e%2e/nonexistent.json):key, "fallback"}'
  }, {
    configDir: dirname
  })
  assert.is(config.value, 'fallback')
})

test('path traversal - dynamic path with variable injection uses fallback', async () => {
  const object = {
    malicious: '../../../nonexistent',
    value: '${file(./${self:malicious}.json):key, "fallback"}'
  }

  const config = await configorama(object, {
    configDir: dirname
  })

  // Should use fallback when file doesn't exist
  assert.is(config.value, 'fallback')
})

// ============================================
// File permission edge cases
// ============================================

test('file permissions - directory instead of file throws error', async () => {
  // LIMITATION: reading a directory throws EISDIR, doesn't use fallback
  try {
    await configorama({
      value: '${file(./):key, "dir-fallback"}'
    }, {
      configDir: dirname
    })
    assert.unreachable('should throw')
  } catch (error) {
    // Reading directory throws EISDIR
    assert.ok(error.message.includes('EISDIR'))
  }
})

test('file permissions - non-existent deeply nested path uses fallback', async () => {
  const object = {
    value: '${file(./a/b/c/d/e/f/g/h/i/j/k/missing.json):key, "deep-fallback"}'
  }

  const config = await configorama(object, {
    configDir: dirname
  })

  assert.is(config.value, 'deep-fallback')
})

// ============================================
// Protocol/scheme handling
// ============================================

test('protocol - file:// scheme uses fallback', async () => {
  const object = {
    value: '${file(file:///nonexistent.json):key, "protocol-fallback"}'
  }

  const config = await configorama(object, {
    configDir: dirname
  })

  // file:// protocol treated as literal path, not found, uses fallback
  assert.is(config.value, 'protocol-fallback')
})

test('protocol - http:// scheme uses fallback', async () => {
  const object = {
    value: '${file(http://example.com/config.json):key, "http-fallback"}'
  }

  const config = await configorama(object, {
    configDir: dirname
  })

  // http:// shouldn't be fetched as a file
  assert.is(config.value, 'http-fallback')
})

// ============================================
// Symlink handling
// ============================================

test('symlink - fallback when symlink target missing', async () => {
  const object = {
    value: '${file(./broken-symlink.json):key, "symlink-fallback"}'
  }

  const config = await configorama(object, {
    configDir: dirname
  })

  assert.is(config.value, 'symlink-fallback')
})

// ============================================
// Absolute path handling
// ============================================

test('absolute path - non-existent uses fallback', async () => {
  const object = {
    value: '${file(/tmp/definitely-not-existing-12345.json):key, "abs-fallback"}'
  }

  const config = await configorama(object, {
    configDir: dirname
  })

  assert.is(config.value, 'abs-fallback')
})

test.run()
