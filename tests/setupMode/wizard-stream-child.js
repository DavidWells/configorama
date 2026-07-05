// Child script for wizardStreams.test.js - runs the real wizard with UI on stderr.
// Parent pipes prompt answers via stdin; stdout must contain only the JSON result.
const path = require('path')
const fs = require('fs')
const os = require('os')
const configorama = require('../../src')

const configFile = path.join(os.tmpdir(), `wizard-stream-child-${process.pid}.yml`)
fs.writeFileSync(configFile, 'service: my-app\nregion: ${env:WIZARD_STREAM_TEST_REGION}\n')

configorama
  .setup(configFile, { streams: { output: process.stderr } })
  .then((result) => {
    process.stdout.write(JSON.stringify(result.answers))
    fs.unlinkSync(configFile)
  })
  .catch((err) => {
    console.error('wizard-stream-child error', err.message)
    fs.unlinkSync(configFile)
    process.exit(1)
  })
