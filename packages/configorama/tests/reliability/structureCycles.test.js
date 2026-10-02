const { test } = require('uvu'); const assert = require('node:assert/strict')
const configorama = require('../../src'); const validate = require('../../src/utils/validateStructure')
const { cases } = require('./cases')
test('recursive YAML alias reports a controlled structural error', cases['structure-cycle'].run)
test('raw object/array cycles are rejected across APIs and static inspection', async () => {
  const direct = {}; direct.self = direct
  const indirect = { a: [] }; indirect.a.push(indirect)
  for (const input of [direct, indirect]) {
    await assert.rejects(() => configorama(input), e => e.code === 'circular_structure')
    await assert.rejects(() => configorama.analyze(input), e => e.code === 'circular_structure')
    assert.throws(() => configorama.sync(input), e => e.code === 'circular_structure')
  }
})
test('shared acyclic aliases and caller containers remain intact', async () => {
  const shared = { value: '${opt:v}' }; const input = { a: shared, b: shared }
  for (const resolve of [configorama, configorama.sync]) assert.deepEqual(await resolve(input, { options: { v: 'ok' } }), { a: { value: 'ok' }, b: { value: 'ok' } })
  assert.equal(shared.value, '${opt:v}')
})
test('iterative validation bounds deep input before recursive processing', () => {
  const root = {}; let cursor=root; for(let i=0;i<10000;i++) {cursor.next={};cursor=cursor.next}
  assert.throws(() => validate(root), e => e.code === 'resolution_limit' && e.details.limit === 'maxDepth')
})
test.run()
