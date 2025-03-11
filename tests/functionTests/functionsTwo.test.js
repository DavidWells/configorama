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

  const configFile = path.join(__dirname, 'functionsTwo.yml')
  try {
    config = await configorama(configFile, {
      options: args
    })
  } catch (e) {
    console.log('error', e)
  }
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
    domainNameTwo: 'my-site-two.com',
    domainsTwo: {
      prod: 'api.my-site-two.com',
      staging: 'api-staging.my-site-two.com',
      dev: 'api-dev.my-site-two.com',
    },
    resolvedDomainNameTwo: 'api.my-site-two.com'
  })
})


test.run()
