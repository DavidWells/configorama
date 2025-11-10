/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

const dirname = path.dirname(__dirname)

process.env.envReference = 'env var'

const args = {
  stage: 'dev',
}

test('throw if self not found', async () => {
  const object = {
    value: '${opt:stage}-${foo}',
  }

  try {
    await configorama(object, {
      configDir: dirname
    })
    assert.unreachable('should have thrown')
  } catch (error) {
    assert.match(error.message, /Invalid variable reference syntax/)
  }
})

test('throw if opt not found', async () => {
  const object = {
    value: '${opt:what}',
  }

  try {
    await configorama(object, {
      configDir: dirname
    })
    assert.unreachable('should have thrown')
  } catch (error) {
    assert.match(error.message, /Unable to resolve/)
  }
})

test('throw if deep value not found', async () => {
  const configFile = path.join(__dirname, 'fail.yml')

  try {
    await configorama(configFile)
    assert.unreachable('should have thrown')
  } catch (error) {
    assert.match(error.message, /Missing Value/)
  }
})

test('throw if value resolved is undefined', async () => {
  const object = {
    value: '${env:no, ${env:empty}}',
  }

  try {
    const config =await configorama(object, {
      configDir: dirname
    })
    assert.unreachable('should have thrown')
  } catch (error) {
    assert.match(error.message, /resolved to "undefined"/)
  }
})

test('Allow undefined values', async () => {
  const object = {
    value: '${env:no, ${env:empty}}',
  }

  const x = await configorama(object, {
    configDir: dirname,
    allowUndefinedValues: true
  })
  assert.is(x.value, undefined)
})

// Nested fallbacks ACCESS_TOKEN = "${file(asyncValue.js, ${env:MY_SECxRET, 'hi'}, ${self:sharedValue})}"

const failConfig = {
  noParams: '${file:}',
  noParams2: '${file():}',
  invalidYaml: '${file(invalid.yml)}',
  invalidJson: '${file(invalid.json)}',
  invalidJs: '${file(invalid.js)}',
  invalidJs2: '${file(invalid2.js)}',
  nonStandardExt: '${file(non-standard.ext)}',
  unresolvable: '${unknown:}'
}

test('failConfig', async () => {
  try {
    await configorama(failConfig, {
      configDir: dirname
    })
    assert.unreachable('should have thrown')
  } catch (error) {
    // console.log('error', error)
    assert.match(error.message, /invalid variable syntax/)
  }
})

const envFailConfig = {
  noAddress: '${env:}',
}

test('env failConfig', async () => {
  try {
    const x = await configorama(envFailConfig, {
      configDir: dirname
    })
    /*
    console.log('x', x)
    /** */
    assert.unreachable('should have thrown')
  } catch (error) {
    /*
    console.log('error', error)
    /** */
    assert.match(error.message, /Invalid variable syntax/)
  }
})

const envFailConfig2 = {
  nonStringAddress: '${env:${self:someObject}}',
  someObject: {},
}

test('env ref is object', async () => {
  try {
    await configorama(envFailConfig2, {
      configDir: dirname
    })
    assert.unreachable('should have thrown')
  } catch (error) {
    /*
    console.log('error', error)
    /** */
    assert.match(error.message, /Invalid variable syntax/)
  }
})

test.run()
