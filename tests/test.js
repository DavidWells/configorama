import test from 'ava'
import doIt from './parse-yml'

let config

// This runs before all tests
test.before(async t => {
  const args = {
    stage: 'dev',
    what: 'prod',
    count: 25,
    // empty: 'HEHEHE'
  }

  config = await doIt(args)

  console.log(config)
})

test('Normal Key - "normalKey: normalKeyValue"', (t) => {
  t.is(config.normalKey, 'normalKeyValue')
})

test('composedKey: "composed-${self:normalKey}-key"', (t) => {
  t.is(config.composedKey, 'composed-normalKeyValue-key')
})

test('CLI Flag: "cliFlag: ${opt:stage}"', (t) => {
  t.is(config.cliFlag, 'dev')
})

test('CLI Flag Default Value: "cliFlagEmtpy: ${opt:empty, \'cliFlagEmtpyValue\'}"', (t) => {
  t.is(config.cliFlagEmtpy, 'cliFlagEmtpyValue')
})

test('selfReference: ${self:normalKey}', (t) => {
  t.is(config.selfReference, 'normalKeyValue')
})

/* Test allowed values */
test('valueWithEqualSign: ${self:doesnt, "this=value=has=equal"}', (t) => {
  t.is(config.valueWithEqualSign, 'this=value=has=equal')
})

/* Testing Advanced Yml */
test('Composed objects - ${self:domains.${opt:stage}}', (t) => {
  t.deepEqual(config.domains, {
    prod: 'api.netlify-services.com',
    staging: 'api-staging.netlify-services.com',
    dev: 'api-dev.netlify-services.com'
  })

  t.is(config.resolvedDomainName, 'api-dev.netlify-services.com')
})
