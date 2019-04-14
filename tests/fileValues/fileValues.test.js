/* eslint-disable no-template-curly-in-string */
import test from 'ava'
import path from 'path'
import Configorama from '../../lib'

let config

process.env.envNumber = 100
process.env.MY_SECRET = 'lol hi there'

// This runs before all tests
test.before(async t => {
  const args = {
    stage: 'dev',
    otherFlag: 'prod',
    count: 25
    // empty: 'HEHEHE'
  }

  const configFile = path.join(__dirname, 'fileValues.yml')
  const configorama = new Configorama(configFile)

  config = await configorama.init(args)
  console.log(`-------------`)
  console.log(`Value count`, Object.keys(config).length)
  console.log(config)
  console.log(`-------------`)
})

test.after(t => {
  console.log(`-------------`)
})

// from ymlfull
const ymlContents = {
  fullYml: 'fullYmlValue',
  fullYmlObject: {
    one: 'one',
    two: 'two'
  }
}

test('full yaml file reference > ${file(./_ymlfull.yml)}', (t) => {
  t.deepEqual(config.yamlFullFile, ymlContents)
})

test('full yaml file no path > ${file(_ymlfull.yml)}', (t) => {
  t.deepEqual(config.yamlFullFileNoPath, ymlContents)
})

test('yamlFullFileNestedRef > ${file(./_yml${self:normalKey}.yml)}', (t) => {
  t.deepEqual(config.yamlFullFileNestedRef, ymlContents)
})

test("yamlFullFileMissing > ${file(./_madeup-file.yml), 'yamlFullFileMissingDefaultValue'}", (t) => {
  t.deepEqual(config.yamlFullFileMissing, 'yamlFullFileMissingDefaultValue')
})

test('yamlPartialTopLevelKey', (t) => {
  t.deepEqual(config.yamlPartialTopLevelKey, 'topLevelValue')
})

test('yamlPartialTopLevelKeyNoPath', (t) => {
  t.deepEqual(config.yamlPartialTopLevelKeyNoPath, 'topLevelValue')
})

test('yamlPartialSecondLevelKey', (t) => {
  t.deepEqual(config.yamlPartialSecondLevelKey, '1leveldown')
})

test('yamlPartialThirdLevelKey', (t) => {
  t.deepEqual(config.yamlPartialThirdLevelKey, '2levelsdown')
})

test('yamlPartialThirdLevelKeyNoPath', (t) => {
  t.deepEqual(config.yamlPartialThirdLevelKeyNoPath, '2levelsdown')
})

test('yamlPartialArrayRef', (t) => {
  t.deepEqual(config.yamlPartialArrayRef, 'one')
})

test('yamlPartialArrayObjectRef', (t) => {
  t.deepEqual(config.yamlPartialArrayObjectRef, { key: 'helloTwo' })
})

test('yamlPartialArrayObjectRefValue', (t) => {
  t.deepEqual(config.yamlPartialArrayObjectRefValue, 'helloTwo')
})

test('stageSpecific', (t) => {
  t.deepEqual(config.stageSpecific, {
    'CREDS': 'dev creds here'
  })
})

test('stageSpecificTwo', (t) => {
  t.deepEqual(config.stageSpecificTwo, {
    'CREDS': 'prod creds here'
  })
})
