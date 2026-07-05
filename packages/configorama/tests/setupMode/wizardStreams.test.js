// Wizard stream routing - prompt UI can render off stdout so --export stays machine-clean
/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const { Writable } = require('stream')
const { spawn } = require('child_process')
const { runConfigWizard } = require('../../src/utils/ui/configWizard')

function captureStream() {
  const chunks = []
  const stream = new Writable({
    write(chunk, enc, cb) {
      chunks.push(chunk.toString())
      cb()
    },
  })
  stream.captured = () => chunks.join('')
  return stream
}

async function captureStdout(fn) {
  const chunks = []
  const origWrite = process.stdout.write.bind(process.stdout)
  process.stdout.write = (chunk, ...args) => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString())
    return true
  }
  try {
    const result = await fn()
    return { result, output: chunks.join('') }
  } finally {
    process.stdout.write = origWrite
  }
}

test('wizard UI routes to the provided output stream, not stdout', async () => {
  const target = captureStream()
  const { output } = await captureStdout(() =>
    runConfigWizard({ uniqueVariables: {} }, {}, '/tmp/example.yml', { output: target })
  )

  assert.is(output, '', 'stdout stays empty')
  assert.ok(target.captured().includes('Configuration Wizard'), 'UI renders on target stream')
})

test('wizard without streams keeps writing to stdout', async () => {
  const { output } = await captureStdout(() =>
    runConfigWizard({ uniqueVariables: {} }, {}, '/tmp/example.yml')
  )
  assert.ok(output.includes('Configuration Wizard'), 'default behavior unchanged')
})

test('interactive prompt keeps stdout clean end-to-end (subprocess)', async () => {
  const childScript = path.join(__dirname, 'wizard-stream-child.js')
  const childEnv = { ...process.env }
  delete childEnv.WIZARD_STREAM_TEST_REGION
  const child = spawn(process.execPath, [childScript], { env: childEnv })
  const killTimer = setTimeout(() => child.kill('SIGKILL'), 15000)

  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (d) => { stdout += d })
  child.stderr.on('data', (d) => { stderr += d })

  // Answer the single REGION prompt; the pipe buffers until clack reads it
  child.stdin.write('us-east-1\r')
  child.stdin.end()

  const exitCode = await new Promise((resolve) => child.on('close', resolve))
  clearTimeout(killTimer)

  assert.is(exitCode, 0, `child exits clean. stderr: ${stderr.slice(0, 400)}`)
  const answers = JSON.parse(stdout)
  assert.is(answers.env.WIZARD_STREAM_TEST_REGION, 'us-east-1')
  assert.ok(stderr.includes('Configuration Wizard'), 'prompt frames render on stderr')
})

test.run()
