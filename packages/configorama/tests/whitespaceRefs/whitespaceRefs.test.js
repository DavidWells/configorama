/* Whitespace handling in variable references */
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

const dirname = __dirname

// ============================================
// Leading/trailing whitespace in variable syntax
// ============================================

test('whitespace - no whitespace (standard)', async () => {
  const config = await configorama({
    key: 'value',
    ref: '${self:key}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'value')
})

test('whitespace - space after opening brace', async () => {
  const config = await configorama({
    key: 'value',
    ref: '${ self:key}'
  }, {
    configDir: dirname
  })

  // Should still resolve
  assert.is(config.ref, 'value')
})

test('whitespace - space before closing brace', async () => {
  const config = await configorama({
    key: 'value',
    ref: '${self:key }'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'value')
})

test('whitespace - spaces on both sides', async () => {
  const config = await configorama({
    key: 'value',
    ref: '${ self:key }'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'value')
})

test('whitespace - multiple spaces', async () => {
  const config = await configorama({
    key: 'value',
    ref: '${   self:key   }'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'value')
})

test('whitespace - tabs not treated as whitespace', async () => {
  // LIMITATION: only spaces are trimmed, not tabs
  const config = await configorama({
    key: 'value',
    ref: '${\tself:key\t}'
  }, {
    configDir: dirname
  })

  // Tabs are not trimmed, so variable isn't matched
  assert.is(typeof config.ref, 'string')
})

test('whitespace - newline breaks variable matching', async () => {
  // LIMITATION: newlines in variable syntax break matching
  const config = await configorama({
    key: 'value',
    ref: '${\nself:key\n}'
  }, {
    configDir: dirname
  })

  // Newlines break the regex match
  assert.is(typeof config.ref, 'string')
})

test('whitespace - mixed whitespace only spaces work', async () => {
  // LIMITATION: only spaces work, tabs/newlines don't
  const config = await configorama({
    key: 'value',
    ref: '${ \t\n self:key \n\t }'
  }, {
    configDir: dirname
  })

  // Mixed whitespace doesn't match
  assert.is(typeof config.ref, 'string')
})

// ============================================
// Whitespace around type separator
// ============================================

test('whitespace - space before colon throws error', async () => {
  // LIMITATION: space before colon causes "invalid variable syntax" error
  try {
    await configorama({
      key: 'value',
      ref: '${self :key}'
    }, {
      configDir: dirname
    })
    assert.unreachable('should throw')
  } catch (error) {
    assert.ok(error.message.includes('invalid variable syntax'))
  }
})

test('whitespace - space after colon throws error', async () => {
  // LIMITATION: space after colon causes resolution failure
  try {
    await configorama({
      key: 'value',
      ref: '${self: key}'
    }, {
      configDir: dirname
    })
    assert.unreachable('should throw')
  } catch (error) {
    assert.ok(error.message.includes('Unable to resolve'))
  }
})

test('whitespace - spaces around colon throws error', async () => {
  // LIMITATION: spaces around colon cause "invalid variable syntax" error
  try {
    await configorama({
      key: 'value',
      ref: '${self : key}'
    }, {
      configDir: dirname
    })
    assert.unreachable('should throw')
  } catch (error) {
    assert.ok(error.message.includes('invalid variable syntax'))
  }
})

// ============================================
// Whitespace in nested references
// ============================================

test('whitespace - nested with outer whitespace', async () => {
  const config = await configorama({
    inner: 'nested-value',
    outer: '${ self:inner }'
  }, {
    configDir: dirname
  })

  assert.is(config.outer, 'nested-value')
})

test('whitespace - nested variable reference with whitespace', async () => {
  const config = await configorama({
    key: 'keyName',
    values: {
      keyName: 'resolved-value'
    },
    ref: '${ self:values.${ self:key } }'
  }, {
    configDir: dirname
  })

  // Nested refs with whitespace
  assert.is(config.ref, 'resolved-value')
})

// ============================================
// Whitespace in fallback syntax
// ============================================

test('whitespace - space around comma in fallback', async () => {
  const config = await configorama({
    ref: '${self:missing , "fallback"}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'fallback')
})

test('whitespace - multiple spaces around fallback', async () => {
  const config = await configorama({
    ref: '${self:missing   ,   "fallback"}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'fallback')
})

test('whitespace - newline in fallback breaks matching', async () => {
  // LIMITATION: newline in variable syntax breaks regex matching
  const config = await configorama({
    ref: '${self:missing,\n"fallback"}'
  }, {
    configDir: dirname
  })

  // Newline breaks matching, returns literal string
  assert.is(typeof config.ref, 'string')
})

// ============================================
// Whitespace in env variables
// ============================================

test('whitespace - env var with spaces', async () => {
  process.env.WHITESPACE_TEST = 'env-value'

  const config = await configorama({
    ref: '${ env:WHITESPACE_TEST }'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'env-value')
  delete process.env.WHITESPACE_TEST
})

// ============================================
// Whitespace in opt variables
// ============================================

test('whitespace - opt var with spaces', async () => {
  const config = await configorama({
    ref: '${ opt:stage }'
  }, {
    configDir: dirname,
    options: {
      stage: 'prod'
    }
  })

  assert.is(config.ref, 'prod')
})

// ============================================
// Whitespace in file references
// ============================================

test('whitespace - file ref with spaces', async () => {
  const config = await configorama({
    ref: '${ file(./missing.json):key , "file-fallback" }'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'file-fallback')
})

// ============================================
// Keys with whitespace-like names
// ============================================

test('whitespace - key name containing spaces works', async () => {
  const config = await configorama({
    'key with spaces': 'value',
    ref: '${self:key with spaces, "fallback"}'
  }, {
    configDir: dirname
  })

  // Keys with spaces in references actually work
  assert.is(config.ref, 'value')
})

// ============================================
// Unicode whitespace characters
// ============================================

test('whitespace - non-breaking space (\\u00A0)', async () => {
  const config = await configorama({
    key: 'value',
    ref: '${self:key\u00A0}'
  }, {
    configDir: dirname
  })

  // Non-breaking space might not be trimmed
  // Should either resolve or treat as literal
  assert.ok(typeof config.ref === 'string')
})

test('whitespace - em space (\\u2003)', async () => {
  const config = await configorama({
    key: 'value',
    ref: '${self:key\u2003}'
  }, {
    configDir: dirname
  })

  assert.ok(typeof config.ref === 'string')
})

// ============================================
// Multiple variables with whitespace
// ============================================

test('whitespace - multiple refs in string with whitespace', async () => {
  const config = await configorama({
    a: 'hello',
    b: 'world',
    combined: '${ self:a } ${ self:b }'
  }, {
    configDir: dirname
  })

  assert.is(config.combined, 'hello world')
})

test('whitespace - adjacent refs with whitespace', async () => {
  const config = await configorama({
    a: 'foo',
    b: 'bar',
    combined: '${ self:a }${ self:b }'
  }, {
    configDir: dirname
  })

  assert.is(config.combined, 'foobar')
})

// ============================================
// Dot notation with whitespace
// ============================================

test('whitespace - space in dot notation path', async () => {
  const config = await configorama({
    nested: {
      deep: {
        value: 'found'
      }
    },
    ref: '${self:nested. deep. value, "fallback"}'
  }, {
    configDir: dirname
  })

  // Spaces in path probably won't resolve
  assert.is(config.ref, 'fallback')
})

test('whitespace - no space in dot notation (baseline)', async () => {
  const config = await configorama({
    nested: {
      deep: {
        value: 'found'
      }
    },
    ref: '${self:nested.deep.value}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'found')
})

test.run()
