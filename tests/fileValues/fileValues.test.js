/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../lib')

let config

process.env.envNumber = 100
process.env.MY_SECRET = 'lol hi there'

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
    otherFlag: 'prod',
    count: 25
  }

  const configFile = path.join(__dirname, 'fileValues.yml')
  config = await configorama(configFile, {
    options: args
  })
  console.log(`-------------`)
  console.log(`Value count`, Object.keys(config).length)
  console.log(config)
  console.log(`-------------`)
}

// Teardown function
const teardown = () => {
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

// from ymlfull
const ymlContents = {
  fullYml: 'fullYmlValue',
  fullYmlObject: {
    one: 'one',
    two: 'two'
  }
}

test('full yaml file reference > ${file(./_ymlfull.yml)}', () => {
  assert.equal(config.yamlFullFile, ymlContents)
})

test('full yaml file no path > ${file(_ymlfull.yml)}', () => {
  assert.equal(config.yamlFullFileNoPath, ymlContents)
})

test('yamlFullFileNestedRef > ${file(./_yml${self:normalKey}.yml)}', () => {
  assert.equal(config.yamlFullFileNestedRef, ymlContents)
})

test("yamlFullFileMissing > ${file(./_madeup-file.yml), 'yamlFullFileMissingDefaultValue'}", () => {
  assert.equal(config.yamlFullFileMissing, 'yamlFullFileMissingDefaultValue')
})

test('yamlPartialTopLevelKey', () => {
  assert.equal(config.yamlPartialTopLevelKey, 'topLevelValue')
})

test('yamlPartialTopLevelKeyNoPath', () => {
  assert.equal(config.yamlPartialTopLevelKeyNoPath, 'topLevelValue')
})

test('yamlPartialSecondLevelKey', () => {
  assert.equal(config.yamlPartialSecondLevelKey, '1leveldown')
})

test('yamlPartialThirdLevelKey', () => {
  assert.equal(config.yamlPartialThirdLevelKey, '2levelsdown')
})

test('yamlPartialThirdLevelKeyNoPath', () => {
  assert.equal(config.yamlPartialThirdLevelKeyNoPath, '2levelsdown')
})

test('yamlPartialArrayRef', () => {
  assert.equal(config.yamlPartialArrayRef, 'one')
})

test('yamlPartialArrayObjectRef', () => {
  assert.equal(config.yamlPartialArrayObjectRef, { key: 'helloTwo' })
})

test('yamlPartialArrayObjectRefValue', () => {
  assert.equal(config.yamlPartialArrayObjectRefValue, 'helloTwo')
})

test('stageSpecific', () => {
  assert.equal(config.stageSpecific, {
    'CREDS': 'dev creds here'
  })
})

test('stageSpecificTwo', () => {
  assert.equal(config.stageSpecificTwo, {
    'CREDS': 'prod creds here'
  })
})

test('singleQuotes', () => {
  assert.equal(config.singleQuotes, {
    'CREDS': 'dev creds here'
  })
})

test('doubleQuotes', () => {
  assert.equal(config.doubleQuotes, {
    'CREDS': 'prod creds here'
  })
})

test.run()
