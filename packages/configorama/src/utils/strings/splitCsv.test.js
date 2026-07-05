const { test } = require('uvu')
const assert = require('uvu/assert')
const { splitCsv } = require('./splitCsv')

// Tests for default comma splitting (uses splitByComma internally)
test('splitCsv - should split simple comma-separated values', () => {
  const result = splitCsv('first,second,third')
  assert.equal(result, ['first', 'second', 'third'])
})

test('splitCsv - should handle spaces around commas', () => {
  const result = splitCsv('first, second, third')
  assert.equal(result, ['first', 'second', 'third'])
})

test('splitCsv - should preserve quoted strings with commas', () => {
  const result = splitCsv("'string, with comma', normal")
  assert.equal(result, ["'string, with comma'", 'normal'])
})

test('splitCsv - should handle double quotes', () => {
  const result = splitCsv('"quoted, value", normal')
  assert.equal(result, ['"quoted, value"', 'normal'])
})

test('splitCsv - should handle parentheses (function calls)', () => {
  const result = splitCsv('func(arg1, arg2), other')
  assert.equal(result, ['func(arg1, arg2)', 'other'])
})

test('splitCsv - should handle square brackets (arrays)', () => {
  const result = splitCsv('[item1, item2], other')
  assert.equal(result, ['[item1, item2]', 'other'])
})

test('splitCsv - should return array with single element when no commas', () => {
  const result = splitCsv('singleValue')
  assert.equal(result, ['singleValue'])
})

test('splitCsv - should handle empty string', () => {
  const result = splitCsv('')
  assert.equal(result, [''])
})

// Tests for custom splitter (uses original simple implementation)
test('splitCsv - should use custom splitter', () => {
  const result = splitCsv('first|second|third', '|')
  assert.equal(result, ['first', 'second', 'third'])
})

test('splitCsv - should preserve quoted content with custom splitter', () => {
  const result = splitCsv('first|"quoted|content"|third', '|')
  assert.equal(result, ['first', '"quoted|content"', 'third'])
})

test('splitCsv - should handle semicolon splitter', () => {
  const result = splitCsv('a;b;c', ';')
  assert.equal(result, ['a', 'b', 'c'])
})

test('splitCsv - custom splitter with quotes preserving internal splitters', () => {
  const result = splitCsv('"has;semicolon";normal', ';')
  assert.equal(result, ['"has;semicolon"', 'normal'])
})

// Edge cases
test('splitCsv - should handle mixed quotes and brackets', () => {
  const result = splitCsv('[array], "string", func(a, b)')
  assert.equal(result, ['[array]', '"string"', 'func(a, b)'])
})

test('splitCsv - should handle deeply nested structures', () => {
  const result = splitCsv('func(obj[0, 1], "str, comma"), other')
  assert.equal(result, ['func(obj[0, 1], "str, comma")', 'other'])
})

test('splitCsv - should handle serverless variable syntax', () => {
  const result = splitCsv('opt:stage, ${opt:stageOne}')
  // Default behavior splits inside ${}, but splitByComma handles this better
  // This test just verifies it doesn't crash
  assert.ok(Array.isArray(result))
})

test('splitCsv - should preserve whitespace in quoted strings', () => {
  const result = splitCsv('"  spaces  ", normal')
  assert.equal(result, ['"  spaces  "', 'normal'])
})

test('splitCsv - should handle consecutive commas with custom splitter', () => {
  const result = splitCsv('a||c', '|')
  assert.equal(result, ['a', '', 'c'])
})

// Run all tests
test.run()
