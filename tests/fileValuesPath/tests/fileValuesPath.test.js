const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../../src')

let config

process.env.envNumber = 100

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
    otherFlag: 'prod',
    count: 25
  }

  const configFile = path.join(__dirname, 'fileValuesPath.yml')
  config = await configorama(configFile, {
    options: args
  })
  console.log(`-------------`)
  console.log(`Value count`, Object.keys(config).length)
  console.log(config)
  console.log(`-------------`)
}

// Teardown function
const teardown = () => {
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

test('siblingFile', () => {
  assert.equal(config.siblingFile, { siblingFile: true })
})

test('childFile', () => {
  assert.equal(config.childFile, { childFile: true })
})

test('child file with reference to parent file', () => {
  assert.equal(config.childRefParent, {
    childFile: 'two',
    parentParentRef: {
      otherParent: 'otherParentValue'
    }
  })
})

test('parentFile', () => {
  assert.equal(config.parentFile, {
    valuesFromParent: 'hi',
    value: 'otherValue',
    thirdValue: 'third',
    otherP: { otherParent: 'otherParentValue' }
  })
})

test('parent file with reference to child file', () => {
  assert.equal(config.parentRefChild, {
    parentRefChild: 'hello',
    child: {
      childFile: true
    }
  })
})

test.run()
