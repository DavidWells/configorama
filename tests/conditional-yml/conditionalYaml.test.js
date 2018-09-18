/* eslint-disable no-template-curly-in-string */
import test from 'ava'
import path from 'path'
import Configorama from '../../lib'

let config

// This runs before all tests
test.before(async t => {
  const args = {
    stage: 'dev',
  }

  const configFile = path.join(__dirname, 'conditionalYaml.yml')
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

test("conditionalYAML > ${file(./fixture.yml):${opt:stage, 'dev'}}", (t) => {
  t.deepEqual(config.conditionalYAML, {
    ALL: 'pass down',
    TABLE: 'DEV-table-name',
    PASSWORD: 'dev-password'
  })
})

test('conditionalYAMLTwo with prod  > ${file(./fixture.yml):prod}', (t) => {
  t.deepEqual(config.conditionalYAMLTwo, {
    ALL: 'pass down',
    TABLE: 'PROD-table-name',
    PASSWORD: 'production-password'
  })
})

test("conditionalYAMLDefault > ${file(./fixture.yml):${opt:emptyOption, 'qa'}}", (t) => {
  t.deepEqual(config.conditionalYAMLDefault, {
    ALL: 'pass down',
    TABLE: 'QA-table-name',
    PASSWORD: 'qa-password'
  })
})
