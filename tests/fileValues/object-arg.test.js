/**
 * Tests for passing JSON objects as arguments to file() references
 */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const fs = require('fs')
const configorama = require('../../src')
const { encodeJsonForVariable } = require('../../src/utils/encoders/js-fixes')

const testDir = __dirname

test('file() with object as first argument should not crash', async () => {
  // Create a config that passes an encoded JSON object as the first arg
  const jsonArg = { key: 'value', number: 42 }
  const encodedJson = encodeJsonForVariable(jsonArg)

  const configContent = `testValue: \${file(./accepts-object-arg.js, ${encodedJson})}`
  const configPath = path.join(testDir, '_temp-object-arg-config.yml')
  fs.writeFileSync(configPath, configContent)

  try {
    const result = await configorama(configPath)

    assert.ok(result.testValue, 'Should have testValue')
    assert.is(result.testValue.type, 'object', 'First arg should be an object')
    assert.is(result.testValue.isObject, true, 'Should recognize as object')
    assert.equal(result.testValue.received, jsonArg, 'Should receive the original object')
  } finally {
    fs.unlinkSync(configPath)
  }
})

test.run()
