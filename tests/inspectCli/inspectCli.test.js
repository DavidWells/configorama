const { test } = require('uvu')
const assert = require('uvu/assert')
const { spawnSync } = require('child_process')
const path = require('path')

const CLI_PATH = path.join(__dirname, '../../cli.js')
const CONFIG_PATH = path.join(__dirname, 'config.yml')
const RESOLVABLE_PATH = path.join(__dirname, 'resolvable.yml')

function runCli(args) {
  const env = { ...process.env }
  delete env.INSPECT_CLI_TOKEN
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: 'utf8',
    cwd: __dirname,
    env,
  })
}

test('inspect returns the full model with requirements, graph and audit', () => {
  const result = runCli(['inspect', CONFIG_PATH])
  assert.is(result.status, 0, result.stderr)
  const out = JSON.parse(result.stdout)
  assert.is(out.schemaVersion, 1)
  assert.ok(out.requirements)
  assert.ok(out.graph)
  assert.ok(out.audit)
  assert.ok(out.graph.nodes.length > 0)
})

test('inspect --view requirements is identical to the requirements verb', () => {
  const viaInspect = runCli(['inspect', CONFIG_PATH, '--view', 'requirements'])
  const viaVerb = runCli(['requirements', CONFIG_PATH])
  assert.is(viaInspect.status, 0, viaInspect.stderr)
  assert.is(viaInspect.stdout, viaVerb.stdout)
})

test('inspect --view audit is identical to the audit verb', () => {
  const viaInspect = runCli(['inspect', CONFIG_PATH, '--view', 'audit'])
  const viaVerb = runCli(['audit', CONFIG_PATH])
  assert.is(viaInspect.status, 0, viaInspect.stderr)
  assert.is(viaInspect.stdout, viaVerb.stdout)
})

test('inspect --view graph --format mermaid emits a mermaid string', () => {
  const result = runCli(['inspect', CONFIG_PATH, '--view', 'graph', '--format', 'mermaid'])
  assert.is(result.status, 0, result.stderr)
  assert.match(result.stdout, /^graph TD/)
})

test('inspect rejects an unknown view as structured JSON', () => {
  const result = runCli(['inspect', CONFIG_PATH, '--view', 'bogus'])
  assert.is(result.status, 1)
  const parsed = JSON.parse(result.stderr)
  assert.is(parsed.error.code, 'invalid_view')
})

test('unknown command suggests the closest command', () => {
  const result = runCli(['inspekt', CONFIG_PATH])
  assert.is(result.status, 1)
  assert.match(result.stderr, /Unknown command/)
  assert.match(result.stderr, /inspect/)
})

test('a misspelled flag warns with a suggestion but does not fail', () => {
  const result = runCli(['graph', CONFIG_PATH, '--fromat', 'mermaid'])
  assert.is(result.status, 0, result.stderr)
  assert.match(result.stderr, /Did you mean "--format"/)
})

test('passthrough opt flags are not hijacked by flag suggestions', () => {
  const result = runCli([RESOLVABLE_PATH, '--stage', 'dev'])
  assert.is(result.status, 0, result.stderr)
  assert.not.match(result.stderr, /Did you mean/)
})

test('structured commands default to JSON errors on a missing file', () => {
  const result = runCli(['graph', './does-not-exist.yml'])
  assert.is(result.status, 1)
  const parsed = JSON.parse(result.stderr)
  assert.is(parsed.error.code, 'file_not_found')
})

test('capabilities prints the contract and needs no input file', () => {
  const result = runCli(['capabilities'])
  assert.is(result.status, 0, result.stderr)
  const caps = JSON.parse(result.stdout)
  assert.is(caps.name, 'configorama')
  assert.ok(caps.commands.some(c => c.name === 'inspect'))
  assert.ok(caps.errorCodes.some(e => e.code === 'missing_env'))
})

test.run()
