const { test } = require('uvu')
const assert = require('uvu/assert')
const {
  getDotenvFileRefMetadata,
  hasFileAccessor,
  isDotenvFilePath,
  normalizeDotenvFileVariable,
} = require('./dotenvFileRefs')

test('dotenv file detection matches .env and .env variants', () => {
  assert.is(isDotenvFilePath('.env'), true)
  assert.is(isDotenvFilePath('./.env.production'), true)
  assert.is(isDotenvFilePath('/tmp/app/.env.local'), true)
  assert.is(isDotenvFilePath('./env.yml'), false)
})

test('dotenv accessors are detected without assuming ${} syntax', () => {
  assert.is(hasFileAccessor('file(.env).API_KEY'), true)
  assert.is(hasFileAccessor('file(.env):TOKEN'), true)
  assert.is(hasFileAccessor('${file(.env).API_KEY}'), true)
  assert.is(hasFileAccessor('[[file(.env).API_KEY]]'), true)
  assert.is(hasFileAccessor('file(.env)'), false)
})

test('dotenv metadata classifies full-file and key reads', () => {
  assert.equal(getDotenvFileRefMetadata({ variable: 'file(.env)' }), {
    sensitive: true,
    sensitivityReason: 'dotenv_file',
    dotenvFile: true,
    dotenvReadScope: 'full_file',
  })
  assert.equal(getDotenvFileRefMetadata({ variable: '[[file(.env):TOKEN]]' }), {
    sensitive: true,
    sensitivityReason: 'dotenv_file',
    dotenvFile: true,
    dotenvReadScope: 'key',
  })
})

test('dotenv variable normalization preserves key accessors', () => {
  assert.is(normalizeDotenvFileVariable('file(.env)'), 'file(./.env)')
  assert.is(normalizeDotenvFileVariable('file(.env).API_KEY'), 'file(./.env).API_KEY')
  assert.is(normalizeDotenvFileVariable('file(.env):TOKEN'), 'file(./.env):TOKEN')
  assert.is(normalizeDotenvFileVariable('file(config.yml):value'), null)
})

test.run()
