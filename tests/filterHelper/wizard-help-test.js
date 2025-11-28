// Test wizard help text extraction
const path = require('path')
const configorama = require('../../src')
const { getHelpText } = require('../../src/utils/configWizard')

async function testWizardHelpText() {
  console.log('Testing wizard help text extraction...')

  const configFile = path.join(__dirname, 'help-filter.yml')

  // Get metadata without resolving
  const result = await configorama(configFile, {
    options: { stage: 'prod' },
    returnMetadata: true
  })

  const { metadata } = result

  console.log('Metadata:', JSON.stringify(metadata, null, 2))

  // Check if help text is in the metadata
  const uniqueVars = metadata.uniqueVariables

  for (const [key, varData] of Object.entries(uniqueVars)) {
    console.log(`\nVariable: ${key}`)
    console.log(`  Variable: ${varData.variable}`)
    console.log(`  Occurrences:`, JSON.stringify(varData.occurrences, null, 2))

    if (varData.occurrences) {
      const helpText = getHelpText(varData.occurrences)
      if (helpText) {
        console.log(`  ✓ Help text found: "${helpText}"`)
      } else {
        console.log(`  - No help text`)
      }
    }
  }

  console.log('\nTest complete!')
}

testWizardHelpText().catch(err => {
  console.error('Test failed:', err)
  process.exit(1)
})
