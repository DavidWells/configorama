/* Tests for config file type classification (dotenv detection) */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { isEnvFile, configFileType } = require('./fileType')

test('isEnvFile detects the env-stage-loader precedence names', () => {
  // .env.{environment}.local, .env.{environment}, .env.local, .env
  assert.ok(isEnvFile('.env'))
  assert.ok(isEnvFile('.env.local'))
  assert.ok(isEnvFile('.env.production'))
  assert.ok(isEnvFile('.env.production.local'))
  assert.ok(isEnvFile('/path/to/.env.staging.local'))
  assert.ok(isEnvFile('deploy.env'))
})

test('isEnvFile rejects non-dotenv names', () => {
  assert.is(isEnvFile('config.yml'), false)
  assert.is(isEnvFile('env.js'), false)
  assert.is(isEnvFile('environment.json'), false)
  assert.is(isEnvFile('.environment'), false)
  assert.is(isEnvFile(''), false)
})

test('configFileType returns .env for staged dotenv names', () => {
  assert.is(configFileType('.env.production.local'), '.env')
  assert.is(configFileType('.env.staging'), '.env')
})

test('configFileType returns .env for dotenv files', () => {
  assert.is(configFileType('.env'), '.env')
  assert.is(configFileType('/x/.env.local'), '.env')
  assert.is(configFileType('deploy.env'), '.env')
})

test('configFileType returns lowercased extension otherwise', () => {
  assert.is(configFileType('config.YML'), '.yml')
  assert.is(configFileType('data.json'), '.json')
  assert.is(configFileType('noext'), '')
})

test.run()
