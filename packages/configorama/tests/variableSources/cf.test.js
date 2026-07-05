/* Tests for CloudFormation variable source and custom metadata collection */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

const dirname = path.dirname(__dirname)

test('cf: variable source collects metadata for downstream use', async () => {
  // Mock CF resolver that returns value and metadata
  const cfReferences = []

  const object = {
    apiEndpoint: '${cf:api-service-dev.ApiEndpoint}',
    dbHost: '${cf:database-stack.DbHost}',
  }

  const config = await configorama(object, {
    configDir: dirname,
    returnMetadata: true,
    variableSources: [{
      type: 'cf',
      match: RegExp(/^cf(\([a-z0-9-]+\))?:/i),
      resolver: (varString, opts, currentObject, valueObject) => {
        // Parse cf:stackName.outputKey or cf(region):stackName.outputKey
        const regionMatch = varString.match(/^cf\(([a-z0-9-]+)\):/i)
        const region = regionMatch ? regionMatch[1] : null
        const withoutPrefix = varString.replace(/^cf(\([a-z0-9-]+\))?:/i, '')
        const dotIndex = withoutPrefix.indexOf('.')
        const stackName = withoutPrefix.slice(0, dotIndex)
        const outputKey = withoutPrefix.slice(dotIndex + 1)

        // Collect reference for metadata
        cfReferences.push({
          raw: `\${${varString}}`,
          stackName,
          outputKey,
          region: region || 'default',
          configPath: valueObject.path.join('.')
        })

        // Return mock value
        return Promise.resolve(`mock-value-${outputKey}`)
      },
      // Custom metadata collector - called after resolution
      collectMetadata: () => cfReferences
    }]
  })

  // Config should have resolved values
  assert.is(config.config.apiEndpoint, 'mock-value-ApiEndpoint')
  assert.is(config.config.dbHost, 'mock-value-DbHost')

  // Metadata should include cfReferences
  assert.ok(config.metadata.cfReferences, 'Should have cfReferences in metadata')
  assert.is(config.metadata.cfReferences.length, 2, 'Should have 2 CF references')

  // Check first reference
  const apiRef = config.metadata.cfReferences.find(r => r.stackName === 'api-service-dev')
  assert.ok(apiRef, 'Should find api-service-dev reference')
  assert.is(apiRef.outputKey, 'ApiEndpoint')
  assert.is(apiRef.configPath, 'apiEndpoint')

  // Check second reference
  const dbRef = config.metadata.cfReferences.find(r => r.stackName === 'database-stack')
  assert.ok(dbRef, 'Should find database-stack reference')
  assert.is(dbRef.outputKey, 'DbHost')
})

test('cf: variable source with nested variables collects resolved metadata', async () => {
  const cfReferences = []

  const object = {
    stage: 'prod',
    // Inner variable ${self:stage} should resolve first, then cf: resolves
    apiEndpoint: '${cf:api-service-${self:stage}.ApiEndpoint}',
  }

  const config = await configorama(object, {
    configDir: dirname,
    returnMetadata: true,
    variableSources: [{
      type: 'cf',
      match: RegExp(/^cf(\([a-z0-9-]+\))?:/i),
      resolver: (varString, opts, currentObject, valueObject) => {
        const withoutPrefix = varString.replace(/^cf(\([a-z0-9-]+\))?:/i, '')
        const dotIndex = withoutPrefix.indexOf('.')
        const stackName = withoutPrefix.slice(0, dotIndex)
        const outputKey = withoutPrefix.slice(dotIndex + 1)

        cfReferences.push({
          raw: valueObject.originalSource,
          resolved: `\${${varString}}`,
          stackName,
          outputKey,
          configPath: valueObject.path.join('.')
        })

        return Promise.resolve(`https://api-${stackName}.example.com`)
      },
      collectMetadata: () => cfReferences
    }]
  })

  assert.is(config.config.apiEndpoint, 'https://api-api-service-prod.example.com')

  // Should have CF reference with both raw and resolved forms
  assert.ok(config.metadata.cfReferences, 'Should have cfReferences')
  assert.is(config.metadata.cfReferences.length, 1)

  const ref = config.metadata.cfReferences[0]
  assert.is(ref.stackName, 'api-service-prod', 'Stack name should be fully resolved')
  assert.is(ref.raw, '${cf:api-service-${self:stage}.ApiEndpoint}', 'Should preserve original raw form')
  assert.is(ref.resolved, '${cf:api-service-prod.ApiEndpoint}', 'Should have resolved form')
})

test('cf: variable source with region syntax', async () => {
  const cfReferences = []

  const object = {
    crossRegionValue: '${cf(us-west-2):other-stack.OutputKey}',
  }

  const config = await configorama(object, {
    configDir: dirname,
    returnMetadata: true,
    variableSources: [{
      type: 'cf',
      match: RegExp(/^cf(\([a-z0-9-]+\))?:/i),
      resolver: (varString, opts, currentObject, valueObject) => {
        const regionMatch = varString.match(/^cf\(([a-z0-9-]+)\):/i)
        const region = regionMatch ? regionMatch[1] : null
        const withoutPrefix = varString.replace(/^cf(\([a-z0-9-]+\))?:/i, '')
        const dotIndex = withoutPrefix.indexOf('.')
        const stackName = withoutPrefix.slice(0, dotIndex)
        const outputKey = withoutPrefix.slice(dotIndex + 1)

        cfReferences.push({
          stackName,
          outputKey,
          region,
          configPath: valueObject.path.join('.')
        })

        return Promise.resolve(`cross-region-value`)
      },
      collectMetadata: () => cfReferences
    }]
  })

  assert.is(config.config.crossRegionValue, 'cross-region-value')
  assert.ok(config.metadata.cfReferences)
  assert.is(config.metadata.cfReferences[0].region, 'us-west-2')
  assert.is(config.metadata.cfReferences[0].stackName, 'other-stack')
})

test.run()
