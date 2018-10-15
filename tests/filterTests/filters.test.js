import test from 'ava'
import path from 'path'
import Configorama from '../../lib'

let config

process.env.envReference = 'env var'

// This runs before all tests
test.before(async t => {
  const args = {
    stage: 'dev',
  }

  const configFile = path.join(__dirname, 'filters.yml')
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

test('toUpperCaseString normal value', (t) => {
  t.is(config.toUpperCaseString, 'VALUE')
})

test('toKebabCaseString', (t) => {
  t.is(config.toKebabCaseString, 'value-here')
})

test('stageToUpper', (t) => {
  t.is(config.stageToUpper, 'DEV')
})

test('toKebabCase TheGooseIsLoose > the-goose-is-loose', (t) => {
  t.is(config.toKebabCase, 'the-goose-is-loose')
})

test('toCamelCase what-is-up', (t) => {
  t.is(config.toCamelCase, 'whatIsUp')
})

test('valueWithAsterisk', (t) => {
  t.is(config.valueWithAsterisk, '*.MYSTAGE.COM')
})

test('deepVarTest capitalize', (t) => {
  t.is(config.deepVarTest, 'What-is-up')
})

test('deepVarTestTwo toCamelCase', (t) => {
  t.is(config.deepVarTestTwo, 'whatIsUp')
})

test('deepVarTestTwo toCamelCase', (t) => {
  t.is(config.deepVarTestTwo, 'whatIsUp')
})

test('resolvedDomainName', (t) => {
  t.is(config.resolvedDomainName, 'api-dev.my-site.com')
})
