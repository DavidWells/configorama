/**
 * Test self: references to falsy values in nested files
 * 
 * Bug fix: When a ${self:...} reference in a nested file (loaded via ${file(...)})
 * pointed to a falsy value (0, false, "", null) in that same nested file, the resolver
 * incorrectly fell back to looking up the property in the parent config instead.
 * 
 * The fix ensures nested file context is checked first, and uses dotProp.has()
 * to properly distinguish between non-existent properties and falsy values.
 */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const { deepLog, createTrackingProxy, checkUnusedConfigValues } = require('../utils')

let config

// Setup function
const setup = async () => {
  try {
    const configFile = path.join(__dirname, 'selfRefInNestedFiles.yml')
    config = await configorama(configFile, {
      options: {}
    })

    config = createTrackingProxy(config)
    console.log(`-------------`)
    console.log(`Value count`, Object.keys(config).length)
    console.log('config', config)
    console.log('config.nested:', config.nested)
    console.log('config.nestedYml:', config.nestedYml)
    console.log(`-------------`)
  } catch (err) {
    console.error(`TEST ERROR ${__dirname}\n`, err)
    process.exit(1)
  }
}

// Teardown function
const teardown = () => {
  checkUnusedConfigValues(config)
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

// ==========================================
// JSON nested file tests
// ==========================================

test('nested JSON: zero (0) should resolve from nested file, not parent', () => {
  assert.is(config.nested.zero, 0)
})

test('nested JSON: ${self:zero} should resolve to 0 from nested file', () => {
  assert.is(config.nested.refZero, 0)
})

test('nested JSON: falseBool (false) should resolve from nested file, not parent', () => {
  assert.is(config.nested.falseBool, false)
})

test('nested JSON: ${self:falseBool} should resolve to false from nested file', () => {
  assert.is(config.nested.refFalseBool, false)
})

test('nested JSON: emptyString ("") should resolve from nested file, not parent', () => {
  assert.is(config.nested.emptyString, '')
})

test('nested JSON: ${self:emptyString} should resolve to "" from nested file', () => {
  assert.is(config.nested.refEmptyString, '')
})

test('nested JSON: truthyValue should resolve from nested file', () => {
  assert.is(config.nested.truthyValue, 'I exist')
})

test('nested JSON: ${self:truthyValue} should resolve to truthy value from nested file', () => {
  assert.is(config.nested.refTruthyValue, 'I exist')
})

test('nested JSON: parentValueNoChild should resolve from nested file from its parent', () => {
  assert.is(config.nested.jsonParentValueNoChild, 'PARENT_VALUE_HERE_BECAUSE_NO_CHILD_SELF_REF')
})

// ==========================================
// YAML nested file tests (using unique property names)
// ==========================================

test('nested YAML: ymlZero (0) should resolve from nested file, not parent', () => {
  assert.is(config.nestedYml.ymlZero, 0)
})

test('nested YAML: ${self:ymlZero} should resolve to 0 from nested file', () => {
  assert.is(config.nestedYml.ymlRefZero, 0)
})

test('nested YAML: ymlFalseBool (false) should resolve from nested file, not parent', () => {
  assert.is(config.nestedYml.ymlFalseBool, false)
})

test('nested YAML: ${self:ymlFalseBool} should resolve to false from nested file', () => {
  assert.is(config.nestedYml.ymlRefFalseBool, false)
})

test('nested YAML: ymlEmptyString ("") should resolve from nested file, not parent', () => {
  assert.is(config.nestedYml.ymlEmptyString, '')
})

test('nested YAML: ${self:ymlEmptyString} should resolve to "" from nested file', () => {
  assert.is(config.nestedYml.ymlRefEmptyString, '')
})

test('nested YAML: ymlTruthyValue should resolve from nested file', () => {
  assert.is(config.nestedYml.ymlTruthyValue, 'I exist in YML')
})

test('nested YAML: ${self:ymlTruthyValue} should resolve to truthy value from nested file', () => {
  assert.is(config.nestedYml.ymlRefTruthyValue, 'I exist in YML')
})

test('nested YAML: ymlRefTruthyValue should resolve from nested file from its parent', () => {
  assert.is(config.nestedYml.ymlParentValueNoChild, 'PARENT_VALUE_HERE_BECAUSE_NO_CHILD_SELF_REF')
})

// ==========================================
// Parent config should be unchanged
// ==========================================

test('parent: zero should still be PARENT_ZERO', () => {
  assert.is(config.zero, 'PARENT_ZERO')
})

test('parent: falseBool should still be PARENT_FALSE', () => {
  assert.is(config.falseBool, 'PARENT_FALSE')
})

test('parent: emptyString should still be PARENT_EMPTY', () => {
  assert.is(config.emptyString, 'PARENT_EMPTY')
})

test('parent: truthyValue should still be PARENT_TRUTHY', () => {
  assert.is(config.truthyValue, 'PARENT_TRUTHY')
})

// Note: null values are not tested here as they have separate handling
// related to allowUndefinedValues setting

test.run()
