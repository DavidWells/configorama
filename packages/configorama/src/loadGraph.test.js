// Guards the require graph of a plain YAML parse: modules for other formats and
// features must load on demand so the common path stays cheap to start.
const { test } = require('uvu')
const assert = require('uvu/assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

/**
 * Parse a YAML config with configorama in a fresh process
 * @returns {string[]} files in require.cache after parsing
 */
function loadedFilesAfterYamlParse() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-load-graph-'))
  const configPath = path.join(dir, 'config.yml')
  fs.writeFileSync(configPath, 'name: demo\nstage: ${env:LOAD_GRAPH_STAGE, dev}\nlabel: ${self:name}-${self:stage}\n')
  const script = `
    const configorama = require(${JSON.stringify(__dirname)})
    configorama(${JSON.stringify(configPath)}).then((config) => {
      if (config.label !== 'demo-dev') throw new Error('unexpected config ' + JSON.stringify(config))
      console.log('LOADED=' + JSON.stringify(Object.keys(require.cache)))
    })
  `
  const out = execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' })
  fs.rmSync(dir, { recursive: true, force: true })
  const line = out.split('\n').find(l => l.startsWith('LOADED='))
  return JSON.parse(line.slice('LOADED='.length))
}

const loaded = loadedFilesAfterYamlParse()

/**
 * @param {string} fragment - path fragment identifying a module
 */
function isLoaded(fragment) {
  return loaded.some(f => f.includes(fragment))
}

const NOT_LOADED_FOR_YAML = [
  `${path.sep}esprima${path.sep}`,
  `${path.sep}json5${path.sep}`,
  `${path.sep}ini${path.sep}`,
  `${path.sep}dotenv${path.sep}`,
  path.join('src', 'parsers', 'toml.js'),
  path.join('src', 'parsers', 'ini.js'),
  path.join('src', 'parsers', 'json5.js'),
  path.join('src', 'parsers', 'dotenv.js'),
  path.join('src', 'parsers', 'hcl.js'),
  path.join('src', 'parsers', 'typescript.js'),
  path.join('src', 'parsers', 'esm.js'),
]

for (const fragment of NOT_LOADED_FOR_YAML) {
  test(`YAML parse does not load ${fragment}`, () => {
    assert.is(isLoaded(fragment), false)
  })
}

test('YAML parse loads the YAML parser', () => {
  assert.is(isLoaded(path.join('src', 'parsers', 'yaml.js')), true)
})

test.run()
