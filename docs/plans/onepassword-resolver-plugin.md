---
id: 01KWQZCMN0PTMNAKATA9R8RHP2
status: draft
createdAt: 2026-07-04T18:48:20-07:00
updatedAt: 2026-07-04T18:48:20-07:00
origin: manual
type: plan
---

# 1Password resolver plugin implementation plan

## Status

This plan is ready for implementation. The remaining open questions from the earlier draft have been resolved with the decisions in this document.

Key decisions:

- Ship `plugins/onepassword` from the root `configorama` npm package and fix the existing CloudFormation plugin export at the same time.
- Support both async `configorama()` and sync `configorama.sync()` usage.
- Use `op read --no-newline` for `op://` secret references.
- Allow aliases matching only `/^[A-Za-z0-9_]+$/`.
- Allow aliases to point to an item, a field on an item, an `op://` secret reference, or a private 1Password item link.
- Treat ambiguous 1Password item fields as errors. Do not silently prefer `notesPlain` over `password` or another concealed field.
- Two syntaxes only: alias colon syntax and direct function syntax. Raw `op://` refs in colon syntax (`${op:op://...}`) are rejected with a pointer to `${op(op://...)}`.
- Return the raw selected field for `${op:alias}`. Parse structured text only when the config reference asks for a key path, such as `${op:alias.NPM_TOKEN}`.
- Reuse the root package `ini` dependency for INI/dotenv parsing if its coercion behavior passes the parser tests; hand-roll only if `ini` fights the raw-value rules.
- No core `safetyPolicy.js` change in v1. Safe mode already blocks all custom resolvers by default (`src/main.js:232`, `src/utils/security/safetyPolicy.js:85-92`), which satisfies the blocking requirement. Only the audit report changes.
- The no-private-URL metadata rule applies to the plugin's `opReferences` entries. Core metadata (`resolutionHistory`, `originalConfig`) captures raw variable strings from the config file and is out of scope.
- Support 1Password private item links copied from "Copy Private Link", such as `https://start.1password.com/open/i?a=...&v=...&i=...&h=...`.
- Do not support public "share with anyone" token links in v1.
- Mark the plugin as sensitive and high risk in metadata/audit surfaces.
- In safe mode, block actual resolution by default but allow inspect/audit to report the risk.
- Add mocked unit tests first; add an optional real `op` smoke test gated by `CONFIGORAMA_OP_E2E=1`.

Reference facts verified against current 1Password CLI docs:

- `op read <reference>` reads a field specified by a secret reference and supports `--no-newline`.
- `op item get <item>` supports `--format json`, `--reveal`, `--vault`, and field filtering.
- Private item URLs use query parameters such as `v` for vault ID and `i` for item ID.
- CLI scoping can be controlled by `--account`, `--config`, `--vault`, and environment variables such as `OP_ACCOUNT`, `OP_CONFIG_DIR`, and `OP_SERVICE_ACCOUNT_TOKEN`.

Reference facts verified against the codebase:

- The runtime variable regex from `buildVariableSyntax` (`src/utils/variables/variableUtils.js:104-108`) allows `&`, `?`, `=`, `/`, `(`, `)`, `:`, `.`, and spaces, so private-link URLs and spaced item names parse in `${op(...)}` syntax.
- Function rewriting only triggers for registered function names (`src/main.js:2136-2138`), so `op(...)` is not mistaken for a config function.
- Comma fallback splitting is parenthesis-depth aware (`src/utils/strings/splitCsv.js`), so commas inside `op(...)` do not split.
- No built-in variable type collides with the `op:`/`op(` prefix; custom sources dispatch before the fall-through self matcher (`src/main.js:535-539`).

Primary documentation links:

- https://www.1password.dev/cli/reference/commands/read
- https://www.1password.dev/cli/reference/management-commands/item
- https://www.1password.dev/cli/secret-reference-syntax
- https://www.1password.dev/cli/environment-variables

## Goal

Build an opt-in Configorama plugin under `plugins/onepassword/` that resolves configuration values from the 1Password CLI.

The plugin should let config authors reference secret material without copying it into environment variables, local files, or committed config. It should preserve the same operational property as the existing shell-helper workflow: the secret is fetched at resolution time, never persisted by Configorama, never printed by the plugin, and never exported beyond the returned resolved config value.

Initial target syntax:

```yaml
npmToken: ${op:npm.NPM_TOKEN}
dbPassword: ${op:database}
directItem: ${op(item-id-example).NPM_TOKEN}
directSecretRef: ${op(op://vault/item/field)}
directSecretRefKey: ${op(op://vault/item/notesPlain).NPM_TOKEN}
privateLink: ${op(https://start.1password.com/open/i?a=acct&v=vault-id&i=item-id&h=my.1password.com).NPM_TOKEN}
```

Recommended usage should be alias based:

```js
const configorama = require('configorama')
const createOnePasswordResolver = require('configorama/plugins/onepassword')

const opResolver = createOnePasswordResolver({
  refs: {
    npm: 'op://production/npm-automation/notesPlain',
    database: {
      item: 'database-prod',
      vault: 'production',
      field: 'password'
    },
    github: {
      item: 'GitHub',
      vault: 'development',
      section: 'credentials',
      field: 'personal_token'
    },
    copiedLink: 'https://start.1password.com/open/i?a=acct&v=vault-id&i=item-id&h=my.1password.com'
  }
})

const config = await configorama('config.yml', {
  variableSources: [opResolver]
})
```

## Why this belongs as a plugin

1Password is a remote secret source, not a core parser feature. Keeping it in `plugins/onepassword/` matches the CloudFormation plugin pattern:

- users opt in through `variableSources`
- 1Password CLI behavior does not become a hard dependency of Configorama core
- 1Password-specific metadata can be collected separately from local file dependencies
- safe-mode and audit behavior can classify it as a sensitive remote resolver
- service account, account, vault, and app-integration details stay isolated from the core resolver loop

## Non-goals for v1

- Do not implement 1Password Connect.
- Do not manage service account creation, signin, or token provisioning.
- Do not auto-run `op signin`.
- Do not write secrets to disk.
- Do not log CLI stdout or stderr.
- Do not support public "share with anyone" token links.
- Do not implement every 1Password structured note format on day one.
- Do not create a broad schema language for selecting item fields.
- Do not silently choose between conflicting fields.
- Do not parse whole selected fields into objects merely because they contain `=`.

`OP_SERVICE_ACCOUNT_TOKEN` may still work naturally because the 1Password CLI reads it. The plugin should document this as a CLI behavior, not as plugin-managed auth.

## Package and export work

The current root package docs show:

```js
require('configorama/plugins/cloudformation')
```

but the root package currently exports only:

```json
{
  ".": "./src/index.js",
  "./parse-file": "./src/utils/parsing/parse.js"
}
```

and `files` does not include `plugins/`. That means the documented CloudFormation plugin subpath does not work from an installed root package.

This implementation should fix plugin packaging for both bundled plugins:

```json
{
  "exports": {
    ".": "./src/index.js",
    "./parse-file": "./src/utils/parsing/parse.js",
    "./plugins/cloudformation": "./plugins/cloudformation/index.js",
    "./plugins/onepassword": "./plugins/onepassword/index.js"
  },
  "files": [
    "cli.js",
    "src",
    "plugins",
    "!plugins/*/*.test.js",
    "!plugins/*/example",
    "!plugins/*/package-lock.json",
    "types",
    "index.d.ts",
    "package.json",
    "package-lock.json",
    "README.md"
  ]
}
```

npm auto-excludes `node_modules` from the tarball. The negation patterns keep plugin tests, examples, and nested lockfiles out of the published package. Verify the final tarball contents with `npm pack --dry-run`.

Do this as part of the 1Password plugin work because the public examples for bundled plugins depend on it.

Keep each plugin's local `package.json` for standalone development/testing, but make root-package subpath imports the primary documented path.

## Public API

```js
const createOnePasswordResolver = require('configorama/plugins/onepassword')

const resolver = createOnePasswordResolver({
  refs: {
    npm: 'op://prod/npm/notesPlain',
    db: {
      item: 'database-prod',
      vault: 'production',
      field: 'password'
    },
    rawToken: {
      ref: 'op://prod/npm/automation_token'
    },
    copiedLink: 'https://start.1password.com/open/i?a=acct&v=vault-id&i=item-id&h=my.1password.com'
  },
  account: 'my',
  configDir: '/path/to/op/config',
  skipResolution: false
})
```

Returned variable source:

```js
{
  type: 'op',
  source: 'remote',
  prefix: 'op',
  syntax: '${op:alias.KEY}, ${op(item).KEY}, or ${op(op://vault/item/field)}',
  description: 'Resolves values from 1Password through the op CLI',
  sensitive: true,
  risk: 'remote_secret_read',
  match: /^op(?::|\()/,
  resolver,
  metadataKey: 'opReferences',
  collectMetadata,
  clearCache,
  syncFactory: require.resolve('./sync-factory'),
  syncOptions: serializableOptions
}
```

`syncFactory` and `syncOptions` are new core-facing contract fields described in the sync section.

## Syntax

### Alias syntax

```yaml
value: ${op:alias}
value: ${op:alias.KEY}
value: ${op:alias.section.KEY}
```

Alias names must match:

```js
/^[A-Za-z0-9_]+$/
```

Dots are not allowed in alias names because dot separates the alias from a structured key path.

`alias` is looked up in `createOnePasswordResolver({ refs })`.

When a path follows the alias, the plugin first selects the backing 1Password field, parses that field as INI/dotenv in v1, then returns the nested key path.

### Direct function syntax

```yaml
value: ${op(item-or-url-or-secret-ref)}
value: ${op(item-or-url-or-secret-ref).KEY}
```

Function syntax is required for direct item names, private item URLs, and secret refs that may contain dots, slashes, spaces, query parameters, or colons. It gives the parser a reliable boundary: the item/link/ref lives inside `op(...)`, and the key path starts after `)`.

Direct specs may be:

- an `op://vault/item/field` secret reference
- a 1Password item ID
- a 1Password item name
- a private 1Password item link copied with "Copy Private Link"

Direct item names with spaces should work:

```yaml
token: ${op(My Database Login).password}
```

but documentation should recommend aliases for readability and auditability.

### Unsupported syntax

Reject raw `op://` refs in colon syntax with a message pointing to function syntax:

```yaml
value: ${op:op://vault/item/field}
```

Error: `Use ${op(op://vault/item/field)} for direct secret references.`

Colon syntax is reserved for aliases only. Supporting raw refs after the colon would require extra parse-ambiguity rules for no capability gain — function syntax already covers direct refs.

Reject raw private links in colon syntax:

```yaml
value: ${op:https://start.1password.com/open/i?...}
```

Reject public share links in all syntaxes for v1. The plugin should identify them as unsupported 1Password share links and tell users to use "Copy Private Link" or an `op://` secret reference instead.

## Reference normalization

Normalize every configured or direct reference into one of these forms:

```js
{ kind: 'secretRef', ref: 'op://vault/item/field' }
{ kind: 'item', item: 'item-id-or-name', vault: undefined, section: undefined, field: undefined }
{ kind: 'item', item: 'database-prod', vault: 'production', section: undefined, field: 'password' }
{ kind: 'item', item: 'GitHub', vault: 'development', section: 'credentials', field: 'personal_token' }
{ kind: 'privateLink', item: 'item-id', vault: 'vault-id' }
```

Accepted `refs` forms:

```js
refs: {
  npm: 'op://prod/npm/notesPlain',
  db: 'database-prod',
  copiedLink: 'https://start.1password.com/open/i?a=acct&v=vault-id&i=item-id&h=my.1password.com',
  github: {
    item: 'GitHub',
    vault: 'development',
    section: 'credentials',
    field: 'personal_token'
  },
  raw: {
    ref: 'op://prod/item/field'
  },
  link: {
    url: 'https://start.1password.com/open/i?a=acct&v=vault-id&i=item-id&h=my.1password.com'
  }
}
```

Validation rules:

- Alias keys must match `/^[A-Za-z0-9_]+$/`.
- A string beginning with `op://` is a secret ref.
- A string beginning with `https://start.1password.com/open/i` or `onepassword://open/i` is a private item link.
- A string that looks like a public share URL is rejected.
- Any other string is treated as an item ID or item name.
- Object refs must specify exactly one of `item`, `ref`, or `url`.
- `section` is meaningful only with `field`.
- If `field` is configured and multiple matching fields exist in different sections, require `section`.

## Private link handling

Support private item links copied from 1Password:

```text
https://start.1password.com/open/i?a=ACCOUNT&v=VAULT_ID&i=ITEM_ID&h=my.1password.com
onepassword://open/i?a=ACCOUNT&v=VAULT_ID&i=ITEM_ID&h=my.1password.com
```

Parsing behavior:

- Extract `i` as item ID.
- Extract `v` as vault ID.
- Ignore `a` and `h` for command construction and metadata.
- Do not preserve the raw URL in metadata.
- Use `op item get <itemId> --vault <vaultId> --format json --reveal`.

If `i` is missing, throw an invalid private-link error.

If `v` is missing, allow the fetch without `--vault`, but attach a warning-like diagnostic in metadata because service accounts and duplicated item names may require vault scoping.

## CLI behavior

Create a utility module:

```text
plugins/onepassword/op-cli.js
```

Responsibilities:

- execute `op` with `child_process.execFile`
- never use `exec`
- never log stdout or stderr
- translate missing binary errors into a useful message
- run `op read --no-newline <ref>` for secret refs
- run `op item get <spec> --format json --reveal` for item IDs, item names, and private links
- pass `--vault` for explicit vaults or vault IDs extracted from private links
- pass `--account` when configured
- pass `--config` when `configDir` is configured
- return parsed JSON for item fetches
- expose dependency injection for tests

Proposed API:

```js
async function runOp(args, options = {}) {}
async function readSecretRef(ref, options = {}) {}
async function getItem(spec, options = {}) {}
```

`runOp()` should catch and sanitize:

- `ENOENT`: 1Password CLI is not installed or not on `PATH`
- signin/auth errors: user likely needs to sign in, unlock app integration, or configure `OP_SERVICE_ACCOUNT_TOKEN`
- not-found errors: item, vault, or field could not be found
- JSON parse errors from `op item get --format json`

Do not perform a separate `command -v op` preflight. Calling `execFile('op', ...)` and translating `ENOENT` is simpler and avoids duplicate checks.

### CLI flags

Secret refs:

```text
op read --no-newline op://vault/item/field
```

Item fetches:

```text
op item get <item-or-id> --format json --reveal
op item get <item-or-id> --vault <vault> --format json --reveal
```

Global scoping:

```text
--account <account>
--config <configDir>
```

The plugin should not pass secrets through command-line arguments except for `op://` references and item identifiers already supplied by the user in config. It must never pass resolved secret values as args.

## Field selection

### Explicit field selection

If `field` is explicitly configured on a ref object, select that 1Password field.

Match against:

- `field.id`
- `field.label`
- `field.purpose`

Matching should be case-insensitive.

If multiple fields match only because they share the same label across sections, require `section`.

If `section` is configured, match against:

- `field.section.id`
- `field.section.label`

also case-insensitively.

### Secret ref selection

For `op://` refs, use `op read --no-newline`. The secret ref itself selects the field, so do not fetch the item JSON just to infer a field.

If a key path is supplied after an `op://` ref, parse the returned secret value as INI/dotenv and select the key.

### Inferred field selection

If no `field` is configured, inspect the item JSON returned by `op item get --format json --reveal`.

Collect candidate fields from `item.fields`. Include candidates likely to contain secret content:

- `id`, `label`, or `purpose` equal to `notesPlain` or notes
- `purpose` equal to `PASSWORD`
- `type` equal to `CONCEALED`
- labels commonly used for secret content, such as `password`, `token`, `api_key`, `api key`, `secret`, `credential`, `private key`

Ignore common metadata/user fields for auto-selection:

- username
- email
- URL/website fields
- timestamps
- item title
- non-secret text fields without a secret-like label or purpose

Inference rule:

1. If exactly one candidate exists, use it.
2. If multiple candidates exist, throw an ambiguity error that names candidate field labels and tells the user to configure `field` and optionally `section`.
3. If no candidate exists, throw a no-secret-field error.

Important: do not prefer `notesPlain` over `password` when both exist. That is ambiguous.

## Structured value parsing

Create:

```text
plugins/onepassword/parser.js
```

V1 supports INI/dotenv-style parsing only.

Use the root package `ini` dependency (`ini@^5.0.0`, already in `package.json`) rather than hand-rolling a parser. Caveat to prove out in the parser tests: `ini` coerces `true`/`false` and strips quotes. If that coercion violates the raw-value rules below, wrap or replace it — decide from failing tests, not up front.

Behavior:

- `${op:alias}` returns the raw selected field text, even if it contains `=`.
- `${op:alias.KEY}` parses the selected field as INI/dotenv and returns `KEY`.
- `${op:alias.section.KEY}` parses the selected field and returns a nested section key.
- Missing keys throw a clear key-path error.
- Empty string values must be preserved.
- Parser errors must not include secret values.

Example selected field:

```ini
# npm automation token
NPM_TOKEN=npm_xxx

[database]
password=s3cr3t
```

Valid references:

```yaml
npmToken: ${op:npm.NPM_TOKEN}
dbPassword: ${op:npm.database.password}
rawNote: ${op:npm}
```

Do not infer whole-object parsing from the presence of `=`. Tokens, base64, connection strings, and private keys can contain `=`.

Shape the parser for future format support:

```js
function parseStructuredSecret(value, options = {}) {
  return parseIni(value)
}
```

Future parser detection can follow this order:

1. explicit `format` option on the ref
2. JSON if the trimmed value starts with `{` or `[`
3. YAML only if there is a clear reason and tests prove it is not confused with INI
4. INI fallback

Do not add JSON/YAML support in v1 unless implementation stays small and tests are very clear.

## Resolver behavior

Resolution flow:

1. Parse the variable string into `{ reference, keyPath }`.
2. Resolve aliases through `refs`.
3. Normalize the reference.
4. Record metadata before fetching.
5. If `skipResolution` is true, return a placeholder.
6. Fetch the secret ref or item JSON through `op-cli`.
7. Select or infer the field.
8. If no key path is supplied, return the raw selected value.
9. If a key path is supplied, parse selected value as INI/dotenv and return the key path.

### Placeholders for skipResolution

`skipResolution` means "collect metadata and prove the resolver recognized the reference, but do not fetch from 1Password."

Return deterministic placeholders:

```text
[OP:alias:npm.NPM_TOKEN]
[OP:secretRef:op://vault/item/field]
[OP:item:item-id]
[OP:item:item-id:NPM_TOKEN]
[OP:privateLink:item-id]
```

Rules:

- Never include raw private links.
- Never include secret values.
- Include the `op://` ref itself; it is already plain text in the user's config and distinguishes placeholders when multiple refs resolve in one run.
- Prefer alias names when the user used alias syntax.
- Include key path when present.

## Caching

Cache per resolver instance, not globally.

Suggested caches:

- secret ref values keyed by account/config/ref
- item JSON keyed by account/config/vault/item
- selected field metadata keyed by normalized reference plus field/section

Cache successes only. Do not cache auth failures, not-found failures, parse failures, or ambiguity failures.

Caching should never write to disk. It exists only to avoid repeated `op` calls during one Configorama resolution run.

Add `clearCache()` to match the CloudFormation plugin pattern.

`clearCache()` should clear:

- secret ref cache
- item JSON cache
- field selection cache
- collected metadata

## Metadata

Expose `metadataKey: 'opReferences'`.

Each occurrence should record:

```js
{
  raw: '${op:npm.NPM_TOKEN}',
  resolved: '${op:npm.NPM_TOKEN}',
  alias: 'npm',
  referenceKind: 'item',
  item: 'item-id-example',
  vault: 'vault-id-example',
  field: 'notesPlain',
  section: undefined,
  keyPath: 'NPM_TOKEN',
  configPath: 'provider.environment.NPM_TOKEN',
  sensitive: true,
  risk: 'remote_secret_read',
  source: 'remote',
  skipped: false
}
```

For private links:

```js
{
  raw: '${op(copied private link).NPM_TOKEN}',
  resolved: '${op(...).NPM_TOKEN}',
  referenceKind: 'privateLink',
  item: 'item-id',
  vault: 'vault-id',
  keyPath: 'NPM_TOKEN',
  configPath: 'provider.environment.NPM_TOKEN',
  sensitive: true,
  risk: 'remote_secret_read',
  source: 'remote'
}
```

Do not record in `opReferences`:

- secret values
- full private item URLs
- `a` account query parameter
- `h` hostname query parameter
- public share URL tokens
- CLI stdout/stderr

Scope note: these rules govern the plugin's `opReferences` entries only. Core metadata surfaces (`resolutionHistory`, `resolutionTracking`, `originalConfig`) record raw variable strings straight from the config file, so a private link written in config will appear there. That is the user's own committed config content, not a plugin leak, and scrubbing it in core is out of scope.

Metadata may include diagnostics:

```js
{
  level: 'warning',
  code: 'op_private_link_missing_vault',
  message: '1Password private link did not include a vault ID; service accounts and duplicate item names may require vault scoping.',
  configPath: '...'
}
```

## Sensitive plugin and audit behavior

Mark this plugin as:

```js
{
  source: 'remote',
  sensitive: true,
  risk: 'remote_secret_read'
}
```

Core audit should learn to use these fields when present on custom resolvers:

- `sensitive: true` means the resolver can return secret material.
- `risk: 'remote_secret_read'` should produce a high-severity finding.
- The existing generic `custom_extension` finding may still be included, but the report should prefer the more specific message when available.

Recommended audit finding:

```js
{
  id: 'customResolver:op',
  severity: 'high',
  risk: 'remote_secret_read',
  kind: 'source',
  variableType: 'op',
  sensitive: true,
  message: 'Custom resolver "op" reads secret values from 1Password.'
}
```

Safe mode behavior:

- During actual resolution, safe mode already blocks all custom resolvers by default (`src/main.js:232`, `src/utils/security/safetyPolicy.js:85-92`). That satisfies "block sensitive resolvers by default" with zero core change.
- `audit`, `introspect`, and `analyze` already pass `blockCustomResolvers: false` (`src/index.js:145-162`), so the plugin can register and be reported without fetching secrets.
- No `safetyPolicy.js` change in v1. Classifying resolvers by sensitivity inside the policy is not needed until safe mode wants to allow non-sensitive custom resolvers, which nothing requires yet.

Audit changes needed:

- `src/index.js:165-167` currently passes only `source.type` strings to `buildAuditReport`. Pass the source objects (or `{ type, sensitive, risk }` projections) so audit can see `sensitive` and `risk`.
- `src/utils/introspection/audit.js:43-54` emits the generic `custom_extension` finding. When a resolver carries `risk`/`sensitive`, emit the specific high-severity finding instead.

## Sync support

The plugin must support both:

```js
await configorama('config.yml', {
  variableSources: [createOnePasswordResolver(options)]
})
```

and:

```js
configorama.sync('config.yml', {
  variableSources: [createOnePasswordResolver(options)]
})
```

The current sync bridge in `src/sync.js` expects custom variable sources to be serializable descriptors with:

- `match` as a string
- `resolver` as a path to a JS file

That is not sufficient for a plugin factory with refs, caches, metadata, and options.

Add a sync-compatible plugin contract:

```js
{
  type: 'op',
  match: /^op(?::|\()/,
  resolver,
  syncFactory: require.resolve('./sync-factory'),
  syncOptions: {
    refs,
    account,
    configDir,
    skipResolution
  }
}
```

Core sync bridge behavior:

1. In `src/index.js`, keep passing `_settings.variableSources` to `sync-rpc`. sync-rpc JSON-serializes the init args, so RegExp `match` arrives as `{}` and function `resolver` is dropped — `syncFactory` (string path) and `syncOptions` (JSON) survive, which is why the worker must check `syncFactory` before the existing string-descriptor validation.
2. In `src/sync.js`, detect sources with `syncFactory`.
3. Require the factory path inside the sync worker.
4. Call the factory with `syncOptions`.
5. Use the returned resolver object as a normal variable source.
6. In the worker's `returnMetadata` block (`src/sync.js:53-77`), add the same `collectMetadata` loop that the async path runs in `src/index.js:76-88`, iterating the factory-created sources. Without this, `opReferences` never reaches sync callers.

Example worker code shape:

```js
if (varSrc.syncFactory) {
  const createSource = require(getFullPath(varSrc.syncFactory))
  const source = createSource(varSrc.syncOptions || {})
  return source
}
```

The sync worker itself already runs in a separate process through `sync-rpc`, so the returned resolver can use async `execFile` internally while the public `configorama.sync()` call blocks until the worker returns.

The plugin should include:

```text
plugins/onepassword/sync-factory.js
```

which exports the same factory as `index.js` or a thin wrapper around it.

`syncOptions` must be JSON-serializable. Reject non-serializable options such as injected `execFile` when sync mode is used.

## Error handling

Errors should be explicit and actionable:

- unknown alias: `Unknown 1Password alias "npm". Configure refs.npm.`
- invalid alias: `Invalid 1Password alias "npm.prod". Aliases may contain only letters, numbers, and underscores.`
- missing CLI: `1Password CLI "op" was not found on PATH. Install 1Password CLI or remove the op resolver.`
- signin failure: `1Password CLI could not read the item. Run op signin, unlock 1Password app integration, or configure OP_SERVICE_ACCOUNT_TOKEN.`
- unsupported public share link: `Public 1Password share links are not supported. Use Copy Private Link or an op:// secret reference.`
- invalid private link: `Invalid 1Password private link. Expected query parameter "i" with the item ID.`
- ambiguous field: `1Password item "x" has multiple candidate secret fields: notesPlain, password. Set field explicitly.`
- ambiguous section field: `1Password item "x" has multiple fields labeled "token". Set section explicitly.`
- missing field: `Field "password" was not found in 1Password item "x".`
- no inferred field: `1Password item "x" has no obvious secret field. Set field explicitly.`
- missing key path: `Key path "NPM_TOKEN" was not found in 1Password field "notesPlain".`
- parse failure: `Could not parse 1Password field "notesPlain" as INI/dotenv.`

Do not include secret values, full private links, public link tokens, stdout, or stderr in error messages.

## Files to add

```text
plugins/onepassword/
  README.md
  index.js
  index.test.js
  op-cli.js
  op-cli.test.js
  parser.js
  parser.test.js
  sync-factory.js
  package.json
```

Optional example:

```text
plugins/onepassword/example/
  config.yml
  usage.js
```

Core files likely to update:

```text
package.json
src/index.js
src/sync.js
src/utils/introspection/audit.js
README.md
index.d.ts
```

## Tests

### Parser tests

- parses `KEY=value`
- ignores `#` comments
- ignores `;` comments if supported by the parser
- strips no useful characters from values
- supports section paths
- errors on missing key
- preserves empty string values when present
- does not parse whole value unless key path is requested
- does not trim raw values returned by `${op:alias}`

### Syntax and normalization tests

- parses `${op:npm}`
- parses `${op:npm.NPM_TOKEN}`
- rejects aliases containing dots, hyphens, spaces, or slashes
- parses `${op(op://vault/item/notesPlain)}`
- parses `${op(op://vault/item/notesPlain).NPM_TOKEN}`
- parses `${op(item-id).NPM_TOKEN}`
- parses `${op(My Database Login).password}`
- parses private item link function syntax without being confused by dots, query params, or `&`
- extracts `i` and `v` from private item links
- drops `a`, `h`, and raw URL from `opReferences` metadata
- rejects private item link colon syntax
- rejects raw `op://` colon syntax with a pointer to `${op(op://...)}`
- rejects public share links
- accepts object ref with `{ item, vault, section, field }`
- rejects object ref that combines `item` and `ref`

### CLI utility tests

Use dependency injection for `execFile`; do not call real `op` in unit tests.

- `readSecretRef()` calls `op read --no-newline <ref>`
- `getItem()` calls `op item get <spec> --format json --reveal`
- vault/account/config options become CLI args
- private link vault becomes `--vault`
- `ENOENT` becomes missing-CLI error
- signin-ish non-zero exit becomes sanitized auth error
- not-found non-zero exit becomes sanitized not-found error
- stdout JSON is parsed for item fetches
- stderr is not included in thrown messages

### Field selection tests

- explicit field wins over inference
- explicit field matches `id`
- explicit field matches `label`
- explicit field matches `purpose`
- explicit section disambiguates duplicate labels
- duplicate labels without section throw ambiguity
- single `notesPlain` candidate is inferred
- single `password` candidate is inferred
- single concealed token-like candidate is inferred
- `notesPlain` plus `password` throws ambiguity
- username/email/url fields are ignored for inference
- no candidates throws no-secret-field error

### Resolver tests

- alias string maps to secret ref read
- alias string maps to item get when not a ref/link
- alias object maps to item get with vault
- private link maps to item get with item ID and vault ID
- `${op:alias}` returns raw selected field
- `${op:alias.KEY}` parses INI note and returns key
- `${op:alias.section.KEY}` parses INI section and returns key
- metadata records refs but not secret values
- `skipResolution` returns placeholders and records metadata
- cache prevents duplicate CLI calls for the same item/ref
- failed calls are not cached
- `clearCache()` clears caches and metadata

### Sync tests

- `configorama.sync()` can use `createOnePasswordResolver()` through `syncFactory`
- sync mode rejects non-serializable injection options
- sync mode returns the same resolved config as async mode for mocked `op`
- sync mode collects `opReferences` metadata when `returnMetadata: true`

### Core packaging tests

- `require('configorama/plugins/cloudformation')` resolves from package exports
- `require('configorama/plugins/onepassword')` resolves from package exports
- `npm pack --dry-run` includes plugin `index.js` files and excludes plugin tests, examples, and nested lockfiles

### Audit/safe-mode tests

- `audit()` reports `op` as high-risk `remote_secret_read`
- audit finding includes `sensitive: true`
- safe mode blocks actual resolution by default
- audit/inspect can still register the plugin with `blockCustomResolvers: false`

### Optional real CLI smoke test

Add a gated test that runs only when:

```text
CONFIGORAMA_OP_E2E=1
CONFIGORAMA_OP_TEST_REF=op://...
```

The test should:

- call `op read --no-newline` through the utility
- assert a non-empty value
- never print the value
- skip by default

Do not require this test in normal CI.

## Documentation

`plugins/onepassword/README.md` should cover:

- installing 1Password CLI as a prerequisite
- enabling/signing into CLI or using `OP_SERVICE_ACCOUNT_TOKEN`
- resolver setup
- alias syntax
- direct item syntax
- direct secret ref syntax
- private item link syntax
- unsupported public share links
- field inference rules
- explicit `field` and `section`
- ambiguity errors
- INI/dotenv notes with comments
- raw return behavior for `${op:alias}`
- security model: no persistence, no logging, values still enter resolved config
- `skipResolution`
- async and sync usage
- safe-mode/audit behavior

Root README should add a short 1Password entry in Bundled Plugins after CloudFormation and update CloudFormation wording if needed to reflect the package export fix.

## Implementation order

1. Fix root package exports/files for `plugins/cloudformation` and `plugins/onepassword`.
2. Add sync plugin contract in `src/sync.js` (including worker `collectMetadata` collection) with tests using a tiny mock plugin.
3. Add sensitive custom resolver audit support in `src/index.js` and `src/utils/introspection/audit.js`.
4. Add `plugins/onepassword/package.json`.
5. Build and test `parser.js` for INI/dotenv key path reads.
6. Build and test private link parsing and reference normalization.
7. Build and test `op-cli.js` with injected `execFile`.
8. Build field selection and inference against representative `op item get --format json --reveal` fixtures.
9. Build resolver syntax parsing, caching, metadata, and `skipResolution`.
10. Add `sync-factory.js` and sync tests.
11. Add README and example usage.
12. Add root README bundled plugin section.
13. Add optional gated real-CLI smoke test.
14. Run full tests and type checks.

## Acceptance criteria

- Configorama can resolve `${op:npm.NPM_TOKEN}` from an INI-style secure note.
- Configorama can resolve `${op:db}` from an item with a single unambiguous password field.
- Configorama can resolve an `op://` secret reference with `op read --no-newline`.
- Configorama can resolve a private item link copied from 1Password by extracting item ID and vault ID.
- Public share links are rejected with a clear message.
- Ambiguous items fail with a clear instruction to set `field` and optionally `section`.
- Missing `op` binary and signin/auth problems produce sanitized actionable errors.
- No default tests call real 1Password.
- Secret values are absent from metadata and error messages.
- Full private links are absent from `opReferences` metadata and placeholders.
- The plugin works through both async and sync Configorama APIs.
- The root package exports bundled plugin subpaths.
- Audit reports the plugin as sensitive/high-risk remote secret access.
- Safe mode blocks actual secret resolution by default.

## Follow-ups outside this plan

- `DEFAULT_VAR_SYNTAX` in `src/utils/parsing/parse.js:13` is an older copy of the variable char class without `&`, so the `configorama/parse-file` subpath will not match private-link variables. Align it with `buildVariableSyntax` in a separate change.
