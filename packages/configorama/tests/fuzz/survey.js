#!/usr/bin/env node
/* Run many cases per property and group every distinct failure, smallest example first.  */
/* Unlike fuzz.test.js (stops at the first failure and shrinks it), this maps the whole    */
/* failure surface in one go.                                                             */
/*   node tests/fuzz/survey.js [runs=400] [seed=random]      FUZZ_ONLY=<name> to filter    */
/*   FUZZ_REPORT=out.json writes the groups as JSON                                       */
/*   FUZZ_TRACE=case.json writes each case before it runs, to catch one that hangs        */
const fs = require('fs')
const { fc } = require('./fuzzUtils')
const { PROPERTIES } = require('./properties')

const runs = Number(process.argv[2]) || 400
const seed = process.argv[3] ? Number(process.argv[3]) : Date.now() % 1e9

/**
 * Group key for a failure: its kind plus the error text with the case-specific parts removed
 * @param {any} err
 * @returns {string}
 */
function signature(err) {
  if (!err || err.name !== 'PropertyFailure') return `unexpected: ${String(err && err.message).split('\n')[0]}`
  const d = err.detail || {}
  const text = String(d.error || d.got || d.sync || '')
  const shape = text.startsWith('value') ? '' : text.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, '…').replace(/\$\{.*\}/g, '${…}').replace(/\d+/g, 'N').slice(0, 90)
  return shape ? `${err.kind} :: ${shape}` : err.kind
}

;(async () => {
  console.log(`fuzz survey: ${runs} cases per property, seed ${seed}\n`)
  /** @type {Record<string, any>} */
  const report = {}
  for (const property of PROPERTIES) {
    if (process.env.FUZZ_ONLY && !property.name.includes(process.env.FUZZ_ONLY)) continue
    const cases = fc.sample(property.arbitrary, { numRuns: runs, seed })
    /** @type {Map<string, { count: number, example: any, size: number }>} */
    const groups = new Map()
    for (const c of cases) {
      if (process.env.FUZZ_TRACE) fs.writeFileSync(process.env.FUZZ_TRACE, JSON.stringify({ property: property.name, case: c }))
      try {
        await property.check(c)
      } catch (err) {
        const key = signature(err)
        const message = err && err.message ? err.message : String(err)
        const size = message.length
        const group = groups.get(key)
        if (!group) groups.set(key, { count: 1, example: message, size })
        else {
          group.count++
          if (size < group.size) Object.assign(group, { example: message, size })
        }
      }
    }
    const failed = [...groups.values()].reduce((n, g) => n + g.count, 0)
    console.log(`## ${property.name}: ${failed}/${cases.length} failing, ${groups.size} distinct`)
    for (const [key, g] of [...groups.entries()].sort((a, b) => b[1].count - a[1].count)) {
      console.log(`\n  [${g.count}x] ${key}\n${g.example.split('\n').slice(1).map((l) => '    ' + l).join('\n')}`)
    }
    console.log('')
    report[property.name] = [...groups.entries()].map(([key, g]) => ({ key, count: g.count, example: g.example }))
  }
  if (process.env.FUZZ_REPORT) fs.writeFileSync(process.env.FUZZ_REPORT, JSON.stringify({ seed, runs, report }, null, 2))
  process.exit(0)
})()
