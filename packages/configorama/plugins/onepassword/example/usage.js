/* Example usage of the 1Password resolver plugin
   Run with a signed-in op CLI: node usage.js */
const path = require('path')
const configorama = require('../../../src')
const createOnePasswordResolver = require('../index')

const opResolver = createOnePasswordResolver({
  refs: {
    npm: 'op://production/npm-automation/notesPlain',
    database: {
      item: 'database-prod',
      vault: 'production',
      field: 'password',
    },
  },
})

async function main() {
  const config = await configorama(path.join(__dirname, 'config.yml'), {
    variableSources: [opResolver],
  })
  console.log('resolved keys', Object.keys(config))
}

main().catch((err) => {
  console.error('example failed', err.message)
  process.exit(1)
})
