const path = require('path')
// Import configorama from local src directory
const configorama = require('../src') // require('configorama')

// Path to config file
const configFile = path.join(__dirname, '../tests/_fixtures/a.yml')

// Resolve config
configorama(configFile).then((resolvedConfig) => {
  console.log('resolved config')
  console.log(resolvedConfig)
})