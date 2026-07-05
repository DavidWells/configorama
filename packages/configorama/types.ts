// --- Type Primitives & Helpers ---
type QuotedString = `"${string}"` | `'${string}'`

// Valid variable prefixes
type KnownVariablePrefix = 'env:' | 'opt:' | 'self:' | 'file:' | 'git:' | 'cron:'

// Helper to detect unknown variable prefixes (for validation)
type UnknownVariablePrefix<S extends string> = S extends `\${${string}:${string}}`
  ? S extends `\${${KnownVariablePrefix}${string}}`
    ? never
    : S
  : never

// Helper — rudimentary check to exclude spaces or commas in the key section.
//  If either a space or a comma is found the type resolves to never.
type NoCommaOrSpace<S extends string> = S extends `${string} ${string}`
  ? never
  : S extends `${string},${string}`
  ? never
  : S

// Main prefix token that must *not* include spaces / commas.
type PrefixedKey = NoCommaOrSpace<string>

// Helper for recursively building dot-prop paths from an object.
type ObjectPaths<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object ? `${K}` | `${K}.${ObjectPaths<T[K]>}` : `${K}`
    }[keyof T & string]
  : never

// ❶ ──────────── Variables *with* a fallback value (fully validated) ─────────
type PrefixedVariableWithFallbackNumber = `\${${KnownVariablePrefix}${PrefixedKey}, ${number}}`
type PrefixedVariableWithFallbackString = `\${${KnownVariablePrefix}${PrefixedKey}, ${QuotedString}}`
type PrefixedVariableWithFallbackBoolean = `\${${KnownVariablePrefix}${PrefixedKey}, ${boolean}}`

// ❷ ──────────── Variables *without* a fallback value (prefix-only) ──────────
type PrefixedVariableNoFallback = `\${${KnownVariablePrefix}${PrefixedKey}}`

// ❸ ──────────── Self-reference (dot-prop) variables ------------------------
type SelfReferenceVariable<Root> = `\${${ObjectPaths<Root>}}`

// ❹ ──────────── Generic dot-prop variables (non-typed) ───────────────────
type GenericDotPropVariable = `\${${string}.${string}}`

// Union of all variable styles we support – narrowed by the primitive `T`
type VariableToken<T, Root> = T extends string
  ? PrefixedVariableWithFallbackString | PrefixedVariableNoFallback | SelfReferenceVariable<Root> | GenericDotPropVariable
  : T extends number
  ? PrefixedVariableWithFallbackNumber | PrefixedVariableNoFallback | SelfReferenceVariable<Root> | GenericDotPropVariable
  : T extends boolean  
  ? PrefixedVariableWithFallbackBoolean | PrefixedVariableNoFallback | SelfReferenceVariable<Root> | GenericDotPropVariable
  : never

// Resolution rule:
//   • string  ➜ must be a recognized variable token OR plain string
//   • number/boolean ➜ original primitive OR a recognized variable token
type ResolvedPrimitive<T, Root> = T extends string 
  ? T | VariableToken<T, Root>
  : T | VariableToken<T, Root>

// Recurse over an object tree replacing every leaf with the resolved type.
type DeepResolved<T, Root = T> = T extends object
  ? { [K in keyof T]: DeepResolved<T[K], Root> }
  : ResolvedPrimitive<T, Root>

// --- Configuration Interfaces ---
interface DatabaseConfig {
  host: string
  port?: number
  database: string
  ssl: boolean
  test?: string
}

interface ApiConfig {
  baseUrl: string
  timeout: number
  retries: number
}

interface ConfigObject {
  environment: string
  nice?: string
  lol: { cool: string }
  database: DatabaseConfig
  api: ApiConfig
  features: { enableNewFeature: boolean; debugMode: boolean }
}

// Automagically wrapped config object
type ResolvedConfig = DeepResolved<ConfigObject>

// --- The Function with a Simple, Stable Signature ---
// We remove the complex generic constraints, as all validation is now handled by ResolvedConfig.
function createBeginResolution(config: ResolvedConfig): ResolvedConfig {
  return config
}

function createOtherResolution(config: any): ConfigObject {
  return config
}

// --- Usage and Final Error Example ---

const inlineConfig: ConfigObject = {
  environment: 'development',
  lol: {
    cool: 'beans',
  },
  database: {
    host: 'localhost',
    port: 5432,
    database: 'myapp',
    ssl: false
  },
  api: {
    baseUrl: 'http://localhost:3000',
    timeout: 5000,
    retries: 3
  },
  features: {
    enableNewFeature: true,
    debugMode: false
  }
}

function invalidConfig(): ResolvedConfig {
  return {
    // EXPECTED ERROR on environment:
    environment: '${opt:stage, development}', // Should error - missing quotes
    // UNEXPECTED ERROR on nice:
    nice: 'cool', // Should work - plain string
    lol: {
      // EXPECTED ERROR on cool:
      cool: '${self:defaultCool, 1111}', // Should error - number fallback for string field
    },
    database: {
      host: '${env:DB_HOST, "localhost"}',
      test: '${database.port}',
      port: '${env:DB_PORT, 1111}',
      database: '${env:DB_NAME, "false"}',
      ssl: '${env:SSL_ENABLED, false}'
    },
    api: {
      baseUrl: '${env:API_BASE_URL, "http://localhost:3000"}',
      timeout: 5000,
      retries: 3
    },
    features: {
      enableNewFeature: '${env:NEW_FEATURE, true}',
      debugMode: false
    }
  };
}

function configFinal(): ConfigObject {
  return {
    environment: 'development',
    lol: {
      cool: 'beans',
    },
    database: {
      host: 'localhost',
      port: 5432,
      database: 'myapp',
      ssl: false
    },
    api: {
      baseUrl: 'http://localhost:3000',
      timeout: 5000,
      retries: 3
    },
    features: {
      enableNewFeature: true,
      debugMode: false
    }
  }
}

function magicalConfig(): ResolvedConfig {
  return {
    environment: '${opt:stage, "development"}',
    nice: 'cool', // This should work now
    lol: {
      cool: '${self:defaultCool, "1111"}',
    },
    database: {
      host: '${env:DB_HOST, "localhost"}',
      test: '${database.port}',
      port: '${env:DB_PORT, 1111}',
      database: '${env:DB_NAME, "false"}',
      ssl: '${env:SSL_ENABLED, false}'
    },
    api: {
      baseUrl: '${env:API_BASE_URL, "http://localhost:3000"}',
      timeout: 5000,
      retries: 3
    },
    features: {
      enableNewFeature: '${env:NEW_FEATURE, true}',
      debugMode: false
    }
  };
}

// This config has an invalid fallback for 'cool'
const myConfigWorking = createBeginResolution({
  environment: '${opt:stage, "development"}',
  lol: {
    cool: '${self:defaultCool, "bob"}',
  },
  database: {
    host: '${env:DB_HOST, "localhost"}',
    test: '${database.host}',
    port: '${env:DB_PORT, 5432}',
    database: '${env:DB_NAME, "myapp"}',
    ssl: '${env:SSL_ENABLED, false}',
  },
  api: { baseUrl: '${env:API_BASE_URL, "http://localhost:3000"}', timeout: 5000, retries: 3 },
  features: { enableNewFeature: '${env:NEW_FEATURE, true}', debugMode: false },
})

// Test cases that should work
const workingVariables = createBeginResolution({
  environment: '${opt:stage, "development"}', // String with fallback
  lol: { cool: '${env:COOL_VALUE}' }, // String without fallback
  database: {
    host: '${env:DB_HOST, "localhost"}', // String with fallback
    port: '${env:DB_PORT, 5432}', // Number with fallback  
    database: '${env:DB_NAME}', // String without fallback
    ssl: '${env:SSL_ENABLED, false}', // Boolean with fallback
    test: '${database.host}' // Dot-prop reference
  },
  api: {
    baseUrl: '${my.config.value}', // Generic dot-prop
    timeout: 5000,
    retries: 3
  },
  features: {
    enableNewFeature: true,
    debugMode: false
  }
})

// Test cases that should fail
function shouldFailConfig(): ResolvedConfig {
  return {
    environment: '${unknownPrefix:stage, "development"}', // Should error - unknown prefix
    lol: { cool: '${env:COOL_VALUE, 123}' }, // Should error - number fallback for string
    database: {
      host: '${env:DB_HOST, "localhost"}',
      port: '${env:DB_PORT, "5432"}', // Should error - string fallback for number
      database: '${env:DB_NAME, "myapp"}',
      ssl: '${env:SSL_ENABLED, "false"}' // Should error - string fallback for boolean
    },
    api: {
      baseUrl: '${env:API_URL, "http://localhost"}',
      timeout: 5000,
      retries: 3
    },
    features: {
      enableNewFeature: '${env:NEW_FEATURE, "true"}', // Should error - string fallback for boolean
      debugMode: false
    }
  }
}

export type {
  KnownVariablePrefix,
  UnknownVariablePrefix,
  ObjectPaths,
  VariableToken,
  ResolvedPrimitive,
  DeepResolved,
  ConfigObject,
  ResolvedConfig,
  DatabaseConfig,
  ApiConfig
}

export {
  createBeginResolution,
  createOtherResolution
}