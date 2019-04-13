import test from 'ava'
import path from 'path'
import Configorama from '../../lib'



let config

process.env.envReference = 'env var'

// This runs before all tests
test.before(async t => {
  const args = {
    stage: 'dev',
  }

  const configFile = path.join(__dirname, 'functions.yml')
  const configorama = new Configorama(configFile)

  config = await configorama.init(args)
  console.log(`-------------`)
  console.log(`Value count`, Object.keys(config).length)
  console.log(config)
  console.log(`-------------`)
  // const secondConfigorama = new Configorama(config)
  // const secondConfig = await configorama.init(args)
  // console.log(`-------------`)
  // console.log(`secondConfig Value count`, Object.keys(secondConfig).length)
  // console.log(secondConfig)
  // console.log(`-------------`)
})

test.after(t => {
  console.log(`-------------`)
})

test('key', (t) => {
  t.is(config.key, 'haha')
})

test("splitTest: ${split('my!string!whatever', !)}", (t) => {
  t.deepEqual(config.splitTest, [ 'my', 'string', 'whatever' ])
})

test("mergeTest: ${merge('stuff', 'new')}", (t) => {
  t.is(config.mergeTest, 'stuffnew')
})

test("upperKeysTest: ${upperKeys(${object})}", (t) => {
  t.deepEqual(config.upperKeysTest, { ONE: 'once', TWO: 'twice' })
})

// Broken
test("splitWithVariables: ${split(${splitString}, ${separater})}", (t) => {
  t.deepEqual(config.splitWithVariables, [ 'yayaaya', 'whwhwhwhwh', 'hahahaha', 'wowowowo' ])
})

test("splitWithVariablesTwo: ${split(${splitStringTwo}, ${separaterTwo})}", (t) => {
  t.deepEqual(config.splitWithVariablesTwo, [ 'yayaaya', 'whwhwhwhwh', 'hahahaha', 'wowowowo' ])
})

test("nestedFunctions: ${split(merge('haha', 'wawawaw'), 'a')}", (t) => {
  t.deepEqual(config.nestedFunctions, [ 'h', 'h', 'w', 'w', 'w', 'w' ])
})

test("mergeInlineObjects: ${merge(${object}, ${objectTwo})}", (t) => {
  t.deepEqual(config.mergeInlineObjects, {
    one: 'once',
    two: 'twice',
    three: 'third',
    four: 'fourth'
  })
})

test("mergeObjects: ${merge(${object}, ${asyncObj})}", (t) => {
  t.deepEqual(config.mergeObjects, {
    one: 'once',
    two: 'twice',
    test: true,
    nested: {
      yolo: 'hi'
    }
  })
})

test("subKey: ${mergeObjects.two}", (t) => {
  t.deepEqual(config.subKey, 'wee')
})

/*
old tests when functions were in resolution path

test('splitTestTwo "lol-hi-_ ha,ha" | split("-", 2) | toUpperCase', (t) => {
  t.deepEqual(config.splitTestTwo, [
    'LOL',
    'HI',
    '_ HA,HA',
  ])
})

test('filterUsingVariableInputs ${"lol-hi-_ ha,ha" | split(${inner===hi}, 2, ${opt:stage}) }', (t) => {
  t.deepEqual(config.filterUsingVariableInputs, [
    'lol-',
    '-_ ha,ha',
  ])
})
*/
