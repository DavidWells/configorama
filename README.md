# Configorama

Dynamic configuration values with variable support.

Works with `yml`, `json`, `toml` config formats and anything that parsed down to a plain ol' javascript object

## About

Configorama extends your configuration with a powerful variable system. It resolves configuration variables from:

- CLI options
- ENV variables
- File references
- Other Key/values in config
- Async/sync JS functions
- Any source you'd like...

See [tests](https://github.com/DavidWells/configorama/tree/master/tests) for more examples.

## Table of Contents
<!-- doc-gen {TOC} collapse=true collapseText="Click to expand" -->
<details>
<summary>Click to expand</summary>

- [About](#about)
- [Usage](#usage)
- [Variable Sources](#variable-sources)
  - [Environment variables](#environment-variables)
  - [CLI option flags](#cli-option-flags)
  - [Self references](#self-references)
  - [File references](#file-references)
  - [Sync/Async file references](#syncasync-file-references)
  - [TypeScript file references](#typescript-file-references)
  - [Git references](#git-references)
  - [Cron Values](#cron-values)
  - [Filters (experimental)](#filters-experimental)
  - [Functions (experimental)](#functions-experimental)
  - [More Examples](#more-examples)
- [Custom Variable Sources](#custom-variable-sources)
- [FAQ](#faq)
- [Whats new](#whats-new)
- [Alt libs](#alt-libs)
- [Inspiration](#inspiration)

</details>
<!-- end-doc-gen -->

## Usage

Async API:

```js
const path = require('path')
const configorama = require('configorama')
const cliFlags = require('minimist')(process.argv.slice(2))

// Path to yaml/json/toml config
const myConfigFilePath = path.join(__dirname, 'config.yml')

const config = await configorama(myConfigFilePath, {
  options: args
})
```

Sync API:

```js
const path = require('path')
const configorama = require('configorama')
const cliFlags = require('minimist')(process.argv.slice(2))

// Path to yaml/json/toml config
const myConfigFilePath = path.join(__dirname, 'config.yml')

const config = configorama.sync(myConfigFilePath, {
  options: cliFlags
})
```

## Variable Sources

### Environment variables

```yml
apiKey: ${env:SECRET_KEY}

# Fallback to default value if env var not found
apiKeyWithFallback: ${env:SECRET_KEY, 'defaultApiKey'}
```

### CLI option flags

```yml
# CLI option. Example `cmd --stage dev` makes `bar: dev`
bar: ${opt:stage}

# Composed example makes `foo: dev-hello`
foo: ${opt:stage}-hello

# You can also provide a default value. If no --stage flag is provided, it will use 'dev'
foo: ${opt:stage, 'dev'}
```

### Self references

```yml
foo: bar

zaz:
  matazaz: 1
  wow:
    cool: 2

# Self file reference. Resolves to `bar`
one: ${self:foo}

# Shorthand self reference. Resolves to `bar`
two: ${foo} 

# Dot prop reference will traverse the object. Resolves to `2`
three: ${zaz.wow.cool}
```

### File references

```yml
# Import full yml/json/toml file via relative path
fileRef: ${file(./subFile.yml)}

# Import sub values from files. This imports other-config.yml `topLevel:` value
fileValue: ${file(./other-config.yml):topLevel}

# Import sub values from files. This imports other-config.json `nested.value` value
fileValueSubKey: ${file(./other-config.json):nested.value}

# Fallback to default value if file not found
fallbackValueExample: ${file(./not-found.yml), 'fall back value'}
```

### Sync/Async file references

```yml
asyncJSValue: ${file(./async-value.js)}
# resolves to 'asyncval'
```

`${file(./asyncValue.js)}` will call into `async-value` and run/resolve the async function with values. These values can be strings, objects, arrays, whatever.

```js
/* async-value.js */
function delay(t, v) {
  return new Promise((resolve) => setTimeout(resolve.bind(null, v), t))
}

async function fetchSecretsFromRemoteStore(config) {
  await delay(1000)
  return 'asyncval'
}

module.exports = fetchSecretsFromRemoteStore
```

### TypeScript file references

Configure with full TypeScript support using modern tsx execution engine with ts-node fallback.

```yml
# TypeScript configuration object
config: ${file(./config.ts)}

# TypeScript async function
secrets: ${file(./async-secrets.ts)}

# Specific property from TypeScript export
database: ${file(./config.ts):database}
```

**TypeScript Object Export:**

```typescript
/* typescript-config.ts */
interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  ssl: boolean;
}

interface ApiConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
}

interface ConfigObject {
  environment: string;
  database: DatabaseConfig;
  api: ApiConfig;
  features: {
    enableNewFeature: boolean;
    debugMode: boolean;
  };
}

function createConfig(): ConfigObject {
  return {
    environment: '${opt:stage, "development"}',
    database: {
      host: '${env:DB_HOST, "localhost"}',
      port: parseInt('${env:DB_PORT, "5432"}'),
      database: '${env:DB_NAME, "myapp"}',
      ssl: '${env:NODE_ENV}' === 'production'
    },
    api: {
      baseUrl: '${env:API_BASE_URL, "http://localhost:3000"}',
      timeout: 5000,
      retries: 3
    },
    features: {
      enableNewFeature: '${opt:stage}' === 'production',
      debugMode: '${env:DEBUG, "false"}' === 'true'
    }
  }
}

export = createConfig
```

**TypeScript Async Function:**

```typescript
/* typescript-async.ts */
interface SecretStore {
  apiKey: string;
  dbPassword: string;
  jwtSecret: string;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchSecretsFromVault(): Promise<SecretStore> {
  console.log('Fetching secrets from vault...')
  
  // Simulate async operations like fetching from AWS Secrets Manager, HashiCorp Vault, etc.
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

```yml
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
  
  # You can also use TypeScript files for specific sections
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
  timestamp: ${timestamp}
  
functions:
  hello:
    handler: handler.hello
    environment:
      LOG_LEVEL: ${self:custom.stageVariables.${self:custom.stage}.logLevel}
      DB_HOST: ${self:provider.database.host}
      API_KEY: ${self:secrets.apiKey}
```

**Installation Requirements:**

TypeScript support requires either `tsx` (recommended) or `ts-node`:

```bash
# Recommended: Modern, fast TypeScript execution
npm install tsx --save-dev

# Alternative: Traditional ts-node approach
npm install ts-node typescript --save-dev
```

**Features:**
- Modern tsx execution (fast, no compilation) with ts-node fallback
- Support for both sync and async TypeScript functions
- Function argument passing via `dynamicArgs`
- Full TypeScript interface support
- Comprehensive error handling with helpful dependency messages

### Git references

Resolve values from `cwd` git data.

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


### Cron Values

Convert human-readable time expressions into cron expressions. Supports single quotes for values.

```yml
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
every3Days: ${cron('every 3 days')}         # 0 0 */3 * * *

# Specific times
at930: ${cron('at 9:30')}                   # 30 9 * * *
at930pm: ${cron('at 9:30 pm')}              # 30 21 * * *
at1200: ${cron('at 12:00')}                 # 0 12 * * *
at1230am: ${cron('at 12:30 am')}            # 30 0 * * *

# Weekday patterns
mondayMorning: ${cron('on monday at 9:00')}  # 0 9 * * 1
fridayEvening: ${cron('on friday at 17:00')} # 0 17 * * 5
sundayNoon: ${cron('on sunday at 12:00')}    # 0 12 * * 0

# Pre-existing cron expressions
customCron: ${cron('15 2 * * *')}           # 15 2 * * *
```

### Filters (experimental)

Filters will transform the resolved variables

```yml
toUpperCaseString: ${'value' | toUpperCase }

toKebabCaseString: ${'valueHere' | toKebabCase }

key: lol_hi

keyTwo: lol_hi

toKebabCase: ${key | toKebabCase }

toCamelCase: ${keyTwo | toCamelCase }
```

### Functions (experimental)

Functions will convert resolved config values with various methods.

```yml
object:
  one: once
  two: twice

objectTwo:
  three: third
  four: fourth

mergeObjects: ${merge(${object}, ${objectTwo})}
```

### More Examples

See the [tests folder](./tests) for a bunch of examples!

## Custom Variable Sources

Configorama allows you to bring your own variable sources.

There are 2 ways to resolve variables from custom sources.

1. Use the baked in javascript method for [sync](https://github.com/DavidWells/configorama/blob/master/tests/syncValues/syncValue.yml) or [aysnc](https://github.com/DavidWells/configorama/blob/master/tests/asyncValues/asyncValue.yml) resolution.

2. Add your own variable syntax and resolver.

    ```js
    const config = configorama('path/to/configFile', {
      variableSources: [{
        // Match variables ${consul:xyz}
        match: RegExp(/^consul:/g),
        // Custom variable source. Must return a promise
        resolver: (varToProcess, opts, currentObject) => {
          // Make remote call to consul
          return Promise.resolve(varToProcess)
        }
      }]
    })
    console.log(config)
    ```

    This would match the following config:

    ```yml
    key: ${consul:xyz}
    ```

## FAQ

**Q: Why should I use this?**

Never rendering a stale configuration file again!

**Q: Does this work with `serverless.yml`**

Yes it does. Using `serverless.js` as your main entry point!

```js
/* serverless.js */
const path = require('path')
const configorama = require('configorama')
const args = require('minimist')(process.argv.slice(2))

// Path to serverless config to be parsed
const yamlFile = path.join(__dirname, 'serverless.config.yml')

module.exports = configorama.sync(yamlFile, { options: args })
```

## Whats new

How is this different than the serverless variable system?

1. You can use it with any other tool you'd like. Just include `configorama` and go nuts.

2. It's pluggable. Add whatever variable syntax/sources you wish.

3. Filters! You can filter values before they are resolved.

    ```yml
    key: ${opt:stage | toUpperCase}
    ```

4. Cleaner self references

    ```yml
    keyOne:
      subKey: hi

    # Before
    key: ${self:keyOne.subKey}

    # Now
    key: ${keyOne.subKey}
    ```

5. Numbers as defaults are supported

    ```yml
    key: ${env:whatever, 2}
    ```

6. TOML, YML, JSON, etc support

    Configorama will work on any configuration format that can be converted into a JS object.

    Parse any config format and pass it into configorama.


7. Configorama has a number of built-in functions.

    Build in functions can be used within expressions as another way to transform and combine values. These are similar to the operators but all follow a common syntax:

    ```
    <FUNCTION NAME>(<ARGUMENT 1>, <ARGUMENT 2>)
    ```

    example:

    ```
    ${merge('one', 'two')} => 'onetwo'
    ```

## Alt libs

- https://github.com/01alchemist/sls-yaml

## Inspiration

This is forked out of the [serverless framework](https://github.com/serverless/serverless/) variable system.

**Mad props to:**

[erikerikson](https://github.com/erikerikson), [eahefnawy](https://github.com/eahefnawy), [HyperBrain](https://github.com/HyperBrain), [ac360](https://github.com/ac360), [gcphost](https://github.com/gcphost), [pmuens](https://github.com/pmuens), [horike37](https://github.com/horike37), [lorengordon](https://github.com/lorengordon), [AndrewFarley](https://github.com/AndrewFarley), [tobyhede](https://github.com/tobyhede), [johncmckim](https://github.com/johncmckim), [mangas](https://github.com/mangas), [e-e-e](https://github.com/e-e-e), [BasileTrujillo](https://github.com/BasileTrujillo), [miltador](https://github.com/miltador), [sammarks](https://github.com/sammarks), [RafalWilinski](https://github.com/RafalWilinski), [indieisaconcept](https://github.com/indieisaconcept), [svdgraaf](https://github.com/svdgraaf), [infiniteluke](https://github.com/infiniteluke), [j0k3r](https://github.com/j0k3r), [craigw](https://github.com/craigw), [bsdkurt](https://github.com/bsdkurt), [aoskotsky-amplify](https://github.com/aoskotsky-amplify), and all the other folks who contributed to the variable system.

Additionally these tools were very helpful:

- [yaml-boost](https://github.com/blackflux/yaml-boost)
- [serverless-merge-config](https://github.com/CruGlobal/serverless-merge-config)
- [terraform variables](https://www.npmjs.com/package/serverless-terraform-variables)
