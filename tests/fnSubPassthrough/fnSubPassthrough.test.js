/**
 * Regression tests for the Fn::Sub passthrough exponential-growth bug.
 *
 * The bug: variables inside a CloudFormation `Fn::Sub` value
 * (e.g. `${ApiGatewayRestApi}`, `${AWS::Region}`, `${UserPoolClientId}`)
 * were treated as configorama variables. If a same-named key existed in the
 * config, the resolver could inline the surrounding template back into
 * itself and corrupt the `Fn::Sub` body.
 *
 * Inside an `Fn::Sub` body, configorama's own typed refs (file/text/env/opt/
 * cron/git/custom) still resolve, while self refs and CloudFormation refs are
 * left verbatim for CloudFormation / downstream Serverless to resolve.
 */

const fs = require('fs')
const os = require('os')
const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

// Hard ceiling so a regression of the exponential blowup fails fast instead
// of hanging the suite for 25+ seconds.
const FAST_TIMEOUT_MS = 3000

/**
 * Run configorama and assert it completes well under the timeout window.
 * @param {object} config
 * @param {object} [options]
 */
async function resolveFast(config, options = {}) {
  const start = Date.now()
  const result = await configorama(config, options)
  const elapsed = Date.now() - start
  assert.ok(
    elapsed < FAST_TIMEOUT_MS,
    `resolution took ${elapsed}ms, expected < ${FAST_TIMEOUT_MS}ms (possible exponential growth regression)`
  )
  return result
}

function collectFnSubValues(node, path = [], out = []) {
  if (node && typeof node === 'object') {
    if (Object.prototype.hasOwnProperty.call(node, 'Fn::Sub')) {
      out.push({ path: path.concat('Fn::Sub'), value: node['Fn::Sub'] })
    }
    for (const key of Object.keys(node)) {
      collectFnSubValues(node[key], path.concat(key), out)
    }
  }
  return out
}

function getAtPath(node, path) {
  return path.reduce((acc, key) => (acc == null ? undefined : acc[key]), node)
}

test('Fn::Sub: single CFN ref mixed with self ref stays verbatim', async () => {
  const config = {
    service: 'api-service',
    provider: { stage: '${opt:stage, "dev"}' },
    resources: {
      Outputs: {
        ServiceEndpoint: {
          Value: {
            'Fn::Sub': 'https://${ApiGatewayRestApi}.execute-api.amazonaws.com/${self:provider.stage}'
          }
        }
      }
    }
  }
  const result = await resolveFast(config)
  assert.is(
    result.resources.Outputs.ServiceEndpoint.Value['Fn::Sub'],
    'https://${ApiGatewayRestApi}.execute-api.amazonaws.com/${self:provider.stage}'
  )
})

test('Fn::Sub: multiple distinct CFN refs all pass through', async () => {
  const config = {
    resources: {
      Outputs: {
        Endpoint: {
          Value: {
            'Fn::Sub': 'https://${ApiGatewayRestApi}.execute-api.${AWS::Region}.amazonaws.com'
          }
        }
      }
    }
  }
  const result = await resolveFast(config)
  assert.is(
    result.resources.Outputs.Endpoint.Value['Fn::Sub'],
    'https://${ApiGatewayRestApi}.execute-api.${AWS::Region}.amazonaws.com'
  )
})

test('Fn::Sub: CFN ref + AWS pseudo-parameter + self ref stay verbatim', async () => {
  const config = {
    service: 'svc',
    provider: { stage: 'prod' },
    resources: {
      Outputs: {
        E: {
          Value: {
            'Fn::Sub': 'https://${ApiGatewayRestApi}.execute-api.${AWS::Region}.amazonaws.com/${self:provider.stage}'
          }
        }
      }
    }
  }
  const result = await resolveFast(config)
  assert.is(
    result.resources.Outputs.E.Value['Fn::Sub'],
    'https://${ApiGatewayRestApi}.execute-api.${AWS::Region}.amazonaws.com/${self:provider.stage}'
  )
})

test('Fn::Sub: same CFN ref repeated is preserved at both positions', async () => {
  const config = {
    resources: {
      Outputs: {
        E: {
          Value: {
            'Fn::Sub': '${ApiGatewayRestApi}-suffix-${ApiGatewayRestApi}'
          }
        }
      }
    }
  }
  const result = await resolveFast(config)
  assert.is(
    result.resources.Outputs.E.Value['Fn::Sub'],
    '${ApiGatewayRestApi}-suffix-${ApiGatewayRestApi}'
  )
})

test('Fn::Sub: CFN ref with minimal surrounding text still passes through', async () => {
  const config = {
    resources: {
      Outputs: {
        Bare: { Value: { 'Fn::Sub': '${ApiGatewayRestApi}' } },
        E: { Value: { 'Fn::Sub': 'x${ApiGatewayRestApi}' } }
      }
    }
  }
  const result = await resolveFast(config)
  assert.is(result.resources.Outputs.Bare.Value['Fn::Sub'], '${ApiGatewayRestApi}')
  assert.is(result.resources.Outputs.E.Value['Fn::Sub'], 'x${ApiGatewayRestApi}')
})

test('Fn::Sub: only self refs still stay verbatim', async () => {
  const config = {
    service: 'svc',
    provider: { stage: 'dev' },
    resources: {
      Outputs: {
        E: { Value: { 'Fn::Sub': '${self:service}-${self:provider.stage}' } }
      }
    }
  }
  const result = await resolveFast(config)
  assert.is(result.resources.Outputs.E.Value['Fn::Sub'], '${self:service}-${self:provider.stage}')
})

test('Fn::Sub: AWS::AccountId, AWS::Region, AWS::StackName pseudo-params preserved', async () => {
  const config = {
    resources: {
      Outputs: {
        Arn: {
          Value: {
            'Fn::Sub': 'arn:aws:s3:::${AWS::StackName}-${AWS::AccountId}-${AWS::Region}'
          }
        }
      }
    }
  }
  const result = await resolveFast(config)
  assert.is(
    result.resources.Outputs.Arn.Value['Fn::Sub'],
    'arn:aws:s3:::${AWS::StackName}-${AWS::AccountId}-${AWS::Region}'
  )
})

test('Fn::Sub: output length is not exponentially larger than input', async () => {
  const input = 'https://${ApiGatewayRestApi}.execute-api.${AWS::Region}.amazonaws.com/${self:provider.stage}'
  const config = {
    provider: { stage: 'dev' },
    resources: { Outputs: { E: { Value: { 'Fn::Sub': input } } } }
  }
  const result = await resolveFast(config)
  const output = result.resources.Outputs.E.Value['Fn::Sub']
  // Output should be the same length as input. A regression of the exponential
  // bug would produce strings 10x+ larger.
  assert.ok(
    output.length < input.length * 2,
    `output (${output.length}) is suspiciously larger than input (${input.length}): possible regression`
  )
})

test('Fn::Sub: nested within larger config alongside other resolved values', async () => {
  const config = {
    service: 'api',
    provider: { stage: '${opt:stage, "dev"}' },
    custom: {
      bucketName: '${self:service}-${self:provider.stage}-bucket'
    },
    resources: {
      Outputs: {
        Endpoint: {
          Value: {
            'Fn::Sub': 'https://${ApiGatewayRestApi}.execute-api.${AWS::Region}.amazonaws.com/${self:provider.stage}'
          }
        }
      }
    }
  }
  const result = await resolveFast(config)
  assert.is(result.custom.bucketName, 'api-dev-bucket')
  assert.is(
    result.resources.Outputs.Endpoint.Value['Fn::Sub'],
    'https://${ApiGatewayRestApi}.execute-api.${AWS::Region}.amazonaws.com/${self:provider.stage}'
  )
})

test('Fn::Sub: multiple Fn::Sub blocks in same config each stay verbatim', async () => {
  const config = {
    provider: { stage: 'staging' },
    resources: {
      Outputs: {
        A: { Value: { 'Fn::Sub': '${ApiGatewayRestApi}.${self:provider.stage}' } },
        B: { Value: { 'Fn::Sub': '${UsersTable}.${AWS::Region}' } },
        C: { Value: { 'Fn::Sub': 'just-${self:provider.stage}' } }
      }
    }
  }
  const result = await resolveFast(config)
  assert.is(result.resources.Outputs.A.Value['Fn::Sub'], '${ApiGatewayRestApi}.${self:provider.stage}')
  assert.is(result.resources.Outputs.B.Value['Fn::Sub'], '${UsersTable}.${AWS::Region}')
  assert.is(result.resources.Outputs.C.Value['Fn::Sub'], 'just-${self:provider.stage}')
})

test('Fn::Sub: passthrough value contains no internal encoding markers', async () => {
  // The fix uses encodeUnknown internally then decodes at output time;
  // ensure no stray ">passthrough" or base64 markers leak into the result.
  const config = {
    resources: {
      Outputs: {
        E: { Value: { 'Fn::Sub': '${ApiGatewayRestApi}-${AWS::Region}' } }
      }
    }
  }
  const result = await resolveFast(config)
  const out = result.resources.Outputs.E.Value['Fn::Sub']
  assert.not.match(out, />passthrough/)
  assert.not.match(out, /\[_\[/)
})

test('Fn::Sub: same-named Parameter ref is not resolved or recursively inlined', async () => {
  const config = {
    custom: {
      userPoolClientId: 'abc123'
    },
    resources: {
      Parameters: {
        UserPoolClientId: {
          Type: 'String',
          Default: '${self:custom.userPoolClientId}'
        }
      },
      Resources: {
        LoginPOST: {
          Properties: {
            Integration: {
              RequestTemplates: {
                'application/json': {
                  'Fn::Sub': '{\n  "ClientId": "${UserPoolClientId}",\n  "User": "$input.path(\'$.username\')"\n}\n'
                }
              }
            }
          }
        }
      }
    }
  }

  const result = await resolveFast(config)
  const template = result.resources.Resources.LoginPOST.Properties.Integration.RequestTemplates['application/json']

  assert.is(result.resources.Parameters.UserPoolClientId.Default, 'abc123')
  assert.is(
    template['Fn::Sub'],
    '{\n  "ClientId": "${UserPoolClientId}",\n  "User": "$input.path(\'$.username\')"\n}\n'
  )
})

test('Fn::Sub: backend-proxy shaped subset preserves all request templates', async () => {
  const endpointActions = {
    AdminLoginPOST: 'AdminInitiateAuth',
    AdminSignupPOST: 'AdminCreateUser',
    AdminConfirmSignupPUT: 'ConfirmSignUp',
    SignupPOST: 'SignUp',
    ConfirmSignupPOST: 'ConfirmSignUp',
    LoginPOST: 'InitiateAuth',
    RespondAuthChallengePOST: 'RespondToAuthChallenge',
    TokenRefreshPOST: 'InitiateAuth',
    RevokeTokenPOST: 'RevokeToken',
    ForgotPasswordPOST: 'ForgotPassword',
    ConfirmForgotPasswordPOST: 'ConfirmForgotPassword',
    EnableMfaPOST: 'AdminSetUserMFAPreference',
    DisableMfaPOST: 'AdminSetUserMFAPreference'
  }
  const resources = {}

  for (const [name, action] of Object.entries(endpointActions)) {
    resources[name] = {
      Type: 'AWS::ApiGateway::Method',
      Properties: {
        Integration: {
          Credentials: {
            'Fn::Sub': 'arn:aws:iam::${AWS::AccountId}:role/${Service}-Cognito-Api-${Environment}'
          },
          Uri: {
            'Fn::Sub': `arn:aws:apigateway:\${AWS::Region}:cognito-idp:action/${action}`
          },
          RequestTemplates: {
            'application/json': {
              'Fn::Sub': `{
  "Endpoint": "${name}",
  "ClientId": "\${UserPoolClientId}",
  "UserPoolId": "\${UserPoolId}",
  "User": "$input.path('$.username')",
  "Environment": "\${Environment}"
}
`
            }
          }
        }
      }
    }
  }

  const config = {
    custom: {
      userPoolClientId: 'example-client-id'
    },
    resources: {
      Parameters: {
        UserPoolClientId: {
          Type: 'String',
          Default: '${self:custom.userPoolClientId}'
        },
        UserPoolId: { Type: 'String' },
        Service: { Type: 'String', Default: 'example-auth-service' },
        Environment: { Type: 'String', Default: 'dev' }
      },
      Resources: {
        CognitoApiRole: {
          Properties: {
            RoleName: {
              'Fn::Sub': '${Service}-Cognito-Api-${Environment}'
            },
            Policies: [
              {
                PolicyDocument: {
                  Statement: [
                    {
                      Resource: {
                        'Fn::Sub': 'arn:aws:cognito-idp:${AWS::Region}:${AWS::AccountId}:userpool/${UserPoolId}'
                      }
                    }
                  ]
                }
              }
            ]
          }
        },
        ...resources
      },
      Outputs: {
        Endpoint: {
          Value: {
            'Fn::Sub': 'https://${CognitoApi}.execute-api.${AWS::Region}.amazonaws.com/${Environment}/'
          }
        }
      }
    }
  }
  const originalFnSubs = collectFnSubValues(JSON.parse(JSON.stringify(config)))
  const result = await resolveFast(config)
  const resultFnSubs = collectFnSubValues(result)

  assert.is(result.resources.Parameters.UserPoolClientId.Default, 'example-client-id')
  assert.is(resultFnSubs.length, originalFnSubs.length)
  assert.is(
    Object.keys(endpointActions).filter((name) => {
      return result.resources.Resources[name].Properties.Integration.RequestTemplates['application/json']['Fn::Sub']
    }).length,
    13
  )
  for (const entry of originalFnSubs) {
    assert.equal(getAtPath(result, entry.path), entry.value)
  }
})

test('Fn::Sub: YAML !Sub body round-trips through sync API', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-fn-sub-'))
  const file = path.join(dir, 'repro.yml')

  try {
    fs.writeFileSync(file, `custom:
  userPoolClientId: "abc123"
resources:
  Parameters:
    UserPoolClientId:
      Type: String
      Default: \${self:custom.userPoolClientId}
  Resources:
    LoginPOST:
      Properties:
        Integration:
          RequestTemplates:
            application/json: !Sub |
              {
                "ClientId": "\${UserPoolClientId}",
                "User": "$input.path('$.username')"
              }
`)

    const result = configorama.sync(file)
    const template = result.resources.Resources.LoginPOST.Properties.Integration.RequestTemplates['application/json']

    assert.is(result.resources.Parameters.UserPoolClientId.Default, 'abc123')
    assert.is(
      template['Fn::Sub'],
      '{\n  "ClientId": "${UserPoolClientId}",\n  "User": "$input.path(\'$.username\')"\n}\n'
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('Fn::Sub: file-only body inlines raw JSON text and preserves CFN refs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-fn-sub-file-'))
  const configFile = path.join(dir, 'serverless.yml')
  const dashboardFile = path.join(dir, 'dashboard.json')

  try {
    fs.writeFileSync(dashboardFile, `{
  "widgets": [
    {
      "type": "text",
      "properties": {
        "markdown": "Region: \${AWS::Region}; Pool: \${CognitoUserPool}"
      }
    }
  ]
}
`)

    fs.writeFileSync(configFile, `resources:
  Resources:
    AuthDashboard:
      Type: AWS::CloudWatch::Dashboard
      Properties:
        DashboardName: !Sub cognito-dashboard
        DashboardBody: !Sub |
          \${file(./dashboard.json)}
`)

    const result = configorama.sync(configFile)
    const body = result.resources.Resources.AuthDashboard.Properties.DashboardBody['Fn::Sub']

    assert.type(body, 'string')
    assert.ok(body.startsWith('{\n  "widgets"'))
    assert.ok(body.includes('"markdown": "Region: ${AWS::Region}; Pool: ${CognitoUserPool}"'))
    assert.not.ok(body.includes('${file(./dashboard.json)}'))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('Fn::Sub: file ref resolves while self + CFN refs in same body stay verbatim', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-fn-sub-mixed-'))
  const configFile = path.join(dir, 'serverless.yml')
  const dashboardFile = path.join(dir, 'dashboard.json')

  try {
    fs.writeFileSync(dashboardFile, `{ "ref": "\${AWS::Region}" }\n`)

    fs.writeFileSync(configFile, `provider:
  stage: dev
resources:
  Resources:
    D:
      Properties:
        Body: !Sub |
          \${file(./dashboard.json)} stage=\${self:provider.stage} api=\${ApiGatewayRestApi}
`)

    const body = configorama.sync(configFile).resources.Resources.D.Properties.Body['Fn::Sub']

    // file() inlined as raw text, CFN ref inside the file preserved
    assert.ok(body.includes('{ "ref": "${AWS::Region}" }'))
    assert.not.ok(body.includes('${file(./dashboard.json)}'))
    // self ref left verbatim (Serverless resolves it later), not inlined to "dev"
    assert.ok(body.includes('stage=${self:provider.stage}'))
    // bare CFN ref left verbatim for CloudFormation
    assert.ok(body.includes('api=${ApiGatewayRestApi}'))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('Fn::Sub: custom variable source resolves inside body', async () => {
  const config = {
    resources: {
      Resources: {
        D: { Properties: { Body: { 'Fn::Sub': 'token=${consul:foo} cfn=${ApiGatewayRestApi}' } } }
      }
    }
  }
  const result = await configorama(config, {
    variableSources: [{
      type: 'consul',
      match: /^consul:/g,
      resolver: (variableString) => Promise.resolve('RESOLVED')
    }]
  })
  const body = result.resources.Resources.D.Properties.Body['Fn::Sub']
  assert.is(body, 'token=RESOLVED cfn=${ApiGatewayRestApi}')
})

test.run()
