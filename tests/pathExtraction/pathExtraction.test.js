/* Tests for CLI jq-style path extraction */
const { test } = require('uvu')
const assert = require('uvu/assert')
const { execSync } = require('child_process')
const path = require('path')

const CLI_PATH = path.join(__dirname, '../../cli.js')
const CONFIG_PATH = path.join(__dirname, 'config.yml')

function runCli(args) {
  const cmd = `node ${CLI_PATH} ${args}`
  try {
    const output = execSync(cmd, { encoding: 'utf8', cwd: __dirname })
    return { output: output.trim(), exitCode: 0 }
  } catch (err) {
    return { output: err.stderr || err.stdout || '', exitCode: err.status }
  }
}

function parseOutput(result) {
  if (result.exitCode !== 0) return undefined
  try {
    return JSON.parse(result.output)
  } catch {
    // Return raw output if not JSON
    return result.output
  }
}

// Basic property access
test('CLI path: .service returns string value', () => {
  const result = runCli(`${CONFIG_PATH} .service`)
  assert.is(result.exitCode, 0)
  assert.is(parseOutput(result), 'my-app')
})

test('CLI path: .version returns string value', () => {
  const result = runCli(`${CONFIG_PATH} .version`)
  assert.is(result.exitCode, 0)
  assert.is(parseOutput(result), '1.0.0')
})

// Nested property access
test('CLI path: .database.host returns nested value', () => {
  const result = runCli(`${CONFIG_PATH} .database.host`)
  assert.is(result.exitCode, 0)
  assert.is(parseOutput(result), 'localhost')
})

test('CLI path: .database.port returns number', () => {
  const result = runCli(`${CONFIG_PATH} .database.port`)
  assert.is(result.exitCode, 0)
  assert.is(parseOutput(result), 5432)
})

test('CLI path: .database.credentials.user returns deeply nested', () => {
  const result = runCli(`${CONFIG_PATH} .database.credentials.user`)
  assert.is(result.exitCode, 0)
  assert.is(parseOutput(result), 'admin')
})

// Array index access
test('CLI path: .servers[0] returns first array element', () => {
  const result = runCli(`${CONFIG_PATH} ".servers[0]"`)
  assert.is(result.exitCode, 0)
  const parsed = parseOutput(result)
  assert.is(parsed.name, 'primary')
  assert.is(parsed.host, '10.0.0.1')
})

test('CLI path: .servers[1].name returns property of array element', () => {
  const result = runCli(`${CONFIG_PATH} ".servers[1].name"`)
  assert.is(result.exitCode, 0)
  assert.is(parseOutput(result), 'secondary')
})

test('CLI path: .servers[2].port returns last server port', () => {
  const result = runCli(`${CONFIG_PATH} ".servers[2].port"`)
  assert.is(result.exitCode, 0)
  assert.is(parseOutput(result), 8082)
})

// Negative array indices
test('CLI path: .servers[-1] returns last array element', () => {
  const result = runCli(`${CONFIG_PATH} ".servers[-1]"`)
  assert.is(result.exitCode, 0)
  const parsed = parseOutput(result)
  assert.is(parsed.name, 'backup')
})

test('CLI path: .servers[-2].host returns second to last element', () => {
  const result = runCli(`${CONFIG_PATH} ".servers[-2].host"`)
  assert.is(result.exitCode, 0)
  assert.is(parseOutput(result), '10.0.0.2')
})

// Simple array access
test('CLI path: .features[0] returns first feature', () => {
  const result = runCli(`${CONFIG_PATH} ".features[0]"`)
  assert.is(result.exitCode, 0)
  assert.is(parseOutput(result), 'auth')
})

test('CLI path: .features[-1] returns last feature', () => {
  const result = runCli(`${CONFIG_PATH} ".features[-1]"`)
  assert.is(result.exitCode, 0)
  assert.is(parseOutput(result), 'metrics')
})

// Deep nesting
test('CLI path: .nested.level1.level2.level3.value returns deeply nested', () => {
  const result = runCli(`${CONFIG_PATH} .nested.level1.level2.level3.value`)
  assert.is(result.exitCode, 0)
  assert.is(parseOutput(result), 'deeply-nested')
})

// Bracket notation for special keys
test('CLI path: .["special-keys"]["key-with-dash"] returns hyphenated key', () => {
  const result = runCli(`${CONFIG_PATH} '.["special-keys"]["key-with-dash"]'`)
  assert.is(result.exitCode, 0)
  assert.is(parseOutput(result), 'works')
})

// Path before file (alternate syntax)
test('CLI path: path before file works', () => {
  const result = runCli(`.database.name ${CONFIG_PATH}`)
  assert.is(result.exitCode, 0)
  assert.is(parseOutput(result), 'mydb')
})

// Return entire object/array
test('CLI path: .database returns full object', () => {
  const result = runCli(`${CONFIG_PATH} .database`)
  assert.is(result.exitCode, 0)
  const parsed = parseOutput(result)
  assert.is(parsed.host, 'localhost')
  assert.is(parsed.port, 5432)
  assert.is(parsed.credentials.user, 'admin')
})

test('CLI path: .features returns full array', () => {
  const result = runCli(`${CONFIG_PATH} .features`)
  assert.is(result.exitCode, 0)
  const parsed = parseOutput(result)
  assert.equal(parsed, ['auth', 'logging', 'metrics'])
})

// Error cases
test('CLI path: missing path returns error', () => {
  const result = runCli(`${CONFIG_PATH} .nonexistent`)
  assert.is(result.exitCode, 1)
})

test('CLI path: out of bounds array index returns error', () => {
  const result = runCli(`${CONFIG_PATH} ".servers[99]"`)
  assert.is(result.exitCode, 1)
})

// Without path returns full config
test('CLI path: no path returns full config', () => {
  const result = runCli(`${CONFIG_PATH}`)
  assert.is(result.exitCode, 0)
  const parsed = parseOutput(result)
  assert.is(parsed.service, 'my-app')
  assert.ok(parsed.database)
  assert.ok(parsed.servers)
})

test.run()
