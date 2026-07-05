const path = require('path')
const configorama = require('../../src')

// wacky case https://github.com/serverless/serverless/issues/13102#issuecomment-3058172006

async function testCase1() {
  try {
    console.log('Testing Case 1: Complex nested variable resolution across multiple files')
    console.log('=' .repeat(60))
    
    // Set environment variables for testing
    process.env['my-aws-profile'] = 'test-profile'
    process.env['NODE_ENV'] = 'test'

    const args = {
      stage: 'dev',
      region: 'us-west-2',
      openAiApiKey: 'via arg',
    }
    
    // Create Configorama instance with the serverless.yml file
    const result = await configorama(path.join(__dirname, 'serverless.yml'), {
      // Allow unknown variables for testing purposes
      allowUnknownVars: true,
      // Enable verbose output to see what's happening
      verbose: true,
      options: args
    })
    
    console.log('\nInitializing Configorama...')
  
    
    console.log('\n✅ Configuration parsed successfully!')
    console.log('\nFinal resolved configuration:')
    console.log(JSON.stringify(result, null, 2))
    
  } catch (error) {
    console.error('\n❌ Error parsing configuration:')
    console.error(error.message)
    console.error('\nStack trace:')
    console.error(error.stack)
  }
}

// Run the test
testCase1()
