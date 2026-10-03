const { test } = require('uvu')
const assert = require('node:assert/strict')
const fs = require('node:fs'); const path = require('node:path')
const configorama = require('../../src')
const { temporary, cases } = require('./cases')
test('dotenv uses config root with isolated overlay', cases['dotenv-root'].run)
test('env and option snapshots do not change across an await boundary', async () => {
  const key = 'CONFIGORAMA_SNAPSHOT'; const saved = process.env[key]
  let release; const wait = new Promise(resolve => { release = resolve })
  const settings = { options: { value: 'original' }, variableSources: [{ type: 'pause', match: /^pause:/g, resolver: () => wait }] }
  try {
    process.env[key] = 'original'
    const pending = configorama({ out: '${pause:x}', env: `\${env:${key}}`, option: '${opt:value}' }, settings)
    settings.options.value = 'changed'; process.env[key] = 'changed'; release('done')
    assert.deepEqual(await pending, { out: 'done', env: 'original', option: 'original' })
    assert.equal((await configorama({ value: `\${env:${key}}` })).value, 'changed')
  } finally { if (saved === undefined) delete process.env[key]; else process.env[key] = saved }
})
test('dotenv precedence and process/isolated modes are explicit across APIs', () => temporary(async dir => {
  const key = 'CONFIGORAMA_DOTENV_PRECEDENCE'; const saved = process.env[key]
  for (const [name, value] of [['.env','base'],['.env.qa','stage'],['.env.local','local'],['.env.qa.local','stage-local']]) fs.writeFileSync(path.join(dir,name), `${key}=${value}\n`)
  try {
    for (const resolve of [configorama, configorama.sync]) {
      delete process.env[key]
      const input = { useDotenv: true, out: `\${env:${key}}` }
      assert.equal((await resolve(input, { configDir: dir, options: { stage: 'qa' }, dotEnvMode: 'isolated' })).out, 'stage-local')
      assert.equal(process.env[key], undefined)
      process.env[key] = 'caller'
      assert.equal((await resolve(input, { configDir: dir, options: { stage: 'qa' }, dotEnvMode: 'isolated' })).out, 'caller')
    }
    delete process.env[key]
    await configorama({ useDotenv: true }, { configDir: dir, options: { stage: 'qa' } })
    assert.equal(process.env[key], 'stage-local')
    delete process.env[key]
    assert.equal((await configorama({ useDotenv: true, out: `\${env:${key}}` }, { configDir: dir, options: { stage: 'test' }, dotEnvMode: 'isolated' })).out, 'base')
  } finally { if (saved === undefined) delete process.env[key]; else process.env[key] = saved }
}))
test('overlapping isolated loads see their own directory and do not mutate caller settings', () => temporary(async dir => {
  const key = 'CONFIGORAMA_OVERLAP'; const saved = process.env[key]
  try {
    delete process.env[key]
    const settings = ['a','b'].map(value => { const root=path.join(dir,value); fs.mkdirSync(root); fs.writeFileSync(path.join(root,'.env'),`${key}=${value}\n`); return {configDir:root,dotEnvMode:'isolated',options:{}} })
    const before = structuredClone(settings)
    const outputs = await Promise.all(settings.map(s => configorama({useDotenv:true,value:`\${env:${key}}`},s)))
    assert.deepEqual(outputs.map(o=>o.value),['a','b']); assert.deepEqual(settings,before); assert.equal(process.env[key],undefined)
  } finally { if (saved === undefined) delete process.env[key]; else process.env[key]=saved }
}))
test.run()
