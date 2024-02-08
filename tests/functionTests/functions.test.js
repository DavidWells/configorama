import test from 'ava'
import path from 'path'
import configorama from '../../lib'



let config

process.env.envReference = 'env var'

// This runs before all tests
test.before(async t => {
  const args = {
    stage: 'prod',
  }

  const configFile = path.join(__dirname, 'functions.yml')
  config = await configorama(configFile, {
    options: args
  })
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

test("joinIt: ${join(${array}, ${other})}", (t) => {
  t.is(config.joinIt, 'yess!sss!no')
})

test("upperKeysTest: ${upperKeys(${object})}", (t) => {
  t.deepEqual(config.upperKeysTest, { ONE: 'once', TWO: 'twice' })
})

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
  // console.log('config.subKey', config.subKey)
  t.deepEqual(config.subKey, 'wee')
})


test("mergeNested: ${merge('lol', ${nestedTwo})}", (t) => {
  t.deepEqual(config.mergeNested, 'lolhahawowowow')
})

test("Nested fileRef: ${file(./other.yml)}", (t) => {
  t.deepEqual(config.fileRef, {
    toUpperCase: 'VALUE',
    domainName: 'my-site.com',
    domains: {
      prod: 'api.my-site.com',
      staging: 'api-staging.my-site.com',
      dev: 'api-dev.my-site.com'
    },
    resolvedDomainName: 'api.my-site.com',
    subThing: 'haha',
    domainNameTwo: 'my-site-two.com',
    domainsTwo: {
      prod: 'api.my-site-two.com',
      staging: 'api-staging.my-site-two.com',
      dev: 'api-dev.my-site-two.com',
    },
    resolvedDomainNameTwo: 'api.my-site-two.com'
  })
})

test("subThing: ${self:key}", (t) => {
  t.deepEqual(config.fileRef.subThing, 'haha')
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
