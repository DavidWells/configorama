// Type definitions for configorama variable validation
// This file provides TypeScript support for validating configuration variables

// Valid variable prefixes supported by configorama
export type KnownVariablePrefix = 'env:' | 'opt:' | 'self:' | 'file:' | 'git:' | 'cron:' | 'param:'

// Quoted string literal type for fallback values
type QuotedString = `"${string}"` | `'${string}'`

// Helper to detect unknown variable prefixes (for validation)
type UnknownVariablePrefix<S extends string> = S extends `\${${string}:${string}}`
  ? S extends `\${${KnownVariablePrefix}${string}}`
    ? never
    : S
  : never

// Helper to exclude spaces or commas in the key section
type NoCommaOrSpace<S extends string> = S extends `${string} ${string}`
  ? never
  : S extends `${string},${string}`
  ? never
  : S

// Main prefix token that must not include spaces or commas
type PrefixedKey = NoCommaOrSpace<string>

// Helper for recursively building dot-prop paths from an object
export type ObjectPaths<T> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object ? `${K}` | `${K}.${ObjectPaths<T[K]>}` : `${K}`
    }[keyof T & string]
  : never

// Variables with fallback values (fully validated)
type PrefixedVariableWithFallbackNumber = `\${${KnownVariablePrefix}${PrefixedKey}, ${number}}`
type PrefixedVariableWithFallbackString = `\${${KnownVariablePrefix}${PrefixedKey}, ${QuotedString}}`
type PrefixedVariableWithFallbackBoolean = `\${${KnownVariablePrefix}${PrefixedKey}, ${boolean}}`

// Variables without fallback values (prefix-only)
type PrefixedVariableNoFallback = `\${${KnownVariablePrefix}${PrefixedKey}}`

// Self-reference (dot-prop) variables
type SelfReferenceVariable<Root> = `\${${ObjectPaths<Root>}}`

// Generic dot-prop variables (non-typed)
type GenericDotPropVariable = `\${${string}.${string}}`

// Union of all variable styles supported – narrowed by the primitive type T
export type VariableToken<T, Root> = T extends string
  ? PrefixedVariableWithFallbackString | PrefixedVariableNoFallback | SelfReferenceVariable<Root> | GenericDotPropVariable
  : T extends number
  ? PrefixedVariableWithFallbackNumber | PrefixedVariableNoFallback | SelfReferenceVariable<Root> | GenericDotPropVariable
  : T extends boolean  
  ? PrefixedVariableWithFallbackBoolean | PrefixedVariableNoFallback | SelfReferenceVariable<Root> | GenericDotPropVariable
  : never

// Resolution rule for primitive types
export type ResolvedPrimitive<T, Root> = T extends string 
  ? T | VariableToken<T, Root>
  : T | VariableToken<T, Root>

// Recursively resolve all values in an object tree
export type DeepResolved<T, Root = T> = T extends object
  ? { [K in keyof T]: DeepResolved<T[K], Root> }
  : ResolvedPrimitive<T, Root>

// Generic configuration resolver function type
export type ConfigResolver<T> = (config: DeepResolved<T>) => DeepResolved<T>

// Example usage with a custom config interface:
/*
interface MyConfig {
  database: {
    host: string
    port: number
    ssl: boolean
  }
  api: {
    baseUrl: string
    timeout: number
  }
}

// This type allows variables in your config while maintaining type safety
type ResolvedMyConfig = DeepResolved<MyConfig>

// Usage example:
const config: ResolvedMyConfig = {
  database: {
    host: '${env:DB_HOST, "localhost"}',     // ✅ String with quoted fallback
    port: '${env:DB_PORT, 5432}',            // ✅ Number with unquoted fallback
    ssl: '${env:SSL_ENABLED, false}'         // ✅ Boolean with unquoted fallback
  },
  api: {
    baseUrl: '${env:API_URL}',               // ✅ Variable without fallback
    timeout: '${api.defaultTimeout}'         // ✅ Dot-prop reference
  }
}

// These would cause TypeScript errors:
const badConfig: ResolvedMyConfig = {
  database: {
    host: '${env:DB_HOST, localhost}',       // ❌ Unquoted string fallback
    port: '${env:DB_PORT, "5432"}',          // ❌ Quoted number fallback
    ssl: '${env:SSL_ENABLED, "false"}'       // ❌ Quoted boolean fallback
  },
  api: {
    baseUrl: '${unknownPrefix:API_URL}',     // ❌ Unknown variable prefix
    timeout: 5000
  }
}
*/