const { test } = require('uvu')
const assert = require('node:assert/strict')
const fs=require('node:fs');const path=require('node:path');const {temporary}=require('./cases')
const { runCase, runChild } = require('./runner')
test('real dotenv progress leaves stdout empty', async () => {
  const result = await runCase('dotenv-stdout')
  assert.equal(result.code, 0, result.stderr)
  assert.equal(result.stdout, '')
})
test('diagnostic settings remain separate between loads and never write stdout', async () => {
  const env={...process.env};delete env.FORCE_COLOR
  const result = await runChild(['-e', `const d=require('./src/utils/diagnostics'); d({dotEnvSilent:true}).info('hidden'); d({dotEnvSilent:false}).info('visible'); d({dotEnvDebug:false}).debug('hidden'); d({dotEnvDebug:true}).debug('debug')`], {env})
  assert.equal(result.stdout, '')
  assert.equal(result.stderr, 'configorama: visible\nconfigorama: debug\n')
  assert.equal(result.code, 0)
})
test('CLI debug JSON and configx shell exports remain clean with dotenv enabled',()=>temporary(async root=>{
  fs.writeFileSync(path.join(root,'.env'),'CONFIGORAMA_CHANNEL_TEST=synthetic&a=1&v=2\n')
  const file=path.join(root,'config.yml');fs.writeFileSync(file,'useDotenv: true\nVALUE: ${env:CONFIGORAMA_CHANNEL_TEST}\n')
  const env={...process.env};delete env.CONFIGORAMA_CHANNEL_TEST
  const cli=await runChild(['cli.js',file,'--debug'],{env})
  assert.equal(cli.code,0,cli.stderr);assert.equal(JSON.parse(cli.stdout).VALUE,'synthetic&a=1&v=2');assert.ok(cli.stderr.length)
  const result=await runChild(['../configx/cli.js',file,'--export'],{env})
  assert.equal(result.code,0,result.stderr)
  assert.ok(result.stdout.trim().split('\n').every(line=>line.startsWith('export ')))
  for (const shellPath of ['/bin/sh', '/bin/zsh'].filter(file => fs.existsSync(file))) {
    const shell=await runChild(['-e',`const {spawnSync}=require('node:child_process');const r=spawnSync(process.argv[1],['-c',process.argv[2]+'\\nprintf %s "$VALUE"'],{encoding:'utf8'});if(r.error)throw r.error;process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exitCode=r.status`,shellPath,result.stdout])
    assert.equal(shell.code,0,shell.stderr);assert.equal(shell.stdout,'synthetic&a=1&v=2')
  }
}))
test('structural failures use one structured stderr error and expose registered reliability codes',()=>temporary(async root=>{
  const file=path.join(root,'cycle.yml');fs.writeFileSync(file,'root: &loop\n  child: *loop\n')
  const result=await runChild(['cli.js',file,'--error-format','json'])
  assert.notEqual(result.code,0);assert.equal(result.stdout,'');assert.equal(JSON.parse(result.stderr).error.code,'circular_structure')
  const capabilities=await runChild(['cli.js','capabilities']);const contract=JSON.parse(capabilities.stdout)
  for(const code of ['circular_structure','resolution_limit','resolution_timeout','resolution_aborted','resolution_no_progress','unsupported_sync_value','invalid_sync_transport'])assert.ok(JSON.stringify(contract).includes('"'+code+'"'))
}))
test.run()
