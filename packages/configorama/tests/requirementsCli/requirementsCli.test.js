const { test } = require('uvu')
const assert = require('uvu/assert')
const { spawnSync } = require('child_process')
const path = require('path')

const CLI_PATH = path.join(__dirname, '../../cli.js')
const CONFIG_PATH = path.join(__dirname, 'config.yml')
const CONFLICT_PATH = path.join(__dirname, 'conflict.yml')

function runCli(args) {
  const env = { ...process.env }
  delete env.CONFIGORAMA_REQUIREMENTS_CLI_API_KEY
  delete env.CONFIGORAMA_REQUIREMENTS_CLI_CONFLICT

  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: 'utf8',
    cwd: __dirname,
    env
  })
}

function parseStdout(result) {
  return JSON.parse(result.stdout)
}

test('requirements subcommand is intercepted before positional file parsing', () => {
  const result = runCli(['requirements', CONFIG_PATH])
  assert.is(result.status, 0, result.stderr)

  const output = parseStdout(result)
  assert.is(output.schemaVersion, 1)
  assert.equal(output.ask.map(item => item.variable), ['env:CONFIGORAMA_REQUIREMENTS_CLI_API_KEY'])
})

test('--requirements uses analyze path and does not resolve missing values', () => {
  const result = runCli([CONFIG_PATH, '--requirements'])
  assert.is(result.status, 0, result.stderr)

  const output = parseStdout(result)
  assert.is(output.summary.total, 2)
  assert.equal(output.ask.map(item => item.variable), ['env:CONFIGORAMA_REQUIREMENTS_CLI_API_KEY'])
})

test('requirements mode reports missing input file as nonzero', () => {
  const result = runCli(['requirements', './does-not-exist.yml'])
  assert.ok(result.status !== 0)
  assert.match(result.stderr, /File not found/)
})

test('requirements mode reports contract conflicts as nonzero', () => {
  const result = runCli(['requirements', CONFLICT_PATH])
  assert.ok(result.status !== 0)
  assert.match(result.stderr, /CONFIGORAMA_REQUIREMENTS_CLI_CONFLICT type conflict/)
})

test.run()
