/* eslint-disable no-template-curly-in-string */
/* Integration tests for configorama parsing .env files by path
   Covers resolution, single-line files, and file+line error reporting */
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const configorama = require('../../src')

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-dotenv-'))

/**
 * @param {string} name - File name
 * @param {string} contents - File contents
 * @returns {string} Full path
 */
function writeEnv(name, contents) {
  const file = path.join(dir, name)
  fs.writeFileSync(file, contents)
  return file
}

test('parses a .env file and resolves ${...} refs in values', async () => {
  const file = writeEnv('.env', 'API_URL=https://api.example.com\nSTAGE=${opt:stage, "dev"}\nEXPORTED=x\n')
  const config = await configorama(file)
  assert.is(config.API_URL, 'https://api.example.com')
  assert.is(config.STAGE, 'dev')
  assert.is(config.EXPORTED, 'x')
})

test('resolves ${opt:...} from CLI options', async () => {
  const file = writeEnv('opt.env', 'STAGE=${opt:stage, "dev"}\n')
  const config = await configorama(file, { options: { stage: 'prod' } })
  assert.is(config.STAGE, 'prod')
})

test('single-line .env is parsed as key/value, not a scalar', async () => {
  const file = writeEnv('single.env', 'ONLY=${opt:x, "works"}\n')
  const config = await configorama(file)
  assert.equal(config, { ONLY: 'works' })
})

test('.env resolution error reports the file and line', async () => {
  const file = writeEnv('bad.env', 'API_URL=https://x\nstage=${opt:missing}\n')
  let caught
  try {
    await configorama(file)
  } catch (err) {
    caught = err
  }
  assert.ok(caught)
  assert.match(caught.message, /In file .*bad\.env at line 2/)
  assert.match(caught.message, /at location "stage"/)
})

test('export-prefixed keys are read', async () => {
  const file = writeEnv('exp.env', 'export TOKEN=abc123\n')
  const config = await configorama(file)
  assert.is(config.TOKEN, 'abc123')
})

test.run()
