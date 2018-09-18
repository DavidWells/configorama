import test from 'ava'
import path from 'path'
import Configorama from '../../../lib'

let config

process.env.envNumber = 100

// This runs before all tests
test.before(async t => {
  const args = {
    stage: 'dev',
    otherFlag: 'prod',
    count: 25
    // empty: 'HEHEHE'
  }

  const configFile = path.join(__dirname, 'fileValuesPath.yml')
  const configorama = new Configorama(configFile)

  config = await configorama.init(args)
  console.log(`-------------`)
  console.log(`Value count`, Object.keys(config).length)
  console.log(config)
  console.log(`-------------`)
})

test.after(t => {
  console.log(`-------------`)
})

test('siblingFile', (t) => {
  t.deepEqual(config.siblingFile, { siblingFile: true })
})

test('childFile', (t) => {
  t.deepEqual(config.childFile, { childFile: true })
})

test('child file with reference to parent file', (t) => {
  t.deepEqual(config.childRefParent, {
    childFile: 'two',
    parentParentRef: {
      otherParent: 'otherParentValue'
    }
  })
})

test('parentFile', (t) => {
  t.deepEqual(config.parentFile, {
    valuesFromParent: 'hi',
    value: 'otherValue',
    thirdValue: 'third',
    otherP: { otherParent: 'otherParentValue' }
  })
})

test('parent file with reference to child file', (t) => {
  t.deepEqual(config.parentRefChild, {
    parentRefChild: 'hello',
    child: {
      childFile: true
    }
  })
})
