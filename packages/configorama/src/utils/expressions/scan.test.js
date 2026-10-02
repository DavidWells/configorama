const {test}=require('uvu');const assert=require('node:assert/strict');const {scan,splitTopLevel,references,parentReference}=require('./scan')
const {grammarControls,wrappers}=require('../../../tests/reliability/ownershipCorpus')
test('immutable nodes retain exact UTF-16 spans, parent and fallback ownership',()=>{
  const source='é😀 ${env:X, "sl-${sls:stage}" | toUpperCase}';const parsed=scan(source)
  assert.ok(Object.isFrozen(parsed));for(const n of parsed.nodes){assert.ok(Object.isFrozen(n));assert.equal(source.slice(n.start,n.end),n.raw)}
  const refs=references(parsed);assert.equal(refs.length,2);assert.equal(parentReference(parsed,refs[1]),refs[0])
  assert.deepEqual(parsed.nodes.filter(n=>n.kind==='Fallback').map(n=>n.raw.trim()),['env:X','"sl-${sls:stage}"'])
  assert.deepEqual(parsed.nodes.filter(n=>n.kind==='Filter').map(n=>n.raw.trim()),['toUpperCase'])
})
test('quoted function-looking text stays literal and nested JSON/calls balance',()=>{
  const parsed=scan('${merge("foo()", {"a":{"b":[1,2]}})}')
  assert.deepEqual(parsed.nodes.filter(n=>n.kind==='Call').map(n=>n.name),['merge'])
  assert.equal(parsed.diagnostics.length,0)
  assert.deepEqual(parsed.nodes.filter(n=>n.kind==='Argument').map(n=>n.raw.trim()),['"foo()"','{"a":{"b":[1,2]}}'])
})
test('all wrappers and corpus controls preserve source; malformed fragments have diagnostics',()=>{
  for(const s of grammarControls)for(const [prefix,suffix] of wrappers) {
    const source=s.replace(/\$\{/g,prefix).replace(/\}/g,suffix);const p=scan(source,{prefix,suffix})
    for(const node of p.nodes)assert.equal(node.raw,source.slice(node.start,node.end))
  }
  assert.ok(scan('${merge("x"').diagnostics.length)
})
test('split projections protect quotes, variables, objects, arrays, escaped quotes and logical OR',()=>{
  assert.deepEqual(splitTopLevel('a, ${x, "b,c"}, f({"x":[1,2]}), "q,c"',',').map(s=>s.trim()),['a','${x, "b,c"}','f({"x":[1,2]})','"q,c"'])
  assert.deepEqual(splitTopLevel("it's | f('a|b') | g || h",'|'),["it's "," f('a|b') ",' g || h'])
  assert.deepEqual(splitTopLevel('\uE0020\uE002, ${x,y}',','),['\uE0020\uE002',' ${x,y}'])
})
test.run()
