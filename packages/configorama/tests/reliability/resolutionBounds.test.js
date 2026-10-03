const { test } = require('uvu'); const assert = require('node:assert/strict')
const configorama = require('../../src'); const { createBudget } = require('../../src/utils/resolutionBudget')
const { runChild } = require('./runner')
test('never-settling source observes an optional deadline', async () => {
  await assert.rejects(() => configorama({out:'${wait:x}'},{timeoutMs:30,variableSources:[{type:'wait',match:/^wait:/,resolver:()=>new Promise(()=>{})}]}),e=>e.code==='resolution_timeout')
})
test('async cancellation and pre-aborted signals return stable codes; sync rejects live signals', async () => {
  const controller=new AbortController()
  const pending=configorama({out:'${wait:x}'},{signal:controller.signal,variableSources:[{type:'wait',match:/^wait:/,resolver:()=>new Promise(()=>{})}]})
  controller.abort(); await assert.rejects(()=>pending,e=>e.code==='resolution_aborted')
  await assert.rejects(()=>configorama({}, {signal:controller.signal}),e=>e.code==='resolution_aborted')
  assert.throws(()=>configorama.sync({}, {signal:controller.signal}),e=>e.code==='unsupported_sync_value')
})
test('late source settlement cannot change closed config/tracker state', async () => {
  let release; const wait=new Promise(resolve=>{release=resolve})
  const instance=new configorama.Configorama({out:'${wait:x}'},{timeoutMs:25,variableSources:[{type:'wait',match:/^wait:/,resolver:()=>wait}]})
  await assert.rejects(()=>instance.init(),e=>e.code==='resolution_timeout')
  const before=structuredClone(instance.config); release('late'); await new Promise(resolve=>setImmediate(resolve))
  assert.deepEqual(instance.config,before);assert.equal(instance.tracker.getAll().length,0)
})
test('deterministic depth/visit/pass budgets reject with registered codes', async () => {
  for(const resolutionLimits of [{maxDepth:1},{maxVisitedNodes:1}]) {
    await assert.rejects(()=>configorama({nested:{v:'${opt:v}'}},{resolutionLimits,options:{v:'ok'}}),e=>e.code==='resolution_limit')
    assert.throws(()=>configorama.sync({nested:{v:'${opt:v}'}},{resolutionLimits,options:{v:'ok'}}),e=>e.code==='resolution_limit')
  }
  const budget=createBudget({resolutionLimits:{maxPasses:1}});budget.pass();assert.throws(()=>budget.pass(),e=>e.code==='resolution_limit')
})
test('sync watchdog and worker deadline bound a never-settling plugin', async () => {
  const child=await runChild(['-e',`const fs=require('fs'),os=require('os'),path=require('path');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cf-deadline-'));try{const file=path.join(dir,'factory.js');fs.writeFileSync(file,"module.exports=()=>({type:'wait',match:/^wait:/,resolver:()=>new Promise(()=>{})})");try{require('./src').sync({out:'\${wait:x}'},{timeoutMs:1000,variableSources:[{syncFactory:file}]});process.exitCode=1}catch(e){if(e.code!=='resolution_timeout')throw e}}finally{fs.rmSync(dir,{recursive:true,force:true})}`],{timeout:5000})
  assert.equal(child.timedOut,false);assert.equal(child.code,0,child.stderr);assert.equal(child.stdout,'')
})
test('shrunk quoted parenthesis/brace arguments are split identically (seed -930883388 path 517:1:1:7:6:6:8:8:8:8:8:8)', async () => {
  for(const resolve of [configorama,configorama.sync]) for(const expression of ["${merge('a({', '}')}","${merge('a({','}')}"]){assert.deepEqual((await resolve({out:expression})).out,'a({}')}
})
test('shrunk replacement metacharacters cannot reinsert calls recursively (seed -1418701778 path 729:2:7:18:19:18:17:17)', async () => {
  for (const resolve of [configorama, configorama.sync]) {
    try { await resolve({custom:{obj:{a:1}}, out:'${self:custom.obj}merge($&a, b)${'}) }
    catch (error) { assert.notEqual(error.name, 'RangeError') }
    assert.equal((await resolve({out:'${merge("$&", "a")}'})).out,'$&a')
  }
})
test('root loading shares the deadline, listeners detach, and later requests succeed', async () => {
  const fs=require('node:fs');const os=require('node:os');const path=require('node:path')
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cf-root-deadline-'))
  try {
    const file=path.join(dir,'root.js');fs.writeFileSync(file,'module.exports=()=>new Promise(()=>{})')
    await assert.rejects(()=>configorama(file,{timeoutMs:25,moduleCacheMode:'load'}),e=>e.code==='resolution_timeout')
    await assert.rejects(()=>configorama.analyze(file,{timeoutMs:25,moduleCacheMode:'load'}),e=>e.code==='resolution_timeout')
    const controller=new AbortController();let listeners=0
    const add=controller.signal.addEventListener.bind(controller.signal);const remove=controller.signal.removeEventListener.bind(controller.signal)
    controller.signal.addEventListener=(...args)=>{listeners++;return add(...args)}
    controller.signal.removeEventListener=(...args)=>{listeners--;return remove(...args)}
    assert.deepEqual(await configorama({ok:true},{signal:controller.signal,timeoutMs:1000}),{ok:true})
    assert.equal(listeners,0)
    for(const resolve of [configorama,configorama.sync]) assert.deepEqual(await resolve({out:'${opt:v}'},{options:{v:'after'},timeoutMs:1000}),{out:'after'})
  } finally {fs.rmSync(dir,{recursive:true,force:true})}
})
test.run()
