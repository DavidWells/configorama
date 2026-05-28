# CloudFormation variable source

Resolves CloudFormation stack output values in configorama configs.

## Syntax

```
${cf:stackName.outputKey}                   # default region, default credentials
${cf(region):stackName.outputKey}           # explicit region, default credentials
${cf(account:region):stackName.outputKey}   # explicit account alias + region
```

## Usage

```js
const configorama = require('configorama')
const createCloudFormationResolver = require('configorama/plugins/cloudformation')

const cfResolver = createCloudFormationResolver({
  defaultRegion: 'us-east-1',     // optional
  skipResolution: false,          // true = collect metadata without calling AWS
  // credentials: { ... }         // optional: bypass env-var discovery
})

const result = await configorama(configPath, {
  returnMetadata: true,
  variableSources: [cfResolver]
})
```

## Multi-account

Account aliases map to env-var prefixes. To make `${cf(prod:us-west-2):…}` work,
set:

```bash
export PROD_AWS_ACCESS_KEY_ID=AKIA...
export PROD_AWS_SECRET_ACCESS_KEY=...
export PROD_AWS_REGION=us-west-2      # optional; falls back to AWS_REGION
```

The alias is the prefix lowercased — `STAGING_AWS_ACCESS_KEY_ID` becomes
`staging`. The alias is **not** an AWS 12-digit account number; it's whatever
string you put before `_AWS_ACCESS_KEY_ID`.

### Credential discovery rules

1. Scan `process.env` for `{PREFIX}_AWS_ACCESS_KEY_ID` → register `{prefix}` (lowercased).
2. If `AWS_ACCESS_KEY_ID` is set unprefixed, register it as `default`.
3. If no `default` exists and there's exactly one prefixed set, use it as
   `default` (and copy into unprefixed env vars so the AWS SDK can find them).

### Parallel safety

Multiple resolves for the **same** account run concurrently. Resolves for
**different** accounts are serialized via a refcounted mutex — `process.env` is
process-global, so two accounts can't be active at once.

## Metadata

Each resolved variable is recorded in `result.metadata.cfReferences`:

```js
{
  raw: '${cf(prod:us-west-2):api-service-prod.ApiUrl}',
  resolved: '${cf(prod:us-west-2):api-service-prod.ApiUrl}',
  stackName: 'api-service-prod',
  outputKey: 'ApiUrl',
  region: 'us-west-2',
  account: 'prod',                // null when not multi-account
  configPath: 'provider.environment.API_URL',
}
```

## Skip resolution

`skipResolution: true` collects metadata without calling AWS. Values are
replaced with placeholders like `[CF:prod:us-west-2:api-service-prod.ApiUrl]`,
useful in CI for dependency analysis.
