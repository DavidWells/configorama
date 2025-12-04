const { test } = require('uvu')
const assert = require('uvu/assert')
const { resolver } = require('./valueFromParam')

test('Resolves parameter from CLI flag', async () => {
  const options = { param: 'domain=myapp.com' }
  const result = await resolver('param:domain', options)
  assert.is(result, 'myapp.com')
})

test('Resolves parameter from multiple CLI flags', async () => {
  const options = { param: ['domain=myapp.com', 'key=value'] }
  const result = await resolver('param:key', options)
  assert.is(result, 'value')
})

test('Resolves parameter with equals sign in value', async () => {
  const options = { param: 'connectionString=Server=localhost;Port=5432' }
  const result = await resolver('param:connectionString', options)
  assert.is(result, 'Server=localhost;Port=5432')
})

test('Resolves parameter from stage-specific params', async () => {
  const options = { stage: 'prod' }
  const config = {
    stages: {
      prod: {
        params: {
          domain: 'production.myapp.com'
        }
      }
    }
  }
  const result = await resolver('param:domain', options, config)
  assert.is(result, 'production.myapp.com')
})

test('Resolves parameter from default stage params', async () => {
  const options = { stage: 'dev' }
  const config = {
    stages: {
      default: {
        params: {
          domain: 'default.myapp.com'
        }
      }
    }
  }
  const result = await resolver('param:domain', options, config)
  assert.is(result, 'default.myapp.com')
})

test('CLI params override stage params', async () => {
  const options = {
    stage: 'prod',
    param: 'domain=cli-override.com'
  }
  const config = {
    stages: {
      prod: {
        params: {
          domain: 'production.myapp.com'
        }
      }
    }
  }
  const result = await resolver('param:domain', options, config)
  assert.is(result, 'cli-override.com')
})

test('Stage-specific params override default params', async () => {
  const options = { stage: 'prod' }
  const config = {
    stages: {
      default: {
        params: {
          domain: 'default.myapp.com'
        }
      },
      prod: {
        params: {
          domain: 'production.myapp.com'
        }
      }
    }
  }
  const result = await resolver('param:domain', options, config)
  assert.is(result, 'production.myapp.com')
})

test('Returns undefined for non-existent parameter', async () => {
  const options = { stage: 'dev' }
  const config = { stages: { dev: { params: {} } } }
  const result = await resolver('param:nonExistent', options, config)
  assert.is(result, undefined)
})

test('Throws error for empty parameter name', async () => {
  try {
    await resolver('param:')
    assert.unreachable('Should have thrown an error')
  } catch (error) {
    assert.ok(error.message.includes('Invalid variable syntax'))
    assert.ok(error.message.includes('must have a key path'))
  }
})

test('Defaults to dev stage when no stage specified', async () => {
  const options = {}
  const config = {
    stages: {
      dev: {
        params: {
          domain: 'dev.myapp.com'
        }
      }
    }
  }
  const result = await resolver('param:domain', options, config)
  assert.is(result, 'dev.myapp.com')
})

test('Supports top-level params property (backwards compatibility)', async () => {
  const options = { stage: 'prod' }
  const config = {
    params: {
      prod: {
        domain: 'production.myapp.com'
      }
    }
  }
  const result = await resolver('param:domain', options, config)
  assert.is(result, 'production.myapp.com')
})

test('Supports top-level params default property', async () => {
  const options = { stage: 'dev' }
  const config = {
    params: {
      default: {
        domain: 'default.myapp.com'
      }
    }
  }
  const result = await resolver('param:domain', options, config)
  assert.is(result, 'default.myapp.com')
})

test('Prefers stages property over params property', async () => {
  const options = { stage: 'prod' }
  const config = {
    stages: {
      prod: {
        params: {
          domain: 'stages.prod.myapp.com'
        }
      }
    },
    params: {
      prod: {
        domain: 'params.prod.myapp.com'
      }
    }
  }
  const result = await resolver('param:domain', options, config)
  assert.is(result, 'stages.prod.myapp.com')
})

test('Returns Promise that resolves to value', async () => {
  const options = { param: 'test=promise-value' }
  const promise = resolver('param:test', options)
  assert.ok(promise instanceof Promise)
  const result = await promise
  assert.is(result, 'promise-value')
})

test('Handles parameter with special characters in value', async () => {
  const options = { param: 'special=value-with-special-chars-!@#$%' }
  const result = await resolver('param:special', options)
  assert.is(result, 'value-with-special-chars-!@#$%')
})

test('Handles empty string parameter value', async () => {
  const options = { param: 'empty=' }
  const result = await resolver('param:empty', options)
  assert.is(result, '')
})

test('Handles numeric parameter value', async () => {
  const options = { param: 'port=3000' }
  const result = await resolver('param:port', options)
  assert.is(result, '3000')
})

test('Handles parameter with underscore', async () => {
  const options = { param: 'my_param=underscore-value' }
  const result = await resolver('param:my_param', options)
  assert.is(result, 'underscore-value')
})

test('Handles parameter with numbers', async () => {
  const options = { param: 'param123=numeric-value' }
  const result = await resolver('param:param123', options)
  assert.is(result, 'numeric-value')
})

test.run()
