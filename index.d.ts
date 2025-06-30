// Type definitions for configorama
// Project: https://github.com/DavidWells/configorama
// Definitions by: Claude AI

// Export the variable validation types
export * from './src/types'

// Main configorama function (async)
export default function configorama(
  configPath: string, 
  options?: {
    options?: Record<string, any>
    variableSources?: Record<string, any>
    [key: string]: any
  }
): Promise<any>

// Sync version
export function sync(
  configPath: string,
  options?: {
    options?: Record<string, any>
    variableSources?: Record<string, any>
    [key: string]: any
  }
): any

// Generic typed versions for better TypeScript experience
export function configorama<T>(
  configPath: string,
  options?: {
    options?: Record<string, any>
    variableSources?: Record<string, any>
    [key: string]: any
  }
): Promise<T>

export function sync<T>(
  configPath: string,
  options?: {
    options?: Record<string, any>
    variableSources?: Record<string, any>
    [key: string]: any
  }
): T