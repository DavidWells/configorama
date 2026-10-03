const {test}=require('uvu');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const c=require('../../src');const {temporary}=require('./cases')
const keys=['__proto__','constructor','hasOwnProperty','a.b','a,b','a\0b','']
const make=()=>Object.fromEntries(keys.map(k=>[k,'${opt:v}']))
test('own keys survive raw/options/file/executable/filter/metadata and both APIs',()=>temporary(async dir=>{
  fs.writeFileSync(path.join(dir,'data.json'),JSON.stringify(make()))
  fs.writeFileSync(path.join(dir,'data.js'),'module.exports=JSON.parse('+JSON.stringify(JSON.stringify(make()))+')')
  const before=Object.getOwnPropertyDescriptors(Object.prototype)
  for(const resolve of [c,c.sync]) {
    const input={raw:make(),option:'${opt:dict}',file:'${file(./data.json)}',executable:'${file(./data.js)}',filtered:'${opt:json | Object}'}
    const settings={configDir:dir,options:{v:'ok',dict:make(),json:JSON.stringify(make())},returnMetadata:true}
    const saved=structuredClone(input);const out=await resolve(input,settings)
    assert.deepEqual(input,saved);assert.deepEqual(settings.options.dict,make())
    for(const value of Object.values(out.config))for(const key of keys){assert.ok(Object.hasOwn(value,key));assert.equal(value[key],'ok')}
    for(const key of keys)assert.ok(Object.hasOwn(out.originalConfig.raw,key))
  }
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype),before)
}))
test('null prototypes, sparse arrays, own extras and repeated aliases survive full boundaries',async()=>{
  for(const resolve of [c,c.sync]) {
    const shared=Object.assign(Object.create(null),{constructor:'${opt:v}',__internal_metadata:true,value:'user'})
    const array=new Array(3);array[1]=shared;array.extra='${opt:v}'
    Object.defineProperty(array,'__proto__',{value:'own',writable:true,enumerable:true,configurable:true})
    const out=await resolve({a:shared,b:shared,array},{options:{v:'ok'},returnMetadata:true})
    assert.equal(Object.getPrototypeOf(out.config.a),null);assert.equal(out.config.a,out.config.b);assert.equal(out.config.a,out.config.array[1])
    assert.equal(out.config.a.constructor,'ok');assert.equal(0 in out.config.array,false);assert.equal(out.config.array.extra,'ok');assert.equal(out.config.array.__proto__,'own')
    assert.equal(shared.constructor,'${opt:v}');assert.equal(array.extra,'${opt:v}')
  }
})
test.run()
