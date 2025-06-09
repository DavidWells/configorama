/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const ini = require('./ini')

function normalize(obj) {
  return JSON.parse(JSON.stringify(obj))
}

test('ini parse basic', () => {
  const iniContent = `
key=value
number=123
boolean=true

[section]
sectionKey=sectionValue
`
  const result = ini.parse(iniContent)
  console.log('result', result)
  
  assert.is(result.key, 'value', 'key should be value')
  assert.is(result.number, '123', 'number should be 123')
  assert.is(result.boolean, true, 'boolean should be true')
  assert.equal(normalize(result.section), normalize({
    sectionKey: 'sectionValue'
  }), 'section should be sectionValue')
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
  console.log('result', result)

  const parsed = JSON.parse(result)
  assert.is(parsed.key, 'value')
  assert.equal(parsed.section,{
    sectionKey: 'sectionValue'
  })
})

test.skip('ini parse error handling', () => {
  let error
  try {
    const result = ini.parse('invalid ini content')
    console.log('ini parse error handling', result)
  } catch (e) {
    error = e
  }
  assert.ok(error instanceof Error)
})

test.run()