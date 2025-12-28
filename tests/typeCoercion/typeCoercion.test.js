/* Type coercion edge case tests */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

const dirname = __dirname

// ============================================
// String "true"/"false" vs boolean
// ============================================

test('type coercion - string "true" vs boolean true', async () => {
  const config = await configorama({
    stringTrue: 'true',
    boolTrue: true,
    refStringTrue: '${self:stringTrue}',
    refBoolTrue: '${self:boolTrue}'
  }, {
    configDir: dirname
  })

  assert.is(config.refStringTrue, 'true')
  assert.is(typeof config.refStringTrue, 'string')
  assert.is(config.refBoolTrue, true)
  assert.is(typeof config.refBoolTrue, 'boolean')
})

test('type coercion - string "false" vs boolean false', async () => {
  const config = await configorama({
    stringFalse: 'false',
    boolFalse: false,
    refStringFalse: '${self:stringFalse}',
    refBoolFalse: '${self:boolFalse}'
  }, {
    configDir: dirname
  })

  assert.is(config.refStringFalse, 'false')
  assert.is(typeof config.refStringFalse, 'string')
  assert.is(config.refBoolFalse, false)
  assert.is(typeof config.refBoolFalse, 'boolean')
})

test('type coercion - boolean standalone reference preserves type', async () => {
  const config = await configorama({
    flag: true,
    ref: '${self:flag}'
  }, {
    configDir: dirname
  })

  // Standalone reference preserves boolean
  assert.is(config.ref, true)
  assert.is(typeof config.ref, 'boolean')
})

// ============================================
// Number edge cases
// ============================================

test('type coercion - numeric string vs number', async () => {
  const config = await configorama({
    stringNum: '123',
    num: 123,
    refStringNum: '${self:stringNum}',
    refNum: '${self:num}'
  }, {
    configDir: dirname
  })

  assert.is(config.refStringNum, '123')
  assert.is(typeof config.refStringNum, 'string')
  assert.is(config.refNum, 123)
  assert.is(typeof config.refNum, 'number')
})

test('type coercion - zero as number vs string', async () => {
  const config = await configorama({
    zeroNum: 0,
    zeroStr: '0',
    refZeroNum: '${self:zeroNum}',
    refZeroStr: '${self:zeroStr}'
  }, {
    configDir: dirname
  })

  assert.is(config.refZeroNum, 0)
  assert.is(typeof config.refZeroNum, 'number')
  assert.is(config.refZeroStr, '0')
  assert.is(typeof config.refZeroStr, 'string')
})

test('type coercion - negative numbers', async () => {
  const config = await configorama({
    negative: -42,
    negativeStr: '-42',
    refNegative: '${self:negative}',
    refNegativeStr: '${self:negativeStr}'
  }, {
    configDir: dirname
  })

  assert.is(config.refNegative, -42)
  assert.is(typeof config.refNegative, 'number')
  assert.is(config.refNegativeStr, '-42')
})

test('type coercion - floating point numbers', async () => {
  const config = await configorama({
    float: 3.14159,
    floatStr: '3.14159',
    refFloat: '${self:float}',
    refFloatStr: '${self:floatStr}'
  }, {
    configDir: dirname
  })

  assert.is(config.refFloat, 3.14159)
  assert.is(typeof config.refFloat, 'number')
  assert.is(config.refFloatStr, '3.14159')
})

test('type coercion - scientific notation', async () => {
  const config = await configorama({
    scientific: 1e5,
    scientificStr: '1e5',
    refScientific: '${self:scientific}',
    refScientificStr: '${self:scientificStr}'
  }, {
    configDir: dirname
  })

  assert.is(config.refScientific, 100000)
  assert.is(config.refScientificStr, '1e5')
})

test('type coercion - Infinity handling', async () => {
  const config = await configorama({
    posInf: Infinity,
    negInf: -Infinity,
    refPosInf: '${self:posInf}',
    refNegInf: '${self:negInf}'
  }, {
    configDir: dirname
  })

  assert.is(config.refPosInf, Infinity)
  assert.is(config.refNegInf, -Infinity)
})

test('type coercion - NaN handling', async () => {
  const config = await configorama({
    nan: NaN,
    refNan: '${self:nan}'
  }, {
    configDir: dirname
  })

  assert.ok(Number.isNaN(config.refNan))
})

// ============================================
// Array index edge cases
// ============================================

test('type coercion - array index as string vs number', async () => {
  const config = await configorama({
    items: ['a', 'b', 'c'],
    refIndex0: '${self:items.0}',
    refIndex1: '${self:items.1}',
    refIndex2: '${self:items.2}'
  }, {
    configDir: dirname
  })

  assert.is(config.refIndex0, 'a')
  assert.is(config.refIndex1, 'b')
  assert.is(config.refIndex2, 'c')
})

test('type coercion - array index with leading zeros', async () => {
  const config = await configorama({
    items: ['a', 'b', 'c'],
    // 01 should still resolve to index 1
    refIndex01: '${self:items.01, "fallback"}'
  }, {
    configDir: dirname
  })

  // Leading zero - behavior may vary
  // Should either resolve to 'b' or use fallback
  assert.ok(config.refIndex01 === 'b' || config.refIndex01 === 'fallback')
})

test('type coercion - negative array index', async () => {
  const config = await configorama({
    items: ['a', 'b', 'c'],
    refNegative: '${self:items.-1, "neg-fallback"}'
  }, {
    configDir: dirname
  })

  // Negative indices aren't supported, should use fallback
  assert.is(config.refNegative, 'neg-fallback')
})

test('type coercion - float as array index', async () => {
  const config = await configorama({
    items: ['a', 'b', 'c'],
    refFloat: '${self:items.1.5, "float-fallback"}'
  }, {
    configDir: dirname
  })

  // Float indices shouldn't work on arrays
  assert.is(config.refFloat, 'float-fallback')
})

test('type coercion - very large array index', async () => {
  const config = await configorama({
    items: ['a', 'b', 'c'],
    refLarge: '${self:items.999999, "large-fallback"}'
  }, {
    configDir: dirname
  })

  assert.is(config.refLarge, 'large-fallback')
})

test('type coercion - string index on array', async () => {
  const config = await configorama({
    items: ['a', 'b', 'c'],
    refString: '${self:items.notanumber, "string-fallback"}'
  }, {
    configDir: dirname
  })

  assert.is(config.refString, 'string-fallback')
})

// ============================================
// Null/undefined handling
// ============================================

test('type coercion - null in intermediate path throws', async () => {
  // LIMITATION: accessing nested property on null throws instead of using fallback
  try {
    await configorama({
      obj: {
        nullValue: null
      },
      refThrough: '${self:obj.nullValue.nested, "null-path-fallback"}'
    }, {
      configDir: dirname
    })
    assert.unreachable('should throw when accessing property on null')
  } catch (error) {
    assert.ok(error.message.includes('Cannot read properties of null'))
  }
})

test('type coercion - explicit null vs missing key', async () => {
  const config = await configorama({
    explicitNull: null,
    refNull: '${self:explicitNull, "null-fallback"}',
    refMissing: '${self:missingKey, "missing-fallback"}'
  }, {
    configDir: dirname,
    allowUndefinedValues: true
  })

  // Both null and missing should trigger fallback
  assert.is(config.refNull, 'null-fallback')
  assert.is(config.refMissing, 'missing-fallback')
})

test('type coercion - undefined vs null vs empty string', async () => {
  const config = await configorama({
    emptyStr: '',
    nullVal: null,
    // undefined doesn't serialize in objects
    refEmpty: '${self:emptyStr, "empty-fallback"}',
    refNull: '${self:nullVal, "null-fallback"}'
  }, {
    configDir: dirname,
    allowUndefinedValues: true
  })

  // Empty string is valid, should NOT use fallback
  assert.is(config.refEmpty, '')
  // Null triggers fallback
  assert.is(config.refNull, 'null-fallback')
})

// ============================================
// Object/array type preservation
// ============================================

test('type coercion - object reference preserves structure', async () => {
  const config = await configorama({
    source: {
      nested: {
        value: 123
      }
    },
    ref: '${self:source}'
  }, {
    configDir: dirname
  })

  assert.equal(config.ref, { nested: { value: 123 } })
  assert.is(typeof config.ref, 'object')
})

test('type coercion - array reference preserves type', async () => {
  const config = await configorama({
    source: [1, 2, 3],
    ref: '${self:source}'
  }, {
    configDir: dirname
  })

  assert.equal(config.ref, [1, 2, 3])
  assert.ok(Array.isArray(config.ref))
})

test('type coercion - mixed array preserves element types', async () => {
  const config = await configorama({
    mixed: [1, 'two', true, null, { key: 'value' }],
    ref: '${self:mixed}'
  }, {
    configDir: dirname
  })

  assert.equal(config.ref, [1, 'two', true, null, { key: 'value' }])
  assert.is(typeof config.ref[0], 'number')
  assert.is(typeof config.ref[1], 'string')
  assert.is(typeof config.ref[2], 'boolean')
  assert.is(config.ref[3], null)
  assert.is(typeof config.ref[4], 'object')
})

// ============================================
// Sparse array handling
// ============================================

test('type coercion - sparse array with undefined elements', async () => {
  const sparse = [1, , , 4] // eslint-disable-line no-sparse-arrays
  const config = await configorama({
    sparse: sparse,
    ref0: '${self:sparse.0}',
    ref1: '${self:sparse.1, "sparse-fallback"}',
    ref3: '${self:sparse.3}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref0, 1)
  assert.is(config.ref1, 'sparse-fallback')
  assert.is(config.ref3, 4)
})

// ============================================
// Edge cases with falsey values
// ============================================

test('type coercion - all falsey values in fallback chain', async () => {
  const config = await configorama({
    zero: 0,
    emptyStr: '',
    boolFalse: false,
    // These are valid values, NOT triggers for fallback
    refZero: '${self:zero, 999}',
    refEmpty: '${self:emptyStr, "should-not-see"}',
    refFalse: '${self:boolFalse, true}'
  }, {
    configDir: dirname
  })

  // Falsey but defined values should NOT use fallback
  assert.is(config.refZero, 0)
  assert.is(config.refEmpty, '')
  assert.is(config.refFalse, false)
})

// ============================================
// Type preservation in string interpolation
// ============================================

test('type coercion - number in string interpolation', async () => {
  const config = await configorama({
    port: 8080,
    url: 'http://localhost:${self:port}/api'
  }, {
    configDir: dirname
  })

  assert.is(config.url, 'http://localhost:8080/api')
  assert.is(typeof config.url, 'string')
})

test('type coercion - multiple string and number types in one string', async () => {
  const config = await configorama({
    host: 'localhost',
    port: 3000,
    combined: '${self:host}:${self:port}/api'
  }, {
    configDir: dirname
  })

  assert.is(config.combined, 'localhost:3000/api')
})

test.run()
