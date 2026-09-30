#!/usr/bin/env node
/** Capture exact YAML preprocessing output for fixtures and a fixed stress corpus.
 * Usage: node scripts/perf-yaml.js <library-path> <output-json>
 */
const fs = require('fs')
const path = require('path')

if (!process.argv[2] || !process.argv[3]) {
  throw new Error('Expected library path and output file')
}
const root = path.resolve(__dirname, '..')
const { preProcess } = require(path.resolve(process.argv[2], 'parsers/yaml'))
const files = []
function collectFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(file)
    else if (/\.ya?ml$/.test(file)) files.push(path.relative(root, file))
  }
}
collectFiles(path.join(root, 'tests'))
const outputs = files.sort().map(file => [file, preProcess(fs.readFileSync(path.join(root, file), 'utf8'))])

// Deliberately includes malformed inputs as well as valid YAML. The optimization
// must preserve preprocessing bytes even when the YAML parser would reject them.
let seed = 741
const fragments = [
  'x: ', '${a}', '[${b}, ${c}]', '{k: ${d}}', '"[{"', "'['",
  '# [${a}]\n', '|\n  [${x}]\n', '{{resolve:ssm:x}}', ' !Join [',
  '\r\n', '] ', '}', '\\"', ' '.repeat(80),
]
for (let i = 0; i < 5000; i++) {
  let input = ''
  for (let j = 0; j < 30; j++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    input += fragments[seed % fragments.length]
  }
  outputs.push([i, preProcess(input)])
}
fs.writeFileSync(path.resolve(process.argv[3]), JSON.stringify(outputs) + '\n')
console.error(files.length, 'YAML fixtures and 5000 generated strings')
