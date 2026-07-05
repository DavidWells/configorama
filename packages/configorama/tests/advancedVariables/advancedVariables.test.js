const path = require('path')
const { test } = require('uvu')
const assert = require('uvu/assert')
const configorama = require('../../src')

test('advanced variables', async () => {
  const configFilePath = path.join(__dirname, 'advancedVariables.yml')
  const config = await configorama(configFilePath, {
    options: {
      stage: 'dev',
      region: 'us-west-2',
      domain: 'test.com'
    }
  })

  // Test filters
  assert.equal(config.toUpperCaseString, 'HELLO WORLD')
  assert.equal(config.toKebabCaseString, 'hello-world')
  assert.equal(config.toCamelCaseString, 'helloWorld')

  // Test functions
  assert.equal(config.mergedObjects, {
    name: 'John',
    age: 30,
    city: 'New York',
    country: 'USA'
  })

  // Test complex cron expressions
  assert.equal(config.everyWeekdayMorning, '0 9 * * 1-5')
  assert.equal(config.everyWeekendNoon, '0 12 * * 6,0')
  assert.equal(config.everyMonthFirstDay, '0 0 1 * *')
  assert.equal(config.everyQuarter, '0 0 1 */3 *')
  assert.equal(config.everyYear, '0 0 1 1 *')

  // Test git references
  assert.ok(config.gitInfo.repo)
  assert.ok(config.gitInfo.owner)
  assert.ok(config.gitInfo.branch)
  assert.ok(config.gitInfo.commit)
  assert.ok(config.gitInfo.sha1)
  assert.ok(config.gitInfo.message)
  assert.ok(config.gitInfo.remote)
  assert.ok(config.gitInfo.tag)
  assert.ok(config.gitInfo.describe)
  assert.ok(config.gitInfo.timestamp)

  // Test complex self references
  assert.equal(config.resolvedConfig.apiUrl, 'https://api-dev.test.com')
  assert.equal(config.resolvedConfig.region, 'us-west-2')
  assert.equal(config.resolvedConfig.stage, 'dev')
})

test.run() 