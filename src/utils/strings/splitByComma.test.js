const { test } = require('uvu')
const assert = require('uvu/assert')
const { splitByComma } = require('./splitByComma')

const variableSyntax = /\${((?!AWS|stageVariables)[ ~:a-zA-Z0-9=+!@#%*<>?._'",|\-\/\(\)\\]+?)}/g

test('splitByComma - should return array with original string when no commas present', () => {
  const result = splitByComma('singleString')
  assert.equal(result, ['singleString'])
})

test('splitByComma - should split by comma and trim whitespace', () => {
  const result = splitByComma('first, second, third')
  assert.equal(result, ['first', 'second', 'third'])
})

test('splitByComma - should preserve quoted strings', () => {
  const result = splitByComma("env:BAZ,'defaultEnvValue'")
  assert.equal(result, ["env:BAZ", "'defaultEnvValue'"])
})

test('splitByComma - should not split commas inside parentheses', () => {
  const result = splitByComma('file(file.js, param, paramTwo)')
  assert.equal(result, ['file(file.js, param, paramTwo)'])
})

test('splitByComma - should not split commas inside square brackets', () => {
  const result = splitByComma('array[item1, item2, item3]')
  assert.equal(result, ['array[item1, item2, item3]'])
})

test('splitByComma - should handle multiple quoted strings', () => {
  const result = splitByComma("'string one', 'string, with comma', \"double quoted\"")
  assert.equal(result, ["'string one'", "'string, with comma'", "\"double quoted\""])
})

test('splitByComma - should handle empty input', () => {
  const result = splitByComma('')
  assert.equal(result, [''])
})

test('splitByComma - should handle input with extra whitespace', () => {
  const result = splitByComma('  first  ,  second  ,  third  ')
  assert.equal(result, ['first', 'second', 'third'])
})

test('splitByComma - should handle mixed scenarios', () => {
  const result = splitByComma("normal, 'quoted, string', function(param1, param2)")
  // console.log('result', result)
  assert.equal(result, ["normal", "'quoted, string'", "function(param1, param2)"])
})

test('splitByComma - should handle nested parentheses', () => {
  const result = splitByComma('outer(inner(a, b), c)')
  assert.equal(result, ['outer(inner(a, b), c)'])
})

test('splitByComma - should handle nested square brackets', () => {
  const result = splitByComma('matrix[[1, 2], [3, 4]]')
  assert.equal(result, ['matrix[[1, 2], [3, 4]]'])
})

test('splitByComma - should handle combination of parentheses and brackets', () => {
  const result = splitByComma('func(array[1, 2], obj.method(a, b))')
  assert.equal(result, ['func(array[1, 2], obj.method(a, b))'])
})

test('splitByComma - should handle escaped quotes in strings', () => {
  const result = splitByComma("normal, 'string with \\'escaped\\' quotes', \"double \\\"escaped\\\" quotes\"")
  assert.equal(result, ["normal", "'string with \\'escaped\\' quotes'", "\"double \\\"escaped\\\" quotes\""])
})

test('splitByComma - should handle complex nested structures', () => {
  const result = splitByComma('func(arg1, {key: [1, 2], other: "value, with comma"}, callback())')
  assert.equal(result, ['func(arg1, {key: [1, 2], other: "value, with comma"}, callback())'])
})

test('splitByComma - should handle backtick quotes', () => {
  const result = splitByComma("normal, `template ${with, commas} inside`", variableSyntax)
  assert.equal(result, ["normal", "`template ${with, commas} inside`"])
})

test('splitByComma - should split ${} variables when NO regex provided', () => {
  const result = splitByComma('${env:no, env:empty}')
  assert.equal(result, ['${env:no', 'env:empty}'])
})

test('splitByComma - should protect ${} variables when regex provided', () => {
  const result = splitByComma('opt:stage, ${opt:stageOne}, ${opt:stageTwo}', variableSyntax)
  assert.equal(result, ['opt:stage', '${opt:stageOne}', '${opt:stageTwo}'])
})

test('splitByComma - should protect nested ${} variables when regex provided', () => {
  const result = splitByComma('opt:stage, ${opt:stageOne, ${env:foo}}, ${opt:stageTwo}', variableSyntax)
  assert.equal(result, ['opt:stage', '${opt:stageOne, ${env:foo}}', '${opt:stageTwo}'])
})

test('splitByComma - should handle multiple nested levels with regex', () => {
  const result = splitByComma('${opt:stageOne, ${env:foo}}, ${opt:stageTwo}, "three"', variableSyntax)
  assert.equal(result, ['${opt:stageOne, ${env:foo}}', '${opt:stageTwo}', '"three"'])
})

test('splitByComma - should handle standalone {} objects with regex', () => {
  const result = splitByComma('func(arg1, {key: value}, arg2)', variableSyntax)
  assert.equal(result, ['func(arg1, {key: value}, arg2)'])
})

test('splitByComma - should handle mixed ${} variables and {} objects with regex', () => {
  const result = splitByComma('${self:config}, {key: "value"}, ${env:var}', variableSyntax)
  assert.equal(result, ['${self:config}', '{key: "value"}', '${env:var}'])
})

test('splitByComma - should handle complex nested case from failCases', () => {
  const result = splitByComma('${env:no, env:empty}')
  assert.equal(result, ['${env:no', 'env:empty}'])
})

test('splitByComma - should handle deeply nested variables with regex', () => {
  const input = 'opt:stage, ${opt:stageOne, ${env:foo}}, ${opt:stageTwo}, "three"'
  const result = splitByComma(input, variableSyntax)
  assert.equal(result.length, 4)
  assert.equal(result[0], 'opt:stage')
  assert.equal(result[1], '${opt:stageOne, ${env:foo}}')
  assert.equal(result[2], '${opt:stageTwo}')
  assert.equal(result[3], '"three"')
})

// Run all tests
test.run() 