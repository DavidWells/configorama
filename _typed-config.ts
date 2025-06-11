// --- Type Primitives & Helpers ---
type QuotedString = `"${string}"` | `'${string}'`
type VariablePrefix = 'env:' | 'opt:' | 'self:' | 'file:' | 'git:' | 'cron:'
type ObjectPaths<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object ? `${K}` | `${K}.${ObjectPaths<T[K]>}` : `${K}`
    }[keyof T & string]
  : never

// --- Variable Pattern Definitions ---
type PrefixedVariable<T> = T extends number
  ? `\${${VariablePrefix}${string}, ${number}}`
  : T extends string
  ? `\${${VariablePrefix}${string}, ${QuotedString}}`
  : T extends boolean
  ? `\${${VariablePrefix}${string}, ${boolean}}`
  : never
type SelfReferenceVariable<Root> = `\${${ObjectPaths<Root>}}`
type VariableResolution<T, Root> = PrefixedVariable<T> | SelfReferenceVariable<Root>

// --- Recursive Resolver ---
type Resolved<T, Root> = T extends string
  ? // For strings, ONLY a valid variable is allowed. This enforces strictness.
    VariableResolution<T, Root>
  : // For numbers/booleans, allow the primitive OR a variable.
    T | VariableResolution<T, Root>
type DeepResolved<T, Root = T> = T extends object ? { [K in keyof T]: DeepResolved<T[K], Root> } : Resolved<T, Root>

// --- Configuration Interfaces ---
interface DatabaseConfig {
  host: string
  port: number
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

// --- Usage and Final Error Example ---

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
    // We'll use a valid variable for this to satisfy the strict string validation.
    lol: {
      cool: '${self:defaultCool, "beans"}',
    },
    database: {
      host: '${env:DB_HOST, "localhost"}',
      // THIS NOW WORKS! `database.host` is a valid nested path.
      test: '${database.port}',
      port: '${env:DB_PORT, 5432}',
      database: '${env:DB_NAME, "myapp"}',
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
const myConfig = createBeginResolution({
  environment: '${opt:stage, "development"}',
  lol: {
    // This is the ONLY property that will show an error.
    // The error will be the default, but correct, TypeScript error.
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

// This config is entirely valid and will now have ZERO errors.
const myValidConfig = createBeginResolution({
  environment: '${opt:stage, "development"}',
  lol: {
    cool: '${self:defaultCool, "Cool"}',
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