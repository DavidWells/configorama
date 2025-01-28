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
    stage: 'dev',
  }

  const configFile = path.join(__dirname, 'gitVariables.yml')
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

test('${git:repository} === configorama', () => {
  assert.is(config.repository, 'DavidWells/configorama')
})

test("repo urls", () => {
  assert.is(config.url, 'https://github.com/DavidWells/configorama')
  assert.is(config.repoUrl, 'https://github.com/DavidWells/configorama')
  assert.is(config.repoUrlDashed, 'https://github.com/DavidWells/configorama')
})

test('${git:dir}', () => {
  assert.is(config.dir, 'https://github.com/DavidWells/configorama/tree/master/tests/gitVariables')
})

test('${git:branch} === master', () => {
  assert.is(config.branch, 'master')
})

test('sha1: ${git:sha1}', async () => {
  assert.match(config.sha1, /\b[0-9a-f]{5,40}\b/)
})

test("remoteDefined: ${git:remote('origin')}", () => {
  assert.is(config.remoteDefined, 'https://github.com/DavidWells/configorama')
})

test("remoteDefinedNoQuotes: ${git:remote(origin)}", () => {
  assert.is(config.remoteDefinedNoQuotes, 'https://github.com/DavidWells/configorama')
})

test.run()
