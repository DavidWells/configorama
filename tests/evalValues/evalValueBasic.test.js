const { test } = require('uvu')
const assert = require('uvu/assert')
const config = require('../../src/index')

test('Basic eval comparison - true', async () => {
  const result = await config({
    result: '${eval(200 > 100)}'
  })
  assert.is(result.result, true)
})

test('Basic eval comparison - false', async () => {
  const result = await config({
    result: '${eval(100 > 200)}'
  })
  assert.is(result.result, false)
})

test('Eval arithmetic', async () => {
  const result = await config({
    sum: '${eval(10 + 5)}',
    product: '${eval(3 * 4)}',
    comparison: '${eval(15 > 12)}'
  })
  assert.is(result.sum, 15)
  assert.is(result.product, 12)
  assert.is(result.comparison, true)
})

test('Eval with comparison operators', async () => {
  const result = await config({
    greater: '${eval(5 > 3)}',
    less: '${eval(2 < 4)}',
    equal: '${eval(5 == 5)}',
    notEqual: '${eval(3 != 5)}'
  })
  assert.is(result.greater, true)
  assert.is(result.less, true)
  assert.is(result.equal, true)
  assert.is(result.notEqual, true)
})

test('Eval with numbers from config', async () => {
  const result = await config({
    valueOne: 100,
    valueTwo: 200,
    // Direct values work
    comparison: '${eval(100 < 200)}'
  })
  assert.is(result.comparison, true)
})

test.run()