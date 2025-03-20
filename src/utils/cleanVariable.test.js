const { test } = require('uvu')
const assert = require('uvu/assert')
const cleanVariable = require('./cleanVariable')

test('cleanVariable - simple variable syntax without nesting', () => {
  // Setup
  const variableSyntax = /\${([^{}]+?)}/g
  const match = '${opt:foo}'
  
  // Execute
  const result = cleanVariable(match, variableSyntax, false, 'test')
  
  // Verify
  assert.is(result, 'opt:foo')
})

test.skip('cleanVariable - with nested variables', () => {
  // Setup
  const variableSyntax = /\${([^{}]+?)}/g
  const match = '${var:${opt:stage}}'
  const nestedVars = [
    { varString: 'var:__VAR_1__', fullMatch: '${opt:stage}' },
    { varString: 'opt:stage', fullMatch: '${opt:stage}' }
  ]
  
  // Execute
  const result = cleanVariable(match, variableSyntax, false, 'test')
  
  // Verify
  assert.is(result, 'var:${opt:stage}')
})

test('cleanVariable - file reference with commas', () => {
  // Setup
  const variableSyntax = /\${([^{}]+?)}/g
  const match = '${file(path/to/file.yml, key1, key2)}'
  
  // Execute
  const result = cleanVariable(match, variableSyntax, false, 'test')
  
  // Verify
  assert.is(result, 'file(path/to/file.yml, key1, key2)')
})

test('cleanVariable - function format', () => {
  // Setup
  const variableSyntax = /\${([^{}]+?)}/g
  const match = '${someFunc(param1, param2)}'
  
  // Execute
  const result = cleanVariable(match, variableSyntax, false, 'test')
  
  // Verify
  assert.is(result, 'someFunc(param1, param2)')
})

test('cleanVariable - simple mode', () => {
  // Setup
  const variableSyntax = /\${([^{}]+?)}/g
  const match = '${opt:foo with spaces}'
  
  // Execute
  const result = cleanVariable(match, variableSyntax, true, 'test')
  
  // Verify
  assert.is(result, 'opt:foo with spaces', 'Should preserve spaces in simple mode')
})

test('cleanVariable - whitespace handling outside quotes', () => {
  // Setup
  const variableSyntax = /\${([^{}]+?)}/g
  const match = '${empty, "fallback value with space"}'
  
  // Execute
  const result = cleanVariable(match, variableSyntax, false, 'test')
  
  // Verify
  assert.is(result, 'empty, "fallback value with space"')
})

test.skip('cleanVariable - complex nested variables', () => {
  // Setup
  const variableSyntax = /\${([^{}]+?)}/g
  const match = '${var:${opt:${stage}}}'
  const nestedVars = [
    { varString: 'var:__VAR_1__', fullMatch: '${opt:${stage}}' },
    { varString: 'opt:__VAR_2__', fullMatch: '${stage}' },
    { varString: 'stage', fullMatch: '${stage}' }
  ]
  
  // Execute
  const result = cleanVariable(match, variableSyntax, false, 'test')
  
  // Verify
  assert.is(result, 'var:${opt:${stage}}')
})

test.run() 