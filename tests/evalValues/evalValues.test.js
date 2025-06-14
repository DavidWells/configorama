const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

test('eval() basic boolean operations', async () => {
  const configFilePath = path.join(__dirname, 'evalValues.yml')
  const config = await configorama(configFilePath)
  
  // Simple boolean evaluations
  assert.equal(config.boolean, false)
  assert.equal(config.booleanTrue, true)
})

test('eval() with inner variable references using self', async () => {
  const configFilePath = path.join(__dirname, 'evalValues.yml')
  const config = await configorama(configFilePath)
  
  // ${eval(${self:three} > ${self:four})} -> ${eval(999 > 1111)} -> false
  assert.equal(config.booleanValue, false)
  
  // ${eval(${self:one} > ${self:two})} -> ${eval(200 > 500)} -> false
  assert.equal(config.booleanValue2, false)
  
  // ${eval(${one} === ${five})} -> ${eval(200 === 200)} -> true
  assert.equal(config.booleanValue3, true)
})

test('eval() arithmetic operations', async () => {
  const configFilePath = path.join(__dirname, 'evalValues.yml')
  const config = await configorama(configFilePath)
  
  assert.equal(config.addition, 15)
  assert.equal(config.subtraction, 12)
  assert.equal(config.multiplication, 42)
  assert.equal(config.division, 5)
})

test('eval() arithmetic with inner variables', async () => {
  const configFilePath = path.join(__dirname, 'evalValues.yml')
  const config = await configorama(configFilePath)
  
  // ${eval(${self:one} + ${self:two})} -> ${eval(200 + 500)} -> 700
  assert.equal(config.additionWithVars, 700)
  
  // ${eval(${self:four} - ${self:three})} -> ${eval(1111 - 999)} -> 112
  assert.equal(config.subtractionWithVars, 112)
  
  // ${eval(${self:one} * 2)} -> ${eval(200 * 2)} -> 400
  assert.equal(config.multiplicationWithVars, 400)
  
  // ${eval(${self:four} / ${self:five})} -> ${eval(1111 / 200)} -> 5.555
  assert.equal(config.divisionWithVars, 5.555)
})

test('eval() comparison operations with variables', async () => {
  const configFilePath = path.join(__dirname, 'evalValues.yml')
  const config = await configorama(configFilePath)
  
  // ${eval(${self:two} > ${self:one})} -> ${eval(500 > 200)} -> true
  assert.equal(config.greaterThan, true)
  
  // ${eval(${self:one} < ${self:two})} -> ${eval(200 < 500)} -> true
  assert.equal(config.lessThan, true)
  
  // ${eval(${self:one} == ${self:five})} -> ${eval(200 == 200)} -> true
  assert.equal(config.equality, true)
  
  // ${eval(${self:three} != ${self:four})} -> ${eval(999 != 1111)} -> true
  assert.equal(config.inequality, true)
})

test('eval() complex expressions', async () => {
  const configFilePath = path.join(__dirname, 'evalValues.yml')
  const config = await configorama(configFilePath)
  
  // ${eval((${self:one} + ${self:two}) > ${self:three})} -> ${eval((200 + 500) > 999)} -> false
  assert.equal(config.complexExpression, false)
  
  // ${eval(${self:one} * 2 == ${self:two} - 100)} -> ${eval(200 * 2 == 500 - 100)} -> true
  assert.equal(config.complexExpression2, true)
  
  // ${eval((${self:four} - ${self:three}) > 100)} -> ${eval((1111 - 999) > 100)} -> true
  assert.equal(config.complexExpression3, true)
})

test('eval() edge cases', async () => {
  const configFilePath = path.join(__dirname, 'evalValues.yml')
  const config = await configorama(configFilePath)
  
  assert.equal(config.zeroComparison, true)
  assert.equal(config.negativeNumbers, true)
  assert.equal(config.stringEquality, true)
})

test.run()