# configorama 1Password plugin

Resolves configuration values from 1Password through the [`op` CLI](https://developer.1password.com/docs/cli/).

Secrets are fetched at resolution time. The plugin never persists them, never logs CLI output, and never passes resolved values as command-line arguments. Resolved values do enter the config object returned to your code — treat that object as sensitive.

## Prerequisites

- Install the [1Password CLI](https://developer.1password.com/docs/cli/get-started/) and make sure `op` is on `PATH`.
- Sign in with `op signin`, enable the 1Password app integration, or set `OP_SERVICE_ACCOUNT_TOKEN`. The CLI reads `OP_ACCOUNT`, `OP_CONFIG_DIR`, and `OP_SERVICE_ACCOUNT_TOKEN` on its own — the plugin does not manage auth.

## Setup

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
    copiedLink: 'https://start.1password.com/open/i?a=ACCT&v=VAULT_ID&i=ITEM_ID&h=my.1password.com'
  },
  // account: 'my',            // passed to op as --account
  // configDir: '/op/config',  // passed to op as --config
  // skipResolution: true,     // collect metadata, return placeholders, never call op
})

const config = await configorama('config.yml', {
  variableSources: [opResolver]
})
```

Options:

| Option | Type | Description |
|--------|------|-------------|
| `refs` | object | Alias map. Values may be an `op://` secret reference, an item ID/name, a private item link, or `{ item, vault, section, field }` / `{ ref }` / `{ url }` |
| `account` | string | Passed to `op` as `--account` |
| `configDir` | string | Passed to `op` as `--config` |
| `opPath` | string | Path to the `op` binary (defaults to `op` on `PATH`) |
| `skipResolution` | boolean | Record metadata and return deterministic placeholders without calling `op` |

## Alias syntax (recommended)

```yaml
npmToken: ${op:npm.NPM_TOKEN}
dbPassword: ${op:database}
rawNote: ${op:npm}
nested: ${op:npm.database.password}
```

Alias names may contain only letters, numbers, and underscores. Dots separate the alias from a key path.

## Direct function syntax

```yaml
directItem: ${op(item-id-example).NPM_TOKEN}
spacedName: ${op(My Database Login).password}
directRef: ${op(op://vault/item/field)}
directRefKey: ${op(op://vault/item/notesPlain).NPM_TOKEN}
privateLink: ${op(https://start.1password.com/open/i?a=ACCT&v=VAULT_ID&i=ITEM_ID&h=my.1password.com).NPM_TOKEN}
```

The parentheses give the parser a reliable boundary for specs containing dots, slashes, spaces, or query parameters. Prefer aliases for readability and auditability.

### Unsupported syntax

- `${op:op://vault/item/field}` — colon syntax is reserved for aliases. Error message points you to `${op(op://vault/item/field)}`.
- Private links in colon syntax.
- Public "share with anyone" links (`share.1password.com`) in any position. Use **Copy Private Link** or an `op://` secret reference instead.

## Private item links

Links copied with **Copy Private Link** are supported:

```text
https://start.1password.com/open/i?a=ACCOUNT&v=VAULT_ID&i=ITEM_ID&h=my.1password.com
onepassword://open/i?a=ACCOUNT&v=VAULT_ID&i=ITEM_ID&h=my.1password.com
```

The plugin extracts `i` (item ID) and `v` (vault ID) and fetches with `op item get <itemId> --vault <vaultId>`. The `a`/`h` parameters and the raw URL are never stored in metadata. A link without `v` still resolves, with a warning diagnostic — service accounts and duplicate item names may require vault scoping.

## Field selection

With an explicit `field` on a ref, the plugin matches against the 1Password field `id`, `label`, and `purpose` (case-insensitive). `section` matches `section.id`/`section.label` and is required when the same label exists in multiple sections.

Without a configured `field`, the plugin infers a single secret field:

- `notesPlain`/notes, `purpose: PASSWORD`, `type: CONCEALED`, or secret-like labels (`password`, `token`, `api_key`, `secret`, `credential`, `private key`) are candidates
- username, email, URL, and other metadata fields are ignored
- exactly one candidate wins; zero or multiple candidates throw an error telling you to set `field` (and `section`)

Ambiguity is always an error — the plugin never silently prefers `notesPlain` over `password`.

In direct/alias syntax without a configured field, the first key path segment may select a field by name: `${op(My Login).password}` picks the `password` field. If no field matches, the segment is treated as an INI key inside the inferred field: `${op(note-item).NPM_TOKEN}`.

## Structured notes (INI/dotenv)

A secure note like:

```ini
# npm automation token
NPM_TOKEN=npm_xxx

[database]
password=s3cr3t
```

resolves as:

```yaml
npmToken: ${op:npm.NPM_TOKEN}          # npm_xxx
dbPassword: ${op:npm.database.password} # s3cr3t
rawNote: ${op:npm}                      # the whole note text, unparsed
```

`${op:alias}` always returns the raw field text — even when it contains `=`. Parsing only happens when a key path is requested, so tokens, base64, and connection strings are never corrupted.

## skipResolution

With `skipResolution: true` the resolver records metadata and returns deterministic placeholders without calling `op`:

```text
[OP:alias:npm.NPM_TOKEN]
[OP:secretRef:op://vault/item/field]
[OP:item:item-id:NPM_TOKEN]
[OP:privateLink:item-id]
```

## Sync usage

```js
const config = configorama.sync('config.yml', {
  variableSources: [createOnePasswordResolver({ refs })]
})
```

Sync mode rebuilds the resolver inside a worker process from JSON-serializable options and always uses the real `op` binary.

## Auth prompts

1Password app-integration auth is per `op` process. The resolver runs the first `op` call alone and queues the rest behind it, so a config referencing many items triggers at most one biometric/authorization prompt per resolution run instead of one per item.

## Safe mode and audit

- `safeMode: true` blocks all custom resolvers during resolution, including this one.
- `configorama.audit()` registers the plugin without fetching secrets and reports a high-severity `remote_secret_read` finding, because this resolver returns secret material.

## Metadata

With `returnMetadata: true`, references are collected under `metadata.opReferences` — reference kinds, item/vault IDs, fields, key paths, and config paths. Secret values, full private links, and CLI output are never recorded.
