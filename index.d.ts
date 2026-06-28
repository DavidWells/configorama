// Type definitions for configorama
// Project: https://github.com/DavidWells/configorama

interface ConfigoramaSettings {
  /** Options to populate for ${opt:xyz}. These could be CLI flags */
  options?: Record<string, any>
  /** Regex of variable syntax */
  syntax?: string
  /** cwd of config. Needed if raw object passed in instead of file path */
  configDir?: string
  /** Array of custom variable sources */
  variableSources?: any[]
  /** Object of custom filters */
  filters?: Record<string, Function>
  /** Object of custom functions */
  functions?: Record<string, Function>
  /** Parameters to populate for ${param:xyz} */
  params?: Record<string, any>

  // === Variable Resolution Options ===

  /**
   * Allow unknown variable types (unregistered resolvers) to pass through.
   * - `true`: All unknown types pass through (e.g., ${ssm:path}, ${cf:stack})
   * - `false`: Throws on unknown types
   * - `string[]`: Only specified types pass through (e.g., ['ssm', 'cf'])
   */
  allowUnknownVariableTypes?: boolean | string[]

  /**
   * Allow known variable types that can't resolve to pass through.
   * - `true`: All unresolved variables pass through
   * - `false`: Throws when resolution fails
   * - `string[]`: Only specified types pass through (e.g., ['param', 'file'])
   */
  allowUnresolvedVariables?: boolean | string[]

  /** Allow undefined values as final results */
  allowUndefinedValues?: boolean

  /**
   * Glob-like config paths whose values should be left verbatim.
   * Useful for embedded languages that also use ${...}.
   */
  ignorePaths?: string[]

  /** Alias for ignorePaths */
  skipResolutionPaths?: string[]

  /** Disable the built-in CloudFormation and embedded-code ignore paths */
  disableDefaultIgnorePaths?: boolean

  // === Legacy Options (deprecated, use above instead) ===

  /** @deprecated Use allowUnknownVariableTypes instead */
  allowUnknownVars?: boolean
  /** @deprecated Use allowUnknownVariableTypes instead */
  allowUnknownVariables?: boolean
  /** @deprecated Use allowUnresolvedVariables: ['param'] instead */
  allowUnknownParams?: boolean
  /** @deprecated Use allowUnresolvedVariables: ['file'] instead */
  allowUnknownFileRefs?: boolean

  // === Other Options ===

  /** Values passed into .js config files if user using javascript config */
  dynamicArgs?: object | Function
  /** Return both config and metadata about variables found */
  returnMetadata?: boolean
  /** Suppress env-stage-loader logs when useDotenv/useDotEnv is enabled. Defaults to true for API calls. */
  dotEnvSilent?: boolean
  /** Enable env-stage-loader debug logs when useDotenv/useDotEnv is enabled */
  dotEnvDebug?: boolean
  /** Keys to merge in arrays of objects */
  mergeKeys?: string[]
  /** Map of file paths to override */
  filePathOverrides?: Record<string, string>
  /** Install Configorama CLI signal handlers. Defaults to false for library calls. */
  handleSignalEvents?: boolean
  /** Block executable and mutating surfaces such as JS/TS file refs, custom resolvers/functions, and dotenv. */
  safeMode?: boolean
  /** Alias for safeMode */
  safe?: boolean
  /** Restrict file/text references to allowed roots. Enabled by default in safeMode. */
  restrictFileRoots?: boolean
  /** Allowed roots for file/text references */
  allowedFileRoots?: string[]
  /** Alias for allowedFileRoots */
  safeRoots?: string[]
  /** Allow executable file refs even when safeMode is enabled */
  blockExecutableFiles?: boolean
  /** Allow custom resolvers even when safeMode is enabled */
  blockCustomResolvers?: boolean
  /** Allow custom functions even when safeMode is enabled */
  blockCustomFunctions?: boolean
  /** Allow dotenv loading even when safeMode is enabled */
  blockDotEnv?: boolean
}

interface ConfigoramaResult<T = any> {
  /** The variable syntax pattern used */
  variableSyntax: RegExp
  /** Map of variable types found */
  variableTypes: Record<string, any>
  /** The resolved configuration object */
  config: T
  /** The original unresolved configuration */
  originalConfig: any
  /** Metadata about variables found and resolved */
  metadata: any
  /** Resolution history per path for debugging */
  resolutionHistory: any
}

/**
 * Context passed to JS/TS/ESM config file functions
 * Used when config files export a function: `export default function(ctx) { ... }`
 */
interface ConfigContext<T = any> {
  /** The original unresolved configuration object */
  originalConfig: T
  /** The current (partially resolved) configuration object */
  currentConfig: T
  /** Options passed to configorama (populates ${opt:xyz} variables) */
  options: Record<string, any>
}

/** Configorama async API - returns resolved config */
declare function configorama<T = any>(
  configPathOrObject: string | object,
  settings?: ConfigoramaSettings & { returnMetadata?: false }
): Promise<T>

/** Configorama async API - returns config with metadata */
declare function configorama<T = any>(
  configPathOrObject: string | object,
  settings: ConfigoramaSettings & { returnMetadata: true }
): Promise<ConfigoramaResult<T>>

declare namespace configorama {
  // Re-export types for consumers
  export { ConfigoramaSettings, ConfigoramaResult, ConfigContext }

  /** Configorama sync API */
  export function sync<T = any>(
    configPathOrObject: string | object,
    settings?: ConfigoramaSettings
  ): T

  /** Unified introspection entry point. Returns requirements, graph, and audit, or one view. */
  export function inspect(
    configPathOrObject: string | object,
    settings?: ConfigoramaSettings & { view?: 'requirements' | 'audit' | 'graph', format?: 'json' | 'mermaid' | 'mmd' | 'dot' | 'graphviz' }
  ): Promise<any>

  /** @deprecated Use inspect(config, { view: 'requirements' }) for requirements, or returnMetadata for resolved metadata. */
  export function analyze(
    configPathOrObject: string | object,
    settings?: ConfigoramaSettings
  ): Promise<any>

  /** @deprecated Use inspect(config) for the unified inspection model. */
  export function introspect(
    configPathOrObject: string | object,
    settings?: ConfigoramaSettings
  ): Promise<any>

  /** @deprecated Use inspect(config, { view: 'audit' }). */
  export function audit(
    configPathOrObject: string | object,
    settings?: ConfigoramaSettings
  ): Promise<any>

  /** @deprecated Use inspect(config, { view: 'graph', format }). */
  export function graph(
    configPathOrObject: string | object,
    settings?: ConfigoramaSettings & { format?: 'json' | 'mermaid' | 'mmd' | 'dot' | 'graphviz', formatGraph?: boolean }
  ): Promise<any>

  /** Format utilities for parsing various config formats */
  export const format: {
    yaml: any
    json: any
    toml: any
    ini: any
    hcl: any
    markdown: any
  }

  /** The Configorama class for advanced usage */
  export const Configorama: any

  /** Build variable syntax regex */
  export function buildVariableSyntax(
    prefix?: string,
    suffix?: string,
    excludePatterns?: string[]
  ): string
}

export = configorama
