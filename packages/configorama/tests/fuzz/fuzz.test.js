/* Property-based fuzz tests. Each property in ./properties runs with a fixed seed, so a  */
/* normal `npm test` is deterministic. Deeper or fresh runs:                              */
/*   FUZZ_RUNS=2000 FUZZ_SEED=random node tests/fuzz/fuzz.test.js                         */
/*   FUZZ_ONLY=lazy node tests/fuzz/fuzz.test.js          (one property, by name)         */
/* To see every distinct failure at once instead of the first: node tests/fuzz/survey.js  */
const { test } = require('uvu')
const { fc, fuzzParams } = require('./fuzzUtils')
const { PROPERTIES } = require('./properties')

for (const property of PROPERTIES) {
  if (process.env.FUZZ_ONLY && !property.name.includes(process.env.FUZZ_ONLY)) continue
  test(`fuzz: ${property.name}`, async () => {
    await fc.assert(fc.asyncProperty(property.arbitrary, property.check), fuzzParams(property.runs))
  })
}

test.run()
