/* eslint-disable no-template-curly-in-string */
/**
 * Tests for parseFile with HCL/Terraform files
 */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const { parseFile } = require('../../src/utils/parsing/parse')

test('parse .tf file using parseFile', () => {
  const filePath = path.join(__dirname, 'simple.tf')
  const result = parseFile(filePath)
  console.log('tf result', result)

  console.log('parseFile .tf result', JSON.stringify(result, null, 2))

  assert.ok(result, 'result should exist')
  assert.ok(result.variable, 'should have variable section')
})

test('parse .tf.json file using parseFile', () => {
  const filePath = path.join(__dirname, 'config.tf.json')
  const result = parseFile(filePath)

  console.log('parseFile .tf.json result', JSON.stringify(result, null, 2))

  assert.ok(result, 'result should exist')
  assert.ok(result.variable, 'should have variable section')
})

test('parse complex .tf file', () => {
  const filePath = path.join(__dirname, 'main.tf')
  const result = parseFile(filePath)

  console.log('parseFile main.tf result', JSON.stringify(result, null, 2))

  assert.ok(result, 'result should exist')
  // Check for Terraform structure elements
  assert.ok(
    result.variable || result.resource || result.locals || result.output,
    'should have at least one Terraform block type'
  )
})

test.run()
