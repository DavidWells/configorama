const path = require('path')
const serverlessConfig = path.join(__dirname, 'x.yml')
const args = require('minimist')(process.argv.slice(2))
const configorama = require('./lib')
const deepLog = require('./lib/utils/deep-log')

async function getConfig() {
  const settings = {
    options: args,
    allowUnknownVars: true,
  }
  return configorama(serverlessConfig, settings)
}

getConfig().then((resolvedConfig) => {
  deepLog('resolved config', resolvedConfig)
})
