/* typescript-config.ts */


// --- Type Primitives ---
type QuotedString = `"${string}"` | `'${string}'`;

// Prefixes remain the same, with the colon for strict validation.
type VariablePrefix = 'env:' | 'opt:' | 'self:' | 'file:' | 'git:' | 'cron:';

// --- NEW: A recursive helper to generate all dot-notation paths of an object ---
type ObjectPaths<T> = T extends object ? {
  [K in keyof T & string]: 
    // If the property is an object, recurse...
    T[K] extends object
      ? `${K}` | `${K}.${ObjectPaths<T[K]>}`
      // Otherwise, it's a leaf node.
      : `${K}`
}[keyof T & string] : never;


// --- Variable Pattern Definitions ---

// PATTERN 1: A variable with a recognized prefix and a typed fallback value. (Unchanged)
type PrefixedVariable<T> = T extends number
  ? `\${${VariablePrefix}${string}, ${number}}`
  : T extends string
    ? `\${${VariablePrefix}${string}, ${QuotedString}}`
    : T extends boolean
      ? `\${${VariablePrefix}${string}, ${boolean}}`
      : never;

// PATTERN 2: A self-reference, now powered by our new ObjectPaths helper.
type SelfReferenceVariable<Root> = `\${${ObjectPaths<Root>}}`;

// A valid variable string can be one of the two patterns. (Unchanged)
type VariableResolution<T, Root> = PrefixedVariable<T> | SelfReferenceVariable<Root>;

// --- Recursive Resolver ---

// The core logic for handling strings vs. other primitives remains the same. (Unchanged)
type Resolved<T, Root> = T extends string
  ? VariableResolution<T, Root>
  : T | VariableResolution<T, Root>;

// The recursive structure of DeepResolved remains the same. (Unchanged)
type DeepResolved<T, Root = T> = T extends object 
  ? { [K in keyof T]: DeepResolved<T[K], Root> } 
  : Resolved<T, Root>;

// --- Configuration Interfaces --- (Unchanged)

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  ssl: boolean;
  test?: string;
}

interface ApiConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
}

interface ConfigObject {
  environment: string;
  lol: {
    cool: string;
  };
  database: DatabaseConfig;
  api: ApiConfig;
  features: {
    enableNewFeature: boolean;
    debugMode: boolean;
  };
}

type ResolvedConfig = DeepResolved<ConfigObject>;

function createBeginResolution(): ResolvedConfig {
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

// Example of what now correctly fails:
function createInvalidResolution(): ResolvedConfig {
    return {
        // ... other properties
        database: {
            // @ts-expect-error Type '"${environment:DB_HOST, "localhost"}"' is not assignable.
            // Reason: 'environment:' is not a valid prefix. It would have to be a self-ref like '${environment}'.
            host: '${environment:DB_HOST, "localhost"}',

            // @ts-expect-error Type '"${env:DB_HOST, true}"' is not assignable.
            // Reason: The `host` property expects a string fallback, not a boolean.
            host2: '${env:DB_HOST, true}',
        }
    }
}
