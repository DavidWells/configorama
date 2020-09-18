const path = require('path')
const serverlessConfig = path.join(__dirname, 'x.yml')
const args = require('minimist')(process.argv.slice(2))

const config = require('./lib').sync(serverlessConfig, {
  options: args,
  passThroughUnknown: true,
})

console.log(require('util').inspect(config, {showHidden: false, depth: null}))
