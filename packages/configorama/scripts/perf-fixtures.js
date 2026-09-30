#!/usr/bin/env node
/**
 * Capture successful resolutions AND expected errors for the fixture corpus.
 * Usage: node scripts/perf-fixtures.js <library-path> <output-json>
 * Compare revisions under the same cwd, environment, runtime and git state.
 * Each fixture gets a fresh process so dotenv and JS configs cannot leak state.
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')
if (!process.argv[2] || !process.argv[3]) {
  throw new Error('Expected library path and output file')
}
const lib = path.resolve(process.argv[2])
const outputPath = path.resolve(process.argv[3])
const files = []

function collectFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(file)
    else if (/\.(ya?ml|json|toml|ini|hcl|tf|md)$/.test(file)) files.push(file)
  }
}
collectFiles(path.join(root, 'tests'))

const results = {}
const counts = { success: 0, failure: 0, noOutput: 0 }
for (const file of files.sort()) {
  // One async ESM fixture uses Date.now(); pin it for reproducible snapshots.
  const script = `
    Date.now = () => 1700000000000
    const configorama = require(${JSON.stringify(lib)})
    configorama(${JSON.stringify(file)}, {
      options: { stage: 'dev', region: 'us-east-1', threads: '2' },
      allowUnknownVariableTypes: true,
      allowUndefinedValues: true,
    }).then(
      value => process.stdout.write('ORACLE=' + JSON.stringify({ ok: true, value })),
      error => process.stdout.write('ORACLE=' + JSON.stringify({ ok: false, code: error.code, message: error.message })),
    )
  `
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: root,
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, CONFIGORAMA_STRICT_THREADS: '2' },
  })
  const index = result.stdout ? result.stdout.lastIndexOf('ORACLE=') : -1
  const outcome = index < 0
    ? { status: result.status, signal: result.signal, error: result.error?.code }
    : JSON.parse(result.stdout.slice(index + 'ORACLE='.length))
  results[path.relative(root, file)] = outcome
  if (outcome.ok === true) counts.success++
  else if (outcome.ok === false) counts.failure++
  else counts.noOutput++
}
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2) + '\n')
console.error(files.length, counts)
if (counts.noOutput) process.exitCode = 1
