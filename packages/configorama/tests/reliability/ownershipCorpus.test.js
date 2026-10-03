const {test}=require('uvu');const assert=require('node:assert/strict');const {ownershipCases,wrappers,grammarControls}=require('./ownershipCorpus');const configorama=require('../../src')
test('ownership matrix defines every wrapper, mode and position with unique names',()=>{
  assert.equal(ownershipCases.length,wrappers.length*3*5);assert.equal(new Set(ownershipCases.map(c=>c.name)).size,ownershipCases.length)
  assert.ok(grammarControls.some(s=>s.includes('sls:stage')));for(const c of ownershipCases)assert.ok(['error','preserve'].includes(c.expected))
})
test('control foreign references preserve exactly when allowed; known typed refs still resolve',async()=>{
  for(const resolve of [configorama,configorama.sync]) {
    const input={out:'pre-${vendor:Thing}-${opt:live}',ignored:{'Fn::Sub':'${AWS::Region}'}}
    const value=await resolve(input,{allowUnknownVariableTypes:['vendor'],options:{live:'ok'}})
    assert.equal(value.out,'pre-${vendor:Thing}-ok');assert.equal(value.ignored['Fn::Sub'],'${AWS::Region}')
    await assert.rejects(async()=>resolve({out:'${unknownCall("x")}'},{}),/function|Function/)
  }
})
test.run()
