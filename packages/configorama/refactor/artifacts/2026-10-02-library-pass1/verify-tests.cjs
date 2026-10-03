const fs = require('fs')
const assert = require('assert/strict')
const [currentFile, baselineFile] = process.argv.slice(2)
function read(file) {
  const log = fs.readFileSync(file, 'utf8').replace(/\x1b\[[0-9;]*m/g, '')
  assert(!/\bFAIL\s+"|ERR_PNPM|Exit status [1-9]/.test(log), 'Test failures in ' + file)
  const counts = [...log.matchAll(/\((\d+) \/ (\d+)\)/g)].map(m => [+m[1], +m[2]])
  assert(counts.length > 100, 'Incomplete monorepo log')
  for (const [passed, total] of counts) assert.equal(passed, total, 'Suite stopped early in ' + file)
  const totals = [...log.matchAll(/(packages\/[^ ]+) test:   (Total|Passed|Skipped):\s+(\d+)/g)].map(m => [m[1], m[2], +m[3]])
  assert(log.includes('packages/configx test: Done'), 'Dependent package did not finish')
  return { counts, totals }
}
const current = read(currentFile)
if (baselineFile) assert.deepEqual(current, read(baselineFile), 'Changed test counts')
console.log(JSON.stringify({ suites: current.counts.length, totals: current.totals, equal: baselineFile ? true : null }))
