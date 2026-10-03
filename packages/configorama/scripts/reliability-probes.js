const { cases } = require('../tests/reliability/cases')
const { runCase } = require('../tests/reliability/runner')
async function main() {
  const args = process.argv.slice(2)
  if (args[0] === '--child') {
    if (!cases[args[1]]) throw new Error('Unknown reliability case')
    await cases[args[1]].run(); return
  }
  const survey = args.includes('--survey')
  const names = args.filter(a => a !== '--survey')
  const selected = names.length ? names : Object.keys(cases)
  const results = []
  for (const name of selected) {
    if (!cases[name]) throw new Error(`Unknown case: ${name}`)
    const result = await runCase(name)
    results.push({ name, owner: cases[name].owner, expected: cases[name].expected,
      status: result.timedOut ? 'timeout' : result.code === 0 ? 'pass' : 'fail',
      replay: `node scripts/reliability-probes.js ${name}`,
      ...(process.env.TEST_VERBOSE ? { diagnostic: result.stderr } : {}) })
  }
  process.stdout.write(JSON.stringify(results, null, 2) + '\n')
  if (!survey && results.some(r => r.status !== 'pass')) process.exitCode = 1
}
main().catch(error => { console.error(error); process.exitCode = 1 })
