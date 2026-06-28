/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

test('oneOf validates inline string enums', async () => {
  const config = await configorama({
    stage: '${opt:stage | oneOf("dev", "staging", "prod")}',
  }, {
    options: { stage: 'prod' }
  })

  assert.is(config.stage, 'prod')
})

test('oneOf throws for values outside inline set', async () => {
  try {
    await configorama({
      stage: '${opt:stage | oneOf("dev", "staging", "prod")}',
    }, {
      options: { stage: 'qa' }
    })
    assert.unreachable('should reject out-of-set value')
  } catch (error) {
    assert.match(error.message, /Value "qa" is not oneOf\(dev, staging, prod\)/)
  }
})

test('Number before oneOf validates normalized numeric value and keeps number type', async () => {
  const config = await configorama({
    replicas: '${opt:replicas | Number | oneOf(1, 2, 4)}',
  }, {
    options: { replicas: '4' }
  })

  assert.is(config.replicas, 4)
  assert.is(typeof config.replicas, 'number')
})

test('oneOf before Number validates before numeric coercion', async () => {
  const config = await configorama({
    replicas: '${opt:replicas | oneOf(1, 2, 4) | Number}',
  }, {
    options: { replicas: '4' }
  })

  assert.is(config.replicas, 4)
  assert.is(typeof config.replicas, 'number')

  try {
    await configorama({
      replicas: '${opt:replicas | oneOf(1, 2, 4) | Number}',
    }, {
      options: { replicas: '04' }
    })
    assert.unreachable('should validate before Number filter runs')
  } catch (error) {
    assert.match(error.message, /Value "04" is not oneOf\(1, 2, 4\)/)
  }
})

test('requirements JSON captures oneOf inline literal allowed values', async () => {
  const result = await configorama.analyze({
    stage: '${opt:stage | oneOf("dev", "staging", "prod")}',
    replicas: '${opt:replicas | Number | oneOf(1, 2, 4)}',
  }, {
    instructions: true,
    options: {}
  })

  const byVariable = Object.fromEntries(result.requirements.map(req => [req.variable, req]))
  assert.equal(byVariable['opt:stage'].allowedValues, ['dev', 'staging', 'prod'])
  assert.equal(byVariable['opt:replicas'].allowedValues, ['1', '2', '4'])
})

test('oneOf resolves list-variable arguments to arrays for runtime validation and requirements', async () => {
  const result = await configorama.analyze({
    allowed: ['dev', 'prod'],
    stage: '${opt:stage | oneOf(${self:allowed})}',
  }, {
    instructions: true,
    options: {}
  })

  const stage = result.requirements.find(req => req.variable === 'opt:stage')
  assert.equal(stage.allowedValues, ['dev', 'prod'])

  const config = await configorama({
    allowed: ['dev', 'prod'],
    stage: '${opt:stage | oneOf(${self:allowed})}',
  }, {
    options: { stage: 'dev' }
  })
  assert.is(config.stage, 'dev')
})

test('oneOf list-variable arguments reject non-array values clearly', async () => {
  try {
    await configorama({
      allowed: 'dev',
      stage: '${opt:stage | oneOf(${self:allowed})}',
    }, {
      options: { stage: 'dev' }
    })
    assert.unreachable('should reject non-array oneOf argument')
  } catch (error) {
    assert.match(error.message, /oneOf\(\$\{...\}\) must resolve to an array/)
  }
})

test('help variables remain metadata text and do not create bogus requirements', async () => {
  const result = await configorama.analyze({
    service: 'api',
    token: '${env:CONFIGORAMA_ONEOF_HELP_TOKEN | help("Token for ${self:service}")}',
  }, {
    instructions: true,
    options: {}
  })

  assert.ok(result.requirements.find(req => req.variable === 'env:CONFIGORAMA_ONEOF_HELP_TOKEN'))
  assert.ok(!result.requirements.find(req => req.variable === 'self:service'))
  assert.is(result.requirements[0].description, 'Token for api')
})

test.run()
