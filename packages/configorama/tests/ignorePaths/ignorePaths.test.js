/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

test('default ignorePaths preserves Lambda Code.ZipFile template literals', async () => {
  const result = await configorama({
    user: 'CONFIG_USER',
    custom: {
      value: 'ok',
      resolved: '${self:custom.value}'
    },
    resources: {
      Resources: {
        InlineLambda: {
          Properties: {
            Code: {
              ZipFile: 'exports.handler = async () => `${user}`'
            }
          }
        }
      }
    }
  })

  assert.is(result.custom.resolved, 'ok')
  assert.is(
    result.resources.Resources.InlineLambda.Properties.Code.ZipFile,
    'exports.handler = async () => `${user}`'
  )
})

test('default ignorePaths preserves CloudFront FunctionCode template literals', async () => {
  const result = await configorama({
    uri: '/from-config',
    resources: {
      Resources: {
        ViewerFunction: {
          Properties: {
            FunctionCode: 'function handler(event) { return `${uri}` }'
          }
        }
      }
    }
  })

  assert.is(
    result.resources.Resources.ViewerFunction.Properties.FunctionCode,
    'function handler(event) { return `${uri}` }'
  )
})

test('default variable syntax preserves IAM aws policy variables', async () => {
  const result = await configorama({
    resources: {
      Resources: {
        UserBucketPolicy: {
          Properties: {
            PolicyDocument: {
              Statement: [
                {
                  Effect: 'Allow',
                  Resource: 'arn:aws:s3:::example-home/${aws:username}/*'
                }
              ]
            }
          }
        }
      }
    }
  })

  assert.is(
    result.resources.Resources.UserBucketPolicy.Properties.PolicyDocument.Statement[0].Resource,
    'arn:aws:s3:::example-home/${aws:username}/*'
  )
})

test('default ignorePaths preserves shell UserData variables', async () => {
  const result = await configorama({
    HOME: '/config-home',
    APP_ENV: 'config-env',
    resources: {
      Resources: {
        Instance: {
          Properties: {
            UserData: '#!/bin/bash\necho "${HOME} ${APP_ENV}"\n'
          }
        }
      }
    }
  })

  assert.is(
    result.resources.Resources.Instance.Properties.UserData,
    '#!/bin/bash\necho "${HOME} ${APP_ENV}"\n'
  )
})

test('custom ignorePaths can mark arbitrary embedded code as opaque', async () => {
  const result = await configorama({
    value: 'CONFIG_VALUE',
    embedded: {
      code: 'return `${value}`'
    }
  }, {
    ignorePaths: ['embedded.code']
  })

  assert.is(result.embedded.code, 'return `${value}`')
})

test('disableDefaultIgnorePaths allows default opaque paths to resolve normally', async () => {
  const result = await configorama({
    user: 'CONFIG_USER',
    resources: {
      Resources: {
        InlineLambda: {
          Properties: {
            Code: {
              ZipFile: 'exports.handler = async () => `${user}`'
            }
          }
        }
      }
    }
  }, {
    disableDefaultIgnorePaths: true
  })

  assert.is(
    result.resources.Resources.InlineLambda.Properties.Code.ZipFile,
    'exports.handler = async () => `CONFIG_USER`'
  )
})

test('metadata collection skips ignored embedded-language variables', async () => {
  const result = await configorama({
    user: 'CONFIG_USER',
    custom: {
      value: 'ok',
      resolved: '${self:custom.value}'
    },
    resources: {
      Resources: {
        InlineLambda: {
          Properties: {
            Code: {
              ZipFile: 'exports.handler = async () => `${user}`'
            }
          }
        }
      }
    }
  }, {
    returnMetadata: true
  })

  const variables = Object.keys(result.metadata.variables)
  assert.ok(variables.some((key) => key.includes('self:custom.value')))
  assert.not.ok(variables.some((key) => key.includes('user')))
})

test.run()
