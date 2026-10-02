/* Golden outputs for Serverless-style configs, resolved the way Serverless wrappers call */
/* configorama, standalone and with deploy-tool env vars. Any change to resolved output    */
/* fails here; regenerate with UPDATE_GOLDENS=1 only after reviewing the diff.             */
/* eslint-disable no-template-curly-in-string */
const fs = require('fs')
const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')
const { assertGolden } = require('../conformance/harness')

const FIXTURES = path.join(__dirname, 'fixtures')
const GOLDENS = path.join(__dirname, 'goldens')
const fixtures = fs.readdirSync(FIXTURES).filter((f) => f.endsWith('.yml')).sort()

// How Serverless wrappers resolve: osls-native ${sls:}/${aws:}/${ssm:}/${cf:} pass through
const SETTINGS = { allowUnknownVariableTypes: true, allowUnresolvedVariables: true }

/** Env a deploy tool injects; standalone deploys have none of it */
const DEPLOYER_ENV = {
  SG_STACK_NAME: 'app-acme-prod-svc',
  SG_ENVIRONMENT: 'prod',
  SG_PREFIX: 'sl',
  SG_DEPLOYMENT_BUCKET: 'shared-artifacts-use1',
  SG_DEPLOYMENT_PREFIX: 'dep_123/svc',
  SG_DEPLOYMENT_ID: 'dep_123',
  SG_TARGET_REGION: 'us-west-2',
  SG_INSTANCE: 'blue',
  SG_TENANCY: 'isolated',
  SG_EXEC_ROLE_ARN: 'arn:aws:iam::123456789012:role/exec',
  SG_REGION_CODE: 'usw2',
  SG_BOUNDARY_ARN: 'arn:aws:iam::123456789012:policy/boundary',
  SG_BUCKET_TOKEN: 'tok123',
  SG_RETRIES: '5',
  SG_ENABLED: 'false',
}

const MODES = {
  standalone: { env: {}, options: { stage: 'qa' } },
  deployer: { env: DEPLOYER_ENV, options: { stage: 'acme-prod', region: 'us-west-2' } },
}

/**
 * Run fn with exactly the given SG_* env vars set, until its result settles
 * @template T
 * @param {Record<string, string>} env
 * @param {() => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withEnv(env, fn) {
  const saved = { ...process.env }
  for (const key of Object.keys(process.env)) if (key.startsWith('SG_')) delete process.env[key]
  Object.assign(process.env, env)
  try {
    return await fn()
  } finally {
    for (const key of Object.keys(process.env)) if (key.startsWith('SG_')) delete process.env[key]
    Object.assign(process.env, saved)
  }
}

// Internal encodings that must never reach resolved output
const LEAKED_MARKERS = [/__JSON_B64__/, /__CFG_C/, //, //, /passthrough\[_\[/, /__configoramaDate/, /__NULL__/]

/**
 * Every string anywhere in a resolved value, with its path
 * @param {any} value
 * @param {string} [at]
 * @returns {Array<[string, string]>}
 */
function strings(value, at = '') {
  if (typeof value === 'string') return [[at, value]]
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => strings(v, `${at}.${k}`))
  }
  return []
}

for (const file of fixtures) {
  const name = file.replace(/\.yml$/, '')
  for (const [mode, { env, options }] of Object.entries(MODES)) {
    test(`${name} (${mode}): matches golden, no leaked encodings, sync = async`, async () => {
      const fixture = path.join(FIXTURES, file)
      const resolved = await withEnv(env, () => configorama(fixture, { ...SETTINGS, options }))
      const resolvedSync = await withEnv(env, () => configorama.sync(fixture, { ...SETTINGS, options }))

      for (const [at, text] of strings(resolved)) {
        for (const marker of LEAKED_MARKERS) {
          assert.not.ok(marker.test(text), `${at} leaked ${marker}: ${JSON.stringify(text)}`)
        }
      }
      assert.equal(resolvedSync, resolved, 'sync and async APIs resolve the same')
      assertGolden(`${name}.${mode}`, resolved, GOLDENS, { keepBackslashes: true })
    })
  }
}

test.run()
