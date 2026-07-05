const { test } = require('uvu')
const assert = require('uvu/assert')
const appendDeepVariable = require('./appendDeepVariable')

test('appendDeepVariable - should append property to variable', () => {
  const result = appendDeepVariable('${env:VAR}', 'subProp')
  assert.equal(result, '${env:VAR.subProp}')
})

test('appendDeepVariable - should handle nested property', () => {
  const result = appendDeepVariable('${self:config}', 'deep.nested.prop')
  assert.equal(result, '${self:config.deep.nested.prop}')
})

test('appendDeepVariable - should handle variable with existing properties', () => {
  const result = appendDeepVariable('${opt:stage.name}', 'region')
  assert.equal(result, '${opt:stage.name.region}')
})

test('appendDeepVariable - should handle simple variable reference', () => {
  const result = appendDeepVariable('${var}', 'prop')
  assert.equal(result, '${var.prop}')
})

test('appendDeepVariable - should handle property with numbers', () => {
  const result = appendDeepVariable('${obj}', 'prop123')
  assert.equal(result, '${obj.prop123}')
})

test('appendDeepVariable - should handle property with underscores', () => {
  const result = appendDeepVariable('${obj}', 'my_prop')
  assert.equal(result, '${obj.my_prop}')
})

test('appendDeepVariable - should handle property with hyphens', () => {
  const result = appendDeepVariable('${obj}', 'my-prop')
  assert.equal(result, '${obj.my-prop}')
})

// Run all tests
test.run()
