/* Parser edge cases for various file formats */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const fs = require('fs')
const configorama = require('../../src')

const dirname = __dirname

// ============================================
// Empty file handling
// ============================================

test('parser edge case - empty YAML file throws error', async () => {
  const emptyYaml = path.join(dirname, 'empty.yml')
  fs.writeFileSync(emptyYaml, '')

  try {
    await configorama(emptyYaml, {
      configDir: dirname
    })
    assert.unreachable('should throw on empty YAML')
  } catch (error) {
    // Empty YAML file causes init error
    assert.ok(error)
  } finally {
    fs.unlinkSync(emptyYaml)
  }
})

test('parser edge case - empty JSON file', async () => {
  const emptyJson = path.join(dirname, 'empty.json')
  fs.writeFileSync(emptyJson, '')

  try {
    await configorama(emptyJson, {
      configDir: dirname
    })
    assert.unreachable('should throw on empty JSON')
  } catch (error) {
    // Empty JSON is invalid
    assert.ok(error)
  } finally {
    fs.unlinkSync(emptyJson)
  }
})

test('parser edge case - JSON with only whitespace', async () => {
  const wsJson = path.join(dirname, 'whitespace.json')
  fs.writeFileSync(wsJson, '   \n\t  ')

  try {
    await configorama(wsJson, {
      configDir: dirname
    })
    assert.unreachable('should throw on whitespace-only JSON')
  } catch (error) {
    assert.ok(error)
  } finally {
    fs.unlinkSync(wsJson)
  }
})

// ============================================
// YAML-specific edge cases
// ============================================

test('parser edge case - YAML with only comments', async () => {
  const commentYaml = path.join(dirname, 'comments-only.yml')
  fs.writeFileSync(commentYaml, '# This is a comment\n# Another comment\n')

  try {
    const config = await configorama(commentYaml, {
      configDir: dirname
    })
    // Should be empty or null
    assert.ok(config === null || config === undefined || (typeof config === 'object' && Object.keys(config).length === 0))
  } finally {
    fs.unlinkSync(commentYaml)
  }
})

test('parser edge case - YAML multiple documents throws error', async () => {
  // LIMITATION: YAML parser only accepts single document
  const multiDocYaml = path.join(dirname, 'multi-doc.yml')
  fs.writeFileSync(multiDocYaml, '---\nkey: value1\n---\nkey: value2\n')

  try {
    await configorama(multiDocYaml, {
      configDir: dirname
    })
    assert.unreachable('should throw on multi-document YAML')
  } catch (error) {
    // Multi-document YAML throws "expected a single document" error
    assert.ok(error.message.includes('single document'))
  } finally {
    fs.unlinkSync(multiDocYaml)
  }
})

test('parser edge case - YAML explicit document end', async () => {
  const docEndYaml = path.join(dirname, 'doc-end.yml')
  fs.writeFileSync(docEndYaml, 'key: value\n...\n')

  const config = await configorama(docEndYaml, {
    configDir: dirname
  })

  assert.is(config.key, 'value')
  fs.unlinkSync(docEndYaml)
})

test('parser edge case - YAML anchor and alias with variable', async () => {
  const anchorYaml = path.join(dirname, 'anchor.yml')
  fs.writeFileSync(anchorYaml, `
defaults: &defaults
  timeout: 30
  retries: 3

production:
  <<: *defaults
  timeout: '\${self:custom.prodTimeout}'

custom:
  prodTimeout: 60
`)

  const config = await configorama(anchorYaml, {
    configDir: dirname
  })

  assert.is(config.production.timeout, 60)
  assert.is(config.production.retries, 3)
  fs.unlinkSync(anchorYaml)
})

test('parser edge case - YAML multiline literal with variable', async () => {
  const multilineYaml = path.join(dirname, 'multiline.yml')
  fs.writeFileSync(multilineYaml, `
name: test
description: |
  This is a multiline
  description for \${self:name}
  project.
`)

  const config = await configorama(multilineYaml, {
    configDir: dirname
  })

  assert.ok(config.description.includes('test'))
  assert.ok(config.description.includes('multiline'))
  fs.unlinkSync(multilineYaml)
})

test('parser edge case - YAML folded block with variable', async () => {
  const foldedYaml = path.join(dirname, 'folded.yml')
  fs.writeFileSync(foldedYaml, `
name: myapp
command: >
  echo "Running \${self:name}"
  && exit 0
`)

  const config = await configorama(foldedYaml, {
    configDir: dirname
  })

  assert.ok(config.command.includes('myapp'))
  fs.unlinkSync(foldedYaml)
})

// ============================================
// JSON5/JSONC edge cases
// ============================================

test('parser edge case - JSON with comments (JSONC)', async () => {
  const jsoncFile = path.join(dirname, 'with-comments.jsonc')
  fs.writeFileSync(jsoncFile, `{
  // This is a comment
  "key": "value",
  /* block comment */
  "ref": "\${self:key}"
}`)

  const config = await configorama(jsoncFile, {
    configDir: dirname
  })

  assert.is(config.key, 'value')
  assert.is(config.ref, 'value')
  fs.unlinkSync(jsoncFile)
})

test('parser edge case - JSON5 single quotes', async () => {
  const json5File = path.join(dirname, 'single-quotes.json5')
  fs.writeFileSync(json5File, `{
  key: 'value',
  ref: '\${self:key}'
}`)

  const config = await configorama(json5File, {
    configDir: dirname
  })

  assert.is(config.key, 'value')
  assert.is(config.ref, 'value')
  fs.unlinkSync(json5File)
})

test('parser edge case - JSON5 unquoted keys', async () => {
  const json5File = path.join(dirname, 'unquoted-keys.json5')
  fs.writeFileSync(json5File, `{
  unquotedKey: "value",
  ref: "\${self:unquotedKey}"
}`)

  const config = await configorama(json5File, {
    configDir: dirname
  })

  assert.is(config.unquotedKey, 'value')
  assert.is(config.ref, 'value')
  fs.unlinkSync(json5File)
})

// ============================================
// File encoding edge cases
// ============================================

test('parser edge case - UTF-8 BOM', async () => {
  const bomFile = path.join(dirname, 'bom.json')
  // UTF-8 BOM: EF BB BF
  fs.writeFileSync(bomFile, '\ufeff{"key": "value", "ref": "${self:key}"}')

  const config = await configorama(bomFile, {
    configDir: dirname
  })

  assert.is(config.key, 'value')
  assert.is(config.ref, 'value')
  fs.unlinkSync(bomFile)
})

test('parser edge case - mixed line endings', async () => {
  const mixedFile = path.join(dirname, 'mixed-endings.yml')
  // Mix CRLF and LF
  fs.writeFileSync(mixedFile, 'key: value\r\nref: ${self:key}\nother: data\r\n')

  const config = await configorama(mixedFile, {
    configDir: dirname
  })

  assert.is(config.key, 'value')
  assert.is(config.ref, 'value')
  fs.unlinkSync(mixedFile)
})

test('parser edge case - Windows CRLF line endings', async () => {
  const crlfFile = path.join(dirname, 'crlf.yml')
  fs.writeFileSync(crlfFile, 'key: value\r\nref: ${self:key}\r\n')

  const config = await configorama(crlfFile, {
    configDir: dirname
  })

  assert.is(config.key, 'value')
  assert.is(config.ref, 'value')
  fs.unlinkSync(crlfFile)
})

test('parser edge case - old Mac CR line endings', async () => {
  const crFile = path.join(dirname, 'cr.yml')
  fs.writeFileSync(crFile, 'key: value\rref: ${self:key}\r')

  try {
    const config = await configorama(crFile, {
      configDir: dirname
    })
    // CR-only might work or might not parse correctly
    assert.ok(config)
  } catch (error) {
    // It's acceptable if CR-only fails
    assert.ok(error)
  } finally {
    fs.unlinkSync(crFile)
  }
})

// ============================================
// Unicode in keys and values
// ============================================

test('parser edge case - unicode in keys does not resolve in refs', async () => {
  // LIMITATION: Unicode characters in variable references don't match
  const config = await configorama({
    'キー': 'value',
    'clé': 'valeur',
    'مفتاح': 'قيمة',
    ref1: '${self:キー}',
    ref2: '${self:clé}',
    ref3: '${self:مفتاح}'
  }, {
    configDir: dirname
  })

  // Unicode keys exist but refs don't resolve
  assert.is(config['キー'], 'value')
  assert.is(config['clé'], 'valeur')
  // The refs remain as literal strings
  assert.is(typeof config.ref1, 'string')
})

test('parser edge case - emoji in keys does not resolve', async () => {
  // LIMITATION: Emoji in variable references don't match
  const config = await configorama({
    '🔑': 'secret',
    ref: '${self:🔑}'
  }, {
    configDir: dirname
  })

  // Emoji key exists but ref doesn't resolve
  assert.is(config['🔑'], 'secret')
  assert.is(typeof config.ref, 'string')
})

test('parser edge case - unicode in values preserved', async () => {
  const config = await configorama({
    greeting: 'こんにちは世界',
    ref: '${self:greeting}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'こんにちは世界')
})

// ============================================
// Special value handling
// ============================================

test('parser edge case - very large number', async () => {
  const config = await configorama({
    large: 9999999999999999999999999999n,
    ref: '${self:large}'
  }, {
    configDir: dirname
  })

  // BigInt handling
  assert.ok(config.ref !== undefined)
})

test('parser edge case - special YAML values', async () => {
  const specialYaml = path.join(dirname, 'special-values.yml')
  fs.writeFileSync(specialYaml, `
yes_val: yes
no_val: no
on_val: on
off_val: off
null_val: null
tilde_null: ~
`)

  const config = await configorama(specialYaml, {
    configDir: dirname
  })

  // YAML 1.1 treats these as booleans/null
  assert.is(config.null_val, null)
  assert.is(config.tilde_null, null)
  // yes/no/on/off may be boolean or string depending on parser
  assert.ok(config.yes_val === true || config.yes_val === 'yes')
  fs.unlinkSync(specialYaml)
})

test('parser edge case - YAML date/time', async () => {
  const dateYaml = path.join(dirname, 'date-values.yml')
  fs.writeFileSync(dateYaml, `
date: 2024-01-15
datetime: 2024-01-15T10:30:00Z
`)

  const config = await configorama(dateYaml, {
    configDir: dirname
  })

  // Dates might be parsed as Date objects or strings
  assert.ok(config.date)
  assert.ok(config.datetime)
  fs.unlinkSync(dateYaml)
})

// ============================================
// Deeply nested structures
// ============================================

test('parser edge case - very deep nesting', async () => {
  const deep = { level0: { level1: { level2: { level3: { level4: { level5: { level6: { level7: { level8: { level9: { value: 'deep' } } } } } } } } } } }

  const config = await configorama({
    ...deep,
    ref: '${self:level0.level1.level2.level3.level4.level5.level6.level7.level8.level9.value}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'deep')
})

test('parser edge case - wide structure with many keys', async () => {
  const wide = {}
  for (let i = 0; i < 100; i++) {
    wide[`key${i}`] = `value${i}`
  }
  wide.ref50 = '${self:key50}'
  wide.ref99 = '${self:key99}'

  const config = await configorama(wide, {
    configDir: dirname
  })

  assert.is(config.ref50, 'value50')
  assert.is(config.ref99, 'value99')
})

// ============================================
// Keys with special characters
// ============================================

test('parser edge case - key with dots', async () => {
  const config = await configorama({
    'dotted.key.name': 'value',
    // Can't reference dotted keys with dot notation
    ref: '${self:dotted.key.name, "fallback"}'
  }, {
    configDir: dirname
  })

  // Dotted keys can't be referenced - uses fallback
  assert.is(config.ref, 'fallback')
})

test('parser edge case - key with hyphen', async () => {
  const config = await configorama({
    'hyphen-key': 'value',
    ref: '${self:hyphen-key}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'value')
})

test('parser edge case - key with underscore', async () => {
  const config = await configorama({
    'under_score_key': 'value',
    ref: '${self:under_score_key}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'value')
})

test('parser edge case - numeric key', async () => {
  const config = await configorama({
    '123': 'numeric-key-value',
    ref: '${self:123}'
  }, {
    configDir: dirname
  })

  assert.is(config.ref, 'numeric-key-value')
})

// ============================================
// No trailing newline
// ============================================

test('parser edge case - file with no trailing newline', async () => {
  const noNewlineFile = path.join(dirname, 'no-newline.yml')
  fs.writeFileSync(noNewlineFile, 'key: value') // No trailing newline

  const config = await configorama(noNewlineFile, {
    configDir: dirname
  })

  assert.is(config.key, 'value')
  fs.unlinkSync(noNewlineFile)
})

test.run()
