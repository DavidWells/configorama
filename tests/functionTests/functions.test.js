/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../lib')
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
    console.log('err', err)
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
