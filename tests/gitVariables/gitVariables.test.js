import test from 'ava'
import path from 'path'
import configorama from '../../lib'

let config

process.env.envReference = 'env var'

// This runs before all tests
test.before(async t => {
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
})

test.after(t => {
  console.log(`-------------`)
})

test('${git:repository} === configorama', (t) => {
  t.is(config.repository, 'DavidWells/configorama')
})

test("repo urls", (t) => {
  t.is(config.url, 'https://github.com/DavidWells/configorama')
  t.is(config.repoUrl, 'https://github.com/DavidWells/configorama')
  t.is(config.repoUrlDashed, 'https://github.com/DavidWells/configorama')
})

test('${git:branch} === master', (t) => {
  t.is(config.branch, 'master')
})

test('sha1: ${git:sha1}', async (t) => {
  t.regex(config.sha1, /\b[0-9a-f]{5,40}\b/)
})

test("remoteDefined: ${git:remote('origin')}", (t) => {
  t.is(config.remoteDefined, 'https://github.com/DavidWells/configorama')
})

test("remoteDefinedNoQuotes: ${git:remote(origin)}", (t) => {
  t.is(config.remoteDefinedNoQuotes, 'https://github.com/DavidWells/configorama')
})
