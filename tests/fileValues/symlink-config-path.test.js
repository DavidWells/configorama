const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const configorama = require('../../src')

test('file refs resolve relative to a symlinked root config target', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-symlink-config-'))
  const realDir = path.join(tempDir, 'real')
  const linkDir = path.join(tempDir, 'link')
  fs.mkdirSync(realDir)
  fs.mkdirSync(linkDir)

  const realConfig = path.join(realDir, 'config.yml')
  const linkConfig = path.join(linkDir, 'config.yml')
  fs.writeFileSync(realConfig, 'value: ${file(.env).KEY}\n')
  fs.writeFileSync(path.join(realDir, '.env'), 'KEY=from-real-env\n')
  fs.symlinkSync(realConfig, linkConfig)

  try {
    const config = await configorama(linkConfig)
    assert.is(config.value, 'from-real-env')
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test.run()
