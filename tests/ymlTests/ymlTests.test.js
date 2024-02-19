/* eslint-disable no-template-curly-in-string */
import test from 'ava'
import path from 'path'
import configorama from '../../lib'

let config

process.env.envNumber = 100

// This runs before all tests
test.before(async t => {
  const args = {
    stage: 'dev',
    otherFlag: 'prod',
    chillFlag: 'nice',
    count: 25
    // empty: 'HEHEHE'
  }

  const configFile = path.join(__dirname, 'test.yml')
  config = await configorama(configFile, {
    options: args,
    allowUnknownVars: true
  })
  console.log(`-------------`)
  console.log(`Value count`, Object.keys(config).length)
  console.log(config)
  console.log(`-------------`)
})

test.after(t => {
  console.log(`-------------`)
})

test('yml valueAsNumber', (t) => {
  t.is(config.valueAsNumber, 1)
})

test('yml fix nested OBJECT var syntax', (t) => {
  t.deepEqual(config.objectNoWrapper, {
    cool: 'no value here'
  })
})

test('yml fix nested OBJECT var syntax 2', (t) => {
  t.deepEqual(config.objectNoWrapperNested, {
    nice: { red: 'woooo' }
  })
})

test('yml OBJECT', (t) => {
  t.deepEqual(config.objectJSStyle, {
    woot: 'wee'
  })
})

test('yml fix nested array var syntax', (t) => {
  t.deepEqual(config.y, {
    'Fn::Not': [
      {
        'Fn::Equals': [ { 'Fn::Join': [ '', '${param:xyz}' ] } ]
      }
    ]
  })
})

test('yml fix nested array var syntax 2', (t) => {
  t.deepEqual(config.Test, {
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

test('yml fix nested array var syntax 3', (t) => {
  t.deepEqual(config.TestTwo, {
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

test('yml fix nested array var syntax 4', (t) => {
  t.deepEqual(config.TestThree, {
    foo: [
      [ 'a', 'b', 'c' ],
      [ 'd', 'e', 'prod', 'nice' ],
      [ 'd', 'e', 'prod', 'nice' ],
      [ 'd', 'e', 'prod', 'nice' ],
      [ 'd', 'e', 'prod', 'nice' ]
    ]
  })
})


test('yml fix multiLineArray', (t) => {
  t.deepEqual(config.multiLineArray, [ 'string1', 'string2', 'string3', 'string4', 'prod', 'string6' ])
})
