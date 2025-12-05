/**
 * Tests for the new unified options API
 */
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

// ===========================================
// allowUnknownVariableTypes tests
// ===========================================

test('allowUnknownVariableTypes passes through unregistered types', async () => {
  const config = {
    known: '${opt:stage}',
    unknown: '${custom:thing}',
    anotherUnknown: '${s3:myBucket/key}',
  }

  const result = await configorama(config, {
    allowUnknownVariableTypes: true,
    options: { stage: 'dev' }
  })

  assert.is(result.known, 'dev')
  assert.is(result.unknown, '${custom:thing}')
  assert.is(result.anotherUnknown, '${s3:myBucket/key}')
})

test('allowUnknownVariableTypes: false throws on unregistered types', async () => {
  const config = {
    unknown: '${custom:thing}',
  }

  let threw = false
  try {
    await configorama(config, {
      allowUnknownVariableTypes: false,
    })
  } catch (e) {
    threw = true
    assert.ok(e.message.includes('invalid variable syntax'))
  }
  assert.ok(threw)
})

test('allowUnknownVariableTypes: array allows only specified types', async () => {
  const config = {
    known: '${opt:stage}',
    allowedUnknown: '${ssm:path/to/value}',
    anotherAllowed: '${cf:stack.output}',
  }

  const result = await configorama(config, {
    allowUnknownVariableTypes: ['ssm', 'cf'],
    options: { stage: 'dev' }
  })

  assert.is(result.known, 'dev')
  assert.is(result.allowedUnknown, '${ssm:path/to/value}')
  assert.is(result.anotherAllowed, '${cf:stack.output}')
})

test('allowUnknownVariableTypes: array throws on non-allowed types', async () => {
  const config = {
    notAllowed: '${custom:thing}',
  }

  let threw = false
  try {
    await configorama(config, {
      allowUnknownVariableTypes: ['ssm', 'cf'],
    })
  } catch (e) {
    threw = true
    assert.ok(e.message.includes('invalid variable syntax'))
  }
  assert.ok(threw)
})

test('allowUnknownVariableTypes: array with mixed known and unknown', async () => {
  const config = {
    known: '${opt:stage}',
    allowedUnknown: '${ssm:path}',
    knownEnv: '${env:HOME}',
  }

  const result = await configorama(config, {
    allowUnknownVariableTypes: ['ssm'],
    options: { stage: 'prod' }
  })

  assert.is(result.known, 'prod')
  assert.is(result.allowedUnknown, '${ssm:path}')
  assert.ok(result.knownEnv) // HOME env var should resolve
})

// ===========================================
// allowUnresolvedVariables array syntax tests
// ===========================================

test('allowUnresolvedVariables: true passes through all unresolved', async () => {
  const config = {
    missingEnv: '${env:MISSING_VAR_12345}',
    missingOpt: '${opt:missingOption}',
    missingParam: '${param:missingParam}',
  }

  const result = await configorama(config, {
    allowUnresolvedVariables: true,
    options: {}
  })

  assert.is(result.missingEnv, '${env:MISSING_VAR_12345}')
  assert.is(result.missingOpt, '${opt:missingOption}')
  assert.is(result.missingParam, '${param:missingParam}')
})

test('allowUnresolvedVariables: ["param"] only passes through param', async () => {
  const config = {
    missingParam: '${param:missingParam}',
  }

  const result = await configorama(config, {
    allowUnresolvedVariables: ['param'],
    options: {}
  })

  assert.is(result.missingParam, '${param:missingParam}')
})

test('allowUnresolvedVariables: ["param"] throws on unresolved env', async () => {
  const config = {
    missingEnv: '${env:MISSING_VAR_12345}',
  }

  let threw = false
  try {
    await configorama(config, {
      allowUnresolvedVariables: ['param'],
      options: {}
    })
  } catch (e) {
    threw = true
    assert.ok(e.message.includes('Unable to resolve'))
  }
  assert.ok(threw)
})

test('allowUnresolvedVariables: ["param", "file"] passes through both', async () => {
  const config = {
    missingParam: '${param:missingParam}',
    missingFile: '${file(./does-not-exist.yml)}',
  }

  const result = await configorama(config, {
    allowUnresolvedVariables: ['param', 'file'],
    options: {}
  })

  assert.is(result.missingParam, '${param:missingParam}')
  // File returns undefined when not found but allowed (no error thrown)
  assert.is(result.missingFile, '${file(./does-not-exist.yml)}')
})

// ===========================================
// Backward compatibility tests
// ===========================================

test('legacy allowUnknownVariables maps to allowUnknownVariableTypes', async () => {
  const config = {
    unknown: '${custom:thing}',
  }

  const result = await configorama(config, {
    allowUnknownVariables: true,
    options: {}
  })

  assert.is(result.unknown, '${custom:thing}')
})

test('legacy allowUnknownVars maps to allowUnknownVariableTypes', async () => {
  const config = {
    unknown: '${custom:thing}',
  }

  const result = await configorama(config, {
    allowUnknownVars: true,
    options: {}
  })

  assert.is(result.unknown, '${custom:thing}')
})

test('legacy allowUnknownParams merges into allowUnresolvedVariables', async () => {
  const config = {
    missingParam: '${param:missingParam}',
  }

  const result = await configorama(config, {
    allowUnknownParams: true,
    options: {}
  })

  assert.is(result.missingParam, '${param:missingParam}')
})

test('legacy allowUnknownFileRefs merges into allowUnresolvedVariables', async () => {
  const config = {
    missingFile: '${file(./does-not-exist.yml)}',
  }

  const result = await configorama(config, {
    allowUnknownFileRefs: true,
    options: {}
  })

  // File ref passes through as string
  assert.is(result.missingFile, '${file(./does-not-exist.yml)}')
})

test('legacy options combine correctly', async () => {
  const config = {
    missingParam: '${param:missingParam}',
    missingFile: '${file(./does-not-exist.yml)}',
  }

  const result = await configorama(config, {
    allowUnknownParams: true,
    allowUnknownFileRefs: true,
    options: {}
  })

  assert.is(result.missingParam, '${param:missingParam}')
  assert.is(result.missingFile, '${file(./does-not-exist.yml)}')
})

test('new array syntax plus legacy flag combine', async () => {
  const config = {
    missingParam: '${param:missingParam}',
    missingFile: '${file(./does-not-exist.yml)}',
  }

  const result = await configorama(config, {
    allowUnresolvedVariables: ['param'],
    allowUnknownFileRefs: true,
    options: {}
  })

  assert.is(result.missingParam, '${param:missingParam}')
  assert.is(result.missingFile, '${file(./does-not-exist.yml)}')
})

test.run()
