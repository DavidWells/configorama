const { test } = require('uvu')
const assert = require('node:assert/strict')
const configorama = require('../../src')
const { cases } = require('./cases')
for (const name of ['filter-special-keys', 'runtime-object-marker']) test(name, cases[name].run)
for (const flag of ['__internal_only_flag', '__internal_metadata']) {
  for (const truth of [false, true, 'user-data']) {
    test(`user ${flag}=${truth} stays data in all reference positions`, async () => {
      const value = { [flag]: truth, value: 'data', nested: { constructor: 'literal' } }
      const input = { value, direct: '${self:value}', alias: '${self:direct}',
        fallback: '${opt:missing, self:value}', filtered: '${self:value | identity}' }
      const output = await configorama(input, { options: {}, filters: { identity: x => x }, returnMetadata: true })
      for (const key of ['value', 'direct', 'alias', 'fallback', 'filtered']) assert.deepEqual(output.config[key], value)
      assert.deepEqual(input.value, value)
      assert.equal(Object.hasOwn(output.config.value, '__resolverType'), false)
      const synced = configorama.sync({ value, direct: '${self:value}', fallback: '${opt:missing, self:value}' }, { options: {} })
      assert.deepEqual(synced, { value, direct: value, fallback: value })
    })
  }
}
test('null-prototype dictionaries survive runtime preprocessing', async () => {
  const value = Object.assign(Object.create(null), { constructor: '${opt:v}', hasOwnProperty: 'data' })
  const output = await configorama({ value, out: '${self:value}' }, { options: { v: 'ok' } })
  assert.equal(Object.getPrototypeOf(output.value), null)
  assert.equal(Object.getPrototypeOf(output.out), null)
  assert.equal(output.value.constructor, 'ok')
  assert.equal(Object.prototype.constructor, Object)
})
test.run()
