/* CloudFormation stack output variable source */
const { useCredentials } = require('./credentials')

const CF_PREFIX = 'cf'
// Updated regex to support: cf(region:accountId):stack.output or cf(region):stack.output
const cfVariableSyntax = RegExp(/^cf(\([a-z0-9-:]+\))?:/i)

/**
 * Creates a CloudFormation variable source resolver
 * Syntax:
 *   ${cf:stackName.outputKey}
 *   ${cf(region):stackName.outputKey}
 *   ${cf(region:accountId):stackName.outputKey}
 *
 * @param {object} options - Configuration options
 * @param {object} [options.credentials] - AWS credentials
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

  // Collect references for metadata
  const cfReferences = []

  // Cache for CloudFormation clients per region
  const clientCache = new Map()

  // Cache for stack outputs to avoid repeated API calls
  const outputCache = new Map()

  /**
   * Get or create CloudFormation client for a region
   */
  async function getClient(region) {
    const cacheKey = region
    if (clientCache.has(cacheKey)) {
      return clientCache.get(cacheKey)
    }

    // Lazy load AWS SDK
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

  /**
   * Fetch stack output value from CloudFormation
   */
  async function getStackOutput(stackName, outputKey, region, accountId = null) {
    const cacheKey = accountId ? `${accountId}:${region}:${stackName}` : `${region}:${stackName}`

    // Check cache first
    if (outputCache.has(cacheKey)) {
      const outputs = outputCache.get(cacheKey)
      const output = outputs.find(o => o.OutputKey === outputKey)
      return output ? output.OutputValue : null
    }

    // Function to fetch the stack (may be wrapped in credential swap)
    const fetchStack = async () => {
      const client = await getClient(region)
      const { DescribeStacksCommand } = await import('@aws-sdk/client-cloudformation')

      const command = new DescribeStacksCommand({ StackName: stackName })

      let response
      try {
        response = await client.send(command)
      } catch (err) {
        const code = err.Code || err.name
        const messages = {
          ExpiredToken: `AWS credentials expired. Refresh your credentials and try again.`,
          AccessDenied: `Access denied to CloudFormation stack "${stackName}" in ${region}. Check IAM permissions.`,
          ValidationError: `Stack "${stackName}" not found in ${region}.`,
          CredentialsProviderError: `No AWS credentials found. Configure credentials via environment, ~/.aws/credentials, or pass explicitly.`,
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

    // If accountId is provided, swap credentials
    if (accountId) {
      return await useCredentials(accountId, fetchStack)
    }

    return await fetchStack()
  }

  /**
   * Parse cf: variable string
   * Supports:
   *   cf:stack.output
   *   cf(region):stack.output
   *   cf(region:accountId):stack.output
   * @param {string} varString - e.g., "cf:stack.output", "cf(us-west-2):stack.output", "cf(us-west-2:123456789):stack.output"
   * @returns {object} { stackName, outputKey, region, accountId }
   */
  function parseVariable(varString) {
    let region = defaultRegion
    let accountId = null

    // Check for region/account in parentheses: cf(region:accountId):stack.output or cf(region):stack.output
    const paramsMatch = varString.match(/^cf\(([a-z0-9-:]+)\):/i)
    if (paramsMatch) {
      const params = paramsMatch[1]
      // Check if it contains a colon (region:accountId)
      if (params.includes(':')) {
        const parts = params.split(':')
        region = parts[0]
        accountId = parts[1]
      } else {
        // Just region
        region = params
      }
    }

    // Remove prefix (cf: or cf(params):)
    const withoutPrefix = varString.replace(/^cf(\([a-z0-9-:]+\))?:/i, '')

    // Split on first dot to get stackName and outputKey
    const dotIndex = withoutPrefix.indexOf('.')
    if (dotIndex === -1) {
      throw new Error(`Invalid cf: variable syntax "${varString}". Expected format: cf:stackName.outputKey`)
    }

    const stackName = withoutPrefix.slice(0, dotIndex)
    const outputKey = withoutPrefix.slice(dotIndex + 1)

    if (!stackName || !outputKey) {
      throw new Error(`Invalid cf: variable syntax "${varString}". Both stackName and outputKey are required.`)
    }

    return { stackName, outputKey, region, accountId }
  }

  /**
   * Resolver function called for each cf: variable
   */
  async function resolver(varString, opts, currentObject, valueObject) {
    const { stackName, outputKey, region, accountId } = parseVariable(varString)

    // Collect reference for metadata
    cfReferences.push({
      raw: valueObject.originalSource,
      resolved: `\${${varString}}`,
      stackName,
      outputKey,
      region,
      accountId,
      configPath: valueObject.path.join('.')
    })

    // Skip AWS call if skipResolution is enabled
    if (skipResolution) {
      const accountInfo = accountId ? `:${accountId}` : ''
      return `[CF:${region}${accountInfo}:${stackName}.${outputKey}]`
    }

    const value = await getStackOutput(stackName, outputKey, region, accountId)

    if (value === null) {
      const accountInfo = accountId ? ` account: ${accountId},` : ''
      throw new Error(`Output "${outputKey}" not found in CloudFormation stack "${stackName}" (region: ${region},${accountInfo})`)
    }

    return value
  }

  return {
    type: CF_PREFIX,
    source: 'remote',
    prefix: CF_PREFIX,
    syntax: '${cf:stackName.outputKey}, ${cf(region):stackName.outputKey}, or ${cf(region:accountId):stackName.outputKey}',
    description: 'Resolves CloudFormation stack output values (supports multi-region and multi-account)',
    match: cfVariableSyntax,
    resolver,
    metadataKey: 'cfReferences',
    collectMetadata: () => cfReferences,
    // Expose for testing/advanced use
    clearCache: () => {
      outputCache.clear()
      cfReferences.length = 0
    }
  }
}

if (require.main === module) {
  const instance = createCloudFormationResolver()
  instance.resolver(
    'cf:rbac-service-v2-dev.RBACTableArn',
    {}, // opts
    {}, // currentObject
    { originalSource: '${cf:rbac-service-v2-dev.RBACTableArn}', path: ['provider', 'rbacTableArn'] }
  ).then(console.log).catch(console.error)
}

module.exports = createCloudFormationResolver
module.exports.cfVariableSyntax = cfVariableSyntax
