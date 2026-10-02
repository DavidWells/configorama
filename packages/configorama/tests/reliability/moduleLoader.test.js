const { test } = require('uvu'); const assert = require('node:assert/strict')
const fs = require('node:fs'); const path = require('node:path')
const load = require('../../src/utils/loadExecutable'); const createContext = require('../../src/utils/loadContext')
const { temporary } = require('./cases')
test('load mode refreshes config-owned helper graphs without purging native caches', () => temporary(async dir => {
  const helper=path.join(dir,'helper.js'); const root=path.join(dir,'root.js')
  fs.writeFileSync(helper, 'module.exports={value:"first"}')
  fs.writeFileSync(root, 'module.exports=require("./helper")')
  const native = require('dotenv'); const context=createContext(root,{})
  assert.equal(load(root,context,'load').value,'first')
  fs.writeFileSync(helper,'module.exports={value:"second"}')
  assert.equal(load(root,context,'load').value,'first')
  assert.equal(load(root,createContext(root,{}),'load').value,'second')
  assert.equal(require('dotenv'),native)
}))
test('process and load modes have consistent JS/TS/MJS policies', () => temporary(async dir => {
  for (const ext of ['js','ts','mjs']) {
    const file=path.join(dir,`root.${ext}`); const code=v=>ext==='js'?`module.exports={value:"${v}"}`:`export default {value:"${v}"}`
    fs.writeFileSync(file,code('one')); assert.equal(load(file,createContext(file,{}),'process').value,'one')
    fs.writeFileSync(file,code('two')); assert.equal(load(file,createContext(file,{}),'process').value,'one')
    assert.equal(load(file,createContext(file,{}),'load').value,'two')
  }
}))
test.run()
