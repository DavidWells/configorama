const configorama = require('./src/index.js')

// Test INI parsing
console.log('Testing INI parser...')

configorama({
  config: './test-ini.ini',
  debug: true
}).then((config) => {
  console.log('✅ INI parsing successful!')
  console.log('Config:', JSON.stringify(config, null, 2))
}).catch((error) => {
  console.log('❌ INI parsing failed:', error.message)
})