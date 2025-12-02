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
  /** Allow unknown variables to pass through without throwing errors */
  allowUnknownVars?: boolean
  /** Allow undefined values to pass through without throwing errors */
  allowUndefinedValues?: boolean
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
  config: T
  /** Configorama options and settings */
  opts: {
    allowUnknownVariables: boolean
    allowUndefinedValues: boolean
    allowUnknownFileRefs: boolean
    allowUnresolvedVariables: boolean
    returnMetadata: boolean
    returnPreResolvedVariableDetails: boolean
    allowUnknownVars?: boolean
    dynamicArgs?: any
    options: Record<string, any>
  }
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
