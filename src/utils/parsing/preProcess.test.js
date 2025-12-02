// Tests for preProcess utility (fixFallbacksInString)

const { test } = require('uvu')
const assert = require('uvu/assert')
const preProcess = require('./preProcess')

// Default ${} syntax
const defaultSyntax = /\$\{([ ~:a-zA-Z0-9._\\'",\-\/\(\)]+?)\}/g

// Custom syntaxes
const doubleBraceSyntax = /\$\{\{([ ~:a-zA-Z0-9._\\'",\-\/\(\)]+?)\}\}/g
const hashSyntax = /\#\{([ ~:a-zA-Z0-9._\\'",\-\/\(\)]+?)\}/g
const angleSyntax = /\<([ ~:a-zA-Z0-9._\\'",\-\/\(\)]+?)\>/g

// Tests for fixFallbacksInString with default ${} syntax
test('fixFallbacksInString - wraps unwrapped self: fallback', () => {
  const input = { key: '${opt:missing, self:fallback}' }
  const result = preProcess(input, defaultSyntax)
  assert.is(result.key, '${opt:missing, ${self:fallback}}')
})

test('fixFallbacksInString - wraps unwrapped env: fallback', () => {
  const input = { key: '${opt:missing, env:FALLBACK}' }
  const result = preProcess(input, defaultSyntax)
  assert.is(result.key, '${opt:missing, ${env:FALLBACK}}')
})

test('fixFallbacksInString - wraps unwrapped opt: fallback', () => {
  const input = { key: '${self:missing, opt:fallback}' }
  const result = preProcess(input, defaultSyntax)
  assert.is(result.key, '${self:missing, ${opt:fallback}}')
})

test('fixFallbacksInString - wraps unwrapped file: fallback', () => {
  const input = { key: '${opt:missing, file:./config.json}' }
  const result = preProcess(input, defaultSyntax)
  assert.is(result.key, '${opt:missing, ${file:./config.json}}')
})

test('fixFallbacksInString - leaves already wrapped fallback alone', () => {
  const input = { key: '${opt:missing, ${self:fallback}}' }
  const result = preProcess(input, defaultSyntax)
  assert.is(result.key, '${opt:missing, ${self:fallback}}')
})

test('fixFallbacksInString - leaves string fallback alone', () => {
  const input = { key: '${opt:missing, "default"}' }
  const result = preProcess(input, defaultSyntax)
  assert.is(result.key, '${opt:missing, "default"}')
})

test('fixFallbacksInString - leaves numeric fallback alone', () => {
  const input = { key: '${opt:missing, 42}' }
  const result = preProcess(input, defaultSyntax)
  assert.is(result.key, '${opt:missing, 42}')
})

test('fixFallbacksInString - handles multiple fallbacks', () => {
  const input = { key: '${opt:missing, self:first, env:second}' }
  const result = preProcess(input, defaultSyntax)
  assert.is(result.key, '${opt:missing, ${self:first}, ${env:second}}')
})

test('fixFallbacksInString - handles nested variables in primary', () => {
  const input = { key: '${file(./config.${opt:stage}.json), "default"}' }
  const result = preProcess(input, defaultSyntax)
  assert.is(result.key, '${file(./config.${opt:stage}.json), "default"}')
})

// Tests for ${{}} syntax
test('fixFallbacksInString - ${{}} syntax wraps unwrapped fallback', () => {
  const input = { key: '${{opt:missing, self:fallback}}' }
  const result = preProcess(input, doubleBraceSyntax)
  assert.is(result.key, '${{opt:missing, ${{self:fallback}}}}')
})

test('fixFallbacksInString - ${{}} syntax leaves wrapped fallback alone', () => {
  const input = { key: '${{opt:missing, ${{self:fallback}}}}' }
  const result = preProcess(input, doubleBraceSyntax)
  assert.is(result.key, '${{opt:missing, ${{self:fallback}}}}')
})

test('fixFallbacksInString - ${{}} syntax leaves string fallback alone', () => {
  const input = { key: '${{opt:missing, "default"}}' }
  const result = preProcess(input, doubleBraceSyntax)
  assert.is(result.key, '${{opt:missing, "default"}}')
})

// Tests for #{} syntax
test('fixFallbacksInString - #{} syntax wraps unwrapped fallback', () => {
  const input = { key: '#{opt:missing, self:fallback}' }
  const result = preProcess(input, hashSyntax)
  assert.is(result.key, '#{opt:missing, #{self:fallback}}')
})

test('fixFallbacksInString - #{} syntax leaves wrapped fallback alone', () => {
  const input = { key: '#{opt:missing, #{self:fallback}}' }
  const result = preProcess(input, hashSyntax)
  assert.is(result.key, '#{opt:missing, #{self:fallback}}')
})

test('fixFallbacksInString - #{} syntax handles multiple fallbacks', () => {
  const input = { key: '#{opt:missing, env:FIRST, self:second}' }
  const result = preProcess(input, hashSyntax)
  assert.is(result.key, '#{opt:missing, #{env:FIRST}, #{self:second}}')
})

// Tests for <> syntax
test('fixFallbacksInString - <> syntax wraps unwrapped fallback', () => {
  const input = { key: '<opt:missing, self:fallback>' }
  const result = preProcess(input, angleSyntax)
  assert.is(result.key, '<opt:missing, <self:fallback>>')
})

test('fixFallbacksInString - <> syntax leaves wrapped fallback alone', () => {
  const input = { key: '<opt:missing, <self:fallback>>' }
  const result = preProcess(input, angleSyntax)
  assert.is(result.key, '<opt:missing, <self:fallback>>')
})

test('fixFallbacksInString - <> syntax leaves string fallback alone', () => {
  const input = { key: '<opt:missing, "default">' }
  const result = preProcess(input, angleSyntax)
  assert.is(result.key, '<opt:missing, "default">')
})

// Edge cases
test('fixFallbacksInString - handles deeply nested objects', () => {
  const input = {
    level1: {
      level2: {
        key: '${opt:missing, self:fallback}'
      }
    }
  }
  const result = preProcess(input, defaultSyntax)
  assert.is(result.level1.level2.key, '${opt:missing, ${self:fallback}}')
})

test('fixFallbacksInString - handles arrays', () => {
  const input = {
    items: [
      '${opt:one, self:fallback1}',
      '${opt:two, self:fallback2}'
    ]
  }
  const result = preProcess(input, defaultSyntax)
  assert.is(result.items[0], '${opt:one, ${self:fallback1}}')
  assert.is(result.items[1], '${opt:two, ${self:fallback2}}')
})

test('fixFallbacksInString - handles no variable syntax', () => {
  const input = { key: 'just a plain string' }
  const result = preProcess(input, defaultSyntax)
  assert.is(result.key, 'just a plain string')
})

test('fixFallbacksInString - handles null variableSyntax', () => {
  const input = { key: '${opt:missing, self:fallback}' }
  const result = preProcess(input, null)
  // Without syntax, should use defaults
  assert.is(result.key, '${opt:missing, ${self:fallback}}')
})

// Tests with explicit variableTypes
const defaultVariableTypes = [
  { type: 'env' },
  { type: 'options', prefix: 'opt' },
  { type: 'self', prefix: 'self' },
  { type: 'file', prefix: 'file' },
  { type: 'text', prefix: 'text' },
  { type: 'deep' },
]

test('fixFallbacksInString - uses variableTypes to determine prefixes', () => {
  const input = { key: '${opt:missing, self:fallback}' }
  const result = preProcess(input, defaultSyntax, defaultVariableTypes)
  assert.is(result.key, '${opt:missing, ${self:fallback}}')
})

test('fixFallbacksInString - custom variableTypes with custom prefix', () => {
  const customTypes = [
    { type: 'ssm', prefix: 'ssm' },
    { type: 'secret', prefix: 'secret' },
  ]
  const input = { key: '${opt:missing, ssm:/path/to/param}' }
  const result = preProcess(input, defaultSyntax, customTypes)
  assert.is(result.key, '${opt:missing, ${ssm:/path/to/param}}')
})

test('fixFallbacksInString - custom variableTypes wraps secret: fallback', () => {
  const customTypes = [
    { type: 'ssm', prefix: 'ssm' },
    { type: 'secret', prefix: 'secret' },
    { type: 'self', prefix: 'self' },
  ]
  const input = { key: '${self:missing, secret:API_KEY}' }
  const result = preProcess(input, defaultSyntax, customTypes)
  assert.is(result.key, '${self:missing, ${secret:API_KEY}}')
})

test('fixFallbacksInString - ignores dot.prop and string types in prefixes', () => {
  const typesWithDotProp = [
    { type: 'env' },
    { type: 'dot.prop' },
    { type: 'string' },
    { type: 'self', prefix: 'self' },
  ]
  const input = { key: '${env:MISSING, self:fallback}' }
  const result = preProcess(input, defaultSyntax, typesWithDotProp)
  assert.is(result.key, '${env:MISSING, ${self:fallback}}')
})

test.run()
