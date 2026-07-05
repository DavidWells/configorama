/* Tests for ${if(...)} syntax - alias for eval */
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

test('if() basic ternary', async () => {
  const result = await configorama({
    yes: '${if(5 > 3 ? "yes" : "no")}',
    no: '${if(3 > 5 ? "yes" : "no")}'
  })
  assert.is(result.yes, 'yes')
  assert.is(result.no, 'no')
})

test('if() with parentheses around condition', async () => {
  const result = await configorama({
    result: '${if((10 < 20) ? "smaller" : "bigger")}'
  })
  assert.is(result.result, 'smaller')
})

test('if() boolean result', async () => {
  const result = await configorama({
    isTrue: '${if(10 == 10)}',
    isFalse: '${if(10 == 5)}'
  })
  assert.is(result.isTrue, true)
  assert.is(result.isFalse, false)
})

test('if() with variables', async () => {
  const result = await configorama({
    threshold: 50,
    value: 75,
    status: '${if(${self:value} > ${self:threshold} ? "above" : "below")}'
  })
  assert.is(result.status, 'above')
})

test('if() nested ternary', async () => {
  const result = await configorama({
    score: 85,
    grade: '${if(${self:score} >= 90 ? "A" : ${self:score} >= 80 ? "B" : "C")}'
  })
  assert.is(result.grade, 'B')
})

test('if() with logical operators', async () => {
  const result = await configorama({
    both: '${if(true && true)}',
    either: '${if(false || true)}',
    neither: '${if(false && false)}'
  })
  assert.is(result.both, true)
  assert.is(result.either, true)
  assert.is(result.neither, false)
})

test('if() arithmetic in condition', async () => {
  const result = await configorama({
    result: '${if((5 + 5) > 8 ? "big" : "small")}'
  })
  assert.is(result.result, 'big')
})

test.run()
