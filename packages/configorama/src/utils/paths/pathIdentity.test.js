const { test }=require('uvu'); const assert=require('node:assert/strict'); const fc=require('fast-check')
const {encodePathIdentity:encode,decodePathIdentity:decode,displayPath,lookupPathSegments}=require('./pathIdentity')
test('identity distinguishes every formerly colliding path and normalizes indexes',()=>{
  for(const [a,b] of [[['a.b'],['a','b']],[['a,b'],['a','b']],[['a\0b'],['a','b']],[[''],[]],[['a[0]'],['a','0']],[['__proto__'],['constructor']]])assert.notEqual(encode(a),encode(b))
  assert.equal(encode(['a',0]),encode(['a','0']))
  fc.assert(fc.property(fc.array(fc.string(),{maxLength:10}),s=>assert.deepEqual(decode(encode(s)),s)),{seed:20261002,numRuns:2000})
})
test('display and lookup are explicit projections with ordinary compatibility',()=>{
  assert.equal(displayPath(['a','0','b']),'a.0.b');assert.equal(displayPath(['a.b']), '["a.b"]')
  assert.deepEqual(lookupPathSegments("items[1]['name']"),['items','1','name'])
  assert.throws(()=>decode('{"x":1}'));assert.throws(()=>encode([{}]))
})
test.run()
