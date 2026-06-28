/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')
const { createPromptDescriptor, validatePromptValue } = require('../../src/utils/ui/promptDescriptors')
const { validateType } = require('../../src/utils/ui/configWizard')

test('Array filter accepts existing arrays', async () => {
  const config = await configorama({
    values: ['a', 'b'],
    copy: '${self:values | Array}',
  })

  assert.equal(config.copy, ['a', 'b'])
})

test('Array filter parses JSON array strings and comma-split strings', async () => {
  const config = await configorama({
    jsonValues: '${opt:jsonValues | Array}',
    csvValues: '${opt:csvValues | Array}',
  }, {
    options: {
      jsonValues: '["a", "b"]',
      csvValues: 'a, b,c',
    }
  })

  assert.equal(config.jsonValues, ['a', 'b'])
  assert.equal(config.csvValues, ['a', 'b', 'c'])
})

test('Array filter rejects invalid array input', async () => {
  try {
    await configorama({
      values: '${opt:values | Array}',
    }, {
      options: { values: '{"not":"array"}' }
    })
    assert.unreachable('should reject non-array object')
  } catch (error) {
    assert.match(error.message, /Expected Array/)
  }
})

test('Object filter accepts objects and parses JSON object strings', async () => {
  const config = await configorama({
    source: { enabled: true },
    copy: '${self:source | Object}',
    parsed: '${opt:objectValue | Object}',
  }, {
    options: { objectValue: '{"name":"api"}' }
  })

  assert.equal(config.copy, { enabled: true })
  assert.equal(config.parsed, { name: 'api' })
})

test('Object filter rejects arrays and invalid object input', async () => {
  try {
    await configorama({
      value: '${opt:value | Object}',
    }, {
      options: { value: '["a"]' }
    })
    assert.unreachable('should reject arrays for Object filter')
  } catch (error) {
    assert.match(error.message, /Expected Object/)
  }
})

test('wizard descriptors and validation align for Array and Object', () => {
  const arrayDescriptor = createPromptDescriptor({
    name: 'items',
    variable: 'option:items',
    variableType: 'option',
    type: 'array',
    required: true,
    sensitive: false,
    default: null,
    allowedValues: null,
    paths: ['items'],
    conflicts: [],
  })
  const objectDescriptor = createPromptDescriptor({
    name: 'settings',
    variable: 'option:settings',
    variableType: 'option',
    type: 'object',
    required: true,
    sensitive: false,
    default: null,
    allowedValues: null,
    paths: ['settings'],
    conflicts: [],
  })

  assert.is(arrayDescriptor.promptType, 'text')
  assert.equal(arrayDescriptor.normalize('a, b'), ['a', 'b'])
  assert.is(validatePromptValue('["a"]', { type: 'array' }), undefined)
  assert.match(validatePromptValue('single', { type: 'array' }), /comma-separated/)

  assert.is(objectDescriptor.promptType, 'text')
  assert.equal(objectDescriptor.normalize('{"ok":true}'), { ok: true })
  assert.is(validateType('{"ok":true}', 'object'), undefined)
  assert.match(validateType('["no"]', 'object'), /JSON object/)
})

test.run()
