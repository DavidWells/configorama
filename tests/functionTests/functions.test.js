/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../lib')

let config

process.env.envReference = 'env var'

// Setup function
const setup = async () => {
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
}

// Teardown function
const teardown = () => {
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

test("subKey: ${mergeObjects.two}", () => {
  assert.equal(config.subKey, 'wee')
})

test("mergeNested: ${merge('lol', ${nestedTwo})}", () => {
  assert.equal(config.mergeNested, 'lolhahawowowow')
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
