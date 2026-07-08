# Cache All Configorama 1Password Syntax Flavors

Status: reviewed spec. Design review 2026-07-07 settled: cached payloads are plugin-side JSON envelopes ({ value, fieldName }) so audit metadata stays identical between miss and hit runs; cache keys are NUL-joined fixed-order parts (no JSON hashing); `getOrSet` mirrors `read` for `OP_CACHE_DISABLED`/win32.

## Goal

Extend the `packages/configorama/plugins/onepassword` integration so the optional
`@davidwells/op-cache` provider can cache every supported `${op...}` variable
flavor, not only direct `op://vault/item/field` secret references.

The practical target is the agent workflow:

```bash
configx .env -- node script.js
configx .env -- node script.js
configx .env -- node script.js
```

When those fresh Node processes resolve the same 1Password-backed values within
the configured TTL, the first process may prompt through the normal 1Password CLI
flow, but subsequent processes should reuse the in-memory daemon cache regardless
of whether the config used aliases, item names, private item links, explicit
fields, inferred fields, or structured note key paths.

## Current State

`@davidwells/op-cache` currently caches scalar `op read` results for direct
secret references:

```yaml
directBare: ${op://vault/item/field}
directFunc: ${op(op://vault/item/field)}
aliasToRef: ${op:npmToken} # when refs.npmToken = "op://vault/item/field"
```

One nuance the rest of this plan builds on: `secretRef` **with a key path**
already flows through the daemon cache today. `fetchValue` caches the whole
backing field via `opCache.read(reference.ref)` and key selection happens
afterward in the resolver (`packages/configorama/plugins/onepassword/index.js:226-230`
and `index.js:313-317`). So `${op(op://vault/item/notesPlain).KEY}` currently
stores the entire `notesPlain` field in the daemon. This plan changes that
path's cached granularity from whole-field to final-value — a behavior change
to an already-shipped cache path, not a pure expansion. No migration is
needed: the synthetic refs below produce different cache keys, so old
whole-field entries simply expire unused.

The plugin path for direct refs is:

```text
parse variable
-> reference.kind === "secretRef"
-> readSecretRefWithOptionalCache(ref)
-> opCache.read(ref)
-> client checks daemon, runs op read on miss, stores scalar value
```

All item-like syntaxes currently bypass `op-cache`:

```yaml
aliasRaw: ${op:npm}
aliasKey: ${op:npm.NPM_TOKEN}
itemField: ${op(database-prod).password}
itemKey: ${op(note-item).database.password}
privateLinkKey: ${op(https://start.1password.com/open/i?...).NPM_TOKEN}
objectExplicit: # refs.database = { item, vault, section, field }
```

Those paths use:

```text
op item get <item|name> --vault <vault> --format json --reveal
-> local field selection or inference
-> optional structured INI/dotenv parsing
-> return final value
```

The resolver has an in-process `itemCache`, so duplicate item reads within one
Configorama process already share one `op item get`. That does not help the
fresh-process `configx`/agent loop.

## Supported Syntax Inventory

The plan must preserve behavior for all existing forms:

| Syntax | Normalized form | Current op path | Desired cache behavior |
| --- | --- | --- | --- |
| `${op://vault/item/field}` | `secretRef` | `op read` | Cache exact scalar ref, unchanged |
| `${op(op://vault/item/field)}` | `secretRef` | `op read` | Cache exact scalar ref, unchanged |
| `${op(op://vault/item/notesPlain).KEY}` | `secretRef` + keyPath | `op read` then parse | Cache final selected key value (change: today caches the whole field) |
| `${op:alias}` where alias is `op://...` | `secretRef` | `op read` | Cache exact scalar ref, unchanged |
| `${op:alias.KEY}` where alias is `op://...` | `secretRef` + keyPath | `op read` then parse | Cache final selected key value (change: today caches the whole field) |
| `${op:alias}` where alias is item/name/link/object | `item`/`privateLink` | `op item get --reveal` | Cache final resolved value |
| `${op:alias.KEY}` | `item`/`privateLink` + keyPath | `op item get --reveal` then select/parse | Cache final resolved value |
| `${op(item-id).field}` | `item` + keyPath | `op item get --reveal` | Cache final resolved value |
| `${op(item-name).field}` | `item` + keyPath | `op item get --reveal` | Cache final resolved value |
| `${op(private-link).KEY}` | `privateLink` + keyPath | `op item get --reveal` | Cache final resolved value |
| `refs.alias = { item, vault, section, field }` | `item` explicit field | `op item get --reveal` | Cache final resolved value |
| `refs.alias = { url }` | `privateLink` | `op item get --reveal` | Cache final resolved value |

Unsupported syntax remains unsupported:

- `${op:op://vault/item/field}` still errors and points to function syntax.
- Private links in colon syntax still error.
- Public share links remain rejected.

## Non-Goals

- Do not silently enable caching just because `@davidwells/op-cache` is installed.
- Do not persist secrets or item JSON to disk.
- Do not require a new daemon protocol for whole-item JSON caching in this pass.
- Do not make configx own secret cache state.
- Do not cache failures, missing fields, auth errors, parse errors, or ambiguity.
- Do not weaken `OP_CACHE_DISABLED=1`.
- Do not cache when `OP_SERVICE_ACCOUNT_TOKEN` is set unless
  `allowServiceAccountTokenCache: true` is explicitly configured.

## Core Decision: Cache Final Resolver Values

Cache final resolved values for non-direct syntaxes, not whole `op item get`
JSON.

For an item/private-link syntax, the plugin already knows how to:

1. fetch the item JSON;
2. select an explicit or inferred field;
3. optionally treat the first key path segment as a field selector;
4. parse structured INI/dotenv content only when a key path remains;
5. return the exact string Configorama needs.

The cache key should represent that final resolver operation. On cache hit, the
plugin can return the final value without fetching item JSON at all.

This avoids expanding the daemon's secret surface from "one resolved value" to
"full item JSON with every revealed field". It also avoids tying `op-cache` to
Configorama-specific field selection logic.

### Why Not Cache Whole Item JSON?

Whole item JSON caching would reduce repeated reads for multiple fields on the
same item across separate processes, but it has worse tradeoffs for v1:

- it stores more secret material than the caller requested;
- it would require item JSON cache APIs, schemas, and tests in `@davidwells/op-cache`;
- it would make `op-cache` aware of 1Password item shape instead of remaining a
  scalar secret cache primitive;
- it would make invalidation more complex when a single field changes;
- it would make stats/debugging less obviously secret-minimal.

Final-value caching matches the current daemon design and keeps the feature
small enough to ship safely.

### Accepted Tradeoff

If one config resolves three different key paths from the same structured note:

```yaml
a: ${op:npm.NPM_TOKEN}
b: ${op:npm.database.password}
c: ${op:npm.GITHUB_TOKEN}
```

the first fresh process still uses the existing in-process `itemCache`, so it
runs one `op item get`. It will then store three final values under three cache
keys. Later fresh processes hit all three values without `op`.

That is good enough for the motivating repeated-agent-command workflow.

Two more tradeoffs to state plainly:

- **Regression case for whole-field sharing.** Today, N key paths off one
  cached `notesPlain` field cost zero op calls in a fresh process once the
  field is cached. Under final-value caching, a key path not previously
  resolved is a fresh `op read`/`op item get` even when a sibling key is
  cached. Fine for the configx loop (same keys every run); it is a tradeoff,
  not a free win.
- **Dual-entry duplication in mixed configs.** `x: ${op(op://v/i/notesPlain)}`
  stores the whole field under the direct-read key while
  `y: ${op(op://v/i/notesPlain).KEY}` stores the extracted key under a
  synthetic key. The daemon can hold both granularities of the same secret
  simultaneously. Accepted: each entry is still exactly what some caller
  asked for.

### Cached Payload: Plugin-Side Envelope

For inferred-field reads, the resolver backfills `entry.field` in
`opReferences` audit metadata with the field it discovered during the fetch
(`index.js:309-311`). A cache hit skips the fetch, so the discovered field
name must ride along with the cached value or audit output would differ
between miss runs and hit runs.

Decision: the producer returns a JSON envelope **as a string**, and the
envelope is a private convention of the plugin. `@davidwells/op-cache` gains
the `getOrSet` API described below, but it does not understand this envelope:
the protocol, daemon, and "producer returns a plain string" contract all hold,
and the daemon stores opaque strings either way:

```json
{"value":"...","fieldName":"credential"}
```

Rules:

- the plugin encodes on produce and decodes on every return (hit or miss),
  records `fieldName` into metadata, and returns `value`;
- envelope parse failure on a hit is treated as a cache miss: recompute via
  the producer and overwrite the entry;
- envelope shape changes ride under the resolver cache schema version that is
  already a key dimension — a shape change produces new keys and old entries
  expire unread, so the envelope needs no version field of its own;
- direct `op://` reads through `opCache.read` keep storing raw values; the
  daemon holds two entry formats (raw scalars and envelope JSON) and does not
  care — this is cosmetic, visible only when debugging entries;
- field labels ("credential", "password") are not secrets; caching them next
  to the value is acceptable.

This buys byte-identical `opReferences` audit metadata regardless of cache
temperature — audit output that changes based on cache state would be a
worse wart than the encode/decode round-trip.

## Cache Key Model

Direct `op://` scalar reads keep using `opCache.read(ref, ...)`, whose key is
computed by the package from:

```text
version | scope | account | configDir | opPath | reference
```

For final-value resolver caching, Configorama should compute a deterministic
synthetic cache reference and ask `op-cache` to cache the value under that ref.

Synthetic ref shape (canonical — this is the single key spec for this plan):

```text
configorama-op://v1/<sha256hex>
```

Where the hash is computed over NUL-joined fixed-order parts, the same idiom
`packages/op-cache/src/key.js` already uses — no JSON hashing, so there is no
key-ordering/canonicalization pitfall:

```text
schemaVersion \0 kind \0 itemOrRef \0 vault \0 section \0 field \0 keyPath
```

- `schemaVersion`: resolver cache schema version (`v1`); bump it whenever
  selection semantics or the envelope shape change — old entries then expire
  unread
- `kind`: `item | privateLink | secretRef` (normalized)
- `itemOrRef`: normalized item ID/name, or the `op://` ref for secretRef
- `vault` / `section` / `field`: normalized values or empty string
- `keyPath`: requested key path or empty string

There is deliberately no `selectionMode` dimension: it is fully derivable from
`field`/`keyPath` presence, and `schemaVersion` covers future changes to the
selection algorithm.

`account`, `configDir`, and `opPath` are deliberately NOT part of the
synthetic ref. They travel via `getOrSet` opts and `op-cache` applies them as
cache key dimensions exactly as it does for `read`
(`packages/op-cache/src/key.js:34-44`). One owner per dimension — putting them
in both places invites silent partition drift when one site changes and the
other does not.

The daemon only sees the synthetic ref's hash-derived cache key, not the raw
private link URL or full item JSON.

Important: do not put raw private link URLs into synthetic refs. Normalize them
to item/vault IDs first, as current metadata already does.

## Required API Addition in `@davidwells/op-cache`

Today `op-cache.read(ref, opts)` always fetches misses by running:

```bash
op read --no-newline <ref>
```

For final-value caching, Configorama needs "get or compute" semantics where the
miss producer is local plugin logic, not `op read`.

Add a programmatic API:

```js
const value = await opCache.getOrSet(cacheRef, async () => {
  return computeResolvedValueWithCurrentPluginLogic()
}, {
  account,
  configDir,
  opPath,
  ttlSeconds,
  scope,
  fallbackToOp: false,
  stderr: process.stderr
})
```

Semantics:

- compute the same cache key dimensions as `read`, using `cacheRef` as the
  reference dimension; `getOrSet` accepts any non-empty reference string — it
  must NOT reuse `read`'s `op://` prefix guard
  (`packages/op-cache/src/api.js:16`);
- mirror `read`'s bypass behavior exactly (`api.js:20-22`):
  `OP_CACHE_DISABLED=1` or win32 → run the producer directly, never touch the
  daemon. The API owns this, as settled in v1; the plugin's
  `shouldBypassOpCache` stays as belt-and-suspenders;
- auto-start daemon on get, same as read;
- on hit, first run `opts.validateCached(value)` when provided. If it returns
  `false` or throws, treat the entry as unusable, recompute via the producer,
  and overwrite the cache entry. This hook exists specifically so the
  onepassword plugin can reject malformed JSON envelopes without needing a
  public `set`/`delete` API. Emit a one-line stderr note on rejection, at
  most once per process (same pattern as the clamp warning) — a validator
  that persistently rejects means every process recomputes forever, and that
  cache-defeat must be visible, not silent;
- on hit that passes validation (or with no validator), return cached value;
- on miss, call the producer in the client process;
- if producer resolves, store the returned string with TTL and return it;
  require a string and throw on anything else;
- if producer rejects, do not store anything;
- respect daemon TTL clamp; emit the clamp warning at most once per process —
  a config resolving 20 cached values against a clamping daemon must not
  print 20 identical stderr lines;
- send `refHash: shortHash(cacheRef)` and `accountHash` on set, matching
  `read`'s diagnostic metadata (`api.js:38-39`);
- respect socket safety checks;
- expose the same fail-closed vs fallback policy shape.

The CLI does not need a public `get-or-set` command because producers are
functions. This is API-only.

Known limitation, same as v1 `read`: two fresh processes concurrently missing
the same key both run the producer (both run `op item get`) and may both
prompt. Accepted — the motivating workflow is sequential agent commands. Do
not add ad hoc locking; if it ever matters, design daemon-side request
coalescing deliberately.

### Fallback Semantics for `getOrSet`

For Configorama plugin integration:

- default `fallbackToOp: false` means daemon failure fails closed before running
  the producer;
- `fallbackToOp: true` means daemon failure runs the producer directly and emits
  the same style of stderr warning as `read`;
- producer failure always surfaces as the producer's sanitized error.

Naming note: in `getOrSet` the fallback runs the producer, not `op` itself.
Document the option as "on daemon failure, do the work directly". Producers
here always bottom out in `op`, and keeping one option name flowing from
`cache.fallbackToOp` through both `read` and `getOrSet` is worth the slight
imprecision.

This matches the existing plugin policy: a broken configured cache is a hard
failure unless the user opts into degradation.

## Resolver Refactor

Introduce a single resolver operation boundary:

```js
async function resolveReference(reference, keyPath, label) {
  if (reference.kind === 'secretRef' && keyPath === undefined) {
    return readSecretRefWithOptionalCache(reference.ref)
  }

  return resolvedValueWithOptionalCache(reference, keyPath, label, () => {
    return resolveReferenceWithoutPersistentCache(reference, keyPath, label)
  })
}
```

`resolveReferenceWithoutPersistentCache` should contain the current behavior:

- direct secret ref read;
- item JSON fetch with in-process item cache;
- explicit field selection;
- key-path first-segment field selection;
- inferred field selection;
- structured parse and key lookup.

`resolvedValueWithOptionalCache` should:

- bypass when no `opCache`;
- bypass when `OP_CACHE_DISABLED=1`;
- bypass when `execFile` is injected;
- bypass when `OP_SERVICE_ACCOUNT_TOKEN` is set and not explicitly allowed;
- create a synthetic cache ref from normalized reference + keyPath + resolver
  selection inputs;
- call `opCache.getOrSet`.

Direct `op://` with no key path can continue to call `opCache.read(ref)`. This
keeps the fast path compatible with standalone `op-cache read`.

Direct `op://` with a key path should use final-value caching:

```yaml
value: ${op(op://vault/item/notesPlain).NPM_TOKEN}
```

The cache should store only `NPM_TOKEN`, not the whole notes field, because the
caller asked for one final value.

## Selection Metadata and Cache Keys

The cache key must be stable before a miss computes the item. That means it can
include requested inputs but not discovered outputs like "the inferred field was
credential" unless the plugin performs an uncached lookup first.

Key dimensions are exactly the canonical synthetic ref spec above (schema
version, kind, itemOrRef, vault, section, field, keyPath) plus the
`account`/`configDir`/`opPath` dimensions `op-cache` applies from opts. There
is one key spec in this document; do not derive a second one.

For inferred-field reads, the key says "infer the field for this item with this
keyPath", not "credential" — but the DISCOVERED field name is preserved in the
cached envelope (see Cached Payload above), so audit metadata is identical on
hits and misses. If the item's fields change while the cache entry is live, the
cached value may remain until TTL expiry. That is already true for direct
`op://` field changes and is acceptable within a short TTL.

If this becomes surprising, later versions can add a `cache.schemaVersion` or
`cache.inferredFieldSalt` option, but v1 should keep TTL as the invalidation
mechanism.

## Private Link Handling

Private links must never be stored raw in metadata, logs, or synthetic refs.

Current normalization extracts:

```text
i = item ID
v = vault ID
```

The cache key should use only:

```json
{
  "kind": "privateLink",
  "item": "<item id>",
  "vault": "<vault id or undefined>"
}
```

Private links without `v` remain supported with the existing warning. Their
cache keys omit vault. This preserves current behavior but means duplicate item
names/IDs across contexts are only as safe as the original lookup. Account and
configDir remain part of the key.

## Option Shape

Keep the existing option:

```js
cache: {
  provider: 'op-cache',
  ttlSeconds: 300,
  scope: 'user',
  fallbackToOp: false,
  allowServiceAccountTokenCache: false
}
```

Do not add a `mode` or `itemSyntax` switch. The user intent is clear and the
feature is still pre-publish: when `cache.provider === 'op-cache'`, all
supported onepassword plugin syntaxes are cacheable under the final-value model.

## Backward Compatibility

No behavior changes when:

- `cache` is not configured;
- `cache.provider` is not `'op-cache'`;
- `OP_CACHE_DISABLED=1`;
- tests inject `execFile`;
- `OP_SERVICE_ACCOUNT_TOKEN` is set without
  `allowServiceAccountTokenCache: true`.

With caching configured, more values will be cached than before. This is a
feature expansion, but it affects security posture. Documentation must clearly
state:

- enabling op-cache caches final resolved values for all onepassword plugin
  syntaxes;
- values live in daemon memory until TTL expiry, clear, or stop;
- secrets are still never written to disk by op-cache;
- short TTLs are recommended for interactive agents.

## Testing Plan

### `@davidwells/op-cache` API Tests

Add tests for `getOrSet`:

- cache miss calls producer once, stores value, returns value;
- cache hit does not call producer;
- `validateCached` can reject a hit, causing producer recompute and overwrite;
- `validateCached` rejection emits a stderr note at most once per process;
- producer rejection is not cached;
- daemon failure fails closed when fallback is false;
- daemon failure runs producer when fallback is true and emits bypass warning;
- TTL expiration causes producer to run again;
- scope separation keeps `scope:a` and `scope:b` isolated;
- key partitioning: changed `account`, `configDir`, or `opPath` opts produce a
  miss for the same `cacheRef`;
- non-string producer return value throws and is not stored;
- `OP_CACHE_DISABLED=1` bypasses daemon and runs producer each call (the API
  owns disabled handling, settled in v1 — `api.js:20-22`);
- win32 (platform-stubbed) runs producer directly, never touches a socket;
- TTL clamp warning emitted at most once per process across many `getOrSet`
  calls;
- set message carries `refHash`/`accountHash` diagnostics, matching `read`.

### Onepassword Plugin Unit/Integration Tests

Update `packages/configorama/plugins/onepassword/op-cache.test.js`.

Replace the current assertion:

```text
item reads do not use op-cache daemon
```

with tests proving item syntaxes do use op-cache when configured:

- alias to item raw field caches across separate processes;
- alias to structured note key path caches across separate processes;
- direct item ID function syntax caches final selected field;
- item name function syntax caches final selected field;
- private link syntax caches final selected value and does not expose raw URL in
  metadata or cache ref;
- object refs with `{ item, vault, field }` cache final selected value;
- explicit section+field refs cache separately from same field label in another
  section;
- direct `op://...` with key path caches final key value;
- `OP_CACHE_DISABLED=1` bypasses all syntax caches;
- service account token bypass applies to all syntax caches unless allowed;
- missing op-cache package still gives install hint only when cache configured;
- envelope round-trip: producer encodes `{value, fieldName}`, hit decodes and
  returns the same value with the same metadata;
- envelope parse failure on a hit is treated as a miss: producer reruns and
  overwrites the entry;
- `opReferences` metadata is identical between a miss run and a hit run,
  including `field` backfill for inferred-field reads;
- the sync-worker resolution path (sync-factory receives the `cache` option
  via `buildSyncOptions`, `index.js:344-357`) caches and hits the same way as
  the async path.

Use fake `op` binaries and temp sockets. Never call real 1Password from tests.

### Regression Tests for Prompt Reduction

Create a cross-process test that runs two separate Node processes resolving:

```yaml
a: ${op:npm.NPM_TOKEN}
b: ${op(database-prod).password}
c: ${op(private-link).credential}
d: ${op(op://vault/item/field)}
```

Expected:

- first process calls fake `op` once per distinct backing operation;
- second process returns all values with zero fake `op` calls;
- daemon stats show hits on the second process;
- stdout remains only resolved config output.

### Real Manual QA

Use real 1Password only manually:

```bash
op-cache stop
configx .env -- node infra/_scripts/hubspot-ops.js channels validate davidwells/projects
configx .env -- node infra/_scripts/hubspot-ops.js channels validate davidwells/projects
op-cache stats --json
op-cache stop
```

Expected:

- first command may prompt;
- second command should not prompt for cached values within TTL;
- `stats --json` shows entries and hits;
- `OP_CACHE_DISABLED=1` restores old prompt behavior.

## Implementation Phases

### Phase 1: Add `getOrSet` to `@davidwells/op-cache`

Files:

- `packages/op-cache/src/api.js`
- `packages/op-cache/src/client.js`
- `packages/op-cache/test/unit.test.js`
- `packages/op-cache/test/integration.test.js`

Tasks:

1. Add public `getOrSet(reference, producer, opts)`. Accept any non-empty
   reference string (no `op://` guard).
2. Reuse existing config resolution, scope resolution, cache key hashing, daemon
   get/set messages, TTL clamp behavior, socket checks, and fallback handling.
3. Mirror `read`'s bypass ladder: `OP_CACHE_DISABLED=1` or win32 run the
   producer directly with no daemon contact.
4. Require producer values to be strings; throw on non-strings, store nothing.
5. Emit the TTL clamp warning at most once per process; send
   `refHash`/`accountHash` on set for parity with `read`.
6. Support optional `validateCached(value)` so integrations can reject a hit
   and force producer recompute/overwrite; warn on stderr at most once per
   process when rejection occurs.
7. Export it from `src/api.js`.
8. Add tests.

### Phase 2: Refactor Resolver Around Final Value Computation

Files:

- `packages/configorama/plugins/onepassword/index.js`

Tasks:

1. Extract current item/direct resolution into a no-persistent-cache helper.
2. Preserve the existing in-process `secretRefCache` and `itemCache`.
3. Add synthetic cache ref builder implementing the canonical NUL-joined key
   spec (schemaVersion, kind, itemOrRef, vault, section, field, keyPath).
4. Add envelope encode/decode helpers: producer returns
   `JSON.stringify({ value, fieldName })`; both hit and miss paths decode,
   backfill `entry.field` metadata, and return `value`; pass a
   `validateCached` hook to `opCache.getOrSet` so parse failure on hit is a
   miss and overwrites the stale/malformed entry.
5. Route all cacheable syntaxes through either:
   - `opCache.read(ref)` for direct `op://` with no key path;
   - `opCache.getOrSet(syntheticRef, producer)` for everything else.
6. Preserve metadata behavior (now fully achievable via the envelope) and
   private-link redaction.
7. Preserve cold-start auth hint behavior on cache misses. Cache hits should not
   print an auth hint because no `op` call occurs. The cold-start latch stays
   inside the producer so cache hits never serialize behind it.

### Phase 3: Update Tests

Files:

- `packages/configorama/plugins/onepassword/op-cache.test.js`
- `packages/configorama/plugins/onepassword/index.test.js`

Tasks:

1. Replace item-bypass test with item-cache tests.
2. Add cross-process tests for all major syntax families.
3. Add private-link redaction assertion for synthetic cache refs if observable
   through test hooks; otherwise assert metadata remains redacted and fake op
   call count proves cache hit.
4. Add service-token and disabled-cache coverage for item syntaxes.

### Phase 4: Documentation

Files:

- `packages/configorama/plugins/onepassword/README.md`
- `packages/op-cache/README.md`
- `packages/configx/README.md`

Tasks:

1. Replace "Only direct secret references are cached in v1" with the new all
   syntax behavior.
2. Explain final-value caching and why item JSON is not cached.
3. Document TTL, scope, daemon memory-only storage, and bypass controls.
4. Add examples for aliases, private links, direct item syntax, and structured
   note key paths.

### Phase 5: Verification

Required commands after code changes:

```bash
pnpm --filter @davidwells/op-cache test
node packages/configorama/plugins/onepassword/op-cache.test.js
node packages/configorama/plugins/onepassword/index.test.js
npm run typecheck
pnpm -r test
```

Package smoke after implementation:

```bash
pnpm --filter @davidwells/op-cache pack --pack-destination /tmp
tmpdir=$(mktemp -d)
cd "$tmpdir"
npm init -y >/dev/null
npm install /tmp/davidwells-op-cache-0.1.0.tgz
./node_modules/.bin/op-cache --help
```

## Resolved Decisions

1. `cache: { provider: 'op-cache' }` immediately means all syntaxes — no
   `mode` switch. The feature is still pre-publish and user intent is clear.
2. Direct `op://notesPlain.KEY` caches the final key, not the whole
   `notesPlain` field — least secret surface per entry. Caveats accepted and
   documented above: this changes an already-shipped cache path from
   whole-field to final-value, mixed configs can hold both granularities of
   the same secret simultaneously, and previously-unseen keys off a cached
   field cost a fresh op call.
3. `getOrSet` is public API, documented in the README as an "advanced
   integration API", not a CLI feature.
4. No user-configurable key namespace — scope already provides the
   operational namespace.
5. Cached payloads for `getOrSet` entries are plugin-side JSON envelopes
   (`{ value, fieldName }`) so audit metadata is identical on hits and
   misses. op-cache itself remains string-in/string-out.

## Acceptance Criteria

- With cache disabled or absent, current onepassword plugin behavior is
  unchanged.
- With cache configured, every supported `${op...}` syntax can avoid a second
  `op` invocation across fresh Node processes inside TTL.
- Cache stores final resolved values only (as plugin-side
  `{ value, fieldName }` envelopes for `getOrSet` entries), never whole item
  JSON.
- `opReferences` audit metadata is identical between miss runs and hit runs.
- Private links remain redacted from metadata and are not stored raw in
  synthetic cache references.
- Failed reads, missing fields, ambiguous field selection, auth errors, and
  parse errors are not cached.
- `OP_CACHE_DISABLED=1` bypasses all cache paths.
- `OP_SERVICE_ACCOUNT_TOKEN` bypasses all cache paths unless explicitly allowed.
- All stdout hygiene rules remain intact.
- Required package/plugin/root tests and typecheck pass.
