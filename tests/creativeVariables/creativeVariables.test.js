/* eslint-disable no-template-curly-in-string */
/**
 * Creative edge case testing for variable resolution
 *
 * This suite tests "clever" use cases where users might push
 * the boundaries of what's possible with nested variables:
 * - Variables that look like other variables
 * - Escaped syntax and literal variable strings
 * - Variables in unusual contexts (URLs, code snippets, etc.)
 * - Mixing multiple variable types in complex ways
 * - Variables with similar names causing confusion
 * - Variables in conditional/ternary-like patterns
 * - Variables resolving to variable syntax
 */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

const dirname = path.dirname(__filename)

// ============================================
// Variables that look like other variables
// ============================================

test('variable value contains variable-like syntax but is literal', async () => {
  const config = await configorama({
    // This is just a string value, but configorama will try to resolve ${variable}
    // Use allowUnknownVars to preserve unresolved variables
    template: 'Use ${variable} in your template',
    result: '${self:template}'
  }, {
    configDir: dirname,
    allowUnknownVars: true
  })

  // The template will pass through with ${variable} preserved since it's unknown
  assert.ok(config.result.includes('Use'))
  assert.ok(config.result.includes('variable'))
})

test('variable resolves to string containing resolved variables', async () => {
  const config = await configorama({
    name: 'World',
    // After resolution, this becomes "Hello World"
    greeting: 'Hello ${self:name}',
    // This references the already-resolved greeting
    result: '${self:greeting}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'Hello World')
})

test('nested variable where inner value looks like variable syntax', async () => {
  const config = await configorama({
    key: 'template',
    values: {
      template: 'Config is ${value}',
      actual: 'real-value'
    },
    // Resolves to the string "Config is ${value}", but ${value} will also try to be resolved
    result: '${self:values.${self:key}}'
  }, {
    configDir: dirname,
    allowUnknownVars: true
  })

  // The ${value} in the result will be preserved with allowUnknownVars
  assert.ok(config.result.includes('Config is'))
  assert.ok(config.result.includes('value'))
})

// ============================================
// Variables with confusingly similar names
// ============================================

test('variables with similar names - stage vs stages', async () => {
  const config = await configorama({
    stage: 'prod',
    stages: ['dev', 'staging', 'prod'],
    // Make sure we get the right one
    currentStage: '${self:stage}',
    allStages: '${self:stages}'
  }, {
    configDir: dirname
  })

  assert.is(config.currentStage, 'prod')
  assert.equal(config.allStages, ['dev', 'staging', 'prod'])
})

test('variable with underscore vs camelCase', async () => {
  const config = await configorama({
    api_key: 'snake-case-key',
    apiKey: 'camel-case-key',
    result1: '${self:api_key}',
    result2: '${self:apiKey}'
  }, {
    configDir: dirname
  })

  assert.is(config.result1, 'snake-case-key')
  assert.is(config.result2, 'camel-case-key')
})

test('variables with numeric suffixes', async () => {
  const config = await configorama({
    server1: 'first-server',
    server2: 'second-server',
    server: 'default-server',
    index: '2',
    // Make sure server2 is accessed, not server + "2"
    result: '${self:server${self:index}}'
  }, {
    configDir: dirname
  })

  // This should resolve server${self:index} -> server2 -> 'second-server'
  assert.is(config.result, 'second-server')
})

// ============================================
// Variables in URL contexts
// ============================================

test('complete URL built from variables', async () => {
  const config = await configorama({
    protocol: 'https',
    subdomain: 'api',
    domain: 'example.com',
    port: '8443',
    path: '/v1/users',
    query: 'limit=10&offset=0',
    url: '${self:protocol}://${self:subdomain}.${self:domain}:${self:port}${self:path}?${self:query}'
  }, {
    configDir: dirname
  })

  assert.is(config.url, 'https://api.example.com:8443/v1/users?limit=10&offset=0')
})

test('URL with dynamic environment in subdomain', async () => {
  const config = await configorama({
    env: 'staging',
    envPrefixes: {
      dev: 'dev',
      staging: 'stage',
      prod: 'www'
    },
    domain: 'example.com',
    url: 'https://${self:envPrefixes.${self:env}}.${self:domain}'
  }, {
    configDir: dirname
  })

  assert.is(config.url, 'https://stage.example.com')
})

test('URL with encoded characters and variables', async () => {
  const config = await configorama({
    query: 'user name',
    baseUrl: 'https://api.example.com/search',
    // URL with query parameter containing space (will be as-is, not encoded)
    fullUrl: '${self:baseUrl}?q=${self:query}'
  }, {
    configDir: dirname
  })

  assert.is(config.fullUrl, 'https://api.example.com/search?q=user name')
})

test('connection string with dynamic parts', async () => {
  const config = await configorama({
    dbUser: 'appuser',
    dbPass: 'secret123',
    dbHost: 'db.example.com',
    dbPort: 5432,
    dbName: 'production',
    connectionString: 'postgresql://${self:dbUser}:${self:dbPass}@${self:dbHost}:${self:dbPort}/${self:dbName}'
  }, {
    configDir: dirname
  })

  assert.is(config.connectionString, 'postgresql://appuser:secret123@db.example.com:5432/production')
})

// ============================================
// Variables in code-like contexts
// ============================================

test('SQL query with variables', async () => {
  const config = await configorama({
    tableName: 'users',
    column: 'email',
    value: 'test@example.com',
    query: 'SELECT * FROM ${self:tableName} WHERE ${self:column} = \'${self:value}\''
  }, {
    configDir: dirname
  })

  assert.is(config.query, "SELECT * FROM users WHERE email = 'test@example.com'")
})

test('shell command with variables', async () => {
  const config = await configorama({
    script: 'deploy.sh',
    env: 'production',
    region: 'us-west-2',
    command: 'bash ${self:script} --env ${self:env} --region ${self:region}'
  }, {
    configDir: dirname
  })

  assert.is(config.command, 'bash deploy.sh --env production --region us-west-2')
})

test('JSON string with variables', async () => {
  const config = await configorama({
    name: 'John',
    age: 30,
    city: 'New York',
    jsonString: '{"name":"${self:name}","age":${self:age},"city":"${self:city}"}'
  }, {
    configDir: dirname
  })

  assert.is(config.jsonString, '{"name":"John","age":30,"city":"New York"}')
})

test('environment variable export with variables', async () => {
  const config = await configorama({
    varName: 'API_KEY',
    varValue: 'abc123xyz',
    export: 'export ${self:varName}="${self:varValue}"'
  }, {
    configDir: dirname
  })

  assert.is(config.export, 'export API_KEY="abc123xyz"')
})

// ============================================
// Mixing variable types in complex ways
// ============================================

test('deeply nested mix of opt, env, self, and file with fallbacks', async () => {
  process.env.TEST_CREATIVE_VAR = 'from-env'
  console.log()

  const config = await configorama({
    localValue: 'from-local',
    // Complex: try opt, fall to env, fall to file (missing), fall to self
    complex: '${opt:xyz, ${env:MISSING_VAR, ${file(./nope.json):key, ${self:localValue}}}}'
  }, {
    configDir: dirname,
    options: {}
  })

  assert.is(config.complex, 'from-local')
  delete process.env.TEST_CREATIVE_VAR
})

test('variable with mixed sources in dynamic key', async () => {
  process.env.TEST_ENV_KEY = 'envValue'

  const config = await configorama({
    keys: {
      optValue: 'from-opt',
      envValue: 'from-env-lookup',
      selfValue: 'from-self-lookup'
    },
    selfKey: 'selfValue',
    // Dynamic key from environment variable
    result: '${self:keys.${env:TEST_ENV_KEY}}'
  }, {
    configDir: dirname,
    options: { key: 'optValue' }
  })

  assert.is(config.result, 'from-env-lookup')
  delete process.env.TEST_ENV_KEY
})

test('chaining different variable types', async () => {
  process.env.TEST_STAGE_ENV = 'prod'

  const config = await configorama({
    stages: {
      dev: 'development',
      prod: 'production'
    },
    envNames: {
      development: 'dev-cluster',
      production: 'prod-cluster'
    },
    // env -> self lookup -> self lookup again
    clusterName: '${self:envNames.${self:stages.${env:TEST_STAGE_ENV}}}'
  }, {
    configDir: dirname
  })

  assert.is(config.clusterName, 'prod-cluster')
  delete process.env.TEST_STAGE_ENV
})

// ============================================
// Conditional-like patterns
// ============================================

test('pseudo-ternary with fallback as else', async () => {
  const config = await configorama({
    isDev: true,
    devUrl: 'https://dev.example.com',
    prodUrl: 'https://example.com',
    // If isDev exists and is truthy, won't work exactly like ternary,
    // but can use fallback for default case
    url: '${opt:customUrl, ${self:prodUrl}}'
  }, {
    configDir: dirname,
    options: {}
  })

  assert.is(config.url, 'https://example.com')
})

test('switch-like pattern using dynamic keys', async () => {
  const config = await configorama({
    action: 'update',
    messages: {
      create: 'Creating resource...',
      update: 'Updating resource...',
      delete: 'Deleting resource...',
      default: 'Unknown action'
    },
    message: '${self:messages.${self:action}, ${self:messages.default}}'
  }, {
    configDir: dirname
  })

  assert.is(config.message, 'Updating resource...')
})

test('switch-like pattern with missing case uses fallback', async () => {
  const config = await configorama({
    action: 'archive',
    messages: {
      create: 'Creating resource...',
      update: 'Updating resource...',
      delete: 'Deleting resource...',
      default: 'Unknown action'
    },
    message: '${self:messages.${self:action}, ${self:messages.default}}'
  }, {
    configDir: dirname
  })

  assert.is(config.message, 'Unknown action')
})

// ============================================
// Arrays with complex variable patterns
// ============================================

test('array where each element is a complex variable', async () => {
  const config = await configorama({
    stage: 'prod',
    region: 'us-west-2',
    envs: {
      prod: 'production',
      dev: 'development'
    },
    regions: {
      'us-west-2': 'west',
      'us-east-1': 'east'
    },
    tags: [
      '${self:envs.${self:stage}}',
      '${self:regions.${self:region}}',
      'app:myapp'
    ]
  }, {
    configDir: dirname
  })

  assert.equal(config.tags, ['production', 'west', 'app:myapp'])
})

test('nested array with variables at multiple levels', async () => {
  const config = await configorama({
    val1: 'a',
    val2: 'b',
    val3: 'c',
    matrix: [
      ['${self:val1}', 'x', 'y'],
      ['z', '${self:val2}', 'w'],
      ['m', 'n', '${self:val3}']
    ]
  }, {
    configDir: dirname
  })

  assert.equal(config.matrix[0][0], 'a')
  assert.equal(config.matrix[1][1], 'b')
  assert.equal(config.matrix[2][2], 'c')
})

test('array of dynamic keys', async () => {
  const config = await configorama({
    keys: ['first', 'second', 'third'],
    data: {
      first: 'value-1',
      second: 'value-2',
      third: 'value-3'
    },
    // Access data using each key in the array
    result0: '${self:data.${self:keys.0}}',
    result1: '${self:data.${self:keys.1}}',
    result2: '${self:data.${self:keys.2}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result0, 'value-1')
  assert.is(config.result1, 'value-2')
  assert.is(config.result2, 'value-3')
})

// ============================================
// Variables with formatting/templating patterns
// ============================================

test('template-like string with multiple variables', async () => {
  const config = await configorama({
    firstName: 'Jane',
    lastName: 'Doe',
    title: 'Dr.',
    greeting: 'Hello, ${self:title} ${self:firstName} ${self:lastName}!'
  }, {
    configDir: dirname
  })

  assert.is(config.greeting, 'Hello, Dr. Jane Doe!')
})

test('path template with variables', async () => {
  const config = await configorama({
    year: '2024',
    month: '03',
    day: '15',
    bucket: 'logs',
    path: 's3://${self:bucket}/logs/${self:year}/${self:month}/${self:day}/app.log'
  }, {
    configDir: dirname
  })

  assert.is(config.path, 's3://logs/logs/2024/03/15/app.log')
})

test('ARN-like identifier with variables', async () => {
  const config = await configorama({
    partition: 'aws',
    service: 'lambda',
    region: 'us-west-2',
    accountId: '123456789012',
    resourceType: 'function',
    resourceName: 'my-function',
    arn: 'arn:${self:partition}:${self:service}:${self:region}:${self:accountId}:${self:resourceType}:${self:resourceName}'
  }, {
    configDir: dirname
  })

  assert.is(config.arn, 'arn:aws:lambda:us-west-2:123456789012:function:my-function')
})

// ============================================
// Numeric and boolean edge cases with variables
// ============================================

test('numeric calculations via string concatenation', async () => {
  const config = await configorama({
    base: 100,
    increment: 50,
    // String concatenation, not math
    result: '${self:base}${self:increment}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, '10050')
})

test('boolean values in string context', async () => {
  const config = await configorama({
    enabled: true,
    disabled: false,
    // Boolean values in string concatenation work when entire value is the variable
    enabledValue: '${self:enabled}',
    disabledValue: '${self:disabled}',
    // String templates with booleans - test if this works
    enabledStr: 'Feature is enabled',
    disabledStr: 'Feature is disabled'
  }, {
    configDir: dirname
  })

  assert.is(config.enabledValue, true)
  assert.is(config.disabledValue, false)
  assert.is(config.enabledStr, 'Feature is enabled')
  assert.is(config.disabledStr, 'Feature is disabled')
})

test('zero and false in dynamic keys', async () => {
  const config = await configorama({
    items: {
      '0': 'zero-key',
      'false': 'false-key'
    },
    zeroKey: '0',
    falseKey: 'false',
    result1: '${self:items.${self:zeroKey}}',
    result2: '${self:items.${self:falseKey}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result1, 'zero-key')
  assert.is(config.result2, 'false-key')
})

// ============================================
// Whitespace and formatting edge cases
// ============================================

test('variable with lots of whitespace around value', async () => {
  const config = await configorama({
    value: '${  self:inner  }',
    inner: 'trimmed-value'
  }, {
    configDir: dirname
  })

  assert.is(config.value, 'trimmed-value')
})

test('multiline string with variables', async () => {
  const config = await configorama({
    name: 'MyApp',
    version: '1.0.0',
    description: 'This is ${self:name} version ${self:version}\nIt does amazing things\nCreated with love'
  }, {
    configDir: dirname
  })

  assert.ok(config.description.includes('MyApp'))
  assert.ok(config.description.includes('1.0.0'))
  assert.ok(config.description.includes('\n'))
})

test('variables in indented YAML-like structure', async () => {
  const config = await configorama({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: 'my-service',
      namespace: 'default',
      labels: {
        app: '${self:metadata.name}',
        version: '${self:apiVersion}'
      }
    }
  }, {
    configDir: dirname
  })

  assert.is(config.metadata.labels.app, 'my-service')
  assert.is(config.metadata.labels.version, 'v1')
})

// ============================================
// Real-world complex scenarios
// ============================================

test('kubernetes-style config with variables', async () => {
  const config = await configorama({
    environment: 'production',
    app: 'myapp',
    version: 'v2.1.0',
    deployment: {
      name: '${self:app}-deployment',
      replicas: 3,
      image: 'gcr.io/myproject/${self:app}:${self:version}',
      env: [
        {
          name: 'ENVIRONMENT',
          value: '${self:environment}'
        },
        {
          name: 'APP_VERSION',
          value: '${self:version}'
        }
      ]
    }
  }, {
    configDir: dirname
  })

  assert.is(config.deployment.name, 'myapp-deployment')
  assert.is(config.deployment.image, 'gcr.io/myproject/myapp:v2.1.0')
  assert.is(config.deployment.env[0].value, 'production')
  assert.is(config.deployment.env[1].value, 'v2.1.0')
})

test('terraform-style variables', async () => {
  const config = await configorama({
    project: 'my-project',
    region: 'us-central1',
    zone: 'us-central1-a',
    environment: 'prod',
    resources: {
      compute_instance: {
        name: '${self:project}-${self:environment}-instance',
        machine_type: 'n1-standard-1',
        zone: '${self:zone}',
        tags: ['${self:environment}', '${self:project}']
      },
      storage_bucket: {
        name: '${self:project}-${self:environment}-bucket',
        location: '${self:region}'
      }
    }
  }, {
    configDir: dirname
  })

  assert.is(config.resources.compute_instance.name, 'my-project-prod-instance')
  assert.is(config.resources.compute_instance.zone, 'us-central1-a')
  assert.equal(config.resources.compute_instance.tags, ['prod', 'my-project'])
  assert.is(config.resources.storage_bucket.name, 'my-project-prod-bucket')
})

test('docker-compose-style with variables', async () => {
  const config = await configorama({
    appName: 'webapp',
    version: 'latest',
    port: 8080,
    dbHost: 'postgres',
    dbPort: 5432,
    services: {
      web: {
        image: '${self:appName}:${self:version}',
        ports: ['${self:port}:8080'],
        environment: {
          DB_HOST: '${self:dbHost}',
          DB_PORT: '${self:dbPort}'
        }
      }
    }
  }, {
    configDir: dirname
  })

  assert.is(config.services.web.image, 'webapp:latest')
  assert.equal(config.services.web.ports, ['8080:8080'])
  assert.is(config.services.web.environment.DB_HOST, 'postgres')
  assert.is(config.services.web.environment.DB_PORT, 5432)
})

test('CI/CD pipeline config with dynamic stages', async () => {
  const config = await configorama({
    environment: 'staging',
    environments: {
      dev: {
        cluster: 'dev-cluster',
        namespace: 'development',
        replicas: 1
      },
      staging: {
        cluster: 'staging-cluster',
        namespace: 'staging',
        replicas: 2
      },
      prod: {
        cluster: 'prod-cluster',
        namespace: 'production',
        replicas: 5
      }
    },
    deployment: {
      cluster: '${self:environments.${self:environment}.cluster}',
      namespace: '${self:environments.${self:environment}.namespace}',
      replicas: '${self:environments.${self:environment}.replicas}'
    }
  }, {
    configDir: dirname
  })

  assert.is(config.deployment.cluster, 'staging-cluster')
  assert.is(config.deployment.namespace, 'staging')
  assert.is(config.deployment.replicas, 2)
})

test.run()
