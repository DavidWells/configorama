/* CloudFormation stack output variable source */
const CF_PREFIX = 'cf'
const cfVariableSyntax = RegExp(/^cf(\([a-z0-9-]+\))?:/i)

/**
 * Creates a CloudFormation variable source resolver
 * Syntax: ${cf:stackName.outputKey} or ${cf(region):stackName.outputKey}
 *
 * @param {object} options - Configuration options
 * @param {object} [options.credentials] - AWS credentials
 * @param {string} [options.defaultRegion] - Default region if not specified in variable
 * @param {object} [options.clientOptions] - Additional options passed to CloudFormation client
 * @returns {object} Variable source configuration with resolver and metadata collector
 */
function createCloudFormationResolver(options = {}) {
  const {
    credentials,
    defaultRegion = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
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

    const clientConfig = {
      region,
      ...clientOptions
    }
    if (credentials) {
      clientConfig.credentials = credentials
    }

    const client = new CloudFormationClient(clientConfig)
    clientCache.set(cacheKey, client)
    return client
  }

  /**
   * Fetch stack output value from CloudFormation
   */
  async function getStackOutput(stackName, outputKey, region) {
    const cacheKey = `${region}:${stackName}`

    // Check cache first
    if (outputCache.has(cacheKey)) {
      const outputs = outputCache.get(cacheKey)
      const output = outputs.find(o => o.OutputKey === outputKey)
      return output ? output.OutputValue : null
    }

    const client = await getClient(region)
    const { DescribeStacksCommand } = await import('@aws-sdk/client-cloudformation')

    const command = new DescribeStacksCommand({ StackName: stackName })

    const response = await client.send(command)

    if (!response.Stacks || response.Stacks.length === 0) {
      throw new Error(`CloudFormation stack "${stackName}" not found in region "${region}"`)
    }

    const outputs = response.Stacks[0].Outputs || []
    outputCache.set(cacheKey, outputs)

    const output = outputs.find(o => o.OutputKey === outputKey)
    return output ? output.OutputValue : null
  }

  /**
   * Parse cf: variable string
   * @param {string} varString - e.g., "cf:stack.output" or "cf(us-west-2):stack.output"
   * @returns {object} { stackName, outputKey, region }
   */
  function parseVariable(varString) {
    // Check for region in parentheses: cf(us-west-2):stack.output
    const regionMatch = varString.match(/^cf\(([a-z0-9-]+)\):/i)
    const region = regionMatch ? regionMatch[1] : defaultRegion

    // Remove prefix (cf: or cf(region):)
    const withoutPrefix = varString.replace(/^cf(\([a-z0-9-]+\))?:/i, '')

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

    return { stackName, outputKey, region }
  }

  /**
   * Resolver function called for each cf: variable
   */
  async function resolver(varString, opts, currentObject, valueObject) {
    const { stackName, outputKey, region } = parseVariable(varString)

    // Collect reference for metadata
    cfReferences.push({
      raw: valueObject.originalSource,
      resolved: `\${${varString}}`,
      stackName,
      outputKey,
      region,
      configPath: valueObject.path.join('.')
    })

    const value = await getStackOutput(stackName, outputKey, region)

    if (value === null) {
      throw new Error(`Output "${outputKey}" not found in CloudFormation stack "${stackName}" (region: ${region})`)
    }

    return value
  }

  return {
    type: CF_PREFIX,
    source: 'remote',
    prefix: CF_PREFIX,
    syntax: '${cf:stackName.outputKey} or ${cf(region):stackName.outputKey}',
    description: 'Resolves CloudFormation stack output values',
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

module.exports = createCloudFormationResolver
module.exports.cfVariableSyntax = cfVariableSyntax
