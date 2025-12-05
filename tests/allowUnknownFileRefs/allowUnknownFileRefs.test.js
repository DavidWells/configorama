/**
 * Tests for allowUnknownFileRefs option - preserves unresolvable file refs as-is
 */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

const configFile = path.join(__dirname, 'config.yml')

test('real file refs still resolve normally', async () => {
  const result = await configorama(configFile, {
    allowUnknownFileRefs: true
  })

  assert.equal(result.realFile, {
    value: 'from-real-file',
    nested: { key: 'nested-value' }
  })
})

test('missing file refs pass through as variable string', async () => {
  const result = await configorama(configFile, {
    allowUnknownFileRefs: true
  })

  // Variable string is preserved for downstream processing
  assert.equal(result.missingFile, '${file(./missing.yml)}')
})

test('missing file refs with fallback preserve entire expression', async () => {
  const result = await configorama(configFile, {
    allowUnknownFileRefs: true
  })

  // The whole expression including fallback is preserved
  assert.ok(result.missingWithFallback.includes('file(./missing.yml)'))
})

test('missing file refs with dynamic path resolve inner vars first', async () => {
  const result = await configorama(configFile, {
    allowUnknownFileRefs: true
  })

  // Inner variable ${self:stage} resolves to 'dev', then file ref passes through
  assert.equal(result.missingDynamic, '${file(./missing.dev.yml)}')
})

test('missing file refs with dynamic path and fallback preserve expression', async () => {
  const result = await configorama(configFile, {
    allowUnknownFileRefs: true
  })

  // Inner var resolves, outer file ref with fallback passes through
  assert.ok(result.missingDynamicWithFallback.includes('file(./missing.dev.yml)'))
})

test('static values pass through unchanged', async () => {
  const result = await configorama(configFile, {
    allowUnknownFileRefs: true
  })

  assert.equal(result.foo, 'bar')
  assert.equal(result.stage, 'dev')
})

test.run()
