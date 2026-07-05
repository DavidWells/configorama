/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const hcl = require('./hcl')
const JSON5 = require('json5')
const path = require('path')
const fs = require('fs')

function normalize(obj) {
  return JSON.parse(JSON.stringify(obj))
}

test('hcl parse basic variable', async () => {
  const hclContent = `variable "name" {
  description = "Name to be used"
  type = string
  default = "test"
}`
  const result = hcl.parse(hclContent, 'test.tf')
  console.log('basic result', JSON.stringify(result, null, 2))

  assert.ok(result, 'result should exist')
  assert.ok(result.variable, 'should have variable section')
})

test('hcl parse multiple variables', async () => {
  const hclContent = `variable "region" {
  description = "AWS region"
  type = string
  default = "us-east-1"
}

variable "count" {
  description = "Number of instances"
  type = number
  default = 2
}

variable "enabled" {
  description = "Feature flag"
  type = bool
  default = true
}`
  const result = hcl.parse(hclContent, 'test.tf')
  console.log('multiple vars result', JSON.stringify(result, null, 2))

  assert.ok(result, 'result should exist')
  assert.ok(result.variable, 'should have variable section')
})

test('hcl parse with locals', async () => {
  const hclContent = `variable "environment" {
  type = string
  default = "dev"
}

locals {
  app_name = "myapp-\${var.environment}"
}`
  const result = hcl.parse(hclContent, 'test.tf')
  console.log('locals result', JSON.stringify(result, null, 2))

  assert.ok(result, 'result should exist')
  assert.ok(result.variable || result.locals, 'should have variable or locals section')
})

test('hcl parse resource block', async () => {
  const hclContent = `resource "aws_instance" "app" {
  ami = "ami-12345678"
  instance_type = "t3.micro"

  tags = {
    Name = "MyApp"
    Environment = "dev"
  }
}`
  const result = hcl.parse(hclContent, 'test.tf')
  console.log('resource result', JSON.stringify(result, null, 2))

  assert.ok(result, 'result should exist')
  assert.ok(result.resource, 'should have resource section')
})

test('hcl parse from file - simple.tf', async () => {
  const filePath = path.join(__dirname, '../../tests/hclTests/simple.tf')

  // Skip if file doesn't exist
  if (!fs.existsSync(filePath)) {
    console.log('Skipping test - fixture file not found')
    return
  }

  const contents = fs.readFileSync(filePath, 'utf8')
  const result = hcl.parse(contents, 'simple.tf')
  console.log('file parse result', JSON.stringify(result, null, 2))

  assert.ok(result, 'result should exist')
  assert.ok(result.variable, 'should have variable section')
})

test('hcl dump should throw error', () => {
  let error
  try {
    hcl.dump({ foo: 'bar' })
  } catch (e) {
    error = e
  }
  assert.ok(error instanceof Error, 'should throw error')
  assert.ok(error.message.includes('not currently supported'), 'error message should indicate not supported')
})

test('hcl toJson basic', async () => {
  const hclContent = `variable "test" {
  type = string
  default = "value"
}`

  const result = await hcl.toJson(hclContent, 'test.tf')
  console.log('toJson result', result)

  assert.ok(result, 'result should exist')
  assert.ok(typeof result === 'string', 'result should be string')

  const parsed = JSON5.parse(result)
  assert.ok(parsed, 'should be valid JSON5')
})

test('hcl toYaml basic', async () => {
  const hclContent = `variable "test" {
  type = string
  default = "value"
}`

  const result = await hcl.toYaml(hclContent, 'test.tf')
  console.log('toYaml result', result)

  assert.ok(result, 'result should exist')
  assert.ok(typeof result === 'string', 'result should be string')
})

test.run()
