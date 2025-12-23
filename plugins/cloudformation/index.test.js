/* Tests for CloudFormation variable source */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const createCloudFormationResolver = require('./index')

const dirname = path.dirname(__dirname)

// Mock CloudFormation responses
const mockStacks = {
  'us-east-1': {
    'api-service-dev': {
      Outputs: [
        { OutputKey: 'ApiEndpoint', OutputValue: 'https://api-dev.example.com' },
        { OutputKey: 'ApiId', OutputValue: 'abc123' }
      ]
    },
    'database-stack': {
      Outputs: [
        { OutputKey: 'DbHost', OutputValue: 'db.dev.example.com' },
        { OutputKey: 'DbPort', OutputValue: '5432' }
      ]
    }
  },
  'us-west-2': {
    'other-service': {
      Outputs: [
        { OutputKey: 'ServiceUrl', OutputValue: 'https://other.west.example.com' }
      ]
    }
  }
}

/**
 * Create a mocked CF resolver for testing
 */
function createMockCFResolver(options = {}) {
  const cfReferences = []
  const defaultRegion = options.defaultRegion || 'us-east-1'

  function parseVariable(varString) {
    let region = defaultRegion
    let accountId = null

    // Check for region/account in parentheses
    const paramsMatch = varString.match(/^cf\(([a-z0-9-:]+)\):/i)
    if (paramsMatch) {
      const params = paramsMatch[1]
      if (params.includes(':')) {
        const parts = params.split(':')
        region = parts[0]
        accountId = parts[1]
      } else {
        region = params
      }
    }

    const withoutPrefix = varString.replace(/^cf(\([a-z0-9-:]+\))?:/i, '')
    const dotIndex = withoutPrefix.indexOf('.')

    if (dotIndex === -1) {
      throw new Error(`Invalid cf: syntax "${varString}"`)
    }

    return {
      stackName: withoutPrefix.slice(0, dotIndex),
      outputKey: withoutPrefix.slice(dotIndex + 1),
      region,
      accountId
    }
  }

  async function resolver(varString, opts, currentObject, valueObject) {
    const { stackName, outputKey, region, accountId } = parseVariable(varString)

    cfReferences.push({
      raw: valueObject.originalSource,
      resolved: `\${${varString}}`,
      stackName,
      outputKey,
      region,
      accountId,
      configPath: valueObject.path.join('.')
    })

    // Mock lookup - return undefined for missing to allow fallbacks
    const regionStacks = mockStacks[region]
    if (!regionStacks) {
      return undefined
    }

    const stack = regionStacks[stackName]
    if (!stack) {
      return undefined
    }

    const output = stack.Outputs.find(o => o.OutputKey === outputKey)
    if (!output) {
      return undefined
    }

    return output.OutputValue
  }

  return {
    type: 'cf',
    source: 'remote',
    match: RegExp(/^cf(\([a-z0-9-:]+\))?:/i),
    resolver,
    metadataKey: 'cfReferences',
    collectMetadata: () => cfReferences
  }
}

test('cf: resolves basic stack output', async () => {
  const object = {
    apiEndpoint: '${cf:api-service-dev.ApiEndpoint}',
  }

  const result = await configorama(object, {
    configDir: dirname,
    returnMetadata: true,
    variableSources: [createMockCFResolver()]
  })

  assert.is(result.config.apiEndpoint, 'https://api-dev.example.com')
})

test('cf: resolves multiple outputs from different stacks', async () => {
  const object = {
    apiEndpoint: '${cf:api-service-dev.ApiEndpoint}',
    dbHost: '${cf:database-stack.DbHost}',
    dbPort: '${cf:database-stack.DbPort}',
  }

  const result = await configorama(object, {
    configDir: dirname,
    returnMetadata: true,
    variableSources: [createMockCFResolver()]
  })

  assert.is(result.config.apiEndpoint, 'https://api-dev.example.com')
  assert.is(result.config.dbHost, 'db.dev.example.com')
  assert.is(result.config.dbPort, '5432')
})

test('cf: resolves with explicit region', async () => {
  const object = {
    westService: '${cf(us-west-2):other-service.ServiceUrl}',
  }

  const result = await configorama(object, {
    configDir: dirname,
    returnMetadata: true,
    variableSources: [createMockCFResolver()]
  })

  assert.is(result.config.westService, 'https://other.west.example.com')
  assert.is(result.metadata.cfReferences[0].region, 'us-west-2')
})

test('cf: collects metadata with all reference details', async () => {
  const object = {
    apiEndpoint: '${cf:api-service-dev.ApiEndpoint}',
    westService: '${cf(us-west-2):other-service.ServiceUrl}',
  }

  const result = await configorama(object, {
    configDir: dirname,
    returnMetadata: true,
    variableSources: [createMockCFResolver()]
  })

  assert.ok(result.metadata.cfReferences)
  assert.is(result.metadata.cfReferences.length, 2)

  const apiRef = result.metadata.cfReferences.find(r => r.stackName === 'api-service-dev')
  assert.ok(apiRef)
  assert.is(apiRef.outputKey, 'ApiEndpoint')
  assert.is(apiRef.region, 'us-east-1')
  assert.is(apiRef.configPath, 'apiEndpoint')

  const westRef = result.metadata.cfReferences.find(r => r.stackName === 'other-service')
  assert.ok(westRef)
  assert.is(westRef.region, 'us-west-2')
})

test('cf: works with nested variables (stage-aware)', async () => {
  const object = {
    stage: 'dev',
    apiEndpoint: '${cf:api-service-${self:stage}.ApiEndpoint}',
  }

  const result = await configorama(object, {
    configDir: dirname,
    returnMetadata: true,
    variableSources: [createMockCFResolver()]
  })

  assert.is(result.config.apiEndpoint, 'https://api-dev.example.com')

  // Metadata should show resolved stack name
  const ref = result.metadata.cfReferences[0]
  assert.is(ref.stackName, 'api-service-dev')
  assert.ok(ref.raw.includes('${self:stage}'), 'raw should contain original variable')
})

test('cf: throws on missing stack without fallback', async () => {
  const object = {
    value: '${cf:nonexistent-stack.Output}',
  }

  try {
    await configorama(object, {
      configDir: dirname,
      variableSources: [createMockCFResolver()]
    })
    assert.unreachable('Should have thrown')
  } catch (err) {
    assert.ok(err.message.includes('Unable to resolve'))
  }
})

test('cf: throws on missing output without fallback', async () => {
  const object = {
    value: '${cf:api-service-dev.NonexistentOutput}',
  }

  try {
    await configorama(object, {
      configDir: dirname,
      variableSources: [createMockCFResolver()]
    })
    assert.unreachable('Should have thrown')
  } catch (err) {
    assert.ok(err.message.includes('Unable to resolve'))
  }
})

test('cf: supports fallback values', async () => {
  const object = {
    value: '${cf:nonexistent-stack.Output, "fallback-value"}',
  }

  const result = await configorama(object, {
    configDir: dirname,
    variableSources: [createMockCFResolver()]
  })

  assert.is(result.value, 'fallback-value')
})

test('createCloudFormationResolver exports correct structure', () => {
  const resolver = createCloudFormationResolver()

  assert.is(resolver.type, 'cf')
  assert.is(resolver.source, 'remote')
  assert.ok(resolver.match instanceof RegExp)
  assert.is(typeof resolver.resolver, 'function')
  assert.is(typeof resolver.collectMetadata, 'function')
  assert.is(resolver.metadataKey, 'cfReferences')
})

test('skipResolution collects metadata without calling AWS', async () => {
  const cfResolver = createCloudFormationResolver({ skipResolution: true })

  const object = {
    stage: 'prod',
    apiEndpoint: '${cf:api-service-${self:stage}.ApiEndpoint}',
    dbHost: '${cf(us-west-2):database-stack.DbHost}',
  }

  const result = await configorama(object, {
    configDir: dirname,
    returnMetadata: true,
    variableSources: [cfResolver]
  })

  // Values should be placeholders, not resolved
  assert.is(result.config.apiEndpoint, '[CF:us-east-1:api-service-prod.ApiEndpoint]')
  assert.is(result.config.dbHost, '[CF:us-west-2:database-stack.DbHost]')

  // But metadata should still be collected
  assert.ok(result.metadata.cfReferences)
  assert.is(result.metadata.cfReferences.length, 2)

  const apiRef = result.metadata.cfReferences.find(r => r.stackName === 'api-service-prod')
  assert.ok(apiRef)
  assert.is(apiRef.outputKey, 'ApiEndpoint')
  assert.is(apiRef.region, 'us-east-1')

  const dbRef = result.metadata.cfReferences.find(r => r.stackName === 'database-stack')
  assert.ok(dbRef)
  assert.is(dbRef.region, 'us-west-2')
})

test('cf: parses multi-account syntax with region and accountId', async () => {
  const cfResolver = createCloudFormationResolver({ skipResolution: true })

  const object = {
    crossAccount: '${cf(us-west-2:123456789):other-account-stack.OutputKey}',
  }

  const result = await configorama(object, {
    configDir: dirname,
    returnMetadata: true,
    variableSources: [cfResolver]
  })

  // Should parse and include in metadata
  assert.ok(result.metadata.cfReferences)
  assert.is(result.metadata.cfReferences.length, 1)

  const ref = result.metadata.cfReferences[0]
  assert.is(ref.region, 'us-west-2')
  assert.is(ref.accountId, '123456789')
  assert.is(ref.stackName, 'other-account-stack')
  assert.is(ref.outputKey, 'OutputKey')

  // Placeholder should include account info
  assert.is(result.config.crossAccount, '[CF:us-west-2:123456789:other-account-stack.OutputKey]')
})

test('cf: variable syntax regex matches multi-account format', () => {
  const { cfVariableSyntax } = require('./index')

  // Should match all valid formats
  assert.ok(cfVariableSyntax.test('cf:stack.output'))
  assert.ok(cfVariableSyntax.test('cf(us-west-2):stack.output'))
  assert.ok(cfVariableSyntax.test('cf(us-west-2:123456789):stack.output'))
  assert.ok(cfVariableSyntax.test('cf(ap-northeast-1:987654321):stack.output'))
})

test('cf: metadata includes accountId when present', async () => {
  const object = {
    local: '${cf:api-service-dev.ApiEndpoint}',
    crossRegion: '${cf(us-west-2):other-service.ServiceUrl}',
    crossAccount: '${cf(eu-west-1:555555555):account-stack.Output, "fallback"}',
  }

  const result = await configorama(object, {
    configDir: dirname,
    returnMetadata: true,
    variableSources: [createMockCFResolver()]
  })

  assert.ok(result.metadata.cfReferences)
  assert.is(result.metadata.cfReferences.length, 3)

  // Local should have no accountId
  const localRef = result.metadata.cfReferences.find(r => r.stackName === 'api-service-dev')
  assert.ok(localRef)
  assert.is(localRef.accountId, null)

  // Cross-region should have no accountId
  const regionRef = result.metadata.cfReferences.find(r => r.stackName === 'other-service')
  assert.ok(regionRef)
  assert.is(regionRef.accountId, null)

  // Cross-account should have accountId
  const accountRef = result.metadata.cfReferences.find(r => r.stackName === 'account-stack')
  assert.ok(accountRef)
  assert.is(accountRef.accountId, '555555555')
  assert.is(accountRef.region, 'eu-west-1')
})

test.run()
