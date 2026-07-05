const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

test('getting started docs example resolves with stage option', async () => {
  const filePath = path.join(__dirname, 'getting-started.config.yml')
  const result = await configorama(filePath, {
    options: {
      stage: 'prod'
    }
  })

  assert.equal(result, {
    service: 'billing',
    stage: 'prod'
  })
})

test('file references docs example resolves selected file values', async () => {
  const filePath = path.join(__dirname, 'file-references.config.yml')
  const result = await configorama(filePath, {
    options: {
      stage: 'prod'
    }
  })

  assert.equal(result, {
    stage: 'prod',
    settings: {
      database: {
        host: 'db.local',
        port: 5432
      }
    },
    databaseHost: 'db.local',
    databasePort: 5432,
    stageConfig: {
      url: 'https://api.example.com'
    },
    fallbackValue: 'local'
  })
})

test('variable type docs example resolves core sources', async () => {
  const filePath = path.join(__dirname, 'variable-types.config.yml')
  const env = {
    ...process.env,
    DOCS_API_HOST: 'api.example.com',
    DOCS_API_PORT: '8080'
  }

  const originalEnv = process.env
  process.env = env
  try {
    const result = await configorama(filePath, {
      options: {
        stage: 'prod',
        region: 'eu-west-1',
        replicas: 3,
        param: [
          'domain=configorama.dev',
          'databasePort=6543'
        ]
      }
    })

    assert.is(result.apiHost, 'api.example.com')
    assert.is(result.apiPort, 8080)
    assert.is(result.stage, 'prod')
    assert.is(result.region, 'eu-west-1')
    assert.is(result.domain, 'configorama.dev')
    assert.is(result.databasePort, 6543)
    assert.is(result.selfExample.serviceUrl, 'https://api.example.com:8080/prod/billing')
    assert.is(result.selfExample.explicitServiceUrl, 'https://api.example.com:8080/prod/billing')
    assert.is(result.databaseHost, 'db.local')
    assert.is(result.databasePortFromFile, 5432)
    assert.match(result.template, /raw text file/)
    assert.type(result.branchName, 'string')
    assert.type(result.shortSha, 'string')
    assert.is(result.everyFiveMinutes, '*/5 * * * *')
    assert.is(result.weekdayMorning, '0 9 * * 1')
    assert.is(result.dailyMidnight, '0 0 * * *')
    assert.is(result.businessHours, '0 9-17 * * 1-5')
    assert.is(result.monthlyBilling, '0 0 1 * *')
    assert.is(result.existingCron, '15 10 * * 1-5')
    assert.is(result.evalStage, 'prod')
    assert.is(result.isScaled, true)
    assert.is(result.desiredReplicas, 3)
    assert.is(result.workerMemoryMb, 768)
    assert.is(result.canDeploy, true)
    assert.is(result.environmentName, 'production')
    assert.is(result.workerCount, 4)
  } finally {
    process.env = originalEnv
  }
})

test.run()
