const {test}=require('uvu');const assert=require('node:assert/strict');const c=require('../../src');const {ownershipCases,wrappers}=require('./ownershipCorpus')
test('both APIs implement the complete wrapper/mode/position ownership matrix',async()=>{
  for(const resolve of [c,c.sync])for(const item of ownershipCases) {
    const settings={options:{live:'ok'},syntax:c.buildVariableSyntax(item.prefix,item.suffix),allowUnknownVariableTypes:item.mode==='allow-all'?true:item.mode==='allow-foreign'?['vendor']:false}
    const input=item.position==='ignored'?{'Fn::Sub':item.source}:{out:item.source}
    if(item.expected==='error'){await assert.rejects(async()=>resolve(input,settings));continue}
    const output=await resolve(input,settings);const actual=item.position==='ignored'?output['Fn::Sub']:output.out
    assert.equal(actual,item.position==='composed'?`pre-${item.foreign}-ok`:item.foreign,item.name)
  }
})
test('allowing foreign source types never allows missing recognized sources or unknown calls/filters',async()=>{
  for(const resolve of [c,c.sync])for(const [prefix,suffix]of wrappers)for(const allowUnknownVariableTypes of [false,true,['vendor']]) {
    const settings={options:{live:'ok'},syntax:c.buildVariableSyntax(prefix,suffix),allowUnknownVariableTypes}
    await assert.rejects(async()=>resolve({out:prefix+'unknownCall("x")'+suffix},settings),/function|Function/)
    await assert.rejects(async()=>resolve({out:prefix+'opt:live | unknownFilter'+suffix},settings),/Filter/)
    await assert.rejects(async()=>resolve({out:prefix+'env:CONFIGORAMA_RELIABILITY_ABSENT'+suffix},settings))
    const expression=prefix+'env:CONFIGORAMA_RELIABILITY_ABSENT'+suffix
    assert.equal((await resolve({out:expression},{...settings,allowUnresolvedVariables:['env']})).out,expression)
  }
})
test('foreign references preserve source bytes while explicitly typed nested refs resolve',async()=>{
  let calls=0
  const foreign='${ vendor:Thing/${spy:x}  }'
  const output=await c({out:`before-${foreign}-${'${opt:v}'}`},{options:{v:'ok'},allowUnknownVariableTypes:['vendor'],variableSources:[{type:'spy',match:/^spy:/,resolver:()=>{calls++;return 'changed'}}]})
  assert.equal(output.out,'before-${ vendor:Thing/changed  }-ok');assert.equal(calls,1)
  for(const resolve of [c,c.sync])assert.equal((await resolve({out:'${ vendor:Thing  }'},{allowUnknownVariableTypes:['vendor']})).out,'${ vendor:Thing  }')
})
test('known unresolved fallback slots preserve only their own reference even without the self container',async()=>{
  for(const resolve of [c,c.sync]) {
    const value=await resolve({out:'${opt:nope, self:missing.key | toUpperCase}'},{allowUnresolvedVariables:true,options:{}})
    assert.equal(value.out,'${self:missing.key}')
  }
})
test.run()
