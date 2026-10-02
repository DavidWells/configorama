const { fc, fuzzParams } = require('./fuzzUtils')
const { PROPERTIES } = require('./properties')
const property = PROPERTIES.find(property => property.name === process.argv[2])
if (!property) throw new Error('Unknown fuzz property')
const params = fuzzParams(property.runs)
console.error(`fuzz replay: FUZZ_ONLY=${JSON.stringify(property.name)} FUZZ_SEED=${params.seed} node tests/fuzz/fuzz.test.js`)
fc.assert(fc.asyncProperty(property.arbitrary, property.check), params).then(() => {
  console.error(`fuzz complete: ${property.name}`)
}, error => { console.error(error); process.exitCode = 1 })
