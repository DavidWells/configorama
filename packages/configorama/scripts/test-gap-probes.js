/* Run the coverage-review regressions individually or together. */
require('../tests/coverageGaps/probes').main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
