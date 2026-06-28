/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

const fixtureDir = path.join(__dirname, 'fixtures')

test('safeMode blocks executable JS file refs during resolution', async () => {
  const configPath = path.join(fixtureDir, 'config.yml')
  let caught
  try {
    await configorama(configPath, { safeMode: true })
  } catch (error) {
    caught = error
  }
  assert.ok(caught)
  assert.is(caught.code, 'blocked_by_safe_mode')
})

test('audit reports executable refs without running them', async () => {
  const configPath = path.join(fixtureDir, 'config.yml')
  const report = await configorama.audit(configPath, { safeMode: true })
  assert.ok(report.findings.some(finding => finding.risk === 'executable_code'))
})

test('eval and if remain sandboxed data-flow surfaces', async () => {
  const report = await configorama.audit({
    result: '${eval(1 + 1)}',
    branch: '${if(true ? "yes" : "no")}',
  }, { safeMode: true })

  const dataFlowFindings = report.findings.filter(finding => finding.risk === 'data_flow_expression')
  assert.is(dataFlowFindings.length, 2)
})

test('eval prototype escape attempts do not execute constructors', async () => {
  let caught
  try {
    await configorama({
      escape: '${eval("".constructor.constructor("return process")())}'
    })
  } catch (error) {
    caught = error
  }
  assert.ok(caught, 'constructor escape attempt should fail')
})

test('safeMode restricts file refs to the config root by default', async () => {
  let caught
  try {
    await configorama({
      packageJson: '${file(../../../package.json):name}'
    }, {
      configDir: path.join(__dirname, 'fixtures'),
      safeMode: true
    })
  } catch (error) {
    caught = error
  }
  assert.ok(caught)
  assert.is(caught.code, 'file_root_forbidden')
})

test('safeMode blocks dotenv mutation', async () => {
  let caught
  try {
    await configorama({
      useDotenv: true,
      value: 'ok'
    }, { safeMode: true })
  } catch (error) {
    caught = error
  }
  assert.ok(caught)
  assert.is(caught.code, 'blocked_by_safe_mode')
})

test('safeMode blocks custom resolvers and functions before resolution', async () => {
  let resolverError
  try {
    await configorama({
      value: '${custom:value}'
    }, {
      safeMode: true,
      variableSources: [{
        type: 'custom',
        match: /^custom:/,
        resolver: () => Promise.resolve('value')
      }]
    })
  } catch (error) {
    resolverError = error
  }
  assert.ok(resolverError)
  assert.is(resolverError.code, 'blocked_by_safe_mode')

  let functionError
  try {
    await configorama({
      value: '${custom("x")}'
    }, {
      safeMode: true,
      functions: {
        custom: value => value
      }
    })
  } catch (error) {
    functionError = error
  }
  assert.ok(functionError)
  assert.is(functionError.code, 'blocked_by_safe_mode')
})

test.run()
