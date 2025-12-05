const { test } = require('uvu')
const assert = require('uvu/assert')
const { extractVariableWrapper, getFallbackString, verifyVariable } = require('./variableUtils')

// Tests for getFallbackString
test('getFallbackString - should reconstruct variable from split array', () => {
  const split = ['env:VAR', 'default']
  const result = getFallbackString(split, 'default')
  assert.equal(result, '${default}')
})

test('getFallbackString - should handle nested variable', () => {
  const split = ['env:VAR', 'env:FALLBACK']
  const result = getFallbackString(split, 'env:FALLBACK')
  assert.equal(result, '${env:FALLBACK}')
})

test('getFallbackString - should include all items after nested var', () => {
  const split = ['env:VAR', 'env:FALLBACK', 'final']
  const result = getFallbackString(split, 'env:FALLBACK')
  assert.equal(result, '${env:FALLBACK, final}')
})

test('getFallbackString - should handle first item as nested var', () => {
  const split = ['env:VAR', 'default']
  const result = getFallbackString(split, 'env:VAR')
  assert.equal(result, '${env:VAR, default}')
})

test('getFallbackString - should clean existing ${} wrappers', () => {
  const split = ['${env:VAR}', 'default']
  // The function only matches if nestedVar equals the array element exactly
  // So it reconstructs from the matched element, not from the beginning
  const result = getFallbackString(split, '${env:VAR}')
  // Since match is found, it creates from '${env:VAR}', 'default' -> ${env:VAR}, default}
  // Then regex cleans wrappers: ${env:VAR}, default}
  assert.equal(result, '${env:VAR}, default}')
})

// Tests for verifyVariable
test('verifyVariable - should return true for valid regex variable', () => {
  const variableTypes = [
    { match: /^env:/ }
  ]
  const valueObject = { path: ['config', 'var'], originalSource: '${env:VAR}' }
  const result = verifyVariable('env:VAR', valueObject, variableTypes)
  assert.is(result, true)
})

test('verifyVariable - should return true for valid function matcher', () => {
  const variableTypes = [
    { match: (str) => str.startsWith('custom:') }
  ]
  const valueObject = { path: ['config'], originalSource: '${custom:value}' }
  const result = verifyVariable('custom:value', valueObject, variableTypes)
  assert.is(result, true)
})

test('verifyVariable - should return false for non-colon variable', () => {
  const variableTypes = [
    { match: /^env:/ }
  ]
  const valueObject = { path: ['config'], originalSource: '${simple.prop}' }
  const result = verifyVariable('simple.prop', valueObject, variableTypes)
  assert.is(result, false)
})

test('verifyVariable - should throw for invalid colon variable', () => {
  const variableTypes = [
    { match: /^env:/ }
  ]
  const valueObject = { path: ['config', 'var'], originalSource: '${invalid:VAR}' }

  assert.throws(
    () => verifyVariable('invalid:VAR', valueObject, variableTypes),
    /invalid variable syntax/
  )
})

test('verifyVariable - should include path in error message', () => {
  const variableTypes = [
    { match: /^env:/ }
  ]
  const valueObject = { path: ['config', 'nested', 'var'], originalSource: '${bad:VAR}' }

  assert.throws(
    () => verifyVariable('bad:VAR', valueObject, variableTypes),
    /config\.nested\.var/
  )
})

test('verifyVariable - should include original source in error', () => {
  const variableTypes = [
    { match: /^env:/ }
  ]
  const valueObject = { path: ['config'], originalSource: 'this is ${bad:VAR}' }

  assert.throws(
    () => verifyVariable('bad:VAR', valueObject, variableTypes),
    /this is \$\{bad:VAR\}/
  )
})

test('verifyVariable - should match with function and config param', () => {
  const config = { stage: 'prod' }
  const variableTypes = [
    {
      match: (str, cfg) => str.startsWith('stage:') && cfg.stage === 'prod'
    }
  ]
  const valueObject = { path: ['config'], originalSource: '${stage:name}' }
  const result = verifyVariable('stage:name', valueObject, variableTypes, config)
  assert.is(result, true)
})

// Tests for extractVariableWrapper
test('extractVariableWrapper - standard ${} syntax', () => {
  const result = extractVariableWrapper('\\$\\{([^}]+)\\}')
  assert.equal(result.prefix, '${')
  assert.equal(result.suffix, '}')
})

test('extractVariableWrapper - double brace ${{}} syntax', () => {
  const result = extractVariableWrapper('\\$\\{\\{([^}]+)\\}\\}')
  assert.equal(result.prefix, '${{')
  assert.equal(result.suffix, '}}')
})

test('extractVariableWrapper - hash #{} syntax', () => {
  const result = extractVariableWrapper('\\#\\{([^}]+)\\}')
  assert.equal(result.prefix, '#{')
  assert.equal(result.suffix, '}')
})

test('extractVariableWrapper - angle bracket <> syntax', () => {
  const result = extractVariableWrapper('\\<([^>]+)\\>')
  assert.equal(result.prefix, '<')
  assert.equal(result.suffix, '>')
})

test('extractVariableWrapper - double bracket [[]] syntax', () => {
  const result = extractVariableWrapper('\\[\\[([^\\]]+)\\]\\]')
  assert.equal(result.prefix, '[[')
  assert.equal(result.suffix, ']]')
})

test('extractVariableWrapper - strips non-capturing group prefix', () => {
  const result = extractVariableWrapper('(?:prefix)\\$\\{([^}]+)\\}')
  assert.equal(result.prefix, '${')
  assert.equal(result.suffix, '}')
})

// Tests for buildVariableSyntax
const { buildVariableSyntax } = require('./variableUtils')

test('buildVariableSyntax - default ${} syntax excludes $ {', () => {
  const syntax = buildVariableSyntax('${', '}')
  const regex = new RegExp(syntax, 'g')
  // $ and { in value cause no match (they're not in character class)
  assert.not.ok("${env:FOO, 'test$value'}".match(regex))
  assert.not.ok("${env:FOO, 'test{value'}".match(regex))
  // } causes partial match (ends early at the } in value)
  const partialMatch = "${env:FOO, 'test}value'}".match(regex)
  assert.ok(partialMatch)
  assert.is(partialMatch[0], "${env:FOO, 'test}")
})

test('buildVariableSyntax - supports backslash in values', () => {
  const syntax = buildVariableSyntax('${', '}')
  const regex = new RegExp(syntax, 'g')
  const match = "${env:FOO, 'path\\to\\file'}".match(regex)
  assert.is(match[0], "${env:FOO, 'path\\to\\file'}")
})

test('buildVariableSyntax - double brace ${{}} syntax excludes }', () => {
  const syntax = buildVariableSyntax('${{', '}}')
  const regex = new RegExp(syntax, 'g')
  const match = "${{env:FOO, 'value'}}".match(regex)
  assert.is(match[0], "${{env:FOO, 'value'}}")
})

test('buildVariableSyntax - angle bracket <> syntax excludes >', () => {
  const syntax = buildVariableSyntax('<', '>')
  const regex = new RegExp(syntax, 'g')
  // > in value causes partial match
  const match = "<env:FOO, 'a>b'>".match(regex)
  assert.is(match[0], "<env:FOO, 'a>")
})

test('buildVariableSyntax - bracket [[]] syntax excludes ]', () => {
  const syntax = buildVariableSyntax('[[', ']]')
  const regex = new RegExp(syntax, 'g')
  const match = "[[env:FOO, 'value']]".match(regex)
  assert.is(match[0], "[[env:FOO, 'value']]")
})

// Run all tests
test.run()
