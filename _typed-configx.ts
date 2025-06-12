// --- Type Primitives & Helpers ---
type QuotedString = `"${string}"` | `'${string}'`

// Valid variable prefixes
type KnownVariablePrefix = 'env:' | 'opt:' | 'self:' | 'file:' | 'git:' | 'cron:'

// Helper ― rudimentary check to exclude spaces or commas in the key section.
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
//     These are *not* validated – we simply ensure the string matches the
//     "${prop.path.here}" shape so users don't accidentally type "${foo bar}".
// -------------------------------------------------------------------------
type SelfReferenceVariable<Root> = `\${${ObjectPaths<Root>}}`

// Union of all variable styles we support – narrowed by the primitive `T`
type VariableToken<T, Root> = T extends string
  ? PrefixedVariableWithFallbackString | SelfReferenceVariable<Root>
  : T extends number
  ? PrefixedVariableWithFallbackNumber | SelfReferenceVariable<Root>
  : T extends boolean
  ? PrefixedVariableWithFallbackBoolean | SelfReferenceVariable<Root>
  : never

// --- Recursive Resolver ---

// Resolution rule:
//   • string  ➜ must be a recognized variable token (plain strings aren't permitted here)
//   • number/boolean ➜ original primitive OR a recognized variable token
type ResolvedPrimitive<T, Root> = T extends string
  ? VariableToken<T, Root>
  : T | VariableToken<T, Root>

// Recurse over an object tree replacing every leaf with the resolved type.
type DeepResolved<T, Root = T> = T extends object
  ? { [K in keyof T]: DeepResolved<T[K], Root> }
  : ResolvedPrimitive<T, Root>

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
      port: '${env:DB_PORT, 1111}',
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
const myConfigWorking = createBeginResolution({
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