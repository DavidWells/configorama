/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

let config

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
  }

  try {
    const configFile = path.join(__dirname, 'conditionalYaml.yml')
    config = await configorama(configFile, {
      options: args
    })
    console.log(`-------------`)
    console.log(`Value count`, Object.keys(config).length)
    console.log(config)
    console.log(`-------------`)
  } catch (err) {
    console.log(`TEST ERROR ${__dirname}\n`, err)
    process.exit(1)
  }
}

// Teardown function
const teardown = () => {
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

test("conditionalYAML > ${file(./fixture.yml):${opt:stage, 'dev'}}", () => {
  assert.equal(config.conditionalYAML, {
    ALL: 'pass down',
    TABLE: 'DEV-table-name',
    PASSWORD: 'dev-password'
  })
})

test('conditionalYAMLTwo with prod  > ${file(./fixture.yml):prod}', () => {
  assert.equal(config.conditionalYAMLTwo, {
    ALL: 'pass down',
    TABLE: 'PROD-table-name',
    PASSWORD: 'production-password'
  })
})

test("conditionalYAMLDefault > ${file(./fixture.yml):${opt:emptyOption, 'qa'}}", () => {
  assert.equal(config.conditionalYAMLDefault, {
    ALL: 'pass down',
    TABLE: 'QA-table-name',
    PASSWORD: 'qa-password'
  })
})

test.run()
