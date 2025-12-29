/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const { createTrackingProxy, checkUnusedConfigValues } = require('../utils')

let config

process.env.envReference = 'env var'

// Setup function
const setup = async () => {
  const args = {
    stage: 'prod',
  }

  try {
    const configFile = path.join(__dirname, 'functions.yml')
    const rawConfig = await configorama(configFile, {
      options: args
    })
    config = createTrackingProxy(rawConfig)
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
  checkUnusedConfigValues(config)
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

test('key', () => {
  assert.is(config.key, 'haha')
})

test("splitTest: ${split('my!string!whatever', !)}", () => {
  assert.equal(config.splitTest, [ 'my', 'string', 'whatever' ])
})

test("mergeTest: ${merge('stuff', 'new')}", () => {
  assert.is(config.mergeTest, 'stuffnew')
})

test("joinIt: ${join(${array}, ${other})}", () => {
  assert.is(config.joinIt, 'yess!sss!no')
})

test("upperKeysTest: ${upperKeys(${object})}", () => {
  assert.equal(config.upperKeysTest, { ONE: 'once', TWO: 'twice' })
})

test("splitWithVariables: ${split(${splitString}, ${separater})}", () => {
  assert.equal(config.splitWithVariables, [ 'yayaaya', 'whwhwhwhwh', 'hahahaha', 'wowowowo' ])
})

test("splitWithVariablesTwo: ${split(${splitStringTwo}, ${separaterTwo})}", () => {
  assert.equal(config.splitWithVariablesTwo, [ 'yayaaya', 'whwhwhwhwh', 'hahahaha', 'wowowowo' ])
})

test("nestedFunctions: ${split(merge('haha', 'wawawaw'), 'a')}", () => {
  assert.equal(config.nestedFunctions, [ 'h', 'h', 'w', 'w', 'w', 'w' ])
})

test("mergeInlineObjects: ${merge(${object}, ${objectTwo})}", () => {
  assert.equal(config.mergeInlineObjects, {
    one: 'once',
    two: 'twice',
    three: 'third',
    four: 'fourth'
  })
})

test("mergeObjects: ${merge(${object}, ${asyncObj})}", () => {
  assert.equal(config.mergeObjects, {
    one: 'once',
    two: 'twice',
    test: true,
    nested: {
      yolo: 'hi'
    }
  })
})

test("mergeObjectsX: ${merge(${otherWW}, ${asyncObj})}", () => {
  // console.log('config.mergeObjectsX', config.mergeObjectsX)
  assert.equal(config.mergeObjectsX, {
    haha: true,
    whatever: { lol: { woot: 'wee' } },
    test: true,
    nested: { yolo: 'hi' }
  })
})

test('mergeTestTwo', () => {
  assert.equal(config.mergeTestTwo, 'OTHERSMASHEDCAPS')
})

test('md5', () => {
  assert.equal(config.md5, '9cdfb439c7876e703e307864c9167a15')
})

test('merge', () => {
  assert.equal(config.merge, 'hahawowowow')
})

test("subKey: ${mergeObjects.two}", () => {
  assert.equal(config.subKey, 'wee')
})

test("mergeNested: ${merge('lol', ${nestedTwo})}", () => {
  assert.equal(config.mergeNested, 'lolhahawowowow')
})

// ==========================================
// Nested Function Calls
// Tests recursive evaluation of nested functions in arguments
// ==========================================

test("nestedMergeInMerge: ${merge('prefix-', merge('hello', 'world'))}", () => {
  // Inner merge('hello', 'world') => 'helloworld'
  // Outer merge('prefix-', 'helloworld') => 'prefix-helloworld'
  assert.is(config.nestedMergeInMerge, 'prefix-helloworld')
})

test("splitMergeResult: ${split(merge('a,b', ',c,d'), ',')}", () => {
  // Inner merge('a,b', ',c,d') => 'a,b,c,d'
  // Outer split('a,b,c,d', ',') => ['a', 'b', 'c', 'd']
  assert.equal(config.splitMergeResult, ['a', 'b', 'c', 'd'])
})

test("mergeOfMerges: ${merge(merge('one', 'two'), merge('three', 'four'))}", () => {
  // First arg: merge('one', 'two') => 'onetwo'
  // Second arg: merge('three', 'four') => 'threefour'
  // Outer: merge('onetwo', 'threefour') => 'onetwothreefour'
  assert.is(config.mergeOfMerges, 'onetwothreefour')
})

test("tripleNested: ${merge('X', merge('Y', merge('Z', '!')))}", () => {
  // Innermost: merge('Z', '!') => 'Z!'
  // Middle: merge('Y', 'Z!') => 'YZ!'
  // Outer: merge('X', 'YZ!') => 'XYZ!'
  assert.is(config.tripleNested, 'XYZ!')
})

test("joinSplitResult: ${join(split('a-b-c', '-'), '_')}", () => {
  // Inner split('a-b-c', '-') => ['a', 'b', 'c']
  // Outer join(['a', 'b', 'c'], '_') => 'a_b_c'
  assert.is(config.joinSplitResult, 'a_b_c')
})

test("lengthOfMerge: ${length(merge('hello', 'world'))}", () => {
  // Inner merge('hello', 'world') => 'helloworld'
  // Outer length('helloworld') => 10
  assert.is(config.lengthOfMerge, 10)
})

test("md5OfMerge: ${md5(merge('hello', 'world'))}", () => {
  // Inner merge('hello', 'world') => 'helloworld'
  // Outer md5('helloworld') => md5 hash
  assert.is(config.md5OfMerge, 'fc5e038d38a57032085441e7fe7010b0')
})

test("Nested fileRef: ${file(./other.yml)}", () => {
  assert.equal(config.fileRef, {
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

test("subThing: ${self:key}", () => {
  assert.equal(config.fileRef.subThing, 'haha')
})

// ==========================================
// Property access + filters on function results
// ==========================================

test("mergeWithPropAndFilter: ${merge(${propObj}).foo | toUpperCase}", () => {
  // merge({foo:'hello',bar:'world'}) => {foo:'hello',bar:'world'}
  // .foo => 'hello'
  // | toUpperCase => 'HELLO'
  assert.is(config.mergeWithPropAndFilter, 'HELLO')
})

test("mergeNestedPropFilter: ${merge(${otherWW}).whatever.lol.woot | toUpperCase}", () => {
  // merge({...otherWW}) => { haha: true, whatever: { lol: { woot: 'wee' } } }
  // .whatever.lol.woot => 'wee'
  // | toUpperCase => 'WEE'
  assert.is(config.mergeNestedPropFilter, 'WEE')
})

// ==========================================
// Array index access on function results
// ==========================================

test("splitFirst: ${split('a-b-c', '-')[0]}", () => {
  // split('a-b-c', '-') => ['a', 'b', 'c']
  // [0] => 'a'
  assert.is(config.splitFirst, 'a')
})

test("splitFirstLength: ${split('hello-world', '-')[0].length}", () => {
  // split('hello-world', '-') => ['hello', 'world']
  // [0] => 'hello'
  // .length => 5
  assert.is(config.splitFirstLength, 5)
})

test("splitLast: ${split('a-b-c', '-')[2]}", () => {
  // split('a-b-c', '-') => ['a', 'b', 'c']
  // [2] => 'c'
  assert.is(config.splitLast, 'c')
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

test.run()
