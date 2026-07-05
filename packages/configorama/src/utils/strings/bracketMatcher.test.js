const { test } = require('uvu')
const assert = require('uvu/assert')
const {
  findOutermostBraces,
  findOutermostBracesDepthFirst,
  findOutermostVariables
} = require('./bracketMatcher')

// Tests for findOutermostBraces
test('findOutermostBraces - should find simple braces', () => {
  const result = findOutermostBraces('text {content} more')
  assert.equal(result, ['{content}'])
})

test('findOutermostBraces - should find multiple brace pairs', () => {
  const result = findOutermostBraces('{first} and {second}')
  assert.equal(result, ['{first}', '{second}'])
})

test('findOutermostBraces - should handle nested braces', () => {
  const result = findOutermostBraces('{outer {inner} content}')
  assert.equal(result, ['{outer {inner} content}'])
})

test('findOutermostBraces - should find with prefix', () => {
  const result = findOutermostBraces('text ${variable} more', '{', '}', '$')
  assert.equal(result, ['${variable}'])
})

test('findOutermostBraces - should handle multiple nested levels with prefix', () => {
  const result = findOutermostBraces('${outer ${inner ${deepest}}}', '{', '}', '$')
  assert.equal(result, ['${outer ${inner ${deepest}}}'])
})

test('findOutermostBraces - should return empty array when no matches', () => {
  const result = findOutermostBraces('no braces here')
  assert.equal(result, [])
})

test('findOutermostBraces - should handle custom delimiters', () => {
  const result = findOutermostBraces('text [content] more', '[', ']')
  assert.equal(result, ['[content]'])
})

test('findOutermostBraces - should not match without prefix when prefix is specified', () => {
  const result = findOutermostBraces('{no prefix} ${with prefix}', '{', '}', '$')
  assert.equal(result, ['${with prefix}'])
})

// Tests for findOutermostBracesDepthFirst
test('findOutermostBracesDepthFirst - should find simple braces', () => {
  const result = findOutermostBracesDepthFirst('text {content} more')
  assert.equal(result, ['{content}'])
})

test('findOutermostBracesDepthFirst - should find multiple brace pairs', () => {
  const result = findOutermostBracesDepthFirst('{first} and {second}')
  assert.equal(result, ['{first}', '{second}'])
})

test('findOutermostBracesDepthFirst - should handle nested braces', () => {
  const result = findOutermostBracesDepthFirst('{outer {inner} content}')
  assert.equal(result, ['{outer {inner} content}'])
})

test('findOutermostBracesDepthFirst - should return empty array when no matches', () => {
  const result = findOutermostBracesDepthFirst('no braces here')
  assert.equal(result, [])
})

test('findOutermostBracesDepthFirst - should handle custom delimiters', () => {
  const result = findOutermostBracesDepthFirst('text [content] more', '[', ']')
  assert.equal(result, ['[content]'])
})

test('findOutermostBracesDepthFirst - should handle unmatched braces gracefully', () => {
  const result = findOutermostBracesDepthFirst('{opened but not closed')
  assert.equal(result, [])
})

test('findOutermostBracesDepthFirst - should handle complex nested structures', () => {
  const result = findOutermostBracesDepthFirst('{a {b {c}}} {d {e}}')
  assert.equal(result, ['{a {b {c}}}', '{d {e}}'])
})

// Tests for findOutermostVariables
test('findOutermostVariables - should find simple variable', () => {
  const result = findOutermostVariables('text ${variable} more')
  assert.equal(result, ['${variable}'])
})

test('findOutermostVariables - should find multiple variables', () => {
  const result = findOutermostVariables('${first} and ${second}')
  assert.equal(result, ['${first}', '${second}'])
})

test('findOutermostVariables - should handle nested variables', () => {
  const result = findOutermostVariables('${outer ${inner}}')
  assert.equal(result, ['${outer ${inner}}'])
})

test('findOutermostVariables - should return empty array when no variables', () => {
  const result = findOutermostVariables('no variables here')
  assert.equal(result, [])
})

test('findOutermostVariables - should ignore plain braces without dollar sign', () => {
  const result = findOutermostVariables('{not a variable} ${is a variable}')
  assert.equal(result, ['${is a variable}'])
})

test('findOutermostVariables - should handle real-world serverless variables', () => {
  const result = findOutermostVariables('${param:xyz}')
  assert.equal(result, ['${param:xyz}'])
})

test('findOutermostVariables - should handle deeply nested serverless variables', () => {
  const result = findOutermostVariables('${opt:stage, ${env:foo}}')
  assert.equal(result, ['${opt:stage, ${env:foo}}'])
})

test('findOutermostVariables - should find multiple variables in array context', () => {
  const text = "y: !Not [!Equals [!Join ['', ${param:xyz}]]]"
  const result = findOutermostVariables(text)
  assert.equal(result, ['${param:xyz}'])
})

test('findOutermostVariables - should handle variables in YAML object context', () => {
  const text = 'key: { value: ${self:config}, other: ${env:var} }'
  const result = findOutermostVariables(text)
  assert.equal(result, ['${self:config}', '${env:var}'])
})

// Run all tests
test.run()
