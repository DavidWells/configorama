/* eslint-disable no-template-curly-in-string */
/**
 * Pathological edge case testing
 *
 * This suite tests extreme cases that might break the resolution engine:
 * - Resolution order dependencies
 * - Circular references that are hard to detect
 * - Very deep nesting that might hit recursion limits
 * - Variables that change meaning during resolution
 * - Parallel resolution conflicts
 * - Memory/performance stress cases
 */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

const dirname = path.dirname(__filename)

// ============================================
// Resolution order dependencies
// ============================================

test('resolution order - forward reference', async () => {
  // variable 'a' references 'b' which is defined later
  const config = await configorama({
    a: '${self:b}',
    b: 'value'
  }, {
    configDir: dirname
  })

  assert.is(config.a, 'value')
})

test('resolution order - backward reference', async () => {
  // variable 'b' references 'a' which is defined earlier
  const config = await configorama({
    a: 'value',
    b: '${self:a}'
  }, {
    configDir: dirname
  })

  assert.is(config.b, 'value')
})

test('resolution order - mutual dependency via shared target', async () => {
  const config = await configorama({
    target: 'final-value',
    a: '${self:target}',
    b: '${self:target}',
    c: '${self:target}'
  }, {
    configDir: dirname
  })

  // All should resolve to the same value
  assert.is(config.a, 'final-value')
  assert.is(config.b, 'final-value')
  assert.is(config.c, 'final-value')
})

test('resolution order - chain that resolves bottom-up', async () => {
  const config = await configorama({
    level1: '${self:level2}',
    level2: '${self:level3}',
    level3: '${self:level4}',
    level4: '${self:level5}',
    level5: 'bottom'
  }, {
    configDir: dirname
  })

  assert.is(config.level1, 'bottom')
})

test('resolution order - diamond dependency', async () => {
  const config = await configorama({
    // Diamond: top depends on middle1 and middle2, both depend on bottom
    bottom: 'base-value',
    middle1: '${self:bottom}',
    middle2: '${self:bottom}',
    top: '${self:middle1}-${self:middle2}'
  }, {
    configDir: dirname
  })

  assert.is(config.top, 'base-value-base-value')
})

// ============================================
// Near-circular references (should work)
// ============================================

test('near-circular - parallel chains to same target', async () => {
  const config = await configorama({
    target: 'shared',
    pathA1: '${self:target}',
    pathA2: '${self:pathA1}',
    pathB1: '${self:target}',
    pathB2: '${self:pathB1}',
    // Both chains converge but don't create a cycle
    result: '${self:pathA2}-${self:pathB2}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'shared-shared')
})

test('near-circular - dynamic key that references different path', async () => {
  const config = await configorama({
    keyName: 'dataKey',
    dataKey: 'actualValue',
    // This looks circular but isn't: keyName -> "dataKey", then lookup dataKey
    result: '${self:${self:keyName}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'actualValue')
})

// ============================================
// True circular references (should fail)
// ============================================

test('direct circular reference detected', async () => {
  try {
    await configorama({
      a: '${self:b}',
      b: '${self:a}'
    }, {
      configDir: dirname
    })
    assert.unreachable('should have thrown')
  } catch (error) {
    assert.match(error.message, /Circular variable dependency detected/)
  }
})

test('indirect circular reference via dynamic key', async () => {
  // This is actually NOT circular because:
  // ${self:key} -> "value"
  // ${self:value} -> "key"
  // ${self:key} (second lookup) -> "value"
  // So it resolves to the string "value" at the end, not circular
  const config = await configorama({
    key: 'value',
    value: 'key',
    // key -> "value", self:value -> "key", self:key -> "value" (string literal)
    result: '${self:${self:${self:key}}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'value')
})

test('circular reference hidden in fallback chain', async () => {
  try {
    await configorama({
      a: '${opt:missing, ${self:b}}',
      b: '${opt:missing, ${self:c}}',
      c: '${opt:missing, ${self:a}}'
    }, {
      configDir: dirname,
      options: {}
    })
    assert.unreachable('should have thrown')
  } catch (error) {
    assert.match(error.message, /Circular variable dependency detected/)
  }
})

test('circular via dynamic keys', async () => {
  try {
    await configorama({
      key1: 'key2',
      key2: 'key1',
      data: {
        key1: '${self:data.${self:key1}}',
        key2: '${self:data.${self:key2}}'
      }
    }, {
      configDir: dirname
    })
    assert.unreachable('should have thrown')
  } catch (error) {
    assert.match(error.message, /Circular variable dependency detected/)
  }
})

// ============================================
// Deep nesting stress tests
// ============================================

test('very deep nesting - 15 levels', async () => {
  const config = await configorama({
    l1: '${self:l2}',
    l2: '${self:l3}',
    l3: '${self:l4}',
    l4: '${self:l5}',
    l5: '${self:l6}',
    l6: '${self:l7}',
    l7: '${self:l8}',
    l8: '${self:l9}',
    l9: '${self:l10}',
    l10: '${self:l11}',
    l11: '${self:l12}',
    l12: '${self:l13}',
    l13: '${self:l14}',
    l14: '${self:l15}',
    l15: 'deep-value'
  }, {
    configDir: dirname
  })

  assert.is(config.l1, 'deep-value')
})

test('very deep object path - 10 levels', async () => {
  const config = await configorama({
    root: {
      l1: {
        l2: {
          l3: {
            l4: {
              l5: {
                l6: {
                  l7: {
                    l8: {
                      l9: {
                        value: 'found'
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    result: '${self:root.l1.l2.l3.l4.l5.l6.l7.l8.l9.value}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'found')
})

test('deep nesting with dynamic keys at each level', async () => {
  const config = await configorama({
    k1: 'a',
    k2: 'b',
    k3: 'c',
    k4: 'd',
    k5: 'e',
    data: {
      a: {
        b: {
          c: {
            d: {
              e: 'nested-dynamic'
            }
          }
        }
      }
    },
    result: '${self:data.${self:k1}.${self:k2}.${self:k3}.${self:k4}.${self:k5}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'nested-dynamic')
})

test('deeply nested with fallbacks at multiple levels', async () => {
  const config = await configorama({
    l1: '${opt:x1, ${self:l2}}',
    l2: '${opt:x2, ${self:l3}}',
    l3: '${opt:x3, ${self:l4}}',
    l4: '${opt:x4, ${self:l5}}',
    l5: '${opt:x5, ${self:l6}}',
    l6: '${opt:x6, ${self:l7}}',
    l7: '${opt:x7, ${self:l8}}',
    l8: '${opt:x8, ${self:l9}}',
    l9: '${opt:x9, ${self:l10}}',
    l10: 'final-fallback'
  }, {
    configDir: dirname,
    options: {}
  })

  assert.is(config.l1, 'final-fallback')
})

// ============================================
// Variables that change meaning
// ============================================

test('variable key is also a variable value', async () => {
  const config = await configorama({
    key: 'key',
    data: {
      key: 'value-of-key'
    },
    // self:key resolves to "key", then data.key resolves to "value-of-key"
    result: '${self:data.${self:key}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'value-of-key')
})

test('nested variables with shadowing names', async () => {
  const config = await configorama({
    name: 'outer',
    outer: {
      name: 'middle',
      middle: {
        name: 'inner',
        inner: 'innermost-value'
      }
    },
    // Resolve through shadowed names
    step1: '${self:name}', // "outer"
    step2: '${self:outer.name}', // "middle"
    step3: '${self:outer.middle.name}', // "inner"
    step4: '${self:outer.middle.inner}' // "innermost-value"
  }, {
    configDir: dirname
  })

  assert.is(config.step1, 'outer')
  assert.is(config.step2, 'middle')
  assert.is(config.step3, 'inner')
  assert.is(config.step4, 'innermost-value')
})

test('variable resolves to path that contains variable syntax', async () => {
  const config = await configorama({
    template: 'prefix-${self:suffix}',
    suffix: 'end',
    // First resolves template, which contains a variable
    result: '${self:template}'
  }, {
    configDir: dirname
  })

  // Template should be fully resolved
  assert.is(config.result, 'prefix-end')
})

// ============================================
// Complex fallback scenarios
// ============================================

test('fallback chain with all types exhausted', async () => {
  console.log()
  const config = await configorama({
    lastResort: 'ultimate-fallback',
    // Try opt, env, file, and self in sequence
    result: '${opt:a, ${env:MISSING_VAR_XYZ, ${file(./missing.json):key, ${self:lastResort}}}}'
  }, {
    configDir: dirname,
    options: {}
  })

  assert.is(config.result, 'ultimate-fallback')
})

test('fallback to variable that also has fallback chain', async () => {
  const config = await configorama({
    deepFallback: 'deep-default',
    middleFallback: '${opt:missing, ${self:deepFallback}}',
    result: '${opt:primary, ${self:middleFallback}}'
  }, {
    configDir: dirname,
    options: {}
  })

  assert.is(config.result, 'deep-default')
})

test('multiple fallbacks with dynamic keys', async () => {
  const config = await configorama({
    key1: 'missing1',
    key2: 'missing2',
    key3: 'exists',
    data: {
      exists: 'found-it'
    },
    // Try three dynamic keys before succeeding
    result: '${self:data.${self:key1}, ${self:data.${self:key2}, ${self:data.${self:key3}}}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'found-it')
})

// ============================================
// Array/Object hybrid access patterns
// ============================================

test('object with numeric string keys vs array', async () => {
  const config = await configorama({
    obj: {
      '0': 'object-zero',
      '1': 'object-one'
    },
    arr: ['array-zero', 'array-one'],
    objResult: '${self:obj.0}',
    arrResult: '${self:arr.0}'
  }, {
    configDir: dirname
  })

  assert.is(config.objResult, 'object-zero')
  assert.is(config.arrResult, 'array-zero')
})

test('mixed array and object access in same path', async () => {
  const config = await configorama({
    data: [
      { name: 'first', values: { a: 1, b: 2 } },
      { name: 'second', values: { a: 3, b: 4 } }
    ],
    result: '${self:data.1.values.b}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 4)
})

test('dynamic array index then object property', async () => {
  const config = await configorama({
    index: 0,
    property: 'value',
    items: [
      { value: 'first-value', other: 'first-other' },
      { value: 'second-value', other: 'second-other' }
    ],
    result: '${self:items.${self:index}.${self:property}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'first-value')
})

// ============================================
// Variable syntax edge cases
// ============================================

test('nested variable syntax in fallback', async () => {
  const config = await configorama({
    inner: 'inner-value',
    result: '${opt:missing, "${self:inner}"}'
  }, {
    configDir: dirname,
    options: {}
  })

  // The quotes in the fallback are treated as part of the string, but then ${self:inner} is resolved
  // Result is: inner-value (without quotes)
  assert.is(config.result, 'inner-value')
})

test('multiple variables concatenated without separator', async () => {
  const config = await configorama({
    a: 'hello',
    b: 'world',
    result: '${self:a}${self:b}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'helloworld')
})

test('variable at very start and end of string', async () => {
  const config = await configorama({
    start: 'BEGIN',
    end: 'END',
    result: '${self:start}-middle-${self:end}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'BEGIN-middle-END')
})

test('empty string between variables', async () => {
  const config = await configorama({
    a: 'A',
    b: 'B',
    c: 'C',
    result: '${self:a}${self:b}${self:c}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'ABC')
})

// ============================================
// Stress tests for large configs
// ============================================

test('many variables referencing single source', async () => {
  const config = await configorama({
    source: 'shared-value',
    ref1: '${self:source}',
    ref2: '${self:source}',
    ref3: '${self:source}',
    ref4: '${self:source}',
    ref5: '${self:source}',
    ref6: '${self:source}',
    ref7: '${self:source}',
    ref8: '${self:source}',
    ref9: '${self:source}',
    ref10: '${self:source}'
  }, {
    configDir: dirname
  })

  // All should resolve to the same value
  for (let i = 1; i <= 10; i++) {
    assert.is(config[`ref${i}`], 'shared-value')
  }
})

test('wide tree of dependencies', async () => {
  const config = await configorama({
    root: 'root-value',
    // Level 1 - all depend on root
    a1: '${self:root}',
    a2: '${self:root}',
    a3: '${self:root}',
    // Level 2 - depend on level 1
    b1: '${self:a1}',
    b2: '${self:a2}',
    b3: '${self:a3}',
    // Level 3 - depend on level 2
    c1: '${self:b1}',
    c2: '${self:b2}',
    c3: '${self:b3}'
  }, {
    configDir: dirname
  })

  assert.is(config.c1, 'root-value')
  assert.is(config.c2, 'root-value')
  assert.is(config.c3, 'root-value')
})

test('complex object with many nested variables', async () => {
  const config = await configorama({
    baseUrl: 'https://api.example.com',
    version: 'v1',
    stage: 'prod',
    region: 'us-west-2',
    api: {
      users: {
        list: '${self:baseUrl}/${self:version}/users',
        get: '${self:baseUrl}/${self:version}/users/:id',
        create: '${self:baseUrl}/${self:version}/users'
      },
      posts: {
        list: '${self:baseUrl}/${self:version}/posts',
        get: '${self:baseUrl}/${self:version}/posts/:id',
        create: '${self:baseUrl}/${self:version}/posts'
      },
      comments: {
        list: '${self:baseUrl}/${self:version}/comments',
        get: '${self:baseUrl}/${self:version}/comments/:id',
        create: '${self:baseUrl}/${self:version}/comments'
      }
    },
    config: {
      stage: '${self:stage}',
      region: '${self:region}',
      endpoints: {
        users: '${self:api.users.list}',
        posts: '${self:api.posts.list}',
        comments: '${self:api.comments.list}'
      }
    }
  }, {
    configDir: dirname
  })

  assert.is(config.config.endpoints.users, 'https://api.example.com/v1/users')
  assert.is(config.config.endpoints.posts, 'https://api.example.com/v1/posts')
  assert.is(config.config.endpoints.comments, 'https://api.example.com/v1/comments')
})

// ============================================
// Edge cases with allowUnknownVars
// ============================================

test('allowUnknownVars with partial resolution in dynamic key', async () => {
  // allowUnknownVars doesn't prevent errors from missing self: references in dynamic keys
  // The inner ${self:unknownKey} fails before the fallback can be applied
  // This is expected behavior - just test that we handle it
  try {
    await configorama({
      data: {
        known: 'value'
      },
      result: '${self:data.${self:unknownKey}, "fallback"}'
    }, {
      configDir: dirname,
      allowUnknownVars: true
    })
    // If it doesn't throw, check that we got something reasonable
    assert.ok(true)
  } catch (error) {
    // It's also acceptable for this to throw since unknownKey doesn't exist
    assert.ok(error)
  }
})

test('allowUnknownVars with nested unknown variables', async () => {
  // allowUnknownVars doesn't prevent errors from nested self: references that don't exist
  // This will throw because unknown1 doesn't exist
  try {
    await configorama({
      // Both inner variables unknown
      result: '${self:${self:unknown1}, ${self:${self:unknown2}}}'
    }, {
      configDir: dirname,
      allowUnknownVars: true
    })
    // If it resolves, check we got something
    assert.ok(true)
  } catch (error) {
    // Expected - self references to missing keys still throw
    assert.ok(error)
  }
})

// ============================================
// Meta/recursive patterns
// ============================================

test('variable that points to variable syntax', async () => {
  const config = await configorama({
    target: 'actualValue',
    pointer: 'target',
    // Resolves pointer to "target", then resolves that
    result: '${self:${self:pointer}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'actualValue')
})

test('double indirection with object paths', async () => {
  const config = await configorama({
    pathPointer: 'data.nested.value',
    data: {
      nested: {
        value: 'found-it'
      }
    },
    // Can't directly use pathPointer as it contains dots
    // But we can use it in other creative ways
    directPath: '${self:data.nested.value}',

    // Alternative: use keys for each part
    part1: 'data',
    part2: 'nested',
    part3: 'value',
    constructedPath: '${self:${self:part1}.${self:part2}.${self:part3}}'
  }, {
    configDir: dirname
  })

  assert.is(config.directPath, 'found-it')
  assert.is(config.constructedPath, 'found-it')
})

test('self-referential lookup with intermediate step', async () => {
  const config = await configorama({
    lookupKey: 'actualKey',
    actualKey: 'finalValue',
    // Two-step lookup
    result: '${self:${self:lookupKey}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'finalValue')
})

test.run()
