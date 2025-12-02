const { test } = require('uvu')
const assert = require('uvu/assert')
const { getVariableType } = require('./getVariableType')

// Tests without variableTypes array (fallback mode)
test('getVariableType - should detect colon-based type', () => {
  const result = getVariableType('env:VAR')
  assert.equal(result, 'env')
})

test('getVariableType - should detect opt type', () => {
  const result = getVariableType('opt:stage')
  assert.equal(result, 'options')
})

test('getVariableType - should detect file type', () => {
  const result = getVariableType('file:path/to/file.txt')
  assert.equal(result, 'file')
})

test('getVariableType - should detect text type', () => {
  const result = getVariableType('text:some content')
  assert.equal(result, 'text')
})

test('getVariableType - should detect function type', () => {
  const result = getVariableType('md5(input)')
  assert.equal(result, 'function')
})

test('getVariableType - should return dot.prop for simple reference', () => {
  const result = getVariableType('simple.property')
  assert.equal(result, 'dot.prop')
})

test('getVariableType - should handle variable with ${} wrapper', () => {
  const result = getVariableType('${env:VAR}')
  assert.equal(result, 'env')
})

test('getVariableType - should handle custom type with colon', () => {
  const result = getVariableType('custom:value')
  assert.equal(result, 'custom')
})

test('getVariableType - should return dot.prop for no match', () => {
  const result = getVariableType('noMatch')
  assert.equal(result, 'dot.prop')
})

// Tests with variableTypes array
test('getVariableType - should match regex in variableTypes', () => {
  const variableTypes = [
    { match: /^env:/, type: 'environment' },
    { match: /^opt:/, type: 'option' }
  ]
  const result = getVariableType('env:VAR', variableTypes)
  assert.equal(result, 'environment')
})

test('getVariableType - should match function matcher', () => {
  const variableTypes = [
    {
      match: (str) => str.startsWith('custom:'),
      type: 'custom-type'
    }
  ]
  const result = getVariableType('custom:value', variableTypes)
  assert.equal(result, 'custom-type')
})

test('getVariableType - should fallback to dot.prop with variableTypes', () => {
  const variableTypes = [
    { match: /^env:/, type: 'environment' }
  ]
  const result = getVariableType('simple.prop', variableTypes)
  assert.equal(result, 'dot.prop')
})

test('getVariableType - should match first matching type', () => {
  const variableTypes = [
    { match: /^env:/, type: 'first' },
    { match: /^env:/, type: 'second' }
  ]
  const result = getVariableType('env:VAR', variableTypes)
  assert.equal(result, 'first')
})

test('getVariableType - should skip types without match property', () => {
  const variableTypes = [
    { type: 'no-match' },
    { match: /^env:/, type: 'env-type' }
  ]
  const result = getVariableType('env:VAR', variableTypes)
  assert.equal(result, 'env-type')
})

test('getVariableType - should handle regex with global flag', () => {
  const variableTypes = [
    { match: /^env:/g, type: 'environment' }
  ]
  const result1 = getVariableType('env:VAR1', variableTypes)
  const result2 = getVariableType('env:VAR2', variableTypes)
  assert.equal(result1, 'environment')
  assert.equal(result2, 'environment')
})

// Run all tests
test.run()
