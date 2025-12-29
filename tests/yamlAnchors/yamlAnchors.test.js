// Test YAML anchors (&) and aliases (*) with configorama variables

const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

let config

process.env.DB_HOST = 'prod-db.example.com'
process.env.DB_PORT = '5432'

const setup = async () => {
  try {
    const configFile = path.join(__dirname, 'anchors.yml')
    config = await configorama(configFile, {
      options: {
        stage: 'dev',
        region: 'eu-west-1'
      }
    })
    console.log('-------------')
    console.log('YAML Anchors Test')
    console.log(config)
    console.log('-------------')
  } catch (err) {
    console.error(`TEST ERROR ${__dirname}\n`, err)
    process.exit(1)
  }
}

test.before(setup)

// Basic anchor/alias merge with <<
test('defaults merged into development via anchor', () => {
  assert.is(config.development.retries, 3)
})

test('defaults timeout in development', () => {
  assert.is(config.development.timeout, 30)
})

test('variable in anchor resolved correctly', () => {
  assert.is(config.development.region, 'eu-west-1')
})

test('development overrides debug from defaults', () => {
  assert.is(config.development.debug, true)
})

// Nested anchor merge (database config)
test('nested database anchor merged with env var', () => {
  assert.is(config.development.database.host, 'prod-db.example.com')
})

test('nested database port from env (string from env)', () => {
  assert.is(config.development.database.port, '5432')
})

test('nested database name uses variable', () => {
  assert.is(config.development.database.name, 'dev_db')
})

test('nested database pool_size from anchor', () => {
  assert.is(config.development.database.pool_size, 10)
})

// Production config with overrides
test('production overrides timeout', () => {
  assert.is(config.production.timeout, 60)
})

test('production inherits retries from defaults', () => {
  assert.is(config.production.retries, 3)
})

test('production database pool_size overridden', () => {
  assert.is(config.production.database.pool_size, 50)
})

test('production database name is static', () => {
  assert.is(config.production.database.name, 'prod_db')
})

// Staging config
test('staging timeout overridden', () => {
  assert.is(config.staging.timeout, 45)
})

test('staging database name', () => {
  assert.is(config.staging.database.name, 'staging_db')
})

// Array aliases
test('frontend paths alias resolved', () => {
  assert.ok(Array.isArray(config.file_filters.frontend))
  assert.is(config.file_filters.frontend.length, 3)
  assert.is(config.file_filters.frontend[0], 'src/**/*.ts')
})

test('backend paths alias resolved', () => {
  assert.ok(Array.isArray(config.file_filters.backend))
  assert.is(config.file_filters.backend.length, 3)
  assert.is(config.file_filters.backend[0], 'api/**/*.py')
})

// Self-references to anchor-resolved values
test('self reference to anchor-merged value', () => {
  assert.is(config.resolved_timeout, 30)
})

test('self reference to nested anchor-merged value', () => {
  assert.is(config.resolved_region, 'prod_db')
})

// Environment variable
test('environment from opt with fallback', () => {
  assert.is(config.environment, 'dev')
})

// Merge with arrays containing glob patterns (bug fix test)
test('merge arrays with glob patterns - allMerged', () => {
  assert.ok(Array.isArray(config.file_filters.allMerged))
  assert.is(config.file_filters.allMerged.length, 6)
  assert.ok(config.file_filters.allMerged.includes('src/**/*.ts'))
  assert.ok(config.file_filters.allMerged.includes('api/**/*.py'))
})

test('merge arrays with glob patterns - allMergedTwo', () => {
  assert.ok(Array.isArray(config.file_filters.allMergedTwo))
  assert.is(config.file_filters.allMergedTwo.length, 6)
  assert.ok(config.file_filters.allMergedTwo.includes('src/**/*.tsx'))
  assert.ok(config.file_filters.allMergedTwo.includes('lib/**/*.py'))
})

test.run()
