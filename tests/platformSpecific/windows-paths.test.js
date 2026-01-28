/* Windows path handling tests (cross-platform validation) */
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const dirname = __dirname

// ============================================
// LIMITATION: Backslash paths break function parsing
// The backslash character breaks the file() function regex
// ============================================

test('windows paths - backslash path uses fallback when file not found', async () => {
  const config = await configorama({
    ref: '${file(.\\config\\test.json):key, "fallback"}'
  }, {
    configDir: dirname
  })
  assert.is(config.ref, 'fallback')
})

// ============================================
// Forward slash paths work correctly
// ============================================

test('windows paths - drive letter with forward slashes uses fallback', async () => {
  const config = await configorama({
    ref: '${file(C:/Users/test/config.json):key, "drive-forward-fallback"}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'drive-forward-fallback')
})

test('windows paths - UNC path with forward slashes uses fallback', async () => {
  const config = await configorama({
    ref: '${file(//server/share/config.json):key, "unc-forward-fallback"}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'unc-forward-fallback')
})

// ============================================
// Very long paths
// ============================================

test('windows paths - path near MAX_PATH limit (260 chars)', async () => {
  const longDir = 'a'.repeat(200)
  const config = await configorama({
    ref: '${file(./' + longDir + '/config.json):key, "long-path-fallback"}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'long-path-fallback')
})

test('windows paths - path exceeding MAX_PATH (260+ chars)', async () => {
  const veryLongDir = 'a'.repeat(300)
  const config = await configorama({
    ref: '${file(./' + veryLongDir + '/config.json):key, "very-long-fallback"}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'very-long-fallback')
})

// ============================================
// Reserved Windows filenames
// ============================================

test('windows paths - CON reserved name uses fallback', async () => {
  const config = await configorama({
    ref: '${file(./CON):key, "reserved-fallback"}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'reserved-fallback')
})

test('windows paths - PRN reserved name uses fallback', async () => {
  const config = await configorama({
    ref: '${file(./PRN.json):key, "prn-fallback"}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'prn-fallback')
})

test('windows paths - AUX reserved name uses fallback', async () => {
  const config = await configorama({
    ref: '${file(./AUX.json):key, "aux-fallback"}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'aux-fallback')
})

test('windows paths - NUL reserved name uses fallback', async () => {
  const config = await configorama({
    ref: '${file(./NUL):key, "nul-fallback"}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'nul-fallback')
})

test('windows paths - COM1 reserved name uses fallback', async () => {
  const config = await configorama({
    ref: '${file(./COM1.json):key, "com1-fallback"}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'com1-fallback')
})

test('windows paths - LPT1 reserved name uses fallback', async () => {
  const config = await configorama({
    ref: '${file(./LPT1.json):key, "lpt1-fallback"}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'lpt1-fallback')
})

// ============================================
// Special characters in paths
// ============================================

test('windows paths - path with spaces uses fallback', async () => {
  const config = await configorama({
    ref: '${file(./My Documents/config.json):key, "spaces-fallback"}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'spaces-fallback')
})

// ============================================
// Path normalization
// ============================================

test('windows paths - redundant separators uses fallback', async () => {
  const config = await configorama({
    ref: '${file(.//config///test.json):key, "redundant-fallback"}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'redundant-fallback')
})

test('windows paths - dot segments uses fallback', async () => {
  const config = await configorama({
    ref: '${file(./config/./test/../other.json):key, "dots-fallback"}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'dots-fallback')
})

test.run()
