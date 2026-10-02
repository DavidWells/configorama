const {test}=require('uvu');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const c=require('../../src');const {temporary}=require('./cases')
const {selectFileTarget}=require('../../src/utils/paths/fileOrigin')
test('author/root/alias/override selection retains lexical and canonical identity',()=>temporary(async root=>{
  const sub=path.join(root,'sub');fs.mkdirSync(sub);const file=path.join(sub,'root.json');fs.writeFileSync(file,'{}');fs.writeFileSync(path.join(sub,'same.json'),'{}');fs.writeFileSync(path.join(root,'same.json'),'{}')
  const origin={authoredFile:file};assert.equal(selectFileTarget('./same.json',root,origin).canonicalTarget,fs.realpathSync(path.join(sub,'same.json')))
  assert.equal(selectFileTarget('./same.json',root,origin,{'same.json':'./same.json'}).canonicalTarget,fs.realpathSync(path.join(root,'same.json')))
  fs.writeFileSync(path.join(root,'only-root.json'),'{}');assert.equal(selectFileTarget('./only-root.json',root,origin).selectionReason,'config-root')
  fs.writeFileSync(path.join(root,'tsconfig.json'),JSON.stringify({compilerOptions:{paths:{'@local/*':['sub/*']}}}));assert.equal(selectFileTarget('@local/same.json',root,origin).selectionReason,'alias')
}))
test('static/dynamic references and self aliases choose their author across repeated names',()=>temporary(async root=>{
  fs.writeFileSync(path.join(root,'leaf.dev.json'),'{"value":"root"}');fs.writeFileSync(path.join(root,'fallback.json'),'{"value":"shared"}')
  for(const name of ['one','two']) {
    const dir=path.join(root,name);fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'leaf.dev.json'),JSON.stringify({value:name}))
    fs.writeFileSync(path.join(dir,'middle.json'),JSON.stringify({static:'${file(./leaf.dev.json):value}',dynamic:'${file(./leaf.${opt:stage}.json):value}',fallback:'${file(./fallback.json):value}'}))
    fs.writeFileSync(path.join(dir,'root.json'),JSON.stringify({inner:'${file(./middle.json)}'}))
  }
  const input={one:'${file(./one/root.json)}',two:'${file(./two/root.json)}',copy:'${self:one}'}
  for(const resolve of [c,c.sync]) {
    const output=await resolve(input,{configDir:root,options:{stage:'dev'}})
    for(const name of ['one','two'])assert.deepEqual(output[name].inner,{static:name,dynamic:name,fallback:'shared'})
    assert.deepEqual(output.copy,output.one)
    const overridden=await resolve(input,{configDir:root,options:{stage:'dev'},filePathOverrides:{'leaf.dev.json':'./leaf.dev.json'}})
    assert.equal(overridden.one.inner.static,'root');assert.equal(overridden.two.inner.dynamic,'root')
  }
}))
test('executable exports use their authored directory',()=>temporary(async root=>{
  const dir=path.join(root,'sub');fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'leaf.json'),'{"value":"local"}');fs.writeFileSync(path.join(dir,'config.js'),'module.exports={value:"${file(./leaf.json):value}"}')
  for(const resolve of [c,c.sync])assert.equal((await resolve({out:'${file(./sub/config.js)}'},{configDir:root,moduleCacheMode:'load'})).out.value,'local')
}))
test('composed repeats, cross-file views, canonical cycles and symlink roots',()=>temporary(async root=>{
  const inside=path.join(root,'inside');const outside=path.join(root,'outside');fs.mkdirSync(inside);fs.mkdirSync(outside)
  fs.writeFileSync(path.join(inside,'leaf.json'),'{"a":"A","b":"${file(./leaf.json):a}"}')
  fs.writeFileSync(path.join(inside,'root.json'),JSON.stringify({value:'pre-${file(./leaf.json):a}-${file(./leaf.json):b}',dynamic:'${file(./leaf.json):b}'}))
  fs.writeFileSync(path.join(outside,'secret.json'),'{"value":"outside"}')
  fs.symlinkSync(path.join(outside,'secret.json'),path.join(inside,'escape.json'))
  fs.writeFileSync(path.join(inside,'raw.json'),JSON.stringify({value:'${text(./raw.json)}'}))
  fs.writeFileSync(path.join(inside,'cycle.json'),'{"value":"${file(./cycle.json):value}"}')
  for(const resolve of [c,c.sync]) {
    const result=await resolve({out:'${file(./root.json)}'},{configDir:inside,returnMetadata:true})
    const raw=await resolve(path.join(inside,'raw.json'))
    assert.equal(raw.value,fs.readFileSync(path.join(inside,'raw.json'),'utf8'))
    assert.equal(result.config.out.value,'pre-A-A');assert.equal(result.config.out.dynamic,'A')
    assert.ok(result.metadata.fileDependencies.selectedReferences.some(ref=>ref.canonicalTarget===fs.realpathSync(path.join(inside,'leaf.json'))&&ref.selectionReason==='authored-file'))
    await assert.rejects(async()=>resolve({out:'${file(./escape.json):value}'},{configDir:inside,safeMode:true}),error=>error.code==='file_root_forbidden')
    await assert.rejects(async()=>resolve({out:'${file(./cycle.json):value}'},{configDir:inside}),/Circular file reference/)
  }
}))
test.run()
