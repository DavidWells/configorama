const path = require('path')
const configorama = require('../src')
const args = require('minimist')(process.argv.slice(2))
const deepLog = require('../src/utils/ui/deep-log')

const configFilePath = path.join(__dirname, '../tests/_fixtures/a.yml')
const config = configorama.sync(configFilePath, {
  options: args,
  allowUnknownVars: true,
})

deepLog('resolved config', config)
