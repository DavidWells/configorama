const { test } = require('uvu')
const assert = require('uvu/assert')
const { findForbiddenAccess, assertSafeEvalExpression } = require('./evalSafety')

let parse
test.before(async () => {
  await import('subscript/justin') // registers operators on the shared parser
  const mod = await import('subscript/parse')
  parse = mod.default
})

function check(expression) {
  let ast = null
  try { ast = parse(expression) } catch (e) { ast = null }
  let caught
  try { assertSafeEvalExpression(expression, ast) } catch (e) { caught = e }
  return caught
}

test('allows arithmetic and comparison expressions', () => {
  assert.is(check('1 + 1'), undefined)
  assert.is(check('"yes" === "yes"'), undefined)
  assert.is(check('true ? 1 : 2'), undefined)
})

test('allows safe static member access on context values', () => {
  assert.is(check('provider.stage === "prod"'), undefined)
  assert.is(check('custom.nullValue === null'), undefined)
})

test('allows literal-key index access', () => {
  assert.is(check('a[0]'), undefined)
  assert.is(check('obj["key"]'), undefined)
})

test('blocks static constructor access', () => {
  assert.ok(check('"".constructor.constructor("return 1")()'))
  assert.ok(check('[].constructor'))
  assert.ok(check('x.__proto__'))
})

test('blocks optional-chaining constructor access', () => {
  assert.ok(check('a?.constructor'))
  assert.ok(check('a?.["constructor"]'))
})

test('blocks literal-bracket constructor access', () => {
  assert.ok(check('(0)["constructor"]["constructor"]("return 1")()'))
})

test('blocks concatenated computed-key escape', () => {
  assert.ok(check('(0)["con" + "structor"]'))
})

test('findForbiddenAccess flags a hand-built dynamic key', () => {
  // ['[]', 'obj', ['+', [null,'con'], [null,'structor']]]
  const ast = ['[]', 'obj', ['+', [null, 'con'], [null, 'structor']]]
  assert.is(findForbiddenAccess(ast), '<computed-key>')
})

test.run()
