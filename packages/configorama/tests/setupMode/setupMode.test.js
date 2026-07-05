// Setup mode test - ensures options.setup triggers the config wizard
/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

const configFile = path.join(__dirname, 'no-vars.yml')

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

test('options.setup triggers the config wizard', async () => {
  const { result, output } = await captureStdout(() =>
    configorama(configFile, { setup: true })
  )
  assert.is(result.service, 'my-app')
  assert.is(result.stage, 'prod')
  assert.ok(output.includes('Configuration Wizard'), 'wizard should run when setup is true')
})

test('config resolves normally without setup', async () => {
  const { result, output } = await captureStdout(() =>
    configorama(configFile, {})
  )
  assert.is(result.service, 'my-app')
  assert.not.ok(output.includes('Configuration Wizard'), 'wizard should not run without setup')
})

test.run()
