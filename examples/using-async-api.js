const path = require('path')

const args = require('minimist')(process.argv.slice(2))
const configorama = require('../src')
const deepLog = require('../src/utils/ui/deep-log')

async function getConfig() {
  const settings = {
    options: args,
    allowUnknownVars: true,
  }
  const configFile = path.join(__dirname, '../tests/_fixtures/deep.yml')
  return configorama(configFile, settings)
}

getConfig().then((resolvedConfig) => {
  deepLog('resolved config', resolvedConfig)
})
