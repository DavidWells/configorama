const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const args = {
  testFlag: 'testValue',
  testFlagTwo: 150,
  otherFlag: 'prod',
  count: 25,
  numberFlag: 50
}

process.env.TEST_ENV_VAR = '150'
process.env.TEST_STRING_VAR = 'test'

test('eval() basic boolean operations', async () => {
  const configFilePath = path.join(__dirname, 'evalValues.yml')
  const config = await configorama(configFilePath, {
    options: args
  })
  
  // Simple boolean evaluations
  assert.equal(config.boolean, false)
  assert.equal(config.booleanTrue, true)
})

test('eval() with inner variable references using self', async () => {
  const configFilePath = path.join(__dirname, 'evalValues.yml')
  const config = await configorama(configFilePath, {
    options: args
  })
  
  // ${eval(${self:three} > ${self:four})} -> ${eval(999 > 1111)} -> false
  assert.equal(config.booleanValue, false)
  
  // ${eval(${self:one} > ${self:two})} -> ${eval(200 > 500)} -> false
  assert.equal(config.booleanValue2, false)
  
  // ${eval(${one} === ${five})} -> ${eval(200 === 200)} -> true
  assert.equal(config.booleanValue3, true)
})

test('eval() arithmetic operations', async () => {
  const configFilePath = path.join(__dirname, 'evalValues.yml')
  const config = await configorama(configFilePath, {
    options: args
  })
  
  assert.equal(config.addition, 15)
  assert.equal(config.subtraction, 12)
  assert.equal(config.multiplication, 42)
  assert.equal(config.division, 5)
})

test('eval() arithmetic with inner variables', async () => {
  const configFilePath = path.join(__dirname, 'evalValues.yml')
  const config = await configorama(configFilePath, {
    options: args
  })
  
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
  const config = await configorama(configFilePath, {
    options: args
  })
  
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
  const config = await configorama(configFilePath, {
    options: args
  })
  
  // ${eval((${self:one} + ${self:two}) > ${self:three})} -> ${eval((200 + 500) > 999)} -> false
  assert.equal(config.complexExpression, false)
  
  // ${eval(${self:one} * 2 == ${self:two} - 100)} -> ${eval(200 * 2 == 500 - 100)} -> true
  assert.equal(config.complexExpression2, true)
  
  // ${eval((${self:four} - ${self:three}) > 100)} -> ${eval((1111 - 999) > 100)} -> true
  assert.equal(config.complexExpression3, true)
})

test('eval() edge cases', async () => {
  const configFilePath = path.join(__dirname, 'evalValues.yml')
  const config = await configorama(configFilePath, {
    options: args
  })
  
  assert.equal(config.zeroComparison, true, 'zeroComparison')
  assert.equal(config.negativeNumbers, true, 'negativeNumbers')
  assert.equal(config.stringEquality, true, 'stringEquality')
})

test('eval() environment variables', async () => {
  const configFilePath = path.join(__dirname, 'evalValues.yml')
  const config = await configorama(configFilePath, {
    options: args
  })

  console.log('config', config)
  
  assert.equal(config.envVarTest, 150)
  assert.equal(config.envVarWithDefault, 'defaultValue')
  assert.equal(config.envVarEval, true)
})

test('eval() CLI options', async () => {
  const configFilePath = path.join(__dirname, 'evalValues.yml')
  const config = await configorama(configFilePath, {
    options: args
  })
  
  assert.equal(config.cliOptTest, 'testValue')
  assert.equal(config.cliOptWithDefault, 'defaultFlagValue')
})

test('eval() file references', async () => {
  const configFilePath = path.join(__dirname, 'evalValues.yml')
  const config = await configorama(configFilePath, {
    options: args
  })
  
  // These will fail if testFile.yml doesn't exist, but that's expected
  // as we're testing the variable resolution syntax
  assert.equal(config.fileRefTest, {
    value: 100,
    string: 'test',
    nested: {
      value: 100,
      string: 'test'
    }
  }, 'fileRefTest')
  assert.equal(config.fileValueTest, 100, 'fileValueTest')
  assert.equal(config.fileWithDefault, 'defaultFileValue', 'fileWithDefault')
})

test('eval() with environment variables inside', async () => {
  const configFilePath = path.join(__dirname, 'evalValues.yml')

  const config = await configorama(configFilePath, {
    options: args
  })

  console.log('config', config)
  
  // ${eval(${env:TEST_ENV_VAR} > 100)} -> ${eval(150 > 100)} -> true
  assert.equal(config.envVarEval, true, 'envVarEval')
  
  // ${eval(${env:MISSING_ENV_VAR, 50} < 100)} -> ${eval(50 < 100)} -> true
  assert.equal(config.envVarEvalWithDefault, true, 'envVarEvalWithDefault')
  
  // ${eval(${env:TEST_STRING_VAR} == 'test')} -> ${eval('test' == 'test')} -> true
  assert.equal(config.envVarStringEval, true, 'envVarStringEval')
})

test('eval() with CLI options inside', async () => {
  const configFilePath = path.join(__dirname, 'evalValues.yml')
  const config = await configorama(configFilePath, {
    options: args
  })
  
  // ${eval(${opt:testFlag} == 'testValue')} -> ${eval('testValue' == 'testValue')} -> true
  assert.equal(config.cliOptEval, true)
  
  // ${eval(${opt:missingFlag, 200} > 100)} -> ${eval(200 > 100)} -> true
  assert.equal(config.cliOptEvalWithDefault, true)
  
  // ${eval(${opt:numberFlag, 50} * 2 == 100)} -> ${eval(50 * 2 == 100)} -> true
  assert.equal(config.cliOptMathEval, true)
})

test('eval() with file references inside', async () => {
  const configFilePath = path.join(__dirname, 'evalValues.yml')
  const config = await configorama(configFilePath, {
    options: args
  })
  
  // These will be undefined/false since testFile.yml doesn't exist
  assert.equal(config.fileRefEval, false, 'fileRefEval')
  assert.equal(config.fileRefEvalWithDefault, true, 'fileRefEvalWithDefault') // true because 75 < 100
  assert.equal(config.fileRefStringEval, true, 'fileRefStringEval')
})

test('eval() with complex variable combinations', async () => {
  const configFilePath = path.join(__dirname, 'evalValues.yml')
  const config = await configorama(configFilePath, {
    options: args
  })
  
  // ${eval(${env:TEST_ENV_VAR} == ${opt:testFlag})} -> ${eval('testValue' == 'testValue')} -> true
  assert.equal(config.envAndOptEval, true, 'envAndOptEval')
  
  // ${eval(${env:TEST_ENV_VAR} > ${file(./testFile.yml):value, 0})} -> ${eval('testValue' > 0)} -> false
  // 150 > 27 -> true
  assert.equal(config.envAndFileEval, true, 'envAndFileEval')
  
  // ${eval(${opt:testFlag} != ${file(./testFile.yml):string, 'default'})} -> ${eval('testValue' != 'default')} -> true
  assert.equal(config.optAndFileEval, true, 'optAndFileEval')
})

test('eval() ternary operator', async () => {
  const result = await configorama({
    simple: '${eval(5 > 3 ? "yes" : "no")}',
    withParens: '${eval((10 < 20) ? "smaller" : "bigger")}',
    numResult: '${eval(true ? 100 : 0)}',
    falseBranch: '${eval(false ? "yes" : "no")}'
  })

  assert.equal(result.simple, 'yes')
  assert.equal(result.withParens, 'smaller')
  assert.equal(result.numResult, 100)
  assert.equal(result.falseBranch, 'no')
})

test('eval() ternary with variables', async () => {
  const result = await configorama({
    threshold: 50,
    value: 75,
    status: '${eval(${self:value} > ${self:threshold} ? "above" : "below")}'
  })

  assert.equal(result.status, 'above')
})

test('eval() nested ternary (if/else if/else)', async () => {
  const result = await configorama({
    score: 85,
    grade: '${eval(${self:score} >= 90 ? "A" : ${self:score} >= 80 ? "B" : ${self:score} >= 70 ? "C" : "F")}'
  })

  assert.equal(result.grade, 'B')
})

test.run()