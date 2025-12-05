// Type definitions for configorama
// Project: https://github.com/DavidWells/configorama

// Re-export variable validation types
export * from './src/types'

export interface ConfigoramaSettings {
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
  /** Keys to merge in arrays of objects */
  mergeKeys?: string[]
  /** Map of file paths to override */
  filePathOverrides?: Record<string, string>
}

export interface ConfigoramaResult<T = any> {
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
export interface ConfigContext<T = any> {
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

export default configorama

/** Configorama sync API */
export function sync<T = any>(
  configPathOrObject: string | object,
  settings?: ConfigoramaSettings
): T

/** Analyze config variables without resolving them */
export function analyze(
  configPathOrObject: string | object,
  settings?: ConfigoramaSettings
): Promise<any>

/** Format utilities for parsing various config formats */
export const format: {
  yaml: any
  json: any
  toml: any
  ini: any
  hcl: any
}

/** The Configorama class for advanced usage */
export const Configorama: any
