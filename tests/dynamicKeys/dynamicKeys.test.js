/* eslint-disable no-template-curly-in-string */
/**
 * Edge case testing for dynamic/nested key resolution
 *
 * This test suite covers clever edge cases users might encounter with:
 * - Multiple levels of dynamic key indirection
 * - Dynamic keys in complex object paths
 * - Dynamic array indices with nested variables
 * - Dynamic keys combined with fallbacks
 * - Dynamic keys in file references
 * - String interpolation with dynamic keys
 * - Cross-referencing between objects using dynamic keys
 */
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../../src')

const dirname = path.dirname(__filename)

// ============================================
// Multiple levels of dynamic key indirection
// ============================================

test('double nested dynamic key - two levels of indirection', async () => {
  const config = await configorama({
    finalKey: 'value',
    middleKey: 'finalKey',
    startKey: 'middleKey',
    // Resolves: startKey -> "middleKey" -> middleKey -> "finalKey" -> finalKey -> "value"
    result: '${self:${self:${self:startKey}}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'value')
})

test('triple nested dynamic key with object paths', async () => {
  const config = await configorama({
    data: {
      prod: {
        db: {
          host: 'prod-db.example.com'
        }
      }
    },
    envKey: 'prod',
    typeKey: 'db',
    propKey: 'host',
    // Resolves through 3 dynamic keys
    result: '${self:data.${self:envKey}.${self:typeKey}.${self:propKey}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'prod-db.example.com')
})

test('nested dynamic key that resolves to another path with variable', async () => {
  const config = await configorama({
    stage: 'prod',
    paths: {
      prod: 'configs.production.url'
    },
    configs: {
      production: {
        url: 'https://prod.example.com'
      }
    },
    // First resolve paths.${stage} to get "configs.production.url", then resolve that
    result: '${self:${self:paths.${self:stage}}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'https://prod.example.com')
})

// ============================================
// Dynamic keys in complex object paths
// ============================================

test('dynamic key in middle of path', async () => {
  const config = await configorama({
    environment: 'staging',
    settings: {
      staging: {
        api: {
          endpoint: 'https://staging-api.example.com'
        }
      },
      production: {
        api: {
          endpoint: 'https://api.example.com'
        }
      }
    },
    result: '${self:settings.${self:environment}.api.endpoint}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'https://staging-api.example.com')
})

test('multiple dynamic keys in same path', async () => {
  const config = await configorama({
    cloud: 'aws',
    region: 'us-east-1',
    resources: {
      aws: {
        'us-east-1': {
          bucket: 'my-bucket-east'
        },
        'us-west-2': {
          bucket: 'my-bucket-west'
        }
      },
      gcp: {
        'us-central1': {
          bucket: 'my-bucket-central'
        }
      }
    },
    result: '${self:resources.${self:cloud}.${self:region}.bucket}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'my-bucket-east')
})

test('dynamic key at start of path', async () => {
  const config = await configorama({
    rootKey: 'databases',
    databases: {
      primary: 'postgres://db1.example.com'
    },
    result: '${self:${self:rootKey}.primary}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'postgres://db1.example.com')
})

test('dynamic key at end of path', async () => {
  const config = await configorama({
    propertyName: 'port',
    server: {
      host: 'localhost',
      port: 3000
    },
    result: '${self:server.${self:propertyName}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 3000)
})

// ============================================
// Dynamic array indices
// ============================================

test('dynamic array index - simple', async () => {
  const config = await configorama({
    servers: ['server1.example.com', 'server2.example.com', 'server3.example.com'],
    index: 1,
    result: '${self:servers.${self:index}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'server2.example.com')
})

test('nested dynamic array indices', async () => {
  const config = await configorama({
    matrix: [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', 'h', 'i']
    ],
    row: 1,
    col: 2,
    result: '${self:matrix.${self:row}.${self:col}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'f')
})

test('dynamic index resolves to another variable', async () => {
  const config = await configorama({
    items: ['first', 'second', 'third'],
    indexKey: 'selectedIndex',
    selectedIndex: 2,
    result: '${self:items.${self:${self:indexKey}}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'third')
})

test('array of objects with dynamic property access', async () => {
  const config = await configorama({
    environments: [
      { name: 'dev', url: 'https://dev.example.com' },
      { name: 'staging', url: 'https://staging.example.com' },
      { name: 'prod', url: 'https://example.com' }
    ],
    envIndex: 2,
    prop: 'url',
    result: '${self:environments.${self:envIndex}.${self:prop}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'https://example.com')
})

// ============================================
// Dynamic keys with fallbacks
// ============================================

test('dynamic key with fallback when key missing', async () => {
  const config = await configorama({
    keyName: 'missingKey',
    data: {
      existingKey: 'exists'
    },
    result: '${self:data.${self:keyName}, "fallback-value"}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'fallback-value')
})

test('dynamic key itself has fallback', async () => {
  const config = await configorama({
    data: {
      defaultKey: 'default-value'
    },
    // keyName is missing, so use "defaultKey" as fallback
    result: '${self:data.${self:keyName, "defaultKey"}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'default-value')
})

test('nested fallbacks in dynamic key chain', async () => {
  const config = await configorama({
    configs: {
      backup: 'backup-value'
    },
    result: '${self:configs.${opt:primary, ${opt:secondary, "backup"}}, "ultimate-fallback"}'
  }, {
    configDir: dirname,
    options: {}
  })

  assert.is(config.result, 'backup-value')
})

test('dynamic key with variable in fallback', async () => {
  const config = await configorama({
    defaultEnv: 'production',
    urls: {
      production: 'https://example.com'
    },
    // envKey is missing, use defaultEnv as key
    result: '${self:urls.${self:envKey, ${self:defaultEnv}}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'https://example.com')
})

// ============================================
// String interpolation with dynamic keys
// ============================================

test('dynamic key in string interpolation', async () => {
  const config = await configorama({
    tier: 'premium',
    prefixes: {
      basic: 'free',
      premium: 'paid',
      enterprise: 'enterprise'
    },
    result: 'user-${self:prefixes.${self:tier}}-account'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'user-paid-account')
})

test('multiple dynamic keys in same string', async () => {
  const config = await configorama({
    protocol: 'https',
    region: 'us-west-2',
    domains: {
      'us-west-2': 'west.example.com',
      'us-east-1': 'east.example.com'
    },
    protocols: {
      https: 'secure',
      http: 'unsecure'
    },
    result: '${self:protocols.${self:protocol}}://${self:domains.${self:region}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'secure://west.example.com')
})

test('dynamic key with static text around it', async () => {
  const config = await configorama({
    envType: 'staging',
    suffixes: {
      dev: 'development',
      staging: 'stage',
      prod: 'production'
    },
    result: 'app-${self:suffixes.${self:envType}}.example.com'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'app-stage.example.com')
})

// ============================================
// Dynamic keys with special characters
// ============================================

test('dynamic key resolves to path with dashes', async () => {
  const config = await configorama({
    service: 'user-service',
    endpoints: {
      'user-service': 'https://users.example.com',
      'order-service': 'https://orders.example.com'
    },
    result: '${self:endpoints.${self:service}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'https://users.example.com')
})

test('dynamic key with underscores', async () => {
  const config = await configorama({
    key: 'api_key_prod',
    secrets: {
      api_key_dev: 'dev-key-123',
      api_key_prod: 'prod-key-456'
    },
    result: '${self:secrets.${self:key}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'prod-key-456')
})

test('dynamic key resolves to numeric string key', async () => {
  const config = await configorama({
    year: '2024',
    data: {
      '2023': 'old-data',
      '2024': 'current-data',
      '2025': 'future-data'
    },
    result: '${self:data.${self:year}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'current-data')
})

// ============================================
// Cross-referencing with dynamic keys
// ============================================

test('dynamic key referencing between separate objects', async () => {
  const config = await configorama({
    selectedEnv: 'prod',
    environments: {
      dev: 'dbDev',
      prod: 'dbProd'
    },
    databases: {
      dbDev: 'postgres://dev-db.example.com',
      dbProd: 'postgres://prod-db.example.com'
    },
    // First get the db key name from environments, then use it to get the db URL
    result: '${self:databases.${self:environments.${self:selectedEnv}}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'postgres://prod-db.example.com')
})

test('circular dynamic key references across objects', async () => {
  const config = await configorama({
    regionKey: 'primary',
    regions: {
      primary: 'us-east-1'
    },
    services: {
      'us-east-1': {
        endpoint: 'https://use1.example.com'
      }
    },
    // regionKey -> "primary" -> regions.primary -> "us-east-1" -> services.us-east-1.endpoint
    result: '${self:services.${self:regions.${self:regionKey}}.endpoint}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'https://use1.example.com')
})

test('dynamic key chain with mixed sources - opt, self, env', async () => {
  process.env.TEST_DYNAMIC_REGION = 'west'

  const config = await configorama({
    regions: {
      west: 'us-west-2',
      east: 'us-east-1'
    },
    zones: {
      'us-west-2': 'zone-a',
      'us-east-1': 'zone-b'
    },
    // Mix opt, env, and self in dynamic key resolution
    result: '${self:zones.${self:regions.${env:TEST_DYNAMIC_REGION}}}'
  }, {
    configDir: dirname,
    options: {}
  })

  assert.is(config.result, 'zone-a')
  delete process.env.TEST_DYNAMIC_REGION
})

// ============================================
// Dynamic keys in file references
// ============================================

test('dynamic key in file reference with fallback', async () => {
  console.log()
  const config = await configorama({
    configKey: 'database',
    // File doesn't exist, should use fallback
    result: '${file(./config.json):${self:configKey}, "file-fallback"}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'file-fallback')
})

test('nested dynamic key in file path', async () => {
  console.log()
  const config = await configorama({
    envKey: 'stage',
    stage: 'production',
    // Dynamic file path with nested key resolution
    result: '${file(./config.${self:${self:envKey}}.json):value, "missing-file"}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'missing-file')
})

// ============================================
// Edge cases that should fail gracefully
// ============================================

test('dynamic key resolves to invalid path throws error', async () => {
  try {
    await configorama({
      keyName: 'invalid.path.with.dots',
      data: {
        valid: 'value'
      },
      result: '${self:data.${self:keyName}}'
    }, {
      configDir: dirname
    })
    assert.unreachable('should have thrown')
  } catch (error) {
    assert.ok(error)
    assert.ok(error.message)
  }
})

test('dynamic key is undefined without fallback throws', async () => {
  try {
    await configorama({
      data: {
        key: 'value'
      },
      // missingKey doesn't exist
      result: '${self:data.${self:missingKey}}'
    }, {
      configDir: dirname
    })
    assert.unreachable('should have thrown')
  } catch (error) {
    assert.ok(error)
    assert.ok(error.message)
  }
})

// ============================================
// Complex real-world scenarios
// ============================================

test('stage-based config with dynamic service selection', async () => {
  const config = await configorama({
    stage: 'production',
    service: 'api',
    configs: {
      development: {
        api: 'https://dev-api.example.com',
        web: 'https://dev-web.example.com'
      },
      production: {
        api: 'https://api.example.com',
        web: 'https://www.example.com'
      }
    },
    serviceUrl: '${self:configs.${self:stage}.${self:service}}'
  }, {
    configDir: dirname
  })

  assert.is(config.serviceUrl, 'https://api.example.com')
})

test('multi-tenant configuration with dynamic tenant and region', async () => {
  const config = await configorama({
    tenant: 'acme',
    region: 'eu',
    tenantConfigs: {
      acme: {
        us: {
          database: 'postgres://acme-us.db.example.com',
          cache: 'redis://acme-us.cache.example.com'
        },
        eu: {
          database: 'postgres://acme-eu.db.example.com',
          cache: 'redis://acme-eu.cache.example.com'
        }
      },
      globex: {
        us: {
          database: 'postgres://globex-us.db.example.com',
          cache: 'redis://globex-us.cache.example.com'
        }
      }
    },
    db: '${self:tenantConfigs.${self:tenant}.${self:region}.database}',
    cacheUrl: '${self:tenantConfigs.${self:tenant}.${self:region}.cache}'
  }, {
    configDir: dirname
  })

  assert.is(config.db, 'postgres://acme-eu.db.example.com')
  assert.is(config.cacheUrl, 'redis://acme-eu.cache.example.com')
})

test('feature flags with dynamic environment and feature name', async () => {
  const config = await configorama({
    environment: 'staging',
    features: {
      dev: {
        newUI: true,
        betaAPI: true,
        analytics: false
      },
      staging: {
        newUI: true,
        betaAPI: false,
        analytics: true
      },
      prod: {
        newUI: false,
        betaAPI: false,
        analytics: true
      }
    },
    checkFeature: 'newUI',
    isEnabled: '${self:features.${self:environment}.${self:checkFeature}}'
  }, {
    configDir: dirname
  })

  assert.is(config.isEnabled, true)
})

test('dynamic api versioning with fallback', async () => {
  const config = await configorama({
    apiVersion: 'v2',
    apiEndpoints: {
      v1: 'https://api.example.com/v1',
      v2: 'https://api.example.com/v2'
    },
    // Support v3 with fallback to v2
    endpoint: '${self:apiEndpoints.${opt:version, ${self:apiVersion}}, ${self:apiEndpoints.v2}}'
  }, {
    configDir: dirname,
    options: {}
  })

  assert.is(config.endpoint, 'https://api.example.com/v2')
})

test('nested dynamic keys with array and object mixed', async () => {
  const config = await configorama({
    clusters: [
      { name: 'cluster1', regions: { us: 'us-west-1', eu: 'eu-west-1' } },
      { name: 'cluster2', regions: { us: 'us-east-1', eu: 'eu-central-1' } }
    ],
    clusterIndex: 1,
    regionKey: 'us',
    result: '${self:clusters.${self:clusterIndex}.regions.${self:regionKey}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'us-east-1')
})

test('conditional routing based on dynamic keys', async () => {
  const config = await configorama({
    userType: 'premium',
    routes: {
      free: {
        dashboard: '/free-dashboard',
        support: '/faq'
      },
      premium: {
        dashboard: '/premium-dashboard',
        support: '/priority-support'
      },
      enterprise: {
        dashboard: '/enterprise-dashboard',
        support: '/dedicated-support'
      }
    },
    page: 'dashboard',
    route: '${self:routes.${opt:userType, ${self:userType}}.${self:page}}'
  }, {
    configDir: dirname,
    options: {}
  })

  assert.is(config.route, '/premium-dashboard')
})

// ============================================
// Performance/stress tests
// ============================================

test('many dynamic keys in sequence', async () => {
  const config = await configorama({
    k1: 'v1',
    k2: 'v2',
    k3: 'v3',
    k4: 'v4',
    k5: 'v5',
    data: {
      v1: { v2: { v3: { v4: { v5: 'deeply-nested-value' } } } }
    },
    result: '${self:data.${self:k1}.${self:k2}.${self:k3}.${self:k4}.${self:k5}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'deeply-nested-value')
})

test('dynamic key with very long path', async () => {
  const config = await configorama({
    key: 'target',
    level1: {
      level2: {
        level3: {
          level4: {
            level5: {
              level6: {
                level7: {
                  level8: {
                    target: 'found-it'
                  }
                }
              }
            }
          }
        }
      }
    },
    result: '${self:level1.level2.level3.level4.level5.level6.level7.level8.${self:key}}'
  }, {
    configDir: dirname
  })

  assert.is(config.result, 'found-it')
})

test.run()
