/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const { execSync } = require('child_process')

let config
let currentBranch

process.env.envReference = 'env var'

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
  }

  // Get current git branch
  try {
    currentBranch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim()
  } catch (err) {
    console.error('Failed to get current git branch:', err)
    process.exit(1)
  }

  const configFile = path.join(__dirname, 'gitVariables.yml')
  try {
    config = await configorama(configFile, {
      options: args
    })
  } catch (err) {
    console.log('err', err)
    // exit with error
    process.exit(1)
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

test('${git:repository} === configorama', () => {
  console.log('config', config)
  assert.is(config.repository, 'DavidWells/configorama')
})

test("repo urls", () => {
  assert.is(config.url, 'https://github.com/DavidWells/configorama')
  assert.is(config.repoUrl, 'https://github.com/DavidWells/configorama')
  assert.is(config.repoUrlDashed, 'https://github.com/DavidWells/configorama')
})

test('${git:dir}', () => {
  assert.is(config.dir, `https://github.com/DavidWells/configorama/tree/${currentBranch}/tests/gitVariables`)
})

test('${git:branch} matches current branch', () => {
  assert.is(config.branch, currentBranch)
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

test("gitTimestamp: ${git:timestamp('../../package.json')} relative to config file", () => {
  //assert.is(config.gitTimestamp, '2025-01-28T07:28:53.000Z')
  assert.match(config.gitTimestampRelativePath, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
})

test("gitTimestampTwo: ${git:timestamp('package.json')} absolute path", () => {
  // assert.is(config.gitTimestampTwo, '2025-01-28T07:28:53.000Z')
  assert.match(config.gitTimestampAbsolutePath, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
})

test.run()
