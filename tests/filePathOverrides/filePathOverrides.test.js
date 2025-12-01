/**
 * Tests for filePathOverrides feature - allows hijacking file resolution paths
 */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const { deepLog } = require('../utils')

const configFile = path.join(__dirname, 'config.yml')

test('without overrides - uses original file', async () => {
  const result = await configorama(configFile, {
    returnMetadata: true
  })

  assert.equal(result.config.envVars.dbHost, 'localhost')
  assert.equal(result.config.envVars.apiKey, 'original-key')
  assert.equal(result.config.specificKey, 'localhost')
})

test('with filePathOverrides - uses override file', async () => {
  const result = await configorama(configFile, {
    returnMetadata: true,
    filePathOverrides: {
      './env.yml': './env-override.yml'
    }
  })

  deepLog('filePathOverrides result', result)

  assert.equal(result.config.envVars.dbHost, 'production.db.example.com')
  assert.equal(result.config.envVars.apiKey, 'override-key')
  assert.equal(result.config.specificKey, 'production.db.example.com')
})

test('metadata tracks overridden files', async () => {
  const result = await configorama(configFile, {
    returnMetadata: true,
    filePathOverrides: {
      './env.yml': './env-override.yml'
    }
  })

  // Check that fileDependencies has overriddenFiles info
  const { fileDependencies } = result.metadata
  assert.ok(fileDependencies, 'fileDependencies should exist')
  assert.ok(fileDependencies.overriddenFiles, 'overriddenFiles should exist')
  assert.ok(Array.isArray(fileDependencies.overriddenFiles), 'overriddenFiles should be array')
  assert.ok(fileDependencies.overriddenFiles.length > 0, 'should have at least one override')

  const override = fileDependencies.overriddenFiles[0]
  assert.ok(override.originalPath.endsWith('env.yml'), 'should track original path')
  assert.ok(override.overridePath.endsWith('env-override.yml'), 'should track override path')
})

test('with absolute path override', async () => {
  const absoluteOverridePath = path.join(__dirname, 'env-override.yml')
  const result = await configorama(configFile, {
    filePathOverrides: {
      './env.yml': absoluteOverridePath
    }
  })

  assert.equal(result.envVars.dbHost, 'production.db.example.com')
})

// text() variable tests
test('text() without overrides - uses original file', async () => {
  const result = await configorama(configFile)

  assert.ok(result.readmeContent.includes('original readme'))
})

test('text() with filePathOverrides - uses override file', async () => {
  const result = await configorama(configFile, {
    filePathOverrides: {
      './readme.txt': './readme-override.txt'
    }
  })

  assert.ok(result.readmeContent.includes('OVERRIDE readme'))
})

test('text() and file() overrides together', async () => {
  const result = await configorama(configFile, {
    filePathOverrides: {
      './env.yml': './env-override.yml',
      './readme.txt': './readme-override.txt'
    }
  })

  assert.equal(result.envVars.dbHost, 'production.db.example.com')
  assert.ok(result.readmeContent.includes('OVERRIDE readme'))
})

// Path normalization tests - ./ prefix handling
test('override key with ./ matches config without ./', async () => {
  // Config has: ${file(env.yml)} (no ./)
  // Override key: ./env.yml
  const result = await configorama(configFile, {
    filePathOverrides: {
      './env.yml': './env-override.yml'
    }
  })

  // envVarsNoDotSlash uses ${file(env.yml)} without ./
  assert.equal(result.envVarsNoDotSlash.dbHost, 'production.db.example.com')
})

test('override key without ./ matches config with ./', async () => {
  // Config has: ${file(./env.yml)} (with ./)
  // Override key: env.yml (no ./)
  const result = await configorama(configFile, {
    filePathOverrides: {
      'env.yml': './env-override.yml'
    }
  })

  // envVars uses ${file(./env.yml)} with ./
  assert.equal(result.envVars.dbHost, 'production.db.example.com')
  // envVarsNoDotSlash uses ${file(env.yml)} without ./
  assert.equal(result.envVarsNoDotSlash.dbHost, 'production.db.example.com')
})

test.run()
