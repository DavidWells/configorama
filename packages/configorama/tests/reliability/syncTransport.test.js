const { test } = require('uvu')
const assert = require('node:assert/strict')
const configorama = require('../../src')
const { cases, temporary } = require('./cases')
const fs = require('node:fs'); const path = require('node:path')
for (const name of ['sync-date-marker', 'sync-undefined', 'sync-bigint']) test(name, cases[name].run)
test('typed options and metadata survive both boundaries and never mutate caller settings', async () => {
  const settings = { options: { value: { undef: undefined, big: 7n, date: new Date(0), regexp: /x/g, values: [NaN, Infinity, -Infinity, -0] } }, returnMetadata: true, allowUndefinedValues: true }
  const before = settings.options.value
  for (const resolve of [configorama, configorama.sync]) {
    const output = await resolve({ result: '${opt:value}', literal: { __configoramaDate: 'data' } }, settings)
    assert.deepEqual(output.config.result, before); assert.deepEqual(output.config.literal, { __configoramaDate: 'data' })
    assert.ok(output.variableSyntax instanceof RegExp)
  }
  assert.equal(settings.options.value, before)
  const noOptions = {}; configorama.sync({}, noOptions); assert.deepEqual(noOptions, {})
})
test('unsupported sync values fail before RPC without executing getters', () => {
  let calls = 0; const value = {}; Object.defineProperty(value, 'get', { enumerable: true, get() { calls++ } })
  assert.throws(() => configorama.sync(value), e => e.code === 'unsupported_sync_value' && e.details.path.join('.') === 'filePath.get')
  assert.equal(calls, 0)
  for(const settings of [Object.defineProperty({},'options',{enumerable:true,get(){calls++;return {}}}),{variableSources:[Object.defineProperty({},'syncFactory',{enumerable:true,get(){calls++;return 'secret'}})]}])assert.throws(()=>configorama.sync({},settings),e=>e.code==='unsupported_sync_value')
  assert.equal(calls,0)
})
test('sync factories initialize after caller env is applied on each request', () => temporary(async dir => {
  const factory = path.join(dir, 'factory.js')
  fs.writeFileSync(factory, `module.exports = () => { const value = process.env.CONFIGORAMA_FACTORY_VALUE; return {type:'fresh',match:/^fresh:/g,resolver:()=>value} }`)
  const key = 'CONFIGORAMA_FACTORY_VALUE'; const saved = process.env[key]
  try {
    for (const value of ['a', 'b', 'a']) { process.env[key] = value; assert.equal(configorama.sync({ value: '${fresh:x}' }, { options: {}, variableSources: [{ syncFactory: factory }] }).value, value) }
  } finally { if (saved === undefined) delete process.env[key]; else process.env[key] = saved }
}))
test('worker errors retain structured code/details', () => {
  assert.throws(() => configorama.sync({ value: '${eval("x".constructor)}' }), e => e.code === 'blocked_eval_escape' && typeof e.details === 'object')
})
test('full output and metadata have strict typed async-sync parity', async () => {
  const dict=Object.assign(Object.create(null),{constructor:'own',__internal_only_flag:true,value:'literal'})
  const sparse=new Array(3);sparse[1]=dict;sparse.extra='own';const regexp=/x/gy;regexp.lastIndex=2
  const input={dict,alias:dict,sparse,invalid:new Date(NaN),date:new Date(0),regexp,number:[NaN,Infinity,-Infinity,-0],big:123n,undefined:undefined,markers:['__JSON_B64__eA==__','__configoramaDate','\uE001x\uE001']}
  const settings={options:{},returnMetadata:true,allowUndefinedValues:true}
  const asynchronous=await configorama(input,settings);const synchronous=configorama.sync(input,settings)
  for(const result of [asynchronous,synchronous])assert.ok(Number.isNaN(result.config.invalid.getTime()))
  const comparable=result=>({...result,config:{...result.config,invalid:'invalid date'},originalConfig:{...result.originalConfig,invalid:'invalid date'}})
  assert.deepEqual(comparable(synchronous),comparable(asynchronous))
  for(const result of [asynchronous,synchronous]){assert.equal(Object.getPrototypeOf(result.config.dict),null);assert.equal(result.config.dict,result.config.alias);assert.equal(result.config.dict,result.config.sparse[1]);assert.equal(0 in result.config.sparse,false);assert.equal(result.config.regexp.lastIndex,2)}
})
test('unsupported native values and callable data fail with sanitized paths',()=>{
  for(const value of [()=>{},Symbol('secret'),new Map(),new Set(),new Uint8Array(1)])assert.throws(()=>configorama.sync({value}),e=>e.code==='unsupported_sync_value'&&!e.message.includes('secret'))
})
test.run()
