// TypeScript usage example for configorama variable validation
import type { DeepResolved, VariableToken, ObjectPaths } from '../../src/types'

// Define your configuration interface
interface DatabaseConfig {
  host: string
  port: number
  database: string
  ssl: boolean
  timeout?: number
}

interface ApiConfig {
  baseUrl: string
  timeout: number
  retries: number
  apiKey?: string
}

interface AppConfig {
  environment: string
  debug: boolean
  database: DatabaseConfig
  api: ApiConfig
  features: {
    enableNewFeature: boolean
    enableLogging: boolean
  }
}

// Create a resolved version that supports variables
type ResolvedAppConfig = DeepResolved<AppConfig>

// Example configuration with variables - this will be type-checked
const config: ResolvedAppConfig = {
  // String variables
  environment: '${opt:stage, "development"}',
  
  // Boolean variables
  debug: '${env:DEBUG_MODE, false}',
  
  database: {
    // String with fallback (must be quoted)
    host: '${env:DB_HOST, "localhost"}',
    
    // Number with fallback (must be unquoted)
    port: '${env:DB_PORT, 5432}',
    
    // Variable without fallback
    database: '${env:DB_NAME}',
    
    // Boolean with fallback
    ssl: '${env:SSL_ENABLED, true}',
    
    // Optional field with dot-prop reference
    timeout: '${database.port}'
  },
  
  api: {
    // String variable
    baseUrl: '${env:API_BASE_URL, "http://localhost:3000"}',
    
    // Plain number (not a variable)
    timeout: 5000,
    
    // Plain number
    retries: 3,
    
    // Optional field with variable
    apiKey: '${env:API_KEY}'
  },
  
  features: {
    // Boolean variable
    enableNewFeature: '${env:NEW_FEATURE, true}',
    
    // Plain boolean
    enableLogging: false
  }
}

// These configurations would cause TypeScript errors:

// ❌ Wrong fallback types
const badConfig1: ResolvedAppConfig = {
  environment: '${opt:stage, development}',  // Missing quotes around string fallback
  debug: false,
  database: {
    host: '${env:DB_HOST, "localhost"}',
    port: '${env:DB_PORT, "5432"}',          // String fallback for number field
    database: '${env:DB_NAME}',
    ssl: '${env:SSL_ENABLED, "true"}'        // String fallback for boolean field
  },
  api: {
    baseUrl: '${env:API_URL}',
    timeout: 5000,
    retries: 3
  },
  features: {
    enableNewFeature: true,
    enableLogging: false
  }
}

// ❌ Unknown variable prefix
const badConfig2: ResolvedAppConfig = {
  environment: '${unknownPrefix:stage, "development"}',  // Unknown prefix
  debug: false,
  database: {
    host: '${env:DB_HOST, "localhost"}',
    port: 5432,
    database: '${env:DB_NAME}',
    ssl: true
  },
  api: {
    baseUrl: '${env:API_URL}',
    timeout: 5000,
    retries: 3
  },
  features: {
    enableNewFeature: true,
    enableLogging: false
  }
}

// ✅ Generic function that works with any config type
function createConfigResolver<T>(config: DeepResolved<T>): DeepResolved<T> {
  return config
}

// Usage with type safety
const resolvedConfig = createConfigResolver(config)

export { config, resolvedConfig }
export type { AppConfig, ResolvedAppConfig, DatabaseConfig, ApiConfig }