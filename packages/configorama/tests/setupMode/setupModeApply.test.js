// Setup mode end-to-end: wizard answers flow through the engine into resolution
/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

const configFile = path.join(__dirname, 'setup-vars.yml')

const SECRET = 'setup-apply-secret-value-9000'

// uvu runs all test files in one process - save/restore shared env keys
const savedEnv = {}
function stashEnv() {
  for (const key of ['API_KEY', 'REGION']) {
    savedEnv[key] = process.env[key]
    delete process.env[key]
  }
}
function restoreEnv() {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

async function captureStdout(fn) {
  const chunks = []
  const origWrite = process.stdout.write.bind(process.stdout)
  const origLog = console.log
  process.stdout.write = (chunk, ...args) => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  }
  console.log = (...args) => { chunks.push(args.join(' ')) }
  try {
    const result = await fn()
    return { result, output: chunks.join('\n') }
  } finally {
    process.stdout.write = origWrite
    console.log = origLog
  }
}

test('setup mode resolves config with answers from the prompt renderer', async () => {
  stashEnv()

  const promptRenderer = async () => ({
    env: { API_KEY: SECRET, REGION: 'us-east-1' },
  })

  const { result, output } = await captureStdout(() =>
    configorama(configFile, { setup: true, promptRenderer })
  )

  assert.is(result.apiKey, SECRET, 'answered env feeds resolution')
  assert.is(result.region, 'us-east-1')
  assert.is(result.stage, 'dev', 'option fallback still applies')
  assert.is(process.env.API_KEY, SECRET, 'setup mode applies env answers to process.env')

  assert.ok(output.includes('User Inputs Summary'), 'summary header printed')
  assert.not.ok(output.includes(SECRET), 'sensitive answer never printed')
  assert.ok(output.includes('us-east-1'), 'non-sensitive answers visible in summary')

  restoreEnv()
})

test('setup requirements are exposed on the instance for CLI redaction', async () => {
  stashEnv()

  const promptRenderer = async () => ({
    env: { API_KEY: SECRET, REGION: 'us-east-1' },
  })

  const instance = new configorama.Configorama(configFile, { setup: true, promptRenderer })
  await captureStdout(() => instance.init({}))

  assert.ok(Array.isArray(instance.setupRequirements), 'setupRequirements set')
  const apiKeyReq = instance.setupRequirements.find((r) => r.name === 'API_KEY')
  assert.ok(apiKeyReq, 'requirements include API_KEY')
  assert.is(apiKeyReq.sensitive, true)

  restoreEnv()
})

test.run()
