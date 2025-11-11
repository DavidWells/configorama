/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

let config

process.env.envNumber = 100

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
    otherFlag: 'prod',
    chillFlag: 'nice',
    count: 25
    // empty: 'HEHEHE'
  }

  try {
    const configFile = path.join(__dirname, 'test.yml')
    config = await configorama(configFile, {
      options: args,
      allowUnknownVars: true
    })
    console.log(`-------------`)
    console.log(`Value count`, Object.keys(config).length)
    console.log(config)
    console.log(`-------------`)
  } catch (err) {
    console.error(`TEST ERROR ${__dirname}\n`, err)
    process.exit(1)
  }
}

// Teardown function
const teardown = () => {
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

test('yml valueAsNumber', () => {
  assert.is(config.valueAsNumber, 1)
})

test('yml fix nested OBJECT var syntax', () => {
  assert.equal(config.objectNoWrapper, {
    cool: 'no value here'
  })
})

test('yml fix nested OBJECT var syntax 2', () => {
  assert.equal(config.objectNoWrapperNested, {
    nice: { red: 'woooo' }
  })
})

test('yml OBJECT', () => {
  assert.equal(config.objectJSStyle, {
    woot: 'wee'
  })
})

test('yml fix nested array var syntax', () => {
  assert.equal(config.y, {
    'Fn::Not': [
      {
        'Fn::Equals': [ { 'Fn::Join': [ '', '${param:xyz}' ] } ]
      }
    ]
  })
})

test('yml fix nested array var syntax 2', () => {
  assert.equal(config.Test, {
    'Fn::Not': [
      {
        'Fn::Equals': [
          '',
          {
            'Fn::Join': [ '', '${param:githubActionsAllowedAwsActions}' ]
          }
        ]
      }
    ]
  })
})

test('yml fix nested array var syntax 3', () => {
  assert.equal(config.TestTwo, {
    'Fn::Not': [
      {
        'Fn::Equals': [
          '',
          {
            'Fn::Join': [ '', 'prod' ]
          }
        ]
      }
    ]
  })
})

test('yml fix nested array var syntax 4', () => {
  assert.equal(config.TestThree, {
    foo: [
      [ 'a', 'b', 'c' ],
      [ 'd', 'e', 'prod', 'nice' ],
      [ 'd', 'e', 'prod', 'nice' ],
      [ 'd', 'e', 'prod', 'nice' ],
      [ 'd', 'e', 'prod', 'nice' ]
    ]
  })
})

test('yml fix multiLineArray', () => {
  assert.equal(config.multiLineArray, [ 'string1', 'string2', 'string3', 'string4', 'prod', 'string6' ])
})

test.run()
