/* Variables embedded in a YAML flow sequence ['..${x}..'] must not get quote-wrapped */
/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

const dirname = __dirname
const POOL = 'us-east-1_zMCQjZIHO'

let config

test.before(async () => {
  process.env.POOL = POOL // clean value, zero quote bytes
  config = await configorama(path.join(dirname, 'flowSeqQuoteLeak.yml'), {
    configDir: dirname,
    options: { stage: 'dev' }
  })
  for (const k of Object.keys(config)) console.log(k.padEnd(14), '=>', JSON.stringify(config[k]))
})

test.after(() => { delete process.env.POOL })

// Scalar and block-sequence forms already resolve cleanly (regression guards).
test('double-quoted scalar', () => assert.is(config.dq_scalar, POOL))
test('single-quoted scalar', () => assert.is(config.sq_scalar, POOL))
test('plain scalar', () => assert.is(config.plain_scalar, POOL))
test('embedded in block scalar', () => assert.is(config.block_embed, `pre/${POOL}/post`))
test('embedded in block sequence', () => assert.is(config.block_seq[0], `pre/${POOL}`))

// The bug: embedding a variable inside a YAML FLOW sequence wraps the resolved
// value in double quotes -> malformed ARN -> IAM deny. Not env-specific.
test('env ref in flow sequence', () => assert.is(config.flow_seq_env[0], `arn:userpool/${POOL}`))
test('self ref in flow sequence', () => assert.is(config.flow_seq_self[0], `arn:userpool/${POOL}`))
test('opt ref in flow sequence', () => assert.is(config.flow_seq_opt[0], 'stage/dev'))

test.run()
