// Setup engine tests - configorama.setup() analyzes, prompts, and returns grouped answers
/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const { REDACTED_VALUE } = require('../../src/utils/redaction/setupRedaction')

const configFile = path.join(__dirname, 'setup-vars.yml')

const SECRET = 'super-secret-api-key-value'

// Capture everything written to stdout (console.log + clack prompts) during fn
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

function fakePromptRenderer(answers) {
  const calls = []
  const renderer = async (metadata, originalConfig, configFilePath) => {
    calls.push({ metadata, originalConfig, configFilePath })
    return answers
  }
  renderer.calls = calls
  return renderer
}

test('setup returns schemaVersion, configPath, requirements, and grouped answers', async () => {
  const promptRenderer = fakePromptRenderer({
    options: { stage: 'dev' },
    env: { API_KEY: SECRET, REGION: 'us-east-1' },
  })
  const result = await configorama.setup(configFile, { promptRenderer })

  assert.is(result.schemaVersion, 1)
  assert.is(result.configPath, configFile)
  assert.ok(path.isAbsolute(result.configPath), 'configPath is absolute')
  assert.ok(Array.isArray(result.requirements), 'requirements is an array')
  assert.ok(result.requirements.length >= 3, 'requirements include all promptable vars')

  assert.equal(result.answers.options, { stage: 'dev' })
  assert.equal(result.answers.env, { API_KEY: SECRET, REGION: 'us-east-1' })
  assert.equal(result.answers.self, {})
  assert.equal(result.answers.dotProp, {})
})

test('setup redacts sensitive answers in redactedAnswers', async () => {
  const promptRenderer = fakePromptRenderer({
    env: { API_KEY: SECRET, REGION: 'us-east-1' },
  })
  const result = await configorama.setup(configFile, { promptRenderer })

  assert.is(result.redactedAnswers.env.API_KEY, REDACTED_VALUE)
  assert.is(result.redactedAnswers.env.REGION, 'us-east-1')
  assert.is(result.answers.env.API_KEY, SECRET, 'raw answers keep the real value')
})

test('setup passes analysis metadata and config path to the prompt renderer', async () => {
  const promptRenderer = fakePromptRenderer({})
  await configorama.setup(configFile, { promptRenderer })

  assert.is(promptRenderer.calls.length, 1)
  const call = promptRenderer.calls[0]
  assert.ok(call.metadata.uniqueVariables, 'renderer receives enriched metadata')
  assert.ok(Object.keys(call.metadata.uniqueVariables).length >= 3, 'metadata covers all vars')
  assert.is(call.originalConfig.service, 'my-app')
  assert.is(call.configFilePath, configFile)
})

test('setup normalizes missing answer groups to empty objects', async () => {
  const promptRenderer = fakePromptRenderer({ env: { REGION: 'us-east-1' } })
  const result = await configorama.setup(configFile, { promptRenderer })

  assert.equal(result.answers.options, {})
  assert.equal(result.answers.self, {})
  assert.equal(result.answers.dotProp, {})
  assert.equal(result.redactedAnswers.options, {})
})

test('setup engine prints nothing to stdout and never leaks secrets', async () => {
  const promptRenderer = fakePromptRenderer({
    env: { API_KEY: SECRET, REGION: 'us-east-1' },
  })
  const { output } = await captureStdout(() =>
    configorama.setup(configFile, { promptRenderer })
  )

  assert.is(output, '', 'engine itself writes nothing to stdout')
  assert.not.ok(output.includes(SECRET), 'no secret values on stdout')
})

test.run()
