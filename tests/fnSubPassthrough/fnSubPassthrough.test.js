/**
 * Regression tests for the Fn::Sub passthrough exponential-growth bug.
 *
 * The bug: when an unresolvable variable appears inside a CloudFormation
 * `Fn::Sub` value (e.g. `${ApiGatewayRestApi}`, `${AWS::Region}`), the
 * resolver was returning the entire enclosing property string as the
 * substitution value for that single variable. Because the substituted
 * string itself contained the same `${...}` marker, each resolution pass
 * doubled the string length until V8 hit "Invalid string length".
 *
 * Fix: only encode the current variable for passthrough, not the whole
 * property. (src/main.js, around line 2587)
 */

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

test('Fn::Sub: single CFN ref mixed with resolvable self ref', async () => {
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
    'https://${ApiGatewayRestApi}.execute-api.amazonaws.com/dev'
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

test('Fn::Sub: CFN ref + AWS pseudo-parameter + resolvable self ref', async () => {
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
    'https://${ApiGatewayRestApi}.execute-api.${AWS::Region}.amazonaws.com/prod'
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
  // A bare `Fn::Sub: '${ApiGatewayRestApi}'` (variable only, no literal text)
  // takes a different resolver path and is not covered here — in practice
  // CloudFormation users write `Ref: ApiGatewayRestApi` for that case anyway.
  // This test pins the minimal substring form, which DOES route through the
  // Fn::Sub passthrough path that the bug fix targets.
  const config = {
    resources: {
      Outputs: {
        E: { Value: { 'Fn::Sub': 'x${ApiGatewayRestApi}' } }
      }
    }
  }
  const result = await resolveFast(config)
  assert.is(result.resources.Outputs.E.Value['Fn::Sub'], 'x${ApiGatewayRestApi}')
})

test('Fn::Sub: only resolvable self refs (no CFN refs) still works', async () => {
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
  assert.is(result.resources.Outputs.E.Value['Fn::Sub'], 'svc-dev')
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
  // Output should be roughly the same length as input (minor delta for ${self:..} → 'dev').
  // A regression of the exponential bug would produce strings 10x+ larger.
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
    'https://${ApiGatewayRestApi}.execute-api.${AWS::Region}.amazonaws.com/dev'
  )
})

test('Fn::Sub: multiple Fn::Sub blocks in same config each resolve independently', async () => {
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
  assert.is(result.resources.Outputs.A.Value['Fn::Sub'], '${ApiGatewayRestApi}.staging')
  assert.is(result.resources.Outputs.B.Value['Fn::Sub'], '${UsersTable}.${AWS::Region}')
  assert.is(result.resources.Outputs.C.Value['Fn::Sub'], 'just-staging')
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

test.run()
