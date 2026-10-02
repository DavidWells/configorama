const { test } = require('uvu'); const assert = require('node:assert/strict')
const fs = require('node:fs'); const path = require('node:path')
const configorama = require('../../src'); const load = require('../../src/utils/loadExecutable'); const context = require('../../src/utils/loadContext')
const { temporary, cases } = require('./cases')
test('load policy refreshes files across formats', cases['module-load-refresh'].run)
test('an application import is unchanged by load mode, including symlink/outside-root helpers', () => temporary(async dir => {
  const other=path.join(dir,'outside'); const root=path.join(dir,'config'); fs.mkdirSync(other); fs.mkdirSync(root)
  const helper=path.join(other,'helper.js'); const link=path.join(root,'linked.js'); const file=path.join(root,'root.js')
  fs.writeFileSync(helper,'module.exports={value:"old"}'); fs.symlinkSync(helper,link)
  const application=require(helper); const cacheEntry=require.cache[require.resolve(helper)]
  fs.writeFileSync(helper,'module.exports={value:"new"}'); fs.writeFileSync(file,'module.exports=require("./linked")')
  assert.equal(load(file,context(file,{}),'load').value,'new')
  assert.equal(require(helper),application); assert.equal(application.value,'old'); assert.equal(require.cache[require.resolve(helper)],cacheEntry)
}))
test('root executes once before its returned dotenv settings; later files receive finalized env', () => temporary(async dir => {
  const key='CONFIGORAMA_MODULE_PHASE';const saved=process.env[key]
  const file=path.join(dir,'root.js'); const reference=path.join(dir,'ref.js')
  fs.writeFileSync(path.join(dir,'.env'),`${key}=overlay\n`)
  fs.writeFileSync(file,`module.exports=(args,ctx)=>({useDotenv:true,initial:ctx.env.${key}||'absent',later:'\${file(./ref.js)}'})`)
  fs.writeFileSync(reference,`module.exports=(ctx)=>ctx.env.${key}`)
  try {delete process.env[key]; for(const resolve of [configorama,configorama.sync]) {const result=await resolve(file,{options:{},dotEnvMode:'isolated',moduleCacheMode:'load'});assert.equal(result.initial,'absent');assert.equal(result.later,'overlay');assert.equal(process.env[key],undefined)}}
  finally {if(saved===undefined)delete process.env[key];else process.env[key]=saved}
}))
test('functions with different arguments do not share invocation results; mutable exports are copied', () => temporary(async dir => {
  const fn=path.join(dir,'fn.js');const data=path.join(dir,'data.js')
  fs.writeFileSync(fn,'module.exports=(arg)=>({value:arg})');fs.writeFileSync(data,'module.exports={value:"original"}')
  for(const resolve of [configorama,configorama.sync]) {
    const settings={configDir:dir,options:{},moduleCacheMode:'process'}
    const output=await resolve({a:'${file(./fn.js, one):value}',b:'${file(./fn.js, two):value}',data:'${file(./data.js)}'},settings)
    assert.equal(output.a,'one');assert.equal(output.b,'two'); output.data.value='mutated'
    assert.equal((await resolve({data:'${file(./data.js)}'},settings)).data.value,'original')
  }
}))
test('each overlapping load evaluates its local graph once, then releases it', () => temporary(async dir => {
  const counter=path.join(dir,'count.json');const file=path.join(dir,'root.js');fs.writeFileSync(counter,'0')
  fs.writeFileSync(path.join(dir,'helper.js'),`const fs=require('fs');const file=${JSON.stringify(counter)};const count=JSON.parse(fs.readFileSync(file))+1;fs.writeFileSync(file,JSON.stringify(count));module.exports={count}`)
  fs.writeFileSync(file,`const a=require('./helper');const b=require('./helper');module.exports=async args=>{await new Promise(r=>setTimeout(r,5));return {a:a.count,b:b.count,arg:args.id}}`)
  const [a,b]=await Promise.all(['a','b'].map(id=>configorama(file,{options:{id},dynamicArgs:{id},moduleCacheMode:'load'})))
  assert.equal(a.a,a.b);assert.equal(b.a,b.b);assert.notEqual(a.a,b.a);assert.equal(a.arg,'a');assert.equal(b.arg,'b');assert.equal(JSON.parse(fs.readFileSync(counter)),2)
  const next=configorama.sync(file,{options:{id:'sync'},dynamicArgs:{id:'sync'},moduleCacheMode:'load'});assert.equal(next.a,3);assert.equal(next.b,3)
}))
test('failed module loads do not poison the next load', () => temporary(async dir => {
  const file=path.join(dir,'root.js');fs.writeFileSync(file,'throw new Error("fixture failure")')
  for(const resolve of [configorama,configorama.sync])await assert.rejects(async()=>resolve(file,{moduleCacheMode:'load'}),/fixture failure/)
  fs.writeFileSync(file,'module.exports={ok:true}')
  for(const resolve of [configorama,configorama.sync])assert.deepEqual(await resolve(file,{moduleCacheMode:'load'}),{ok:true})
}))
test.run()
