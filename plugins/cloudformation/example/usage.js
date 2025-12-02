/* Example usage of the CloudFormation plugin with configorama */
const path = require('path')
const configorama = require('../../../src')
const createCloudFormationResolver = require('../')

async function main() {
  const configPath = path.join(__dirname, 'config.yml')

  // Create the CF resolver instance
  const cfResolver = createCloudFormationResolver({
    // Optional: override default region
    // defaultRegion: 'us-west-2',

    // Optional: pass explicit credentials
    // credentials: { accessKeyId: '...', secretAccessKey: '...' }
  })

  try {
    const result = await configorama(configPath, {
      returnMetadata: true,
      options: {
        stage: 'dev',
        region: 'us-east-1'
      },
      variableSources: [cfResolver]
    })

    console.log('=== Resolved Config ===')
    console.log(JSON.stringify(result.config, null, 2))

    console.log('\n=== CF References Metadata ===')
    console.log(JSON.stringify(result.metadata.cfReferences, null, 2))

    // Example output:
    // [
    //   {
    //     "raw": "${cf:rbac-service-v2-${self:provider.stage}.RBACTableArn}",
    //     "resolved": "${cf:rbac-service-v2-dev.RBACTableArn}",
    //     "stackName": "rbac-service-v2-dev",
    //     "outputKey": "RBACTableArn",
    //     "region": "us-east-1",
    //     "configPath": "provider.environment.RBAC_TABLE_ARN"
    //   }
    // ]

  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}

main()
