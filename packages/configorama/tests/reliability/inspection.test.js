const {test}=require('uvu')
const assert=require('node:assert/strict')
const fs=require('node:fs');const path=require('node:path')
const c=require('../../src');const {temporary}=require('./cases');const {runChild}=require('./runner')
test('static occurrences preserve original spans, wrappers, path identities and annotations',async()=>{
  for(const [syntax,prefix,suffix] of [[undefined,'${','}'],['\\#\\{([^}]+?)\\}','#{','}'],['\\$\\[([^\\]]+?)\\]','$[',']']]) {
    const value=`pre-${prefix}env:X, ${prefix}opt:Y${suffix} | help("example ${prefix}vendor:annotation${suffix}")${suffix}`
    const result=await c.analyze({'a.b':value,a:{b:value}},{syntax,options:{},allowUnknownVariableTypes:true})
    const found=result.occurrences
    assert.equal(new Set(found.map(o=>o.occurrenceId)).size,found.length)
    for(const o of found)assert.equal(value.slice(o.start,o.end),o.varMatch)
    assert.ok(found.some(o=>o.role==='annotation'));assert.ok(found.some(o=>o.filters.length===1))
    assert.ok(found.some(o=>o.pathIdentity==='["a.b"]'));assert.ok(found.some(o=>o.pathIdentity==='["a","b"]'))
  }
})
test('requirements distinguish guaranteed literal and conditional defaults; graph and audit retain possible files',()=>temporary(async root=>{
  const sentinel=path.join(root,'executed');fs.writeFileSync(path.join(root,'risky.js'),`require('fs').writeFileSync(${JSON.stringify(sentinel)},'bad');module.exports={value:1}`)
  const input={literal:'${env:PRIMARY, "literal"}',dependent:'${env:OTHER, env:SECONDARY}',file:'${env:FILE_PRIMARY, file(./risky.js):value}',filtered:'${env:FILTER_PRIMARY, "literal" | Number}',dynamic:'${file(./${opt:stage}.json):value}'}
  const result=await c.inspect(input,{configDir:root,options:{}})
  const requirement=name=>result.requirements.requirements.find(r=>r.name===name)
  assert.equal(requirement('PRIMARY').defaultAvailability,'guaranteed')
  assert.equal(requirement('OTHER').defaultAvailability,'conditional')
  assert.equal(requirement('FILE_PRIMARY').defaultAvailability,'conditional')
  assert.equal(requirement('FILTER_PRIMARY').defaultAvailability,'conditional')
  assert.ok(result.graph.edges.some(edge=>edge.kind==='possible'))
  assert.ok(result.audit.findings.some(finding=>finding.risk==='executable_code'))
  assert.ok(result.graph.diagnostics.some(d=>d.code==='dynamic_file_target'))
  assert.equal(fs.existsSync(sentinel),false)
}))
test('discovery never invokes custom matchers, resolvers, functions or filters',async()=>{
  let calls=0;const fail=()=>{calls++;throw Error('executed')}
  const result=await c.inspect({value:'${spy:value, "fallback" | spy}',call:'${spy("x")}'},{variableSources:[{type:'spy',match:fail,resolver:fail}],functions:{spy:fail},filters:{spy:fail}})
  assert.equal(calls,0);assert.ok((await c.analyze({value:'${spy:value}'},{variableSources:[{type:'spy',match:fail,resolver:fail}]})).occurrences.some(o=>o.variableType==='spy'));assert.equal(calls,0)
})
test('CLI inspection stays non-executing and origin chains agree with both APIs',()=>temporary(async root=>{
  const dir=path.join(root,'sub');fs.mkdirSync(dir);const sentinel=path.join(root,'ran')
  fs.writeFileSync(path.join(dir,'leaf.json'),'{"value":"local"}')
  fs.writeFileSync(path.join(dir,'config.mjs'),`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(sentinel)},'ran');export default {value:'\${file(./leaf.json):value}'}`)
  const config=path.join(root,'root.json');fs.writeFileSync(config,JSON.stringify({out:'${file(./sub/config.mjs)}'}))
  for(const command of ['inspect','requirements','graph','audit']) {
    const result=await runChild(['cli.js',command,config,'--format','json'])
    assert.equal(result.code,0,result.stderr);JSON.parse(result.stdout);assert.equal(fs.existsSync(sentinel),false)
  }
  const cli=await runChild(['cli.js',config]);assert.equal(cli.code,0,cli.stderr);assert.equal(JSON.parse(cli.stdout).out.value,'local')
  for(const resolve of [c,c.sync])assert.equal((await resolve(config,{moduleCacheMode:'load'})).out.value,'local')
}))
test('runtime fallback history records selected and skipped branches with authored identity',async()=>{
  for(const resolve of [c,c.sync]) {
    const result=await resolve({value:'${opt:first, env:CONFIGORAMA_IMPOSSIBLE, "last"}'},{options:{first:'chosen'},returnMetadata:true})
    assert.equal(result.config.value,'chosen')
    const occurrence=result.metadata.occurrences.find(o=>o.parentNodeId===null)
    assert.equal(occurrence.selectedBranch,0)
    assert.deepEqual(occurrence.branches.map(b=>b.runtimeOutcome),['selected','skipped','skipped'])
    assert.ok(result.resolutionHistory.value.fallbackSelections.length>0)
  }
})
test.run()
