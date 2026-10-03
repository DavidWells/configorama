/* Desired contracts from the October reliability review. Run pending cases manually
 * with scripts/reliability-probes.js; passing cases join normal tests with their fix. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const configorama = require('../../src')

async function temporary(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'configorama-reliability-'))
  try { await run(dir) } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}
const cases = {
  'filter-special-keys': { owner: '3.1', expected: 'Every filtered own key contains HELLO', run: async () => {
    for (const key of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      const input = Object.fromEntries([['word', 'hello'], [key, '${self:word | toUpperCase}']])
      for (const resolve of [configorama, configorama.sync]) {
        const output = await resolve(input, { options: {} })
        assert.equal(output[key], 'HELLO'); assert.ok(Object.hasOwn(output, key))
      }
    }
  } },
  'runtime-object-marker': { owner: '2.1', expected: 'Reference retains complete user record without mutation', run: async () => {
    const value = { __internal_only_flag: 'user-data', value: 'data' }
    const input = { value, out: '${self:value}' }
    const output = await configorama(input, { options: {} })
    assert.deepEqual(output.out, value); assert.deepEqual(output.value, value)
    assert.deepEqual(value, { __internal_only_flag: 'user-data', value: 'data' })
  } },
  'private-character': { owner: '2.2', expected: 'Literal U+E001 stays exact', run: async () => {
    const output = await configorama({ value: 'pre\uE001post', out: '${self:value}' }, { options: {} })
    assert.equal(output.value, 'pre\uE001post'); assert.equal(output.out, 'pre\uE001post')
  } },
  'sync-date-marker': { owner: '6.3', expected: 'Date-looking dictionary stays a dictionary', run: async () => {
    const value = { __configoramaDate: 'ordinary data' }
    assert.deepEqual(configorama.sync({ value }, { options: {} }), { value })
  } },
  'sync-undefined': { owner: '6.3', expected: 'Explicit undefined own key survives sync', run: async () => {
    const output = configorama.sync({ value: undefined, out: '${opt:v}' }, { options: { v: 'ok' }, allowUndefinedValues: true })
    assert.ok(Object.hasOwn(output, 'value')); assert.equal(output.value, undefined)
  } },
  'sync-bigint': { owner: '6.3', expected: 'BigInt retains type and value', run: async () => {
    assert.deepEqual(configorama.sync({ value: 123n, out: '${opt:v}' }, { options: { v: 'ok' } }), { value: 123n, out: 'ok' })
  } },
  'markdown-own-key': { owner: '3.2', expected: 'Own hasOwnProperty frontmatter works', run: () => temporary(async dir => {
    const file = path.join(dir, 'config.md'); fs.writeFileSync(file, '---\nhasOwnProperty: data\nout: ${opt:v}\n---\nBody')
    const output = await configorama(file, { options: { v: 'ok' } })
    assert.deepEqual(output, { hasOwnProperty: 'data', out: 'ok', _content: 'Body' })
  }) },
  'markdown-body-collision': { owner: '3.2', expected: 'All frontmatter keys survive body insertion', run: () => temporary(async dir => {
    const file = path.join(dir, 'config.md'); fs.writeFileSync(file, '---\n_content: original\n_body: other\n_body_1: occupied\n---\nBody')
    assert.deepEqual(await configorama(file, { options: {} }), { _content: 'original', _body: 'other', _body_1: 'occupied', _body_2: 'Body' })
  }) },
  'structure-cycle': { owner: '7.1', expected: 'YAML alias cycle reports controlled error', run: () => temporary(async dir => {
    const file = path.join(dir, 'config.yml'); fs.writeFileSync(file, 'root: &loop\n  itself: *loop\nout: ${opt:v}\n')
    await assert.rejects(() => configorama(file, { options: { v: 'ok' } }), error => error.name === 'ConfigoramaError' && error.code === 'circular_structure')
  }) },
  'module-load-refresh': { owner: '5.3', expected: 'Explicit load mode refreshes JS/TS/MJS', run: () => temporary(async dir => {
    for (const extension of ['js', 'ts', 'mjs']) {
      const file = path.join(dir, `data.${extension}`)
      const text = value => extension === 'js' ? `module.exports={value:${JSON.stringify(value)}}` : `export default {value:${JSON.stringify(value)}}`
      fs.writeFileSync(file, text('first'))
      const input = { out: `\${file(${file}):value}` }; const settings = { options: {}, moduleCacheMode: 'load' }
      assert.equal((await configorama(input, settings)).out, 'first')
      fs.writeFileSync(file, text('second')); assert.equal((await configorama(input, settings)).out, 'second')
    }
  }) },
  'dotenv-root': { owner: '5.2', expected: 'Dotenv comes from config root', run: () => temporary(async dir => {
    const original = process.cwd(); const key = 'CONFIGORAMA_RELIABILITY_ORIGIN'; const saved = process.env[key]
    const a = path.join(dir, 'a'); const b = path.join(dir, 'b'); fs.mkdirSync(a); fs.mkdirSync(b)
    fs.writeFileSync(path.join(a, '.env'), `${key}=caller\n`); fs.writeFileSync(path.join(b, '.env'), `${key}=config\n`)
    const file = path.join(b, 'config.yml'); fs.writeFileSync(file, `useDotenv: true\nout: \${env:${key}}\n`)
    try {
      delete process.env[key]; process.chdir(a)
      assert.equal((await configorama(file, { options: {}, dotEnvMode: 'isolated' })).out, 'config')
      assert.equal(process.env[key], undefined)
    } finally { process.chdir(original); if (saved === undefined) delete process.env[key]; else process.env[key] = saved }
  }) },
  'dotenv-stdout': { owner: '12.1', expected: 'Dependency progress emits no stdout', run: () => temporary(async dir => {
    const original = process.cwd(); const write = process.stdout.write; const key = 'CONFIGORAMA_RELIABILITY_STDOUT'; const saved = process.env[key]
    fs.writeFileSync(path.join(dir, '.env'), `${key}=ok\n`); let stdout = ''
    try {
      process.chdir(dir); delete process.env[key]
      process.stdout.write = chunk => { stdout += String(chunk); return true }
      await configorama({ useDotenv: true, out: `\${env:${key}}` }, { options: {}, dotEnvSilent: false })
      assert.equal(stdout, '')
    } finally { process.stdout.write = write; process.chdir(original); if (saved === undefined) delete process.env[key]; else process.env[key] = saved }
  }) },
}
module.exports = { cases, temporary }
