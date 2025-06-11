/* typescript-config.ts */

// Type utility to handle variable resolution with fallback value validation
type QuotedString = `"${string}"` | `'${string}'`
type VariableType = 'env:' | 'opt:' | 'self:' | 'file:' | 'git:' | 'cron:'
type VariableName = `${VariableType}${string}`

type VariableResolution<T> = T extends number 
  ? `\${${VariableName}, ${number}}` 
  : T extends string 
    ? `\${${VariableName}, ${QuotedString}}` 
    : T extends boolean 
      ? `\${${VariableName}, ${boolean}}` 
      : never

type Resolved<T> = T extends string 
  ? VariableResolution<T> 
  : T | VariableResolution<T>;

// Recursively apply Resolved to all properties
type DeepResolved<T> = T extends object ? { [K in keyof T]: DeepResolved<T[K]> } : Resolved<T>

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
  database: DatabaseConfig
  api: ApiConfig
  features: {
    enableNewFeature: boolean
    debugMode: boolean
  }
}

// Apply DeepResolved to the entire config object
type ResolvedConfig = DeepResolved<ConfigObject>

function createBeginResolution(): ResolvedConfig {
  return {
    environment: '${opt:stage, "development"}',
    database: {
      host: '${env:DB_HOST, "localhost"}',
      // test: '${environment}',
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
  }
}

function configFinal(): ConfigObject {
  return {
    environment: 'development',
    database: {
      host: 'localhost',
      port: 5432,
      database: 'myapp',
      ssl: false,
    },
    api: {
      baseUrl: 'http://localhost:3000',
      timeout: 5000,
      retries: 3,
    },
    features: {
      enableNewFeature: true,
      debugMode: false,
    },
  }
}

export = createBeginResolution
