const {test}=require('uvu');const assert=require('node:assert/strict');const c=require('../../src')
test('typed call arguments retain function ownership inside fallback slots (seed 20260928 path 18:1:1:1:1:1:1)',async()=>{
  for(const resolve of [c,c.sync]) {
    const input={custom:{list:['a','b,c'],obj:{value:'literal',__internal_only_flag:true}},plain:'${length(${self:custom.list})}',fallback:'${opt:missing, ${length(${self:custom.list})}}',object:'${opt:missing, ${merge(${self:custom.obj})}}'}
    const result=await resolve(input,{options:{}});assert.equal(result.plain,2);assert.equal(result.fallback,2);assert.deepEqual(result.object,input.custom.obj)
  }
})
test('nested quoted fallback and per-expression filters retain parent ownership',async()=>{
  for(const resolve of [c,c.sync]) {
    const out=await resolve({a:'${opt:missing, "before-${opt:v, \'x\'}" | toUpperCase}',b:'${opt:v | toUpperCase}-${opt:w}'},{options:{v:'hello',w:'world'}})
    assert.equal(out.a,'BEFORE-HELLO');assert.equal(out.b,'HELLO-world')
  }
})
test.run()
