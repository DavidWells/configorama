/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const ini = require('./ini')

test('ini parse basic', () => {
  const iniContent = `
key=value
number=123
boolean=true

[section]
sectionKey=sectionValue
`
  const result = ini.parse(iniContent)
  
  assert.is(result.key, 'value')
  assert.is(result.number, '123')
  assert.is(result.boolean, 'true')
  assert.equal(result.section, {
    sectionKey: 'sectionValue'
  })
})

test('ini dump basic', () => {
  const obj = {
    key: 'value',
    number: 123,
    section: {
      sectionKey: 'sectionValue'
    }
  }
  
  const result = ini.dump(obj)
  assert.ok(result.includes('key=value'))
  assert.ok(result.includes('number=123'))
  assert.ok(result.includes('[section]'))
  assert.ok(result.includes('sectionKey=sectionValue'))
})

test('ini toYaml', () => {
  const iniContent = `
key=value
[section]
sectionKey=sectionValue
`
  
  const result = ini.toYaml(iniContent)
  assert.ok(result.includes('key: value'))
  assert.ok(result.includes('section:'))
  assert.ok(result.includes('sectionKey: sectionValue'))
})

test('ini toJson', () => {
  const iniContent = `
key=value
[section]
sectionKey=sectionValue
`
  
  const result = ini.toJson(iniContent)
  const parsed = JSON.parse(result)
  
  assert.is(parsed.key, 'value')
  assert.equal(parsed.section, {
    sectionKey: 'sectionValue'
  })
})

test('ini parse error handling', () => {
  let error
  try {
    ini.parse('[invalid ini content')
  } catch (e) {
    error = e
  }
  assert.ok(error instanceof Error)
})

test.run()