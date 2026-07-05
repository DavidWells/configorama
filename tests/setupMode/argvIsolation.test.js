// Library calls must not enter setup mode just because --setup is in process.argv
// (e.g. configx .env -- node app.js --setup must not flip the wizard on)
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const { execFileSync } = require('child_process')

const childScript = path.join(__dirname, 'argv-isolation-child.js')

test('library call ignores --setup in process.argv', () => {
  const output = execFileSync(process.execPath, [childScript, '--setup'], {
    encoding: 'utf8',
  })
  assert.not.ok(output.includes('Configuration Wizard'), 'wizard must not run from argv sniffing')
  assert.ok(output.includes('"service":"my-app"'), 'config resolves normally')
})

test('library call with options.setup still runs the wizard', () => {
  const output = execFileSync(process.execPath, [childScript, '--opt-in'], {
    encoding: 'utf8',
  })
  assert.ok(output.includes('Configuration Wizard'), 'explicit opt-in still works')
})

test.run()
