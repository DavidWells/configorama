/* eslint-disable no-template-curly-in-string */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')
const { deepLog } = require('../utils')

let config

process.env.envNumber = 100
process.env.MY_SECRET = 'lol hi there'

// Setup function
const setup = async () => {
  const args = {
    stage: 'dev',
    otherFlag: 'prod',
    count: 25
  }

  try {
    const configFile = path.join(__dirname, 'combined.yml')
    config = await configorama(configFile, {
      options: args,
      mergeKeys: ['Resources']
    })
    console.log(`-------------`)
    console.log(`Value count`, Object.keys(config).length)
    deepLog(config)
    // process.exit(0)
    console.log(`-------------`)
  } catch (err) {
    console.log('err', err)
    process.exit(1)
  }
}

// Teardown function
const teardown = () => {
  console.log(`-------------`)
}

test.before(setup)
test.after(teardown)

// from ymlfull
const ymlContents = {
  test: [
    {
      Resources: {
        S3Bucket: {
          Type: 'AWS::S3::Bucket',
          Properties: { BucketName: 'some-bucket-name' }
        }
      }
    },
    {
      Resources: {
        S3BucketTwo: {
          Type: 'AWS::S3::Bucket',
          Properties: { BucketName: 'some-bucket-name-two' }
        }
      }
    }
  ],
  resources: [
    {
      Resources: { ApiGatewayRestApi: { Type: 'AWS::ApiGateway::RestApi' } }
    },
    {
      Resources: {
        S3Bucket: {
          Type: 'AWS::S3::Bucket',
          Properties: { BucketName: 'some-bucket-name' }
        }
      }
    },
    {
      Resources: {
        S3BucketTwo: {
          Type: 'AWS::S3::Bucket',
          Properties: { BucketName: 'some-bucket-name-two' }
        }
      }
    },
    {
      Outputs: { CognitoUserPoolId: { Value: { Ref: 'CognitoUserPool' } } }
    }
  ]
}

test('combine files', () => {
  assert.equal(config, ymlContents)
})


test.run()
