/* Test for allowUnresolvedVariables option */
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

test('allowUnresolvedVariables passes through unresolvable known types', async () => {
  const config = {
    cool: true,
    known: '${opt:stage}',
    rad: '${cool}',
    missingEnv: '${env:CONFIGORAMA_MISSING_VAR_12345}',
    missingOpt: '${opt:missingOption}',
  }

  const result = await configorama(config, {
    allowUnresolvedVariables: true,
    options: {
      stage: 'dev',
    }
  })

  assert.is(result.known, 'dev', 'known variable should resolve')
  assert.is(result.missingEnv, '${env:CONFIGORAMA_MISSING_VAR_12345}', 'missing env should pass through')
  assert.is(result.missingOpt, '${opt:missingOption}', 'missing opt should pass through')
})

test('allowUnresolvedVariables passes through missing file refs', async () => {
  const config = {
    stage: '${opt:stage}',
    missingFile: '${file(./does-not-exist-12345.yml)}',
  }

  const result = await configorama(config, {
    allowUnresolvedVariables: true,
    options: {
      stage: 'prod',
    }
  })

  assert.is(result.stage, 'prod')
  assert.is(result.missingFile, '${file(./does-not-exist-12345.yml)}')
})

test('allowUnresolvedVariables in mixed strings', async () => {
  const config = {
    mixed: 'prefix-${env:CONFIGORAMA_MISSING_VAR_12345}-suffix',
  }

  const result = await configorama(config, {
    allowUnresolvedVariables: true,
    options: {}
  })

  assert.is(result.mixed, 'prefix-${env:CONFIGORAMA_MISSING_VAR_12345}-suffix')
})

test('without allowUnresolvedVariables, missing env throws', async () => {
  const config = {
    missing: '${env:CONFIGORAMA_MISSING_VAR_12345}',
  }

  let threw = false
  try {
    await configorama(config, {
      options: {}
    })
  } catch (e) {
    threw = true
    assert.ok(e.message.includes('Unable to resolve'), 'should throw resolution error')
  }
  assert.ok(threw, 'should throw for unresolvable variable')
})

test.run()
