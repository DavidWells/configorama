/* CloudFormation stack output variable source */
const { useCredentials } = require('./credentials')

const CF_PREFIX = 'cf'
// Supports: cf:stack.output, cf(region):stack.output, cf(account:region):stack.output
const cfVariableSyntax = RegExp(/^cf(\([a-z0-9_-]+(:[a-z0-9_-]+)?\))?:/i)

/**
 * Creates a CloudFormation variable source resolver.
 *
 * Syntax:
 *   ${cf:stackName.outputKey}                       — default region, default creds
 *   ${cf(region):stackName.outputKey}               — explicit region, default creds
 *   ${cf(account:region):stackName.outputKey}       — explicit account alias + region
 *
 * `account` is an env-var-prefix alias matching `{ACCOUNT}_AWS_ACCESS_KEY_ID`
 * (case-insensitive). E.g., with PROD_AWS_ACCESS_KEY_ID set, use `cf(prod:us-west-2):…`.
 * See credentials.js for the discovery rules.
 *
 * @param {object} options - Configuration options
 * @param {object} [options.credentials] - AWS credentials (bypasses env-var discovery)
 * @param {string} [options.defaultRegion] - Default region if not specified in variable
 * @param {boolean} [options.skipResolution] - Skip AWS calls, just collect metadata
 * @param {object} [options.clientOptions] - Additional options passed to CloudFormation client
 * @returns {object} Variable source configuration with resolver and metadata collector
 */
function createCloudFormationResolver(options = {}) {
  const {
    credentials,
    defaultRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
    skipResolution = false,
    clientOptions = {}
  } = options

  const cfReferences = []

  // Clients are cached per (account, region) — different accounts cannot share a
  // client because the provider chain memoizes credentials on first resolve.
  const clientCache = new Map()
  const outputCache = new Map()

  async function getClient(region, account) {
    const cacheKey = `${account || 'default'}:${region}`
    if (clientCache.has(cacheKey)) {
      return clientCache.get(cacheKey)
    }

    const { CloudFormationClient } = await import('@aws-sdk/client-cloudformation')
    const { fromNodeProviderChain } = await import('@aws-sdk/credential-providers')

    const clientConfig = {
      region,
      credentials: credentials || fromNodeProviderChain(),
      ...clientOptions
    }

    const client = new CloudFormationClient(clientConfig)
    clientCache.set(cacheKey, client)
    return client
  }

  async function getStackOutput(stackName, outputKey, region, account = null) {
    const cacheKey = `${account || 'default'}:${region}:${stackName}`

    if (outputCache.has(cacheKey)) {
      const outputs = outputCache.get(cacheKey)
      const output = outputs.find(o => o.OutputKey === outputKey)
      return output ? output.OutputValue : null
    }

    const fetchStack = async () => {
      const client = await getClient(region, account)
      const { DescribeStacksCommand } = await import('@aws-sdk/client-cloudformation')
      const command = new DescribeStacksCommand({ StackName: stackName })

      let response
      try {
        response = await client.send(command)
      } catch (err) {
        const code = err.Code || err.name
        const accountInfo = account ? ` for account "${account}"` : ''
        const messages = {
          ExpiredToken: `AWS credentials expired${accountInfo}. Refresh your credentials and try again.`,
          AccessDenied: `Access denied to CloudFormation stack "${stackName}" in ${region}${accountInfo}. Check IAM permissions.`,
          ValidationError: `Stack "${stackName}" not found in ${region}${accountInfo}.`,
          CredentialsProviderError: `No AWS credentials found${accountInfo}. Configure credentials via environment, ~/.aws/credentials, or pass explicitly.`,
        }
        throw new Error(messages[code] || `CloudFormation error: ${err.message}`)
      }

      if (!response.Stacks || response.Stacks.length === 0) {
        throw new Error(`CloudFormation stack "${stackName}" not found in region "${region}"`)
      }

      const outputs = response.Stacks[0].Outputs || []
      outputCache.set(cacheKey, outputs)

      const output = outputs.find(o => o.OutputKey === outputKey)
      return output ? output.OutputValue : null
    }

    if (account) {
      return useCredentials(account, fetchStack)
    }
    return fetchStack()
  }

  /**
   * Parse cf: variable string.
   *
   * @param {string} varString
   * @returns {{stackName: string, outputKey: string, region: string, account: string|null}}
   */
  function parseVariable(varString) {
    let region = defaultRegion
    let account = null

    const paramsMatch = varString.match(/^cf\(([a-z0-9_-]+(?::[a-z0-9_-]+)?)\):/i)
    if (paramsMatch) {
      const params = paramsMatch[1]
      if (params.includes(':')) {
        const [accountPart, regionPart] = params.split(':')
        account = accountPart
        region = regionPart
      } else {
        region = params
      }
    }

    const withoutPrefix = varString.replace(/^cf(\([a-z0-9_-]+(?::[a-z0-9_-]+)?\))?:/i, '')

    const dotIndex = withoutPrefix.indexOf('.')
    if (dotIndex === -1) {
      throw new Error(`Invalid cf: variable syntax "${varString}". Expected format: cf:stackName.outputKey`)
    }

    const stackName = withoutPrefix.slice(0, dotIndex)
    const outputKey = withoutPrefix.slice(dotIndex + 1)

    if (!stackName || !outputKey) {
      throw new Error(`Invalid cf: variable syntax "${varString}". Both stackName and outputKey are required.`)
    }

    return { stackName, outputKey, region, account }
  }

  async function resolver(varString, opts, currentObject, valueObject) {
    const { stackName, outputKey, region, account } = parseVariable(varString)

    cfReferences.push({
      raw: valueObject.originalSource,
      resolved: `\${${varString}}`,
      stackName,
      outputKey,
      region,
      account,
      configPath: valueObject.path.join('.')
    })

    if (skipResolution) {
      const accountInfo = account ? `${account}:` : ''
      return `[CF:${accountInfo}${region}:${stackName}.${outputKey}]`
    }

    const value = await getStackOutput(stackName, outputKey, region, account)

    if (value === null) {
      const accountInfo = account ? `, account: ${account}` : ''
      throw new Error(`Output "${outputKey}" not found in CloudFormation stack "${stackName}" (region: ${region}${accountInfo})`)
    }

    return value
  }

  return {
    type: CF_PREFIX,
    source: 'remote',
    prefix: CF_PREFIX,
    syntax: '${cf:stackName.outputKey}, ${cf(region):stackName.outputKey}, or ${cf(account:region):stackName.outputKey}',
    description: 'Resolves CloudFormation stack output values (supports multi-region and multi-account)',
    match: cfVariableSyntax,
    resolver,
    metadataKey: 'cfReferences',
    collectMetadata: () => cfReferences,
    clearCache: () => {
      outputCache.clear()
      clientCache.clear()
      cfReferences.length = 0
    }
  }
}

if (require.main === module) {
  const instance = createCloudFormationResolver()
  instance.resolver(
    'cf:rbac-service-v2-dev.RBACTableArn',
    {},
    {},
    { originalSource: '${cf:rbac-service-v2-dev.RBACTableArn}', path: ['provider', 'rbacTableArn'] }
  ).then(console.log).catch(console.error)
}

module.exports = createCloudFormationResolver
module.exports.cfVariableSyntax = cfVariableSyntax
