const { test } = require('uvu')
const assert = require('uvu/assert')
const { resolver } = require('./valueFromEval')

test('Basic boolean evaluation - true', async () => {
  const result = await resolver('eval(200 > 100)')
  assert.is(result, true)
})

test('Basic boolean evaluation - false', async () => {
  const result = await resolver('eval(100 > 200)')
  assert.is(result, false)
})

test('Numeric evaluation', async () => {
  const result = await resolver('eval(10 + 5)')
  assert.is(result, 15)
})

test('String comparison', async () => {
  const result = await resolver('eval("hello" == "hello")')
  assert.is(result, true)
})

test('String comparison - strict', async () => {
  const result = await resolver('eval("hello" === "hello")')
  assert.is(result, true)
})

test('Complex boolean expression', async () => {
  const result = await resolver('eval(100 > 50)')
  assert.is(result, true)
})

test('Invalid syntax throws error', async () => {
  try {
    await resolver('eval(')
    assert.unreachable('Should have thrown an error')
  } catch (error) {
    assert.ok(error.message.includes('Invalid eval syntax'))
  }
})

test.run()