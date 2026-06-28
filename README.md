# Configorama

[![npm version](https://img.shields.io/npm/v/configorama.svg)](https://www.npmjs.com/package/configorama)
[![license](https://img.shields.io/npm/l/configorama.svg)](https://www.npmjs.com/package/configorama)
[![types](https://img.shields.io/npm/types/configorama.svg)](https://www.npmjs.com/package/configorama)

Resolve dynamic config values from environment variables, CLI flags, files, git data, expressions, and custom sources. Works with YAML, JSON, TOML, INI, HCL, Markdown, JavaScript, and TypeScript.

```bash
npm install configorama
npx configorama config.yml --stage prod
```

Configorama is a framework-agnostic variable engine for configuration files. Use it to resolve a config at runtime, inspect missing values before resolution, run an interactive setup flow, or emit requirements JSON for agents and automation.

## TL;DR

Deployment configs usually pull values from several places: env vars, CLI flags, local files, generated JavaScript, git metadata, stage-specific maps, and secret stores. Most config parsers stop at parsing, while framework-specific variable systems tend to stay tied to that framework.

Configorama loads a config file, finds variable references, resolves them in dependency order, applies filters/functions, and returns a plain JavaScript object. It can also report what the config needs before resolution.

Common use cases:

| Need | Support | Example |
|---|---|---|
| Resolve values from many sources | Built-in `env`, `option`/`opt`, `self`, `file`, `text`, `git`, `cron`, `eval`, and `if` sources | `${env:API_KEY}`, `${option:stage}`, `${file(./secrets.yml)}` |
| Keep config portable | Runs outside any framework | Use the same resolver in a CLI, build script, deploy job, or app bootstrap |
| Prompt for missing inputs | Interactive setup wizard with type-aware prompts and masked secrets | `configorama setup config.yml` |
| Tell agents what to provide | Requirements JSON with `schemaVersion`, `requirements[]`, and `ask[]` | `configorama requirements config.yml` |
| Document variables near the config | `help()` plus comment annotations for descriptions, obtain hints, examples, groups, sensitivity, and deprecation warnings | `# @from Stripe dashboard > Developers > API keys` |
| Enforce runtime constraints | Type filters and `oneOf(...)` validation | `${option:threads \| Number \| oneOf(1, 2, 4)}` |

## Quick Example

```yaml
# config.yml
service: billing-api

# Deployment stage
stage: ${option:stage | oneOf("dev", "staging", "prod")}

secrets:
  # Stripe live secret key
  # @from Stripe dashboard > Developers > API keys
  # @example sk_live_...
  # @sensitive true
  # @group Payments
  stripeSecret: ${env:STRIPE_SECRET_KEY}

database:
  host: ${env:DB_HOST, "localhost"}
  port: ${env:DB_PORT, 5432 | Number}
  name: ${self:service}-${self:stage}
```

```bash
# Resolve the config
STRIPE_SECRET_KEY=sk_live_xxx npx configorama config.yml --stage prod

# Walk through missing variables interactively
npx configorama setup config.yml

# Print requirements for agents or automation
npx configorama requirements config.yml
```

## What We Added Recently

| Area | Added |
|---|---|
| Normalized requirements model | `ConfigRequirements` groups occurrences by variable, normalizes `${opt:...}` and `${option:...}` as `variableType: "option"`, and tracks paths, defaults, types, allowed values, sensitivity, and conflicts. |
| Requirements JSON | `configorama requirements config.yml` and `configorama config.yml --requirements` emit `schemaVersion: 1`, `summary`, `requirements[]`, and environment-aware `ask[]` without resolving missing values. |
| Conflict handling | Conflicting type/default/allowed-value/annotation metadata is deterministic in the wizard. Requirements serialization fails on conflicts so agents get a clean contract. |
| Setup wizard migration | The wizard now consumes prompt descriptors derived from the requirements model, supports enum selects from `oneOf`, displays annotation details, and redacts sensitive values in setup summaries and setup stdout. |
| `oneOf(...)` validation | Runtime filter for inline literal sets and resolved list variables, including type-filter-first behavior such as `${option:threads \| Number \| oneOf(1, 2, 4)}`. |
| More type filters | `Array` and `Object` filters now validate/coerce arrays, comma-separated lists, JSON/JSON5 arrays, and JSON/JSON5 objects. |
| Option alias | `${option:name}` is supported alongside the existing `${opt:name}` shorthand. |
| Comment metadata | Leading/inline comments become help fallback; structured tags add `@description`, `@from`, `@example`, `@default`, `@sensitive`, `@group`, and `@deprecated`. |
| Documentation and fixtures | Added focused fixtures and tests for oneOf edge cases, option aliases, annotations, requirements CLI behavior, setup prompt descriptors, redaction, and display output. |

## Key Features

- **Multiple file formats** - yml, yaml, json, toml, ini, hcl (Terraform), TypeScript, JavaScript, markdown
- **Rich variable sources** - env vars, CLI flags, file refs, git data, cron expressions, eval/if expressions
- **Async/sync function execution** - Import and execute JavaScript/TypeScript files with argument passing
- **Self-referencing** - Reference other values within the same config using dot notation
- **Custom variable sources** - Pluggable architecture to add your own variable resolvers
- **Filters and functions** - Transform, coerce, constrain, and combine values with built-in or custom operators
- **Setup and requirements mode** - Prompt humans interactively or generate requirements JSON for agents
- **Comment annotations** - Keep human and agent metadata beside the config value it describes
- **Metadata extraction** - Analyze configs without resolving missing values, or get full resolution history
- **Circular dependency detection** - Helpful error messages instead of infinite loops
- **TypeScript support** - Full type definitions and TypeScript file execution via tsx/ts-node

## Table of Contents

<!-- doc-gen {TOC} collapse=true collapseText="Click to expand" -->
<details>
<summary>Click to expand</summary>

- [TL;DR](#tldr)
- [Quick Example](#quick-example)
- [What We Added Recently](#what-we-added-recently)
- [Key Features](#key-features)
- [Getting Started](#getting-started)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
  - [Running Examples](#running-examples)
- [How It Works](#how-it-works)
  - [Resolution Flow](#resolution-flow)
  - [Analyzing Without Resolving](#analyzing-without-resolving)
  - [Getting Metadata](#getting-metadata)
  - [Architecture](#architecture)
  - [Performance](#performance)
- [Variable Sources](#variable-sources)
  - [Summary Table](#summary-table)
  - [Environment Variables](#environment-variables)
  - [CLI Option Flags](#cli-option-flags)
  - [Parameter Values](#parameter-values)
  - [Self References](#self-references)
  - [File References](#file-references)
  - [Sync/Async File References](#syncasync-file-references)
    - [Passing Arguments to Functions](#passing-arguments-to-functions)
    - [ConfigContext](#configcontext)
    - [Functions Without Arguments](#functions-without-arguments)
  - [TypeScript File References](#typescript-file-references)
  - [Terraform HCL Support](#terraform-hcl-support)
  - [Git References](#git-references)
  - [Cron Values](#cron-values)
  - [Eval Expressions](#eval-expressions)
  - [If Expressions](#if-expressions)
  - [Filters (Experimental)](#filters-experimental)
  - [Functions (Experimental)](#functions-experimental)
- [Bundled Plugins](#bundled-plugins)
  - [CloudFormation](#cloudformation)
- [API Reference](#api-reference)
  - [Async API](#async-api)
  - [Sync API](#sync-api)
  - [Analyze API](#analyze-api)
  - [Format Utilities](#format-utilities)
  - [Markdown Files](#markdown-files)
  - [`buildVariableSyntax(prefix, suffix, excludePatterns?)`](#buildvariablesyntaxprefix-suffix-excludepatterns)
  - [`Configorama` Class](#configorama-class)
  - [`configorama/parse-file` Subpath](#configoramaparse-file-subpath)
  - [TypeScript Types](#typescript-types)
- [Configuration Options](#configuration-options)
  - [Custom Variable Syntax](#custom-variable-syntax)
  - [allowUnknownVariableTypes](#allowunknownvariabletypes)
  - [allowUnresolvedVariables](#allowunresolvedvariables)
  - [Complete Options Reference](#complete-options-reference)
- [Custom Variable Sources](#custom-variable-sources)
  - [Variable Source Types](#variable-source-types)
  - [Creating a Custom Resolver](#creating-a-custom-resolver)
- [Config Wizard (Experimental)](#config-wizard-experimental)
- [Agent Requirements JSON](#agent-requirements-json)
- [CLI Usage](#cli-usage)
  - [Basic Commands](#basic-commands)
  - [Command Options](#command-options)
  - [CLI Examples](#cli-examples)
- [Testing](#testing)
  - [Running Tests](#running-tests)
  - [Test Structure](#test-structure)
  - [Writing Tests](#writing-tests)
- [Deployment](#deployment)
  - [Using with Serverless Framework](#using-with-serverless-framework)
  - [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)
  - [Common Issues](#common-issues)
  - [Debug Mode](#debug-mode)
  - [Circular Dependencies](#circular-dependencies)
- [FAQ](#faq)
- [Advanced Usage](#advanced-usage)
  - [Multi-Stage Resolution](#multi-stage-resolution)
  - [Function Arguments and Context](#function-arguments-and-context)
  - [Programmatic Usage](#programmatic-usage)
- [Comparison vs Serverless Framework Variables](#comparison-vs-serverless-framework-variables)
- [Alternative Libraries](#alternative-libraries)
- [Changelog](#changelog)
- [Inspiration](#inspiration)
- [License](#license)
- [Contributing](#contributing)
- [Support](#support)

</details>
<!-- end-doc-gen -->

---

## Getting Started

### Installation

**As a library dependency:**

```bash
npm install configorama
```

**As a global CLI tool:**

```bash
npm install -g configorama
```

### Quick Start

**Async API (recommended for most use cases):**

```javascript
const path = require('path')
const configorama = require('configorama')
const cliFlags = require('minimist')(process.argv.slice(2))

// Path to yaml/json/toml config
const myConfigFilePath = path.join(__dirname, 'config.yml')

// Execute config resolution asynchronously
const config = await configorama(myConfigFilePath, { options: cliFlags })

console.log(config) // resolved config
```

**Sync API (for synchronous execution contexts):**

```javascript
const path = require('path')
const configorama = require('configorama')
const cliFlags = require('minimist')(process.argv.slice(2))

// Path to yaml/json/toml config
const myConfigFilePath = path.join(__dirname, 'config.yml')

// Execute config resolution synchronously
const config = configorama.sync(myConfigFilePath, { options: cliFlags })

console.log(config) // resolved config
```

**Example configuration file (`config.yml`):**

```yaml
# Environment variable
apiKey: ${env:API_KEY}

# CLI option (e.g., --stage prod)
environment: ${opt:stage, 'dev'}

# Self-reference to other values
service: my-app
fullName: ${service}-api

# File reference
secrets: ${file(./secrets.yml)}

# Git information
branch: ${git:branch}
commit: ${git:sha1}

# Conditional logic
memorySize: ${if(${environment} === 'prod' ? 1024 : 512)}

# Nested references
database:
  host: ${env:DB_HOST, 'localhost'}
  port: ${env:DB_PORT, 5432}
  name: ${service}-${environment}
```

### Running Examples

The project includes example files demonstrating various features:

```bash
# Clone the repository
git clone https://github.com/DavidWells/configorama
cd configorama

# Install dependencies
npm install

# Run async API example
node examples/using-async-api.js --stage prod

# Run sync API example
node examples/using-sync-api.js --stage dev

# Run zero-config example
node examples/zero-config.js

# Run TypeScript example
node examples/typescript/using-typescript.js
```

---

## How It Works

### Resolution Flow

Configorama creates a dependency graph of your config file and all its dependencies, then resolves values based on their variable sources. The resolution process follows this flow:

```mermaid
flowchart TD
    A[Load config file] --> B[Parse yml/json/toml/hcl to object]
    B --> C[Preprocess: raw config file]
    C --> D{Return metadata only?}
    D -->|Yes| E[Collect variable metadata]
    E --> F[Return found variable metadata + original config]
    D -->|No| G[Traverse & resolve variables recursively]
    G --> H[Post-process: runs filters and functions]
    H --> I[Return resolved config]
```

**Resolution process:**

1. **Load** - Read config file from disk or accept JavaScript object
2. **Parse** - Convert to JavaScript object (format auto-detected by extension)
3. **Preprocess** - Identify all variables and build dependency graph
4. **Traverse** - Recursively resolve variables in dependency order
5. **Post-process** - Apply filters and functions
6. **Return** - Fully resolved configuration object

### Analyzing Without Resolving

Analyze config structure and variables without actually resolving them:

```javascript
const result = await configorama.analyze('config.yml')

// Returns metadata about variables without resolving them
console.log(result.originalConfig)   // Raw config object
console.log(result.variables)        // All variables found
console.log(result.uniqueVariables)  // Variables grouped by name
console.log(result.fileDependencies) // File references found
```

**Use cases:**
- Validate config structure before deployment
- Generate documentation of required environment variables
- Build dependency graphs for complex configs
- Audit what external resources a config depends on

### Getting Metadata

Resolve config and get detailed metadata about the resolution process:

```javascript
const result = await configorama('config.yml', {
  returnMetadata: true,
  options: { stage: 'prod' }
})

// Returns both resolved config and metadata
console.log(result.config)                    // Fully resolved config
console.log(result.originalConfig)            // Raw config object
console.log(result.metadata.variables)        // Variable info with resolution details
console.log(result.metadata.fileDependencies) // All file dependencies
console.log(result.metadata.summary)          // { totalVariables, requiredVariables, variablesWithDefaults }
console.log(result.resolutionHistory)         // Step-by-step resolution for each path
```

**Metadata structure:**

```javascript
{
  config: { /* resolved config */ },
  originalConfig: { /* raw config */ },
  metadata: {
    variables: [
      {
        variable: '${env:API_KEY}',
        variableType: 'env',
        variableName: 'API_KEY',
        variablePath: 'apiKey',
        defaultValue: null,
        hasDefault: false,
        resolved: true,
        resolvedValue: 'secret-key-123'
      },
      // ... more variables
    ],
    summary: {
      totalVariables: 15,
      requiredVariables: 8,
      variablesWithDefaults: 7
    },
    fileDependencies: ['./secrets.yml', './config.ts']
  },
  resolutionHistory: {
    'apiKey': [
      { step: 1, value: '${env:API_KEY}', type: 'env' },
      { step: 2, value: 'secret-key-123', resolved: true }
    ]
  }
}
```

### Architecture

```
┌──────────────────┐    ┌─────────────────────┐    ┌──────────────────┐
│  Input           │───▶│  Configorama core   │───▶│  Output          │
│                  │    │                     │    │                  │
│  • Config file   │    │  parser registry    │    │  Resolved config │
│  • JS/TS object  │    │  (yaml, json, toml, │    │  (+ metadata if  │
│  • Inline opts   │    │   ini, hcl, md, …)  │    │   requested)     │
└──────────────────┘    │                     │    └──────────────────┘
                        │  preProcess()       │
                        │  ↓                  │
                        │  populateObject()   │◀───┐  iterates until
                        │  ↓                  │    │  no variables
                        │  resolve leaf vars  │────┘  remain
                        │  ↓                  │
                        │  apply filters/funcs│
                        │  ↓                  │
                        │  return             │
                        └──────────┬──────────┘
                                   │
                                   ▼
                ┌──────────────────────────────────────┐
                │           Variable Sources           │
                │ ┌────────┐ ┌────────┐ ┌────────────┐ │
                │ │ env    │ │ opt    │ │ file/text  │ │
                │ │ self   │ │ param  │ │ git/cron   │ │
                │ │ eval   │ │ if     │ │ + plugins  │ │
                │ └────────┘ └────────┘ └────────────┘ │
                │                                      │
                │  Bundled plugins:                    │
                │  • plugins/cloudformation            │
                │                                      │
                │  Custom: variableSources: [{…}]      │
                └──────────────────────────────────────┘
```

Resolution is a **fixed-point loop**: each pass resolves what it can, then `populateObject()` runs again until no `${…}` references remain. Built-in resolvers run first; custom resolvers from `variableSources` are tried in order.

### Performance

A typical 21KB serverless-style config resolves in **~3ms** on warm Node 22.

- Before/after benchmarks against the published `0.9.17` baseline: [`PERF.md`](./PERF.md)
- Reproducible bench harness: [`scripts/bench.js`](./scripts/bench.js)
- Run against your own configs:
  ```bash
  node scripts/bench.js  # local
  node scripts/bench.js /path/to/another/configorama  # A/B
  ```

If your config is slow, please open an issue with the config (or a redacted reproduction). We're happy to profile and tighten the hot path.

---

## Variable Sources

Configorama supports multiple variable sources. All variable syntax follows the pattern `${type:value}` or `${type(value)}`.

### Summary Table

| Variable | Syntax                | Description            | Example |
|----------|-----------------------|------------------------|---------|
| env      | `${env:VAR}`          | Environment variables  | `${env:NODE_ENV}` |
| option   | `${option:flag}` or `${opt:flag}` | CLI option flags (`opt` is shorthand) | `${option:stage}` |
| param    | `${param:key}`        | Parameter values       | `${param:domain}` |
| self     | `${key}` or `${self:key}` | Self references    | `${database.host}` |
| file     | `${file(path)}`       | File references        | `${file(./secrets.yml)}` |
| text     | `${text(path)}`       | Raw text file          | `${text(./README.md)}` |
| git      | `${git:value}`        | Git data               | `${git:branch}` |
| cron     | `${cron(expr)}`       | Cron expressions       | `${cron('every 5 minutes')}` |
| eval     | `${eval(expr)}`       | Math/logic expressions | `${eval(10 + 5)}` |
| if       | `${if(expr)}`         | Conditional expressions| `${if(x > 5 ? 'yes' : 'no')}` |

---

### Environment Variables

Access values from `process.env` environment variables.

```yaml
# Basic env var
apiKey: ${env:SECRET_KEY}

# With fallback default if env var not found
apiKeyWithFallback: ${env:SECRET_KEY, 'defaultApiKey'}

# Common patterns
nodeEnv: ${env:NODE_ENV, 'development'}
port: ${env:PORT, 3000}
debug: ${env:DEBUG, false}
```

**How it works:**
- Reads from `process.env` at resolution time
- Supports default values with comma syntax
- Throws error if env var not found and no default provided (unless `allowUnresolvedVariables` is set)

**CLI usage:**

```bash
# Set env var then run
SECRET_KEY=abc123 node app.js

# Or export first
export SECRET_KEY=abc123
node app.js
```

---

### CLI Option Flags

Access values from command line arguments passed via the `options` parameter.

```yaml
# CLI option. Example `cmd --stage dev` makes `bar: dev`
bar: ${opt:stage}

# Composed example makes `foo: dev-hello`
foo: ${opt:stage}-hello

# With default value. If no --stage flag, uses 'dev'
environment: ${opt:stage, 'dev'}

# Boolean flags
verbose: ${opt:verbose, false}

# Nested paths
region: ${opt:aws.region, 'us-east-1'}
```

**How it works:**
- Reads from the `options` object passed to configorama
- Typically populated from CLI args using `minimist` or similar parser
- Supports dot-notation for nested option paths

**Example:**

```javascript
const minimist = require('minimist')
const configorama = require('configorama')

const argv = minimist(process.argv.slice(2))
// argv = { stage: 'prod', verbose: true, aws: { region: 'eu-west-1' } }

const config = await configorama('config.yml', { options: argv })
```

```bash
# Command line
node app.js --stage prod --verbose --aws.region eu-west-1
```

---

### Parameter Values

Access parameter values via `${param:key}`. Parameters follow a resolution hierarchy:

1. **CLI params** (`--param="key=value"`) - highest priority
2. **Stage-specific params** (`stages.<stage>.params`)
3. **Default params** (`stages.default.params`)

```yaml
# Direct parameter reference
appDomain: ${param:domain}

# Parameter with fallback
apiKey: ${param:apiKey, 'default-api-key'}

# Stage-specific parameters defined in config
stages:
  dev:
    params:
      domain: dev.myapp.com
      dbHost: localhost
  prod:
    params:
      domain: myapp.com
      dbHost: prod-db.myapp.com
  default:
    params:
      domain: default.myapp.com
      dbPort: 3306
```

**CLI Usage:**

```bash
# Single param
node app.js --param="domain=example.com"

# Multiple params
node app.js --param="domain=example.com" --param="apiKey=secret123"

# With stage selection
node app.js --stage prod --param="domain=cli-override.com"
```

**Code Usage:**

```javascript
const config = await configorama('config.yml', {
  options: {
    stage: 'prod',
    param: ['domain=cli-override.com', 'apiKey=secret']
  }
})
```

**Resolution order example:**

```yaml
stages:
  prod:
    params:
      domain: prod.myapp.com  # 2. Stage-specific
  default:
    params:
      domain: default.myapp.com  # 3. Default fallback

appUrl: ${param:domain}
```

```bash
# CLI override (highest priority)
node app.js --stage prod --param="domain=cli.myapp.com"
# Result: appUrl = 'cli.myapp.com'

# Stage param (no CLI override)
node app.js --stage prod
# Result: appUrl = 'prod.myapp.com'

# Default param (no CLI override, no stage match)
node app.js --stage staging
# Result: appUrl = 'default.myapp.com'
```

---

### Self References

Reference values from other key paths in the same configuration file using dot notation.

```yaml
foo: bar

zaz:
  matazaz: 1
  wow:
    cool: 2

# Shorthand dot.prop reference
two: ${foo}  # Resolves to 'bar'

# Explicit self file reference
one: ${self:foo}  # Resolves to 'bar'

# Dot prop reference traverses objects
three: ${zaz.wow.cool}  # Resolves to 2

# Complex nested references
database:
  host: localhost
  port: 5432
  name: mydb

connectionString: postgres://${database.host}:${database.port}/${database.name}
# Resolves to: postgres://localhost:5432/mydb

# Array access
items:
  - first
  - second
  - third

selectedItem: ${items[1]}  # Resolves to 'second'
```

**How it works:**
- Uses dot-notation for nested object access
- Supports array index access with bracket notation
- Resolves in dependency order (referenced values resolved first)
- Detects circular references and throws helpful errors

---

### File References

Import values from external yml, json, toml, hcl, or other supported files by relative path.

```yaml
# Import full yml/json/toml/hcl file via relative path
fileRef: ${file(./subFile.yml)}

# Import sub values from files (topLevel key from other-config.yml)
fileValue: ${file(./other-config.yml):topLevel}

# Import nested sub values (nested.value from other-config.json)
fileValueSubKey: ${file(./other-config.json):nested.value}

# Fallback to default value if file not found
fallbackValueExample: ${file(./not-found.yml), 'fall back value'}

# Relative paths from config file location
secrets: ${file(../shared/secrets.yml)}

# Import from subdirectory
dbConfig: ${file(./config/database.yml):production}
```

**Supported file types (extensions are case-insensitive):**

| Type | Extensions |
|------|------------|
| TypeScript | `.ts`, `.tsx`, `.mts`, `.cts` |
| JavaScript | `.js`, `.cjs` |
| ESM | `.mjs`, `.esm` |
| YAML | `.yml`, `.yaml` |
| TOML | `.toml`, `.tml` |
| INI | `.ini` |
| JSON | `.json`, `.json5`, `.jsonc` |
| HCL (Terraform) | `.tf`, `.hcl`, `.tf.json` |
| Markdown | `.md`, `.mdx`, `.markdown`, `.mdown`, `.mkdn`, `.mkd` |

**Path resolution:**
- Relative paths resolved from config file's directory
- Absolute paths supported
- `~` home directory expansion NOT supported (use absolute paths)

**Example file structure:**

```text
project/
├── config.yml            # Main config
├── secrets.yml           # Secrets file
└── environments/
    ├── dev.yml
    └── prod.yml
```

```yaml
# config.yml
secrets: ${file(./secrets.yml)}
environment: ${file(./environments/${opt:stage}.yml)}
```

---

### Sync/Async File References

Execute JavaScript files and use their exported function's return value. Functions can be synchronous or asynchronous and receive arguments from your config.

```yaml
# Async function execution
asyncJSValue: ${file(./async-value.js)}

# Sync function execution
syncJSValue: ${file(./sync-value.js)}

# With arguments (resolved before being passed)
secrets: ${file(./fetch-secrets.js, ${self:environment}, ${self:region})}
```

**JavaScript file example (`async-value.js`):**

```javascript
async function fetchSecretsFromRemoteStore() {
  // Simulate async operation (AWS Secrets Manager, HashiCorp Vault, etc.)
  await new Promise(resolve => setTimeout(resolve, 1000))
  return {
    apiKey: 'secret-key-123',
    dbPassword: 'db-password-456'
  }
}

module.exports = fetchSecretsFromRemoteStore
```

**Sync function example (`sync-value.js`):**

```javascript
function getEnvironmentConfig() {
  return {
    timeout: 5000,
    retries: 3,
    logLevel: process.env.NODE_ENV === 'production' ? 'error' : 'debug'
  }
}

module.exports = getEnvironmentConfig
```

#### Passing Arguments to Functions

You can pass resolved values from your config as arguments to JavaScript/TypeScript functions:

```yaml
foo: bar
baz:
  qux: quux

# Pass resolved values as arguments
secrets: ${file(./fetch-secrets.js, ${self:foo}, ${self:baz})}
```

Arguments are passed in order, with the config context always last:

```javascript
/**
 * @param {string} foo - First arg from YAML ('bar')
 * @param {object} baz - Second arg from YAML ({ qux: 'quux' })
 * @param {import('configorama').ConfigContext} ctx - Config context (always last)
 */
async function fetchSecrets(foo, baz, ctx) {
  console.log(foo)  // 'bar'
  console.log(baz)  // { qux: 'quux' }

  // Access config context
  console.log(ctx.originalConfig)  // Original unresolved config
  console.log(ctx.currentConfig)   // Current partially-resolved config
  console.log(ctx.options)         // Options passed to configorama

  return { secret: 'value' }
}

module.exports = fetchSecrets
```

#### ConfigContext

The `ctx` parameter (always the last argument) provides access to:

| Property | Description |
|----------|-------------|
| `originalConfig` | The original unresolved configuration object |
| `currentConfig` | The current (partially resolved) configuration |
| `options` | Options passed to configorama (populates `${option:xyz}` / `${opt:xyz}` variables) |

**TypeScript users can import the type:**

```typescript
import type { ConfigContext } from 'configorama'

async function fetchSecrets(
  foo: string,
  baz: { qux: string },
  ctx: ConfigContext
): Promise<string> {
  // Full type support for ctx properties
  return 'secret-value'
}

export = fetchSecrets
```

#### Functions Without Arguments

If you don't need arguments, the function still receives `ctx` as its only parameter:

```javascript
// No args - ctx is the only parameter
async function getSecrets(ctx) {
  return ctx.options.stage === 'prod'
    ? 'prod-secret'
    : 'dev-secret'
}

module.exports = getSecrets
```

---

### TypeScript File References

Execute TypeScript files using tsx (recommended) or ts-node.

**Installation:**

```bash
# Recommended: Modern, fast TypeScript execution
npm install tsx --save-dev

# Alternative: Traditional ts-node approach
npm install ts-node typescript --save-dev
```

**Usage in config:**

```yaml
# TypeScript configuration object
config: ${file(./config.ts)}

# TypeScript async function
secrets: ${file(./async-secrets.ts)}

# Specific property from TypeScript export
database: ${file(./config.ts):database}

# With arguments
apiConfig: ${file(./config.ts, ${opt:stage})}
```

**TypeScript Object Export (`typescript-config.ts`):**

```typescript
interface DatabaseConfig {
  host: string
  port: number
  database: string
  ssl: boolean
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

function createConfig(): ConfigObject {
  return {
    environment: process.env.STAGE || 'development',
    database: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'myapp',
      ssl: process.env.NODE_ENV === 'production'
    },
    api: {
      baseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
      timeout: 5000,
      retries: 3
    },
    features: {
      enableNewFeature: process.env.STAGE === 'production',
      debugMode: process.env.DEBUG === 'true'
    }
  }
}

export = createConfig
```

**TypeScript Async Function (`typescript-async.ts`):**

```typescript
interface SecretStore {
  apiKey: string
  dbPassword: string
  jwtSecret: string
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchSecretsFromVault(): Promise<SecretStore> {
  console.log('Fetching secrets from vault...')

  // Simulate async operations (AWS Secrets Manager, HashiCorp Vault, etc.)
  await delay(100)

  return {
    apiKey: process.env.API_KEY || 'dev-api-key',
    dbPassword: process.env.DB_PASSWORD || 'dev-password',
    jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret'
  }
}

export = fetchSecretsFromVault
```

**Complete Example Configuration:**

```yaml
# config-with-typescript.yml
service: my-awesome-app

# Load configuration from TypeScript file
provider: ${file(./typescript-config.ts)}

# Load secrets asynchronously from TypeScript file
secrets: ${file(./typescript-async.ts)}

# Mix TypeScript with other configuration
custom:
  stage: ${opt:stage, "dev"}
  region: ${opt:region, "us-east-1"}

  # Use TypeScript files for specific sections
  databaseConfig: ${file(./typescript-config.ts):database}

  # Environment-specific overrides
  stageVariables:
    dev:
      logLevel: debug
    prod:
      logLevel: info

# Regular configuration values
resources:
  description: "Configuration loaded with TypeScript support"

functions:
  hello:
    handler: handler.hello
    environment:
      LOG_LEVEL: ${self:custom.stageVariables.${self:custom.stage}.logLevel}
      DB_HOST: ${self:provider.database.host}
      API_KEY: ${self:secrets.apiKey}
```

**Features:**
- Modern tsx execution (fast, no compilation) with ts-node fallback
- Support for both sync and async TypeScript functions
- Function argument passing via config variables
- Full TypeScript interface support
- Errors point to the failing dependency

---

### Terraform HCL Support

Configorama supports Terraform HCL (HashiCorp Configuration Language) files, allowing you to parse `.tf`, `.tf.json`, and `.hcl` files.

**Installation:**

HCL parsing requires the optional `@cdktf/hcl2json` package:

```bash
npm install @cdktf/hcl2json
```

**Supported file types:**
- `.tf` - Terraform configuration files
- `.hcl` - Generic HCL files
- `.tf.json` - Terraform JSON configuration files

**Example:**

```javascript
const configorama = require('configorama')

// Parse a Terraform configuration file
const terraformConfig = await configorama('./main.tf')

// Access Terraform variables, resources, locals, etc.
console.log(terraformConfig.variable)  // Variables defined in the file
console.log(terraformConfig.resource)  // Resources
console.log(terraformConfig.locals)    // Local values
console.log(terraformConfig.output)    // Outputs
```

**Importing Terraform files:**

```yaml
# Import Terraform variables from a .tf file
terraformVars: ${file(./terraform/variables.tf)}

# Import specific variable from Terraform file
region: ${file(./terraform/variables.tf):variable.region[0].default}
```

**Variable syntax:**

When loading `.tf` or `.hcl` files directly, configorama automatically uses `$[...]` syntax instead of `${...}` to avoid conflicts with Terraform's native `${var.name}` interpolation. Terraform expressions like `${var.environment}` and `${map(string)}` are preserved as-is.

```javascript
// Loading .tf directly - uses $[...] syntax automatically
const config = await configorama('./main.tf')
// config.locals[0].app_name = "myapp-${var.environment}" (preserved)

// Use $[...] for configorama variables in .tf files
// myvar: $[env:MY_VAR]
// myref: $[file(./other.yml)]  # referenced files also use $[...]
```

When importing `.tf` files from other config formats (yml, json, etc.) via `${file()}`, the parent file's syntax applies. Use `allowUnknownVariableTypes: true` if the imported `.tf` contains Terraform interpolations:

```javascript
const config = await configorama('./config.yml', {
  allowUnknownVariableTypes: true
})
```

**Read-only support:**

Currently, HCL files can be read and parsed, but writing/generating HCL files is not supported.

See [tests/hclTests](./tests/hclTests) for example Terraform files.

---

### Git References

Access repository information from the current working directory's git data.

<!-- doc-gen CODE src=tests/gitVariables/gitVariables.yml -->
```yml
########################
# Git Variables
########################

# Repo owner/name. E.g. DavidWells/configorama
repo: ${git:repo}
repository: ${git:repository}

# Repo owner. E.g. DavidWells
owner: ${git:owner}
repoOwner: ${git:repoOwner}
repoOwnerDashed: ${git:repo-owner}

# Url. E.g. https://github.com/DavidWells/configorama
url: ${git:url}
repoUrl: ${git:repoUrl}
repoUrlDashed: ${git:repo-url}

# Directory. E.g. https://github.com/DavidWells/configorama/tree/master/tests/gitVariables
dir: ${git:dir}
directory: ${git:directory}

# Branch
branch: ${git:branch}

# Commits. E.g. 785fa6b982d67b079d53099d57c27fa87c075211
commit: ${git:commit}

# Sha1. E.g. 785fa6b
sha1: ${git:sha1}

# Message. E.g. 'Initial commit'
message: ${git:message}

# Remotes. E.g. https://github.com/DavidWells/configorama
remote: ${git:remote}
remoteDefined: ${git:remote('origin')}
remoteDefinedNoQuotes: ${git:remote(origin)}

# Tags. E.g. v0.5.2-1-g785fa6b
tag: ${git:tag}
# Describe. E.g. v0.5.2-1-g785fa6b
describe: ${git:describe}

# Timestamp. E.g. 2025-01-28T07:28:53.000Z
gitTimestampRelativePath: ${git:timestamp('../../package.json')}
# Timestamp. E.g. 2025-01-28T07:28:53.000Z
gitTimestampAbsolutePath: ${git:timestamp('package.json')}
```
<!-- end-doc-gen -->

**How it works:**
- Reads git data from `.git` directory in current working directory or parent directories
- Executes git commands via child process
- Throws error if not in a git repository

---

### Cron Values

Convert human-readable time expressions into standard cron syntax.

```yaml
# Basic patterns
everyMinute: ${cron('every minute')}        # * * * * *
everyHour: ${cron('every hour')}            # 0 * * * *
everyDay: ${cron('every day')}              # 0 0 * * *
weekdays: ${cron('weekdays')}               # 0 0 * * 1-5
midnight: ${cron('midnight')}               # 0 0 * * *
noon: ${cron('noon')}                       # 0 12 * * *

# Interval patterns
every5Minutes: ${cron('every 5 minutes')}   # */5 * * * *
every15Minutes: ${cron('every 15 minutes')} # */15 * * * *
every2Hours: ${cron('every 2 hours')}       # 0 */2 * * *
every3Days: ${cron('every 3 days')}         # 0 0 */3 * *

# Specific times
at930: ${cron('at 9:30')}                   # 30 9 * * *
at930pm: ${cron('at 9:30 pm')}              # 30 21 * * *
at1200: ${cron('at 12:00')}                 # 0 12 * * *
at1230am: ${cron('at 12:30 am')}            # 30 0 * * *

# Weekday patterns
mondayMorning: ${cron('on monday at 9:00')}  # 0 9 * * 1
fridayEvening: ${cron('on friday at 17:00')} # 0 17 * * 5
sundayNoon: ${cron('on sunday at 12:00')}    # 0 12 * * 0

# Pre-existing cron expressions (pass through)
customCron: ${cron('15 2 * * *')}           # 15 2 * * *
```

**Supported expressions:**
- `every N minutes/hours/days`
- `at HH:MM [am/pm]`
- `on [weekday] at HH:MM`
- `midnight`, `noon`, `weekdays`
- Standard cron syntax (passed through unchanged)

---

### Eval Expressions

Evaluate mathematical and logical expressions safely (without using JavaScript's `eval`). Uses the `subscript` library for safe expression evaluation.

```yaml
# Math operations
sum: ${eval(10 + 5)}                  # 15
multiply: ${eval(10 * 3)}             # 30
divide: ${eval(100 / 4)}              # 25
modulo: ${eval(17 % 5)}               # 2

# Comparisons (returns boolean)
isGreater: ${eval(200 > 100)}         # true
isLess: ${eval(100 > 200)}            # false
isEqual: ${eval(10 == 10)}            # true

# String comparisons
isEqual: ${eval("hello" == "hello")}  # true
strictEqual: ${eval("foo" === "foo")} # true
notEqual: ${eval("a" != "b")}         # true

# Complex expressions
complex: ${eval((10 + 5) * 2)}        # 30
percentage: ${eval((75 / 100) * 200)} # 150

# With variables
threshold: 50
value: 75
aboveThreshold: ${eval(${value} > ${threshold})}  # true
```

**Supported operators:**

| Category | Operators |
|----------|-----------|
| Arithmetic | `+` `-` `*` `/` `%` |
| Comparison | `==` `!=` `===` `!==` `>` `<` `>=` `<=` |
| Logical | `&&` `\|\|` `!` |
| Grouping | `( )` |

**Security:**
- Does NOT use JavaScript's `eval()`
- Uses safe expression parser (subscript)
- No access to global scope or functions
- Only mathematical and logical operations allowed

---

### If Expressions

Conditional expressions using ternary syntax. This is an alias for `eval` with a clearer name for conditionals.

```yaml
# Basic ternary (condition ? "yes" : "no")
status: ${if(5 > 3 ? "yes" : "no")}           # "yes"

# With variables
threshold: 50
value: 75
result: ${if(${value} > ${threshold} ? "above" : "below")}  # "above"

# Nested ternary (if/else if/else)
score: 85
grade: ${if(${score} >= 90 ? "A" : ${score} >= 80 ? "B" : "C")}  # "B"

# Boolean result (no ternary needed)
isValid: ${if(${value} > 0)}               # true

# Logical operators
enabled: true
count: 5
canProceed: ${if(${enabled} && ${count} > 0)}  # true
hasIssues: ${if(!${enabled} || ${count} == 0)} # false
```

**Supported operators:**

| Category | Operators |
|----------|-----------|
| Comparison | `==` `!=` `===` `!==` `>` `<` `>=` `<=` |
| Logical | `&&` `\|\|` `!` |
| Nullish | `??` |
| Ternary | `condition ? "yes" : "no"` |

**Serverless deployment examples:**

```yaml
service: my-service

provider:
  name: aws
  stage: ${opt:stage, 'dev'}
  region: ${opt:region, 'us-east-1'}

custom:
  # Different memory by stage
  memorySize: ${if(${provider.stage} === "prod" ? 1024 : 512)}

  # Different log retention by stage
  logRetention: ${if(${provider.stage} === "prod" ? 30 : 7)}

  # Enable features per environment
  enableDebugEndpoints: ${if(${provider.stage} !== "prod")}
  enableMetrics: ${if(${provider.stage} === "prod")}

  # Regional settings
  replicaCount: ${if(${provider.region} === "us-east-1" ? 3 : 1)}

  # Conditional IAM role (use predefined role in prod, inline in dev)
  useExternalRole: ${if(${provider.stage} === "prod")}
  role: ${if(${custom.useExternalRole} ? "arn:aws:iam::123:role/prod-role" : null)}

functions:
  api:
    handler: handler.api
    memorySize: ${custom.memorySize}

  # Debug function - only deployed in non-prod
  debug:
    handler: handler.debug
    enabled: ${custom.enableDebugEndpoints}

  # Metrics processor - only in prod
  metricsProcessor:
    handler: handler.metrics
    enabled: ${custom.enableMetrics}
```

---

### Filters (Experimental)

Pipe resolved values through transformation functions like case conversion.

```yaml
# String transformations
toUpperCaseString: ${'value' | toUpperCase }  # 'VALUE'
toLowerCaseString: ${'VALUE' | toLowerCase }  # 'value'

# Case conversions
toKebabCaseString: ${'valueHere' | toKebabCase }  # 'value-here'
toCamelCaseString: ${'value-here' | toCamelCase } # 'valueHere'

# Chaining filters
key: lol_hi
transformed: ${key | toKebabCase | toUpperCase }  # 'LOL-HI'

# With variables
serviceName: MyServiceName
serviceSlug: ${serviceName | toKebabCase}  # 'my-service-name'
```

**Built-in filters:**
- `toUpperCase` - Convert to uppercase
- `toLowerCase` - Convert to lowercase
- `toKebabCase` - Convert to kebab-case
- `toCamelCase` - Convert to camelCase
- `String`, `Number`, `Boolean`, `Array`, `Object`, `Json` - Validate/coerce resolved values
- `oneOf(...)` - Restrict a value to inline literals or a resolved list variable
- `help('text')` - Attach guidance to a variable for the [config wizard](#config-wizard-experimental); returns the value unchanged

The `help()` filter is an identity filter: it leaves the value untouched but records prompt/agent description text.

```yaml
apiKey: ${env:API_KEY | help('The Stripe live secret key')}
stage: ${option:stage | toUpperCase | help('Deployment stage')}
dbPort: ${env:DB_PORT, 5432 | Number | help('The Postgres port')}
```

`oneOf()` is a runtime constraint. It throws if the resolved value is not in the allowed set. Put type filters first when coercion matters:

```yaml
stage: ${option:stage | oneOf('dev', 'staging', 'prod')}
threads: ${option:threads | Number | oneOf(1, 2, 4)}

allowedStages:
  - dev
  - prod
stageFromList: ${option:stage | oneOf(${self:allowedStages})}
```

`Array` accepts existing arrays, JSON/JSON5 array strings, and comma-separated text. `Object` accepts existing objects and JSON/JSON5 object strings.

Comments are used as help fallback when `help()` is absent. Precedence is `help()` first, then trailing inline comments, then a leading comment block:

```yaml
# Used by deploy jobs
deployToken: ${env:DEPLOY_TOKEN}
region: ${option:region, 'us-east-1'} # AWS region
```

Use comment annotations for human and agent metadata. Filters affect runtime values; comments describe values:

```yaml
secrets:
  # Stripe live secret key
  # @from Stripe dashboard > Developers > API keys
  # @example sk_live_...
  # @default Set in CI or local shell profile
  # @sensitive true
  # @group Payments
  # @deprecated Use STRIPE_RESTRICTED_KEY instead
  stripeSecret: ${env:STRIPE_SECRET_KEY}
```

Supported annotation tags:

- `@description ...` - Explicit description; overrides normal comment text and `help()`
- `@from ...` - Where to obtain the value; appears as `obtainHint`
- `@example ...` - Example value; can appear multiple times
- `@default ...` - Documentation-only default hint; does not resolve the variable
- `@sensitive true|false` - Override name-based masking detection
- `@group ...` - Wizard display group label
- `@deprecated ...` - Warning text for requirements JSON and prompt descriptors

`from()` and `meta()` are not built-in filters. JSON files cannot use comment annotations because JSON has no comments; use JSON5/JSONC or another commented format if metadata is needed.

**Custom filters:**

```javascript
const config = await configorama('config.yml', {
  filters: {
    // Custom filter
    reverse: (value) => value.split('').reverse().join(''),
    // Filter with options
    truncate: (value, length = 10) => value.substring(0, length)
  }
})
```

```yaml
# Using custom filters
reversed: ${'hello' | reverse}  # 'olleh'
truncated: ${'very long string' | truncate(5)}  # 'very '
```

---

### Functions (Experimental)

Apply built-in functions to combine, transform, or manipulate values.

```yaml
object:
  one: once
  two: twice

objectTwo:
  three: third
  four: fourth

# Merge objects
mergeObjects: ${merge(${object}, ${objectTwo})}
# Result: { one: 'once', two: 'twice', three: 'third', four: 'fourth' }

# String concatenation
fullName: ${concat(${firstName}, ' ', ${lastName})}

# Array operations
items:
  - a
  - b
  - c

joinedItems: ${join(${items}, ', ')}  # 'a, b, c'
```

**Built-in functions:**
- `merge(obj1, obj2, ...)` - Merge multiple objects
- `concat(str1, str2, ...)` - Concatenate strings
- `join(array, separator)` - Join array elements

**Custom functions:**

```javascript
const config = await configorama('config.yml', {
  functions: {
    // Custom function
    add: (a, b) => a + b,
    // Function with multiple args
    between: (val, min, max) => val >= min && val <= max
  }
})
```

```yaml
# Using custom functions
sum: ${add(5, 10)}  # 15
value: 75
inRange: ${between(${value}, 50, 100)}  # true
```

---

## Bundled Plugins

Plugins ship in the repo under `plugins/` and are opt-in: install their peer dependencies, then wire them into `variableSources`. Plugins are *not* required dependencies of `configorama` itself, so consumers who don't need them aren't paying for them.

### CloudFormation

Resolves CloudFormation stack output values. Single-region, multi-region, and multi-account.

```yaml
# Default region, default AWS credentials
apiUrl: ${cf:my-stack.ApiUrl}

# Explicit region
westUrl: ${cf(us-west-2):west-stack.ApiUrl}

# Cross-account: 'prod' matches PROD_AWS_ACCESS_KEY_ID env vars
prodUrl: ${cf(prod:us-west-2):prod-stack.ApiUrl}
```

```javascript
const configorama = require('configorama')
const createCloudFormationResolver = require('configorama/plugins/cloudformation')

const cfResolver = createCloudFormationResolver({
  defaultRegion: 'us-east-1',
})

const config = await configorama('config.yml', {
  variableSources: [cfResolver]
})
```

Full docs: [`plugins/cloudformation/README.md`](./plugins/cloudformation/README.md). Covers the env-var-prefix alias convention, the refcounted credential mutex for parallel-safe deploys, and the `skipResolution` mode for CI metadata extraction.

Peer dependency (install separately):

```bash
npm install @aws-sdk/client-cloudformation @aws-sdk/credential-providers
```

---

## API Reference

### Async API

The primary async API for resolving configurations.

**Signature:**

```typescript
function configorama<T = any>(
  configPathOrObject: string | object,
  settings?: ConfigoramaSettings
): Promise<T | ConfigoramaResult<T>>
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `configPathOrObject` | `string \| object` | Yes | Path to config file or raw JavaScript object |
| `settings` | `ConfigoramaSettings` | No | Configuration options |

**Settings object:**

```typescript
interface ConfigoramaSettings {
  options?: Record<string, any>          // CLI flags for ${opt:xyz}
  syntax?: string | RegExp               // Custom variable syntax
  configDir?: string                     // Working directory for relative paths
  variableSources?: VariableSource[]     // Custom variable resolvers
  filters?: Record<string, Function>     // Custom filter functions
  functions?: Record<string, Function>   // Custom functions
  allowUnknownVariableTypes?: boolean | string[]  // Allow unknown var types
  allowUnresolvedVariables?: boolean | string[]   // Allow unresolved vars
  allowUndefinedValues?: boolean         // Allow undefined in output
  returnMetadata?: boolean               // Return metadata with config
  mergeKeys?: string[]                   // Keys to merge in arrays
  filePathOverrides?: Record<string, string>  // Override file paths
}
```

**Returns:**

- If `returnMetadata: false` (default): `Promise<T>` - Resolved config object
- If `returnMetadata: true`: `Promise<ConfigoramaResult<T>>` - Object with config and metadata

**Example:**

```javascript
const configorama = require('configorama')

// Basic usage
const config = await configorama('./config.yml')

// With options
const config = await configorama('./config.yml', {
  options: { stage: 'prod', region: 'us-east-1' },
  allowUnknownVariableTypes: ['ssm', 'cf']
})

// With metadata
const result = await configorama('./config.yml', {
  returnMetadata: true,
  options: { stage: 'prod' }
})

console.log(result.config)           // Resolved config
console.log(result.metadata)         // Variable metadata
console.log(result.resolutionHistory) // Resolution steps
```

---

### Sync API

Synchronous API for blocking config resolution.

**Signature:**

```typescript
function configorama.sync<T = any>(
  configPathOrObject: string | object,
  settings?: ConfigoramaSettings
): T
```

**Parameters:**

Same as async API, but `dynamicArgs` cannot be a function (must be serializable).

**Returns:**

`T` - Resolved config object (synchronously)

**Limitations:**

- Cannot use async functions in JavaScript/TypeScript file references
- `dynamicArgs` must be serializable (not a function)
- CLI args automatically parsed from `process.argv` if `options` not provided

**Example:**

```javascript
const configorama = require('configorama')

// Basic sync usage
const config = configorama.sync('./config.yml')

// With options
const config = configorama.sync('./config.yml', {
  options: { stage: 'dev' }
})
```

---

### Analyze API

Analyze config structure without resolving variables.

**Signature:**

```typescript
function configorama.analyze(
  configPathOrObject: string | object,
  settings?: ConfigoramaSettings
): Promise<AnalyzeResult>
```

**Returns:**

```typescript
interface AnalyzeResult {
  originalConfig: object         // Raw config object
  variables: Variable[]          // All variables found
  uniqueVariables: Record<string, Variable[]>  // Variables grouped by name
  fileDependencies: string[]     // File references
}

interface Variable {
  variable: string               // Full variable syntax (e.g., '${env:KEY}')
  variableType: string           // Type (e.g., 'env', 'opt', 'file')
  variableName: string           // Name/path (e.g., 'KEY')
  variablePath: string           // Location in config (e.g., 'database.host')
  defaultValue: any              // Default value if provided
  hasDefault: boolean            // Whether default exists
}
```

**Example:**

```javascript
const configorama = require('configorama')

const analysis = await configorama.analyze('./config.yml')

console.log(`Found ${analysis.variables.length} variables`)
console.log(`File dependencies:`, analysis.fileDependencies)

// List all environment variables required
const envVars = analysis.variables
  .filter(v => v.variableType === 'env' && !v.hasDefault)
  .map(v => v.variableName)

console.log('Required env vars:', envVars)
```

**Use cases:**
- Generate documentation of required environment variables
- Validate config structure in CI/CD
- Build dependency graphs
- Audit external dependencies before resolution

---

### Format Utilities

Parse various config formats to JavaScript objects.

**Available parsers:**

```javascript
const { format } = require('configorama')

// Parse YAML
const yamlObj = format.yaml.parse('key: value')

// Parse JSON (handles JSON5/JSONC too: comments, trailing commas)
const jsonObj = format.json.parse('{ key: "value", }')

// Parse TOML
const tomlObj = format.toml.parse('key = "value"')

// Parse INI
const iniObj = format.ini.parse('[section]\nkey=value')

// Parse HCL (requires @cdktf/hcl2json)
const hclObj = await format.hcl.parse('variable "example" { default = "value" }')
```

**Available parsers:** `format.json`, `format.yaml`, `format.toml`, `format.ini`, `format.hcl`, `format.markdown`.

Each has at minimum a `parse(content)` method; `dump(obj)` / `stringify(obj)` and cross-format converters (e.g. `format.yaml.toJson`, `format.toml.toYaml`) are available where the underlying format supports them. `format.markdown` is a frontmatter parser; see [Markdown Files](#markdown-files) below.

**Real use cases for `format`:**

- Parse a config file without resolving variables (just want the structure):
  ```javascript
  const { format } = require('configorama')
  const fs = require('fs')
  const raw = format.yaml.parse(fs.readFileSync('config.yml', 'utf8'))
  // raw is the YAML structure with ${...} strings intact
  ```
- Use the same YAML/TOML/JSON5 parsers as configorama itself in your own tooling, so a file that loads in one place loads identically in the other.

---

### Markdown Files

Markdown configs (`.md`, `.mdx`, `.markdown`, `.mdown`, `.mkdn`, `.mkd`) are parsed as YAML/TOML/JSON frontmatter + body. The frontmatter becomes top-level keys; the body is exposed as `_content` on the resolved config (or `_body` if the frontmatter used that key explicitly).

```markdown
---
service: my-service
stage: ${opt:stage, 'dev'}
---

# Service Docs
This is the body content.
```

Resolves to:

```javascript
{
  service: 'my-service',
  stage: 'dev',
  _content: '# Service Docs\nThis is the body content.'
}
```

The body is detached during variable resolution (so `${…}` inside the body text is left alone) and re-attached afterward; only frontmatter keys get variable expansion.

---

### `buildVariableSyntax(prefix, suffix, excludePatterns?)`

Helper for building a properly-escaped regex source string to pass to the `syntax` option. Handles regex-special characters in your delimiters without you having to escape them yourself.

```javascript
const { buildVariableSyntax } = require('configorama')

// Use {{ ... }} instead of ${ ... }
const syntax = buildVariableSyntax('{{', '}}')

const config = await configorama('config.yml', { syntax })
```

**Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `prefix` | `string` | `'${'` | Opening delimiter |
| `suffix` | `string` | `'}'` | Closing delimiter |
| `excludePatterns` | `string[]` | `['AWS', 'aws:', 'stageVariables']` | Patterns to exclude via negative lookahead (so e.g. `${AWS::Region}` and `${aws:username}` are left untouched by CloudFormation users) |

---

### `Configorama` Class

For advanced use cases (long-lived instances, hooking into init/resolve lifecycle, accessing partial state) the underlying class is exported.

```javascript
const { Configorama } = require('configorama')

const instance = new Configorama('config.yml', { options: { stage: 'dev' } })
await instance.init({ stage: 'dev' })
const resolved = await instance.populateObject(instance.config)
const metadata = instance.collectVariableMetadata()
```

Most users should prefer the top-level `configorama()` / `.sync()` / `.analyze()` functions, which are thin wrappers around this class.

---

### `configorama/parse-file` Subpath

For tools that want to parse a config file (auto-detecting format from extension or contents) without going through variable resolution:

```javascript
const { parseFile, parseFileContents } = require('configorama/parse-file')

// Read from disk
const raw = parseFile('./config.yml')
// returns the parsed object with ${...} strings intact

// Or parse already-loaded contents
const fromString = parseFileContents({
  contents: 'service: my-app\nstage: ${opt:stage}',
  filePath: 'in-memory.yml'
})
```

Both are synchronous. Useful for build tools that inspect or rewrite configs before handing them to configorama.

---

### TypeScript Types

Type definitions are bundled (`index.d.ts`). TypeScript users get:

- Generic typing on the resolved config: `configorama<MyConfig>('config.yml')` returns `Promise<MyConfig>`
- Full typing on `ConfigoramaSettings` and `ConfigoramaResult`
- Editor autocomplete on all options shown in the [Complete Options Reference](#complete-options-reference)

```typescript
import configorama, { ConfigoramaSettings } from 'configorama'

interface MyConfig {
  service: string
  stage: string
  database: { host: string; port: number }
}

const config = await configorama<MyConfig>('config.yml', { options: { stage: 'prod' } })
// config.database.port is typed as number
```

---

## Configuration Options

### Custom Variable Syntax

Use the `syntax` option to change the variable delimiters. You can provide a regex string directly or use `buildVariableSyntax()` to generate one with proper character escaping:

```javascript
const configorama = require('configorama')
const { buildVariableSyntax } = require('configorama')

// Using buildVariableSyntax helper (recommended)
const config = await configorama(configFile, {
  syntax: buildVariableSyntax('{{', '}}'),  // Mustache-style: {{env:FOO}}
  options: { stage: 'dev' }
})

// Other examples:
buildVariableSyntax('${{', '}}')   // ${{env:FOO}}
buildVariableSyntax('#{', '}')     // #{env:FOO}
buildVariableSyntax('[[', ']]')    // [[env:FOO]]
buildVariableSyntax('<', '>')      // <env:FOO>
```

**Function signature:**

```typescript
function buildVariableSyntax(
  prefix: string = '${',
  suffix: string = '}',
  excludePatterns: string[] = ['AWS', 'aws:', 'stageVariables']
): string
```

The `buildVariableSyntax()` function:
- Automatically excludes suffix characters from the allowed character class (prevents parsing issues)
- Supports nested variables by excluding `$` and `{` from values
- Third parameter `excludePatterns` is an array of strings to exclude via negative lookahead

**Example with custom syntax:**

```javascript
const config = await configorama('config.yml', {
  syntax: buildVariableSyntax('{{', '}}')
})
```

```yaml
# config.yml with {{ }} syntax
apiKey: {{env:API_KEY}}
stage: {{opt:stage, 'dev'}}
database: {{file(./db.yml)}}
```

---

### allowUnknownVariableTypes

Controls what happens when encountering unregistered variable types (e.g., `${ssm:path}` when `ssm` isn't a registered resolver).

**Type:** `boolean | string[]`

**Default:** `false`

**Behavior:**

```javascript
// Allow ALL unknown types to pass through
const config = await configorama(configFile, {
  allowUnknownVariableTypes: true,
  options: { stage: 'dev' }
})
// Input:  { key: '${ssm:/path/to/secret}' }
// Output: { key: '${ssm:/path/to/secret}' }

// Allow only SPECIFIC unknown types
const config = await configorama(configFile, {
  allowUnknownVariableTypes: ['ssm', 'cf'],  // only these pass through
  options: { stage: 'dev' }
})
// ${ssm:path} and ${cf:stack.output} pass through
// ${custom:thing} throws an error
```

**Use cases:**
- Multi-stage resolution (local resolution, then cloud provider resolves remaining vars)
- Serverless Framework integration (let the framework resolve SSM and other refs it owns)
- Gradual migration (allow unknown types during transition period)

> CloudFormation refs (`${cf:…}`, `${cf(region):…}`, `${cf(account:region):…}`) are now resolved natively by the bundled [`plugins/cloudformation/`](./plugins/cloudformation/README.md) plugin; no external resolver required.

---

### allowUnresolvedVariables

Controls what happens when a known resolver can't find a value (missing env vars, missing files, etc.).

**Type:** `boolean | string[]`

**Default:** `false`

**Behavior:**

```javascript
// Allow ALL unresolved variables to pass through
const config = await configorama(configFile, {
  allowUnresolvedVariables: true,
  options: { stage: 'dev' }
})
// Input:  { key: '${env:MISSING_VAR}' }
// Output: { key: '${env:MISSING_VAR}' }

// Allow only SPECIFIC types to be unresolved
const config = await configorama(configFile, {
  allowUnresolvedVariables: ['param', 'file'],  // only these pass through
  options: { stage: 'prod' }
})
// Input:  { paramKey: '${param:x}', fileKey: '${file(missing.yml)}' }
// Output: { paramKey: '${param:x}', fileKey: '${file(missing.yml)}' }

// Mixed scenario
const config = await configorama(configFile, {
  allowUnresolvedVariables: ['param', 'file'],
  options: { stage: 'prod' }
})
// Input:  {
//   key: '${env:MISSING_VAR}',
//   paramKey: '${param:x}',
//   fileKey: '${file(missing.yml)}'
// }
// Output: Error thrown because ${env:MISSING_VAR} cannot resolve
// (param and file pass through, but env vars must resolve)
```

**Important notes:**
- This option does NOT apply to `self:` or dotProp variables (e.g., `${foo.bar.baz}`)
- Self-references are local config errors, not external dependencies
- Useful for multi-stage resolution pipelines

**Use cases:**
- Serverless Dashboard resolves params after local resolution
- Gradual migration with optional external dependencies
- Development mode where some services are unavailable

---

### Complete Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `options` | `object` | `{}` | CLI options/flags to populate `${option:xyz}` / `${opt:xyz}` variables |
| `syntax` | `string \| RegExp` | `${...}` | Custom variable syntax regex pattern |
| `configDir` | `string` | directory of config file | Working directory for relative file paths |
| `variableSources` | `VariableSource[]` | `[]` | Custom variable sources (see below) |
| `filters` | `Record<string, Function>` | `{}` | Custom filter functions for pipe operator |
| `functions` | `Record<string, Function>` | `{}` | Custom functions for `${fn(...)}` syntax |
| `allowUnknownVariableTypes` | `boolean \| string[]` | `false` | Allow unknown variable types to pass through |
| `allowUnresolvedVariables` | `boolean \| string[]` | `false` | Allow known types that can't resolve to pass through |
| `allowUndefinedValues` | `boolean` | `false` | Allow undefined as a valid end result |
| `ignorePaths` | `string[]` | Built-in CloudFormation/code paths | Glob-like config paths whose values should be left verbatim |
| `skipResolutionPaths` | `string[]` | `[]` | Alias for `ignorePaths` |
| `disableDefaultIgnorePaths` | `boolean` | `false` | Disable the built-in CloudFormation/code ignore paths |
| `returnMetadata` | `boolean` | `false` | Return `{ config, metadata }` instead of just the resolved config |
| `returnPreResolvedVariableDetails` | `boolean` | `false` | Return metadata about variables *without* resolving them (used by `analyze()`) |
| `useDotEnvFiles` | `boolean` | `false` | Auto-load `.env`, `.env.{stage}`, etc. into `process.env` before resolution (via [env-stage-loader](https://www.npmjs.com/package/env-stage-loader)) |
| `dotEnvSilent` | `boolean` | `true` (unless `--verbose`) | Suppress the env-stage-loader log lines when `useDotEnvFiles` is on |
| `dotEnvDebug` | `boolean` | `false` | Enable env-stage-loader debug output |
| `dynamicArgs` | `object \| Function` | `undefined` | Values passed into `.js`/`.ts` config files when they're imported as the root config |
| `mergeKeys` | `string[]` | `[]` | Keys to merge in arrays of objects |
| `filePathOverrides` | `Record<string, string>` | `{}` | Map of file paths to override (for testing/mocking) |

> The config file itself can also set `useDotenv: true` (or `useDotEnv: true`) at the top level to trigger dotenv loading. Useful when you want the behavior intrinsic to the config rather than the JS caller.

**Legacy options (deprecated):**

| Legacy Option | New Equivalent |
|---------------|----------------|
| `allowUnknownVars` | `allowUnknownVariableTypes` |
| `allowUnknownVariables` | `allowUnknownVariableTypes` |
| `allowUnknownParams` | `allowUnresolvedVariables: ['param']` |
| `allowUnknownFileRefs` | `allowUnresolvedVariables: ['file']` |

---

## Custom Variable Sources

Bring your own variable sources.

### Variable Source Types

The `source` property defines how the config wizard handles each variable type:

| Source | Description | Wizard Behavior | Examples |
|--------|-------------|-----------------|----------|
| `'user'` | Values provided by user at runtime | Prompt user for value | `env`, `option` / `opt` |
| `'config'` | Values from config files or self-references | Check existence, can create | `self`, `file`, `text` |
| `'remote'` | Values from external services | Fetch, prompt if missing, can write back | `ssm`, `vault`, `consul` |
| `'readonly'` | Computed or system-derived values | Display only, cannot modify | `git`, `cron`, `eval` |

**Built-in variable sources and their types:**

| Variable | Source Type | Description |
|----------|-------------|-------------|
| `${env:VAR}` | `user` | Environment variables |
| `${option:flag}` / `${opt:flag}` | `user` | CLI option flags |
| `${param:key}` | `user` | Parameter values |
| `${self:key}` | `config` | Self references |
| `${file(path)}` | `config` | File references |
| `${text(path)}` | `config` | Raw text file references |
| `${git:branch}` | `readonly` | Git repository data |
| `${cron(expr)}` | `readonly` | Cron expression conversion |
| `${eval(expr)}` | `readonly` | Math/logic evaluation |
| `${if(expr)}` | `readonly` | Conditional expressions |

### Creating a Custom Resolver

There are 2 ways to resolve variables from custom sources:

1. **Use built-in JavaScript method** for [sync](https://github.com/DavidWells/configorama/blob/master/tests/syncValues/syncValue.yml) or [async](https://github.com/DavidWells/configorama/blob/master/tests/asyncValues/asyncValue.yml) resolution.

2. **Add your own variable syntax and resolver:**

```javascript
const configorama = require('configorama')

const config = await configorama('path/to/configFile', {
  variableSources: [{
    // Variable type name (used in metadata)
    type: 'consul',

    // Source type for config wizard behavior
    source: 'remote',

    // Prefix shown in syntax examples
    prefix: 'consul',

    // Example syntax for documentation
    syntax: '${consul:path/to/key}',

    // Description for help text
    description: 'Resolves values from Consul KV store',

    // Match variables ${consul:xyz}
    match: RegExp(/^consul:/g),

    // Custom variable source. Must return a promise
    resolver: async (varToProcess, opts, currentObject) => {
      // varToProcess = 'consul:path/to/key'
      const consulPath = varToProcess.replace(/^consul:/, '')

      // Make remote call to consul
      const consulClient = require('consul')()
      const result = await consulClient.kv.get(consulPath)

      return result.Value
    }
  }]
})

console.log(config)
```

**This would match:**

```yaml
key: ${consul:path/to/my/key}
```

**Variable source interface:**

```typescript
interface VariableSource {
  type: string                    // Type name (e.g., 'consul', 'ssm')
  source: 'user' | 'config' | 'remote' | 'readonly'
  prefix?: string                 // Prefix for examples (defaults to type)
  syntax: string                  // Example syntax (e.g., '${consul:key}')
  description?: string            // Help text description
  match: RegExp                   // Regex to match variables
  resolver: (                     // Resolution function
    variable: string,             // Variable string (e.g., 'consul:key')
    options: object,              // Options from configorama call
    currentConfig: object         // Current partially-resolved config
  ) => Promise<any>
  collectMetadata?: () => any     // Optional: collect custom metadata
  metadataKey?: string            // Optional: key for custom metadata
}
```

**Advanced example with AWS SSM:**

```javascript
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm')
const ssm = new SSMClient({})

const config = await configorama('config.yml', {
  variableSources: [{
    type: 'ssm',
    source: 'remote',
    syntax: '${ssm:/path/to/parameter}',
    description: 'Resolves values from AWS Systems Manager Parameter Store',
    match: /^ssm:/,
    resolver: async (variable, options, currentConfig) => {
      const paramPath = variable.replace(/^ssm:/, '')

      try {
        const result = await ssm.send(new GetParameterCommand({
          Name: paramPath,
          WithDecryption: true
        }))

        return result.Parameter.Value
      } catch (err) {
        if (options.allowUnresolvedVariables) {
          return `\${${variable}}` // Pass through unresolved
        }
        throw new Error(`SSM parameter not found: ${paramPath}`)
      }
    }
  }]
})
```

> **See also:** the bundled [`plugins/cloudformation/`](./plugins/cloudformation/README.md) plugin is a working example of a `source: 'remote'` resolver. It handles multi-region and multi-account credential swapping, plus per-instance client and output caching.

```yaml
# config.yml
database:
  password: ${ssm:/myapp/prod/db-password}
  apiKey: ${ssm:/myapp/prod/api-key}
```

---

## Config Wizard (Experimental)

The config wizard walks you through every variable your config needs that isn't resolved yet, prompting for each one and then resolving the config with your answers.

Trigger it with the `--setup` flag, the `setup` subcommand, or the `setup` library option:

```bash
configorama config.yml --setup
configorama setup config.yml
```

```javascript
const config = await configorama('config.yml', { setup: true })
```

The wizard groups unresolved variables by source and prompts for each:

- `${option:...}` / `${opt:...}` - CLI option flags (`opt` is shorthand)
- `${env:...}` - environment variables (shows the current `process.env` value if set)
- `${self:...}` and dot-prop references - values defined elsewhere in the config

Variables whose names look sensitive (`secret`, `password`, `token`, `key`, etc.) are prompted with a masked password input. Use comment annotations for new metadata, or annotate any variable with the backward-compatible [`help()` filter](#filters-experimental) to show guidance during the prompt:

```yaml
# Stripe live secret key
# @from Stripe dashboard > Developers > API keys
# @sensitive true
apiKey: ${env:API_KEY}

stage: ${opt:stage | help('Deployment stage, e.g. dev or prod')}
```

The [Variable Source Types](#variable-source-types) table describes how the wizard treats each source.

> **Experimental:** the wizard fills in values for the current resolution run only. It does not write your answers back to the config file yet.

---

## Agent Requirements JSON

Use requirements mode when an agent or script needs to know what a config is missing without running the full resolver:

```bash
configorama requirements config.yml
configorama config.yml --requirements
```

Both commands use analyze mode and print JSON. Missing required variables do not fail requirements output. The result is environment-aware: if `process.env.API_KEY` is already set, `${env:API_KEY}` is removed from `ask[]`.

```json
{
  "schemaVersion": 1,
  "config": "config.yml",
  "summary": {
    "total": 2,
    "required": 1,
    "optional": 1,
    "sensitive": 1
  },
  "requirements": [
    {
      "name": "API_KEY",
      "variable": "env:API_KEY",
      "variableType": "env",
      "sourceClass": "user",
      "type": "string",
      "description": "Stripe live secret key",
      "descriptionSource": "commentTag",
      "allowedValues": null,
      "sensitive": true,
      "sensitiveSource": "commentTag",
      "required": true,
      "default": null,
      "defaultHint": "Set in CI or local shell profile",
      "obtainHint": "Stripe dashboard > Developers > API keys",
      "examples": ["sk_live_..."],
      "group": "Payments",
      "deprecationMessage": "Use STRIPE_RESTRICTED_KEY instead",
      "paths": ["apiKey"],
      "conflicts": []
    }
  ],
  "ask": [
    {
      "name": "API_KEY",
      "variable": "env:API_KEY",
      "variableType": "env",
      "type": "string",
      "sensitive": true,
      "description": "Stripe live secret key",
      "obtainHint": "Stripe dashboard > Developers > API keys",
      "examples": ["sk_live_..."],
      "defaultHint": "Set in CI or local shell profile",
      "group": "Payments",
      "deprecationMessage": "Use STRIPE_RESTRICTED_KEY instead",
      "paths": ["apiKey"],
      "how": "Set environment variable API_KEY"
    }
  ]
}
```

`variableType` uses normalized names. CLI flags are reported as `option` for both `${option:stage}` and the backward-compatible `${opt:stage}` shorthand. Concrete missing `${file(...)}` and `${text(...)}` dependencies appear in `ask[]`; dynamic paths such as `${file(./${option:stage}.yml)}` ask for the inner variables first.

---

## CLI Usage

Configorama includes a CLI tool for resolving configs from the command line.

### Basic Commands

```bash
# Resolve a config file
configorama config.yml

# Resolve and write to output file
configorama config.yml --output resolved.json

# Resolve with CLI options
configorama config.yml --stage prod --region us-east-1

# Show info about variables
configorama config.yml --info

# Verify config (check for errors without resolving)
configorama config.yml --verify

# Walk through unresolved variables interactively (experimental)
configorama config.yml --setup

# Print agent requirements JSON without resolving config
configorama requirements config.yml
configorama config.yml --requirements

# Extract a specific path from config
configorama config.yml .database.host

# Print an extracted scalar without JSON quotes
configorama config.yml .database.host --raw

# Copy the formatted output to your clipboard
configorama config.yml .database.host --raw --copy

# Output as YAML
configorama config.yml --format yaml
```

### Command Options

```text
Usage:
  configorama [options] <file> [path]

Options:
  -h, --help                Show this help message
  -v, --version             Show version number
  -o, --output <file>       Write output to file instead of stdout
  -f, --format <format>     Output format: json, yaml, or js (default: json)
  -r, --raw                 Print extracted scalar values without JSON quoting
  -c, --copy                Copy the formatted output to the clipboard
  -d, --debug               Enable debug mode
  -i, --info                Show info about the config
  -V, --verify              Verify the config
  --setup                   Run the interactive config wizard (experimental)
  --requirements            Print agent requirements JSON without resolving config
  --param <key=value>       Pass parameter values (can be used multiple times)
  --allow-unknown           Allow unknown variables to pass through
  --allow-undefined         Allow undefined values in the final output

Path Extraction:
  configorama config.yml .database.host   Extract a nested value
  configorama config.yml '.functions[0]'  Extract from an array
  configorama -r config.yml .stage        Print raw scalar output
  configorama -r -c config.yml .stage     Print and copy raw scalar output
```

Path extraction uses jq-style paths. JSON remains the default output format, so extracted strings are quoted by default:

```bash
configorama config.yml .stage
# "prod"

configorama config.yml .stage --raw
# prod
```

`--copy` copies exactly the formatted value that the CLI prints. It uses native clipboard commands where available: `pbcopy` on macOS, `clip` on Windows, and `wl-copy`, `xclip`, or `xsel` on Linux.

### CLI Examples

**Basic resolution:**

```bash
# Input: config.yml
apiKey: ${env:API_KEY}
stage: ${opt:stage, 'dev'}

# Command
export API_KEY=secret123
configorama config.yml --stage prod

# Output
{
  "apiKey": "secret123",
  "stage": "prod"
}
```

**With parameters:**

```bash
configorama config.yml \
  --stage prod \
  --param "domain=myapp.com" \
  --param "apiKey=secret123"
```

**Extract specific path:**

```bash
# config.yml
database:
  host: localhost
  port: 5432

# Extract database.host as JSON
configorama config.yml .database.host
# Output: "localhost"

# Extract database.host as a raw scalar
configorama config.yml .database.host --raw
# Output: localhost

# Extract and copy the raw scalar
configorama config.yml .database.host --raw --copy
# Output: localhost

# Extract database config as JSON
configorama config.yml .database --format json
# Output: {"host":"localhost","port":5432}
```

**Output to file:**

```bash
configorama config.yml --output resolved.json
configorama config.yml --output resolved.yml --format yaml
```

**Show variable info:**

```bash
configorama config.yml --info

# Output:
# Found 15 variables
#   env: 5
#   opt: 3
#   self: 4
#   file: 2
#   git: 1
#
# Required environment variables:
#   - API_KEY
#   - DB_HOST
#   - DB_PASSWORD
#
# File dependencies:
#   - ./secrets.yml
#   - ./config/database.yml
```

**Verify without resolving:**

```bash
configorama config.yml --verify

# Output:
# ✓ Config structure valid
# ✓ No circular dependencies
# ✓ All file references exist
# ! Warning: 3 environment variables not set
#   - API_KEY
#   - DB_HOST
#   - DB_PASSWORD
```

**Allow unknown variable types to pass through unresolved:**

```bash
# ${ssm:...} and ${custom:...} stay as literal ${ssm:...} strings
# (typical for multi-stage pipelines where another tool resolves them)
configorama config.yml --allow-unknown
```

**Allow undefined values in the final output:**

```bash
# Don't error on values that resolved to undefined; emit them as nulls
# (useful for downstream tooling that does its own validation)
configorama config.yml --allow-undefined
```

---

## Testing

### Running Tests

```bash
# Run all tests
npm test

# Run only fast tests (excludes slow tests)
npm run test:lib

# Run API tests
npm run test:api

# Run tests in a specific directory
npm run test:tests

# Run slow tests only
npm run test:slow

# Watch mode (reruns on file changes)
npm run watch

# Type checking
npm run typecheck
```

### Test Structure

```text
tests/
├── _fixtures/           # Shared test fixtures
├── api/                 # API tests
├── asyncValues/         # Async function resolution tests
├── syncValues/          # Sync function resolution tests
├── cronValues/          # Cron expression tests
├── gitVariables/        # Git variable tests
├── filePathOverrides/   # File path override tests
├── filterTests/         # Filter tests
├── hclTests/            # Terraform HCL tests
├── iniTests/            # INI format tests
├── tomlTests/           # TOML format tests
├── jsTests/             # JavaScript file tests
└── ...                  # More test categories
```

### Writing Tests

Configorama uses the `uvu` test framework. Tests can be run directly with Node.js:

```bash
# Run a single test file
node tests/api/api.test.js
```

**Example test:**

```javascript
const { test } = require('uvu')
const assert = require('uvu/assert')
const path = require('path')
const configorama = require('../src')

test('resolves environment variables', async () => {
  process.env.TEST_VAR = 'test-value'

  const config = await configorama({
    key: '${env:TEST_VAR}'
  })

  assert.equal(config.key, 'test-value')

  delete process.env.TEST_VAR
})

test('handles missing env vars with defaults', async () => {
  const config = await configorama({
    key: '${env:MISSING_VAR, "default"}'
  })

  assert.equal(config.key, 'default')
})

test.run()
```

**Test utilities available at `tests/utils.js`:**

```javascript
const { getFixturePath, loadFixture } = require('./tests/utils')

// Get path to fixture file
const fixturePath = getFixturePath('config.yml')

// Load and parse fixture
const fixtureData = loadFixture('config.yml')
```

---

## Deployment

### Using with Serverless Framework

Configorama can be used as a drop-in replacement for the Serverless Framework variable system.

**serverless.js:**

```javascript
const path = require('path')
const configorama = require('configorama')
const args = require('minimist')(process.argv.slice(2))

// Path to serverless config to be parsed
const yamlFile = path.join(__dirname, 'serverless.config.yml')

module.exports = configorama.sync(yamlFile, { options: args })
```

**serverless.config.yml:**

```yaml
service: my-service

provider:
  name: aws
  runtime: nodejs22.x
  stage: ${opt:stage, 'dev'}
  region: ${opt:region, 'us-east-1'}

  # Environment-specific config
  environment:
    STAGE: ${opt:stage}
    DB_HOST: ${env:DB_HOST}
    API_KEY: ${ssm:/my-service/${opt:stage}/api-key}

custom:
  # Load stage-specific config
  stageConfig: ${file(./config/${opt:stage}.yml)}

  # Git info for tracking
  deploymentInfo:
    branch: ${git:branch}
    commit: ${git:sha1}
    timestamp: ${timestamp}

functions:
  api:
    handler: handler.api
    memorySize: ${if(${provider.stage} === 'prod' ? 1024 : 512)}
    events:
      - http:
          path: /
          method: ANY
```

**Deploy:**

```bash
# Deploy to dev
serverless deploy --stage dev

# Deploy to production
serverless deploy --stage prod --region us-west-2
```

---

### CI/CD Integration

**GitHub Actions example (.github/workflows/deploy.yml):**

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm ci

      - name: Verify config
        run: npx configorama config.yml --verify
        env:
          STAGE: prod
          DB_HOST: ${{ secrets.DB_HOST }}
          DB_PASSWORD: ${{ secrets.DB_PASSWORD }}
          API_KEY: ${{ secrets.API_KEY }}

      - name: Run tests
        run: npm test

      - name: Deploy to production
        run: npm run deploy
        env:
          STAGE: prod
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

**GitLab CI example (.gitlab-ci.yml):**

```yaml
stages:
  - verify
  - test
  - deploy

verify-config:
  stage: verify
  image: node:22
  script:
    - npm ci
    - npx configorama config.yml --verify --stage $CI_ENVIRONMENT_NAME
  variables:
    STAGE: $CI_ENVIRONMENT_NAME

test:
  stage: test
  image: node:22
  script:
    - npm ci
    - npm test

deploy-production:
  stage: deploy
  image: node:22
  script:
    - npm ci
    - npm run deploy
  environment:
    name: production
  only:
    - main
  variables:
    STAGE: prod
```

---

## Troubleshooting

### Common Issues

**Q: Variable not resolving**

```yaml
# Problem
apiKey: ${env:API_KEY}
# Error: Environment variable 'API_KEY' not found
```

**Solutions:**
1. Ensure environment variable is set: `echo $API_KEY`
2. Check variable name spelling
3. Use default value: `${env:API_KEY, 'default'}`
4. Allow unresolved vars: `allowUnresolvedVariables: ['env']`

---

**Q: Circular dependency error**

```yaml
# Problem
a: ${self:b}
b: ${self:a}
# Error: Circular variable dependency detected: b → a → b
```

**Solutions:**
1. Restructure config to remove circular reference
2. Use intermediate values to break the cycle
3. Consider if one value should be a constant instead

---

**Q: File not found**

```yaml
# Problem
secrets: ${file(./secrets.yml)}
# Error: File not found: ./secrets.yml
```

**Solutions:**
1. Check file path is correct relative to config file
2. Ensure file exists: `ls -la secrets.yml`
3. Use absolute path: `${file(/absolute/path/to/secrets.yml)}`
4. Add default: `${file(./secrets.yml), {}}`

---

**Q: TypeScript file execution fails**

```yaml
# Problem
config: ${file(./config.ts)}
# Error: Cannot find module 'tsx'
```

**Solutions:**
1. Install tsx: `npm install tsx --save-dev`
2. Or install ts-node: `npm install ts-node typescript --save-dev`
3. Ensure TypeScript file exports correctly: `export = value` or `module.exports = value`

---

**Q: HCL parsing fails**

```yaml
# Problem
terraform: ${file(./main.tf)}
# Error: HCL parsing requires @cdktf/hcl2json
```

**Solutions:**
1. Install dependency: `npm install @cdktf/hcl2json`
2. Ensure HCL file is valid Terraform syntax
3. Check file extension is `.tf`, `.hcl`, or `.tf.json`

---

### Debug Mode

Enable debug mode to see detailed resolution steps:

**CLI:**

```bash
configorama config.yml --debug
```

**Programmatic:**

```javascript
const config = await configorama('config.yml', {
  returnMetadata: true
})

// Inspect resolution history
console.log(config.resolutionHistory)
```

**Environment variable:**

```bash
DEBUG=configorama:* node app.js
```

**Output example:**

```text
configorama:resolve Resolving variable: ${env:API_KEY}
configorama:resolve Type: env, Name: API_KEY
configorama:resolve Resolved to: secret-key-123
configorama:resolve Resolving variable: ${opt:stage}
configorama:resolve Type: opt, Name: stage
configorama:resolve Resolved to: prod
```

---

### Circular Dependencies

Configorama detects circular dependencies and provides helpful error messages:

```yaml
# Direct cycle
a: ${self:b}
b: ${self:a}
```

**Error:**
```text
Circular variable dependency detected: b → a → b

Resolution path:
  1. Started resolving 'b'
  2. Required 'a' (from ${self:b})
  3. Required 'b' (from ${self:a})
  4. Circular dependency detected

To fix this, restructure your config to break the circular reference.
```

**How to fix:**

1. **Use intermediate values:**

```yaml
# Before (circular)
a: ${self:b}
b: ${self:a}

# After (fixed)
base: value
a: ${self:base}
b: ${self:base}
```

2. **Make one value a constant:**

```yaml
# Before (circular)
apiUrl: ${self:baseUrl}/api
baseUrl: ${self:apiUrl}/v1

# After (fixed)
baseUrl: https://example.com
apiUrl: ${self:baseUrl}/api/v1
```

3. **Restructure dependencies:**

```yaml
# Before (circular)
database:
  connectionString: postgres://${database.host}:${database.port}/${database.name}
  host: ${self:database.connectionString}

# After (fixed)
database:
  host: localhost
  port: 5432
  name: mydb
  connectionString: postgres://${database.host}:${database.port}/${database.name}
```

---

## FAQ

**Q: What happens with circular variable dependencies?**

Configorama detects circular dependencies and throws a helpful error instead of hanging forever. See [Circular Dependencies](#circular-dependencies) section for examples and fixes.

---

**Q: Why should I use this?**

Configs resolve fresh on every run, so values stay in sync with your environment variables, CLI flags, file contents, and custom sources instead of going stale.

---

**Q: Does this work with `serverless.yml`?**

Yes! Use `serverless.js` as your main entry point. See [Using with Serverless Framework](#using-with-serverless-framework) for full example.

---

**Q: Can I use this with other frameworks/tools?**

Yes! Configorama is framework-agnostic. It works with any tool that accepts a JavaScript object or can import a .js file. Examples:

- **Webpack**: `webpack.config.js`
- **Vite**: `vite.config.js`
- **Jest**: `jest.config.js`
- **ESLint**: `eslint.config.js`
- **Docker Compose**: Generate yaml from resolved config
- **Kubernetes**: Generate manifests from resolved config

---

**Q: How do I handle secrets securely?**

Best practices:

1. **Use environment variables:**
```yaml
apiKey: ${env:API_KEY}
```

2. **Fetch from secret managers:**
```yaml
secrets: ${file(./fetch-secrets.js)}
```

```javascript
// fetch-secrets.js
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm')
const ssm = new SSMClient({})

module.exports = async () => {
  const result = await ssm.send(new GetParameterCommand({
    Name: '/myapp/api-key',
    WithDecryption: true
  }))

  return result.Parameter.Value
}
```

3. **Never commit secrets to version control**
4. **Use `.gitignore` for secret files**
5. **Rotate secrets regularly**

---

**Q: Can I use variables in variable syntax?**

Yes! Variables are resolved recursively:

```yaml
stage: prod
configFile: config-${stage}.yml
config: ${file(${configFile})}
# Resolves: ${file(config-prod.yml)}
```

---

**Q: How do I migrate from Serverless Framework variables?**

Configorama is mostly compatible with Serverless Framework variable syntax. Key differences:

1. **Cleaner self-references:**
```yaml
# Serverless
key: ${self:other.key}

# Configorama (both work)
key: ${self:other.key}
key: ${other.key}
```

2. **Numbers as defaults:**
```yaml
# Configorama supports numeric defaults
timeout: ${env:TIMEOUT, 30}
```

3. **Additional variable types:**
- `${cron()}` - Cron expressions
- `${eval()}` - Math expressions
- `${if()}` - Conditionals
- `${git:}` - Git data

---

## Advanced Usage

### Multi-Stage Resolution

Resolve configs in multiple stages, allowing external systems to handle remaining variables:

```javascript
// Stage 1: Local resolution (resolve env, opt, file, etc.)
const partiallyResolved = await configorama('config.yml', {
  options: { stage: 'prod' },
  allowUnresolvedVariables: ['ssm', 'cf'],
  allowUnknownVariableTypes: ['ssm', 'cf']
})

// Stage 2: External system resolves SSM and any other refs
// (e.g., Serverless Dashboard, secrets manager, etc.)
const fullyResolved = await externalResolver(partiallyResolved)
```

**Use case:** Serverless Framework + Serverless Dashboard workflow.

> For CloudFormation refs specifically, the bundled [CF plugin](./plugins/cloudformation/README.md) resolves them natively in Stage 1, so you don't need a second pass.

---

### Function Arguments and Context

Pass dynamic data from your config to JavaScript/TypeScript functions:

```yaml
environment: prod
region: us-east-1
features:
  enableMetrics: true

# Pass resolved config values as arguments
secrets: ${file(./get-secrets.js, ${environment}, ${region}, ${features})}
```

**get-secrets.js:**

```javascript
async function getSecrets(env, region, features, ctx) {
  // Arguments from YAML
  console.log(env)      // 'prod'
  console.log(region)   // 'us-east-1'
  console.log(features) // { enableMetrics: true }

  // Context (always last argument)
  console.log(ctx.options)        // CLI options
  console.log(ctx.originalConfig) // Original config
  console.log(ctx.currentConfig)  // Partially resolved config

  // Fetch secrets based on arguments
  if (env === 'prod') {
    return await fetchProdSecrets(region)
  }

  return await fetchDevSecrets()
}

module.exports = getSecrets
```

---

### Programmatic Usage

**Custom variable resolver:**

```javascript
const configorama = require('configorama')

// Add custom AWS SSM resolver
const config = await configorama('config.yml', {
  variableSources: [{
    type: 'ssm',
    source: 'remote',
    syntax: '${ssm:/path}',
    description: 'AWS Systems Manager Parameter Store',
    match: /^ssm:/,
    resolver: async (variable) => {
      const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm')
      const ssm = new SSMClient({})

      const paramName = variable.replace(/^ssm:/, '')
      const result = await ssm.send(new GetParameterCommand({
        Name: paramName,
        WithDecryption: true
      }))

      return result.Parameter.Value
    }
  }]
})
```

**Custom filters:**

```javascript
const config = await configorama('config.yml', {
  filters: {
    // Custom string transformation
    slugify: (str) => str.toLowerCase().replace(/\s+/g, '-'),

    // Custom formatting
    currency: (amount) => `$${parseFloat(amount).toFixed(2)}`,

    // Chained filters work
    upperSnake: (str) => str.toUpperCase().replace(/\s+/g, '_')
  }
})
```

```yaml
# Usage
projectName: My Awesome Project
slug: ${projectName | slugify}  # 'my-awesome-project'

price: 19.99
displayPrice: ${price | currency}  # '$19.99'

constantName: my constant
constName: ${constantName | upperSnake}  # 'MY_CONSTANT'
```

**Custom functions:**

```javascript
const config = await configorama('config.yml', {
  functions: {
    // Timestamp generator
    timestamp: () => new Date().toISOString(),

    // Random ID generator
    uuid: () => require('crypto').randomUUID(),

    // Environment-based selector
    selectByEnv: (prodValue, devValue, env) => {
      return env === 'prod' ? prodValue : devValue
    }
  }
})
```

```yaml
# Usage
createdAt: ${timestamp()}
id: ${uuid()}

environment: ${opt:stage, 'dev'}
timeout: ${selectByEnv(30, 5, ${environment})}
```

---

## Comparison vs Serverless Framework Variables

Configorama was forked from the Serverless Framework variable system and extended. The differences:

| Capability | Serverless | Configorama |
|---|---|---|
| Framework-agnostic; use outside Serverless | ❌ Serverless-only | ✅ Any tool, any framework |
| Pluggable variable sources | ❌ Hardcoded | ✅ Custom resolvers, custom syntax |
| `self:` prefix optional in self-refs | ❌ Required | ✅ `${foo.bar}` works without `self:` |
| Numbers as defaults | ❌ Coerced to string | ✅ `${env:TIMEOUT, 30}` stays numeric |
| Format support | YAML/JSON | YAML, JSON/JSON5/JSONC, TOML, INI, HCL, Markdown, TS, JS |
| Filters (pipe transforms) | ❌ | ✅ `${value \| toUpperCase}` |
| Built-in functions | ❌ | ✅ `merge()`, custom user functions |
| Conditional expressions | ❌ | ✅ `${if(cond ? a : b)}` |
| Eval/math expressions | ❌ | ✅ `${eval(2 + 2)}` |
| TypeScript file refs | ❌ | ✅ `${file(./config.ts)}` |
| Git data refs | ❌ | ✅ `${git:branch}`, `${git:sha1}`, etc. |
| Cron expression refs | ❌ | ✅ `${cron(every monday at 9am)}` |
| Metadata extraction (analyze without resolving) | ❌ | ✅ `configorama.analyze(...)` |
| Multi-account CloudFormation refs | ❌ | ✅ via bundled CF plugin |
| Circular dependency detection | ❌ Hangs | ✅ Helpful error |

---

## Alternative Libraries

How configorama compares to other variable-substitution libraries:

| Library | Formats | Variable sources | Custom resolvers | Async | TypeScript |
|---|---|---|---|---|---|
| **configorama** | YAML, JSON5, TOML, INI, HCL, MD, TS, JS | env, opt, file, self, git, cron, eval, if, custom | ✅ | ✅ | ✅ |
| [sls-yaml](https://github.com/01alchemist/sls-yaml) | YAML | env, opt, file, self | ❌ | ❌ | ❌ |
| [yaml-boost](https://github.com/blackflux/yaml-boost) | YAML | env, file, self, function | partial | ❌ | ❌ |
| [serverless-merge-config](https://github.com/CruGlobal/serverless-merge-config) | YAML | merge-focused | ❌ | ❌ | ❌ |
| [serverless-terraform-variables](https://www.npmjs.com/package/serverless-terraform-variables) | YAML + .tfvars | terraform-focused | ❌ | ❌ | ❌ |

---

## Changelog

Version history lives in [CHANGELOG.md](./CHANGELOG.md). It covers everything from 0.9.9 onward; older releases are in `git log`.

---

## Inspiration

This is forked from the [Serverless Framework](https://github.com/serverless/serverless/) variable system.

<details>
<summary><strong>Mad props to the original contributors</strong></summary>

[erikerikson](https://github.com/erikerikson), [eahefnawy](https://github.com/eahefnawy), [HyperBrain](https://github.com/HyperBrain), [ac360](https://github.com/ac360), [gcphost](https://github.com/gcphost), [pmuens](https://github.com/pmuens), [horike37](https://github.com/horike37), [lorengordon](https://github.com/lorengordon), [AndrewFarley](https://github.com/AndrewFarley), [tobyhede](https://github.com/tobyhede), [johncmckim](https://github.com/johncmckim), [mangas](https://github.com/mangas), [e-e-e](https://github.com/e-e-e), [BasileTrujillo](https://github.com/BasileTrujillo), [miltador](https://github.com/miltador), [sammarks](https://github.com/sammarks), [RafalWilinski](https://github.com/RafalWilinski), [indieisaconcept](https://github.com/indieisaconcept), [svdgraaf](https://github.com/svdgraaf), [infiniteluke](https://github.com/infiniteluke), [j0k3r](https://github.com/j0k3r), [craigw](https://github.com/craigw), [bsdkurt](https://github.com/bsdkurt), [aoskotsky-amplify](https://github.com/aoskotsky-amplify), and all the other folks who contributed to the variable system.

</details>

**Additionally these tools were very helpful:**

- [yaml-boost](https://github.com/blackflux/yaml-boost)
- [serverless-merge-config](https://github.com/CruGlobal/serverless-merge-config)
- [serverless-terraform-variables](https://www.npmjs.com/package/serverless-terraform-variables)

---

## License

MIT © [David Wells](https://davidwells.io)

## Contributing

Bug reports and reproductions are very welcome. Please open an [issue](https://github.com/DavidWells/configorama/issues) with a minimal failing config. PRs are reviewed case-by-case; small targeted fixes with a test case are most likely to land quickly.

## Support

- 🐛 [Report bugs](https://github.com/DavidWells/configorama/issues)
- 💡 [Request features](https://github.com/DavidWells/configorama/issues)
- 📖 [Read the docs](https://github.com/DavidWells/configorama#readme)
