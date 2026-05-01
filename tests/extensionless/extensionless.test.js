/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const path = require('path')
const configorama = require('../../src')

const fixtureDir = path.join(__dirname, 'fixtures')

test.before(() => {
  fs.mkdirSync(fixtureDir, { recursive: true })

  // JSON content, no extension
  fs.writeFileSync(path.join(fixtureDir, 'config-json'), JSON.stringify({
    name: 'test',
    port: 3000
  }, null, 2))

  // YAML content, no extension
  fs.writeFileSync(path.join(fixtureDir, 'config-yaml'), [
    'name: test',
    'port: 3000',
    ''
  ].join('\n'))

  // YAML with document marker, no extension
  fs.writeFileSync(path.join(fixtureDir, 'config-yaml-doc'), [
    '---',
    'name: test',
    'port: 3000',
    ''
  ].join('\n'))

  // TOML content, no extension
  fs.writeFileSync(path.join(fixtureDir, 'config-toml'), [
    '[server.settings]',
    'name = "test"',
    'port = 3000',
    ''
  ].join('\n'))

  // JSON array content, no extension
  fs.writeFileSync(path.join(fixtureDir, 'config-json-array'), JSON.stringify([
    { name: 'a' },
    { name: 'b' }
  ], null, 2))

  // YAML with variables, no extension
  fs.writeFileSync(path.join(fixtureDir, 'config-yaml-vars'), [
    "name: ${env:APP_NAME, 'myapp'}",
    "port: 3000",
    ''
  ].join('\n'))
})

test.after(() => {
  try {
    fs.rmSync(fixtureDir, { recursive: true, force: true })
  } catch (e) { /* ignore */ }
})

test('extensionless JSON file parses correctly', async () => {
  const config = await configorama(path.join(fixtureDir, 'config-json'))
  assert.is(config.name, 'test')
  assert.is(config.port, 3000)
})

test('extensionless YAML file parses correctly', async () => {
  const config = await configorama(path.join(fixtureDir, 'config-yaml'))
  assert.is(config.name, 'test')
  assert.is(config.port, 3000)
})

test('extensionless YAML with --- document marker parses correctly', async () => {
  const config = await configorama(path.join(fixtureDir, 'config-yaml-doc'))
  assert.is(config.name, 'test')
  assert.is(config.port, 3000)
})

test('extensionless TOML file parses correctly', async () => {
  const config = await configorama(path.join(fixtureDir, 'config-toml'))
  assert.is(config.server.settings.name, 'test')
  assert.is(config.server.settings.port, 3000)
})

test('extensionless JSON array file parses correctly', async () => {
  const config = await configorama(path.join(fixtureDir, 'config-json-array'))
  assert.ok(Array.isArray(config))
  assert.is(config[0].name, 'a')
  assert.is(config[1].name, 'b')
})

test('extensionless YAML with variables resolves correctly', async () => {
  const config = await configorama(path.join(fixtureDir, 'config-yaml-vars'))
  assert.is(config.name, 'myapp')
  assert.is(config.port, 3000)
})

test('file with recognized extension ignores content sniffing', async () => {
  // A .yml file with JSON-looking content should still parse as YAML
  const ymlFile = path.join(fixtureDir, 'test.yml')
  fs.writeFileSync(ymlFile, 'name: test\nport: 3000\n')
  const config = await configorama(ymlFile)
  assert.is(config.name, 'test')
})

test.run()
