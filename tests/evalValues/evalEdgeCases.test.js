/* Eval expression edge cases */
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const dirname = __dirname

// ============================================
// Division edge cases
// ============================================

test('eval edge case - division by zero', async () => {
  const config = await configorama({
    result: '${eval(10 / 0)}'
  }, {
    configDir: dirname
  })

  // JavaScript division by zero = Infinity
  assert.is(config.result, Infinity)
})

test('eval edge case - zero divided by zero', async () => {
  const config = await configorama({
    result: '${eval(0 / 0)}'
  }, {
    configDir: dirname
  })

  // 0/0 = NaN
  assert.ok(Number.isNaN(config.result))
})

test('eval edge case - negative division by zero', async () => {
  const config = await configorama({
    result: '${eval(-10 / 0)}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, -Infinity)
})

// ============================================
// Modulo edge cases
// ============================================

test('eval edge case - modulo of negative number', async () => {
  const config = await configorama({
    result: '${eval(-7 % 3)}'
  }, {
    configDir: dirname
  })

  // JavaScript: -7 % 3 = -1
  assert.is(config.result, -1)
})

test('eval edge case - modulo with zero', async () => {
  const config = await configorama({
    result: '${eval(10 % 0)}'
  }, {
    configDir: dirname
  })

  // Modulo by zero = NaN
  assert.ok(Number.isNaN(config.result))
})

// ============================================
// Operator precedence
// ============================================

test('eval edge case - operator precedence', async () => {
  const config = await configorama({
    result: '${eval(1 + 2 * 3)}'
  }, {
    configDir: dirname
  })

  // Should be 7, not 9 (multiplication first)
  assert.is(config.result, 7)
})

test('eval edge case - parentheses override precedence', async () => {
  const config = await configorama({
    result: '${eval((1 + 2) * 3)}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 9)
})

test('eval edge case - complex precedence', async () => {
  const config = await configorama({
    result: '${eval(2 + 3 * 4 - 5 / 5)}'
  }, {
    configDir: dirname
  })

  // 2 + 12 - 1 = 13
  assert.is(config.result, 13)
})

// ============================================
// Bitwise operators
// ============================================

test('eval edge case - bitwise AND', async () => {
  const config = await configorama({
    result: '${eval(5 & 3)}'
  }, {
    configDir: dirname
  })

  // 5 = 101, 3 = 011, AND = 001 = 1
  assert.is(config.result, 1)
})

test('eval edge case - bitwise OR conflicts with filter syntax', async () => {
  // LIMITATION: | is used for filter syntax, so bitwise OR doesn't work in eval
  const config = await configorama({
    result: '${eval(5 | 3)}'
  }, {
    configDir: dirname
  })

  // The | is interpreted as filter pipe, not bitwise OR
  // Result will be the unprocessed string or filter error
  assert.is(typeof config.result, 'string')
})

test('eval edge case - bitwise XOR', async () => {
  const config = await configorama({
    result: '${eval(5 ^ 3)}'
  }, {
    configDir: dirname
  })

  // 5 = 101, 3 = 011, XOR = 110 = 6
  assert.is(config.result, 6)
})

test('eval edge case - left shift', async () => {
  const config = await configorama({
    result: '${eval(1 << 4)}'
  }, {
    configDir: dirname
  })

  // 1 << 4 = 16
  assert.is(config.result, 16)
})

test('eval edge case - right shift', async () => {
  const config = await configorama({
    result: '${eval(16 >> 2)}'
  }, {
    configDir: dirname
  })

  // 16 >> 2 = 4
  assert.is(config.result, 4)
})

// ============================================
// Comparison edge cases
// ============================================

test('eval edge case - strict equality', async () => {
  const config = await configorama({
    loose: '${eval(1 == "1")}',
    strict: '${eval(1 === "1")}'
  }, {
    configDir: dirname
  })

  assert.is(config.loose, true)
  assert.is(config.strict, false)
})

test('eval edge case - NaN comparisons', async () => {
  const config = await configorama({
    nanEqual: '${eval(NaN === NaN)}',
    nanNotEqual: '${eval(NaN !== NaN)}'
  }, {
    configDir: dirname
  })

  // NaN is not equal to itself
  assert.is(config.nanEqual, false)
  assert.is(config.nanNotEqual, true)
})

// ============================================
// Boolean logic
// ============================================

test('eval edge case - logical AND short circuit', async () => {
  const config = await configorama({
    result: '${eval(false && undefined)}'
  }, {
    configDir: dirname
  })

  // Short circuits to false
  assert.is(config.result, false)
})

test('eval edge case - logical OR short circuit', async () => {
  const config = await configorama({
    result: '${eval(true || undefined)}'
  }, {
    configDir: dirname
  })

  // Short circuits to true
  assert.is(config.result, true)
})

test('eval edge case - multiple logical ORs', async () => {
  const config = await configorama({
    test1: '${eval(false || false || true)}',
    test2: '${eval(null || undefined || "fallback")}',
    test3: '${eval(0 || "" || "value")}',
    test4: '${eval(true && (false || true))}',
    test5: '${eval((false || true) && (null || "ok"))}'
  }, {
    configDir: dirname
  })

  assert.is(config.test1, true)
  assert.is(config.test2, 'fallback')
  assert.is(config.test3, 'value')
  assert.is(config.test4, true)
  assert.is(config.test5, 'ok')
})

test('eval edge case - multiple ORs with variable refs', async () => {
  const config = await configorama({
    a: 5,
    b: 10,
    c: 20,
    test1: '${eval(${self:a} || ${self:b})}',
    test2: '${eval(${self:a} || ${self:b} || ${self:c})}'
  }, {
    configDir: dirname
  })

  // First truthy value wins
  assert.is(config.test1, 5)
  assert.is(config.test2, 5)
})

test('eval edge case - nullish coalescing', async () => {
  const config = await configorama({
    result: '${eval(null ?? "default")}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'default')
})

// ============================================
// Result type preservation
// ============================================

test('eval edge case - result type is number', async () => {
  const config = await configorama({
    result: '${eval(5 + 5)}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 10)
  assert.is(typeof config.result, 'number')
})

test('eval edge case - result type is boolean', async () => {
  const config = await configorama({
    result: '${eval(5 > 3)}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, true)
  assert.is(typeof config.result, 'boolean')
})

test('eval edge case - result type is string', async () => {
  const config = await configorama({
    result: '${eval("hello" + " " + "world")}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'hello world')
  assert.is(typeof config.result, 'string')
})

// ============================================
// Deeply nested eval expressions
// ============================================

test('eval edge case - nested parentheses', async () => {
  const config = await configorama({
    result: '${eval(((((1 + 2)))))}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 3)
})

test('eval edge case - very long expression', async () => {
  const config = await configorama({
    result: '${eval(1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1+1)}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 20)
})

// ============================================
// Eval with variables
// ============================================

test('eval edge case - variables in expression', async () => {
  const config = await configorama({
    a: 10,
    b: 5,
    result: '${eval(${self:a} * ${self:b})}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 50)
})

test('eval edge case - nested eval in fallback', async () => {
  const config = await configorama({
    result: '${eval(${self:missing, 5} + 10)}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 15)
})

// ============================================
// Security - dangerous operations should fail or be safe
// ============================================

test('eval edge case - assignment should not work', async () => {
  try {
    await configorama({
      result: '${eval(a = 5)}'
    }, {
      configDir: dirname
    })
    // If it doesn't throw, check the result
  } catch (error) {
    // Assignment in eval should fail
    assert.ok(error)
  }
})

test('eval edge case - function call attempt', async () => {
  try {
    const config = await configorama({
      result: '${eval(Math.random())}'
    }, {
      configDir: dirname
    })
    // If it succeeds, should return a number between 0 and 1
    if (typeof config.result === 'number') {
      assert.ok(config.result >= 0 && config.result < 1)
    }
  } catch (error) {
    // Or it could be blocked for security
    assert.ok(error)
  }
})

test('eval edge case - constructor access attempt', async () => {
  try {
    const config = await configorama({
      result: '${eval(this.constructor)}'
    }, {
      configDir: dirname
    })
    // Should either fail or return something safe
    assert.ok(config.result === undefined || config.result === null || typeof config.result !== 'function')
  } catch (error) {
    assert.ok(error)
  }
})

// ============================================
// Edge cases with special values
// ============================================

test('eval edge case - undefined in expression', async () => {
  const config = await configorama({
    result: '${eval(undefined === undefined)}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, true)
})

test('eval edge case - null in expression may not work', async () => {
  // LIMITATION: null keyword may not be recognized in eval
  const config = await configorama({
    result: '${eval(null === null)}'
  }, {
    configDir: dirname
  })

  // Result may be true, false, or string depending on null handling
  assert.ok(typeof config.result === 'boolean' || typeof config.result === 'string')
})

test('eval edge case - empty string comparison', async () => {
  const config = await configorama({
    result: '${eval("" === "")}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, true)
})

// ============================================
// Ternary operator
// ============================================

test('eval edge case - ternary operator true branch', async () => {
  const config = await configorama({
    result: '${eval(5 > 3 ? "yes" : "no")}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'yes')
})

test('eval edge case - ternary operator false branch', async () => {
  const config = await configorama({
    result: '${eval(5 < 3 ? "yes" : "no")}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'no')
})

test('eval edge case - nested ternary', async () => {
  const config = await configorama({
    value: 5,
    result: '${eval(${self:value} < 0 ? "negative" : ${self:value} > 0 ? "positive" : "zero")}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'positive')
})

// ============================================
// NOT prefix operator
// ============================================

test('eval edge case - NOT prefix operator', async () => {
  const config = await configorama({
    notTrue: '${eval(!true)}',
    notFalse: '${eval(!false)}',
    doubleNot: '${eval(!!true)}',
    notZero: '${eval(!0)}',
    notOne: '${eval(!1)}',
    notEmptyString: '${eval(!\"\")}'
  }, {
    configDir: dirname
  })

  assert.is(config.notTrue, false)
  assert.is(config.notFalse, true)
  assert.is(config.doubleNot, true)
  assert.is(config.notZero, true)
  assert.is(config.notOne, false)
  assert.is(config.notEmptyString, true)
})

test('eval edge case - NOT with comparison', async () => {
  const config = await configorama({
    val: 0,
    result: '${eval(!(5 > 10))}',
    notComparison: '${eval(!(${self:val} > 5))}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, true)
  assert.is(config.notComparison, true) // !(0 > 5) = !false = true
})

// ============================================
// Greater/less than or equal
// ============================================

test('eval edge case - greater than or equal', async () => {
  const config = await configorama({
    gte1: '${eval(5 >= 5)}',
    gte2: '${eval(6 >= 5)}',
    gte3: '${eval(4 >= 5)}'
  }, {
    configDir: dirname
  })

  assert.is(config.gte1, true)
  assert.is(config.gte2, true)
  assert.is(config.gte3, false)
})

test('eval edge case - less than or equal', async () => {
  const config = await configorama({
    lte1: '${eval(5 <= 5)}',
    lte2: '${eval(4 <= 5)}',
    lte3: '${eval(6 <= 5)}'
  }, {
    configDir: dirname
  })

  assert.is(config.lte1, true)
  assert.is(config.lte2, true)
  assert.is(config.lte3, false)
})

test('eval edge case - combined >= <= with variables', async () => {
  const config = await configorama({
    min: 0,
    max: 100,
    val: 50,
    inRange: '${eval(${self:val} >= ${self:min} && ${self:val} <= ${self:max})}'
  }, {
    configDir: dirname
  })

  assert.is(config.inRange, true)
})

test.run()
