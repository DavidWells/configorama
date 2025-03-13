const path = require('path')
const configorama = require('../src') // require('configorama')

const configFile = path.join(__dirname, '../tests/_fixtures/a.yml')
configorama(configFile).then((resolvedConfig) => {
  console.log('resolved config')
  console.log(resolvedConfig)
})
