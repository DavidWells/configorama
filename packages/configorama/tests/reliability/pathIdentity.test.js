const { test }=require('uvu');const assert=require('node:assert/strict');const configorama=require('../../src')
const {displayPath}=require('../../src/utils/paths/pathIdentity')
test('colliding old cache labels resolve independently with typed metadata',async()=>{
  const input=Object.fromEntries([['a,b','${opt:v | toUpperCase}'],['a',{b:'${opt:v | toUpperCase}'}],['a.b','${opt:d}'],['a\0b','${opt:n}'],['','${opt:e}'],['__proto__','${opt:p}'],['constructor','${opt:c}']])
  for(const resolve of [configorama,configorama.sync]) {
    const result=await resolve(input,{options:{v:'x,y',d:17,n:false,e:'empty',p:'own',c:'ctor'},returnMetadata:true})
    assert.deepEqual(result.config['a,b'],'X,Y');assert.deepEqual(result.config.a.b,'X,Y');assert.equal(result.config['a.b'],17);assert.equal(result.config['a\0b'],false)
    for(const segments of [['a,b'],['a','b'],['a.b'],['a\0b'],[''],['__proto__'],['constructor']]) {
      const history=result.metadata.resolutionHistory[displayPath(segments)]
      assert.ok(history,displayPath(segments));assert.deepEqual(history.pathSegments,segments)
      let expected=result.config;for(const key of segments)expected=expected[key]
      assert.deepEqual(history.resolvedPropertyValue,expected)
    }
    assert.equal(Object.getPrototypeOf(result.config),Object.prototype)
  }
})
test('non-idempotent filters run once for each literal/composed colliding path',async()=>{
  let calls=0;const config=await configorama({'a,b':'${opt:v | once}',a:{b:'${opt:w | once}'}},{options:{v:'x',w:'x'},filters:{once:v=>{calls++;return v+'!'}}})
  assert.deepEqual(config,{'a,b':'x!',a:{b:'x!'}});assert.equal(calls,2)
})
test('ignore decisions distinguish NUL keys from path segments',()=>{
  const instance=new configorama.Configorama({}, {disableDefaultIgnorePaths:true,ignorePaths:['a.b']})
  assert.equal(instance.isIgnorePath(['a\0b']),false);assert.equal(instance.isIgnorePath(['a','b']),true)
})
test.run()
