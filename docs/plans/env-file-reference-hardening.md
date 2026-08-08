---
id: 01KWN69M7GYMFQM1NFBBAJBJ4X
status: draft
createdAt: 2026-07-03T16:51:18-07:00
updatedAt: 2026-07-03T16:51:18-07:00
origin: manual
type: plan
---

# Dotenv File Reference Hardening Plan

Status: implemented 2026-07-03.

## Goal

Make `${file(.env)}` and `${file(.env).KEY}` safe to introspect and report on
without changing the normal resolution behavior added in `54abf89`.

Configorama now treats `.env` files as INI-like files for `file()` references.
That is useful because users can keep secrets outside `process.env` mutation
and still read individual keys:

```yaml
remoteEvents:
  wsUrl: ${file(.env).WSS_URL}
  apiKey: ${file(.env).API_KEY}
```

The follow-up is not to block this. The follow-up is to make all metadata,
audit, graph, and diagnostics surfaces understand that `.env` file references
are likely secret-bearing local file reads.

## Non-Goals

- Do not change normal resolved config output. `configorama config.yml` should
  continue to return real values because resolution is the product behavior.
- Do not mutate `process.env`. This plan is about `file(.env)` references, not
  `useDotenv` / `useDotEnv`.
- Do not introduce a new dotenv parser dependency. The current behavior uses the
  existing INI parser, and this plan works with that.
- Do not make `.env` reads high severity solely because the extension is `.env`.
  A key-level read is still a local file read; the important difference is
  sensitivity and accidental disclosure risk.

## Current State

Implemented:

- [src/resolvers/valueFromFile.js](../../src/resolvers/valueFromFile.js)
  treats `env` as an INI-like extension.
- [src/main.js](../../src/main.js) resolves the root config file through
  `fs.realpathSync()` before choosing the base directory for relative `file()`
  references. This supports symlinked config files such as
  `~/.config/project-manager/global.yaml -> ~/dotfiles/.../global.yaml`.
- [tests/fileValues/fileValues.yml](../../tests/fileValues/fileValues.yml) has
  `.env` file-reference fixtures.
- [tests/fileValues/fileValues.test.js](../../tests/fileValues/fileValues.test.js)
  verifies full `.env` import and `.KEY` / `:KEY` subkey lookup.
- [tests/fileValues/symlink-config-path.test.js](../../tests/fileValues/symlink-config-path.test.js)
  verifies relative file refs resolve beside a symlink target.

Relevant existing pipeline:

1. `valueFromFile()` resolves the file ref and pushes a `fileRefEntry` into
   `ctx.fileRefsFound`.
2. `collectVariableMetadata()` and `enrichMetadata()` build `uniqueVariables`
   and `fileDependencies`.
3. [src/utils/introspection/model.js](../../src/utils/introspection/model.js)
   converts metadata into graph/audit nodes and assigns `risk` and `severity`.
4. [src/utils/introspection/audit.js](../../src/utils/introspection/audit.js)
   turns risky nodes into audit findings.

Existing risk model:

- JS/TS file refs are `executable_code`, high severity.
- Non-executable file refs are `local_file_read`, low severity.
- `useDotenv` / `useDotEnv` is separately reported as
  `environment_mutation`, high severity.

Gap:

- `.env` file refs are indistinguishable from ordinary data-file reads in
  metadata and audit.
- Full-file `${file(.env)}` imports can accidentally expose every secret in
  metadata/debug/reporting paths if future code starts showing resolved values.
- Key-level `${file(.env).API_KEY}` is desirable behavior, but consumers should
  be able to identify it as sensitive.

## Design Principles

1. **Resolution remains literal.**
   Normal resolve output should still contain resolved values. Redaction belongs
   in introspection/reporting surfaces, not the core resolver return value.

2. **Sensitivity is metadata, not a parse mode.**
   `.env` should keep using the existing INI-like parser. Mark the source and
   derived nodes as sensitive instead of inventing a special resolver.

3. **Full-file and key-level reads differ.**
   `${file(.env)}` imports a whole secret-bearing file and deserves a clearer
   warning than `${file(.env).API_KEY}`. Both are sensitive, but the full-file
   case has higher accidental-disclosure blast radius.

4. **Machine output must be stable.**
   New audit fields and findings should have deterministic IDs and be covered by
   tests or goldens.

5. **Never print secret values in audit/reporting tests.**
   Tests should assert presence of redaction/sensitivity markers and absence of
   literal fixture secret strings.

## Proposed Behavior

### Metadata

For file refs where the basename is `.env` or starts with `.env.`, add metadata:

```json
{
  "sensitive": true,
  "sensitivityReason": "dotenv_file",
  "dotenvFile": true,
  "dotenvReadScope": "full_file | key"
}
```

Scope rules:

- `full_file`: `matchedFileString === variableString`
  - Example: `${file(.env)}`
- `key`: variable has a subpath after `file(...)`
  - Examples: `${file(.env).API_KEY}`, `${file(.env):API_KEY}`

Candidate place to compute this:

- `valueFromFile()` already has `relativePath`, `resolvedPath`,
  `matchedFileString`, and `variableString`.
- Add a tiny helper near `isIniLikeExtension()`:

```js
function isDotenvFilePath(filePath) {
  const base = path.basename(String(filePath || ''))
  return base === '.env' || base.startsWith('.env.')
}
```

`valueFromFile.js` currently does not import `path`; add it there or use simple
string splitting if avoiding another import.

### Introspection Nodes

For `.env`-sourced file variables and file-dependency nodes:

- `risk`: keep `local_file_read`.
- `severity`: make key-level `.env` reads `medium` or keep `low` with
  `sensitive: true`.
- Full-file `.env` imports should be `medium` because they pull the entire
  secret file into config.
- Add:

```json
{
  "sensitive": true,
  "sensitivityReason": "dotenv_file",
  "dotenvReadScope": "full_file"
}
```

Recommended severity:

- `${file(.env)}`: `medium`
- `${file(.env).KEY}` / `${file(.env):KEY}`: `low`, with `sensitive: true`

Rationale: a key-level read is still intentional local-file access. The
security concern is disclosure in reporting. Full-file import has more
blast radius, so medium is justified.

### Audit Findings

Audit should make `.env` reads easy to spot without printing values.

For key-level reads:

```json
{
  "id": "variable:file(.env)",
  "severity": "low",
  "risk": "local_file_read",
  "sensitive": true,
  "sensitivityReason": "dotenv_file",
  "dotenvReadScope": "key",
  "message": "Reference reads a key from a dotenv file."
}
```

For full-file reads:

```json
{
  "id": "variable:file(.env)",
  "severity": "medium",
  "risk": "local_file_read",
  "sensitive": true,
  "sensitivityReason": "dotenv_file",
  "dotenvReadScope": "full_file",
  "message": "Reference imports an entire dotenv file; resolved output may contain secrets."
}
```

Do not add another finding if the existing node finding can carry this data.
Duplicate findings make automation harder.

### Redaction

Immediate redaction requirement:

- Audit JSON/human output must not include resolved `.env` values.

Current audit output is mostly variable metadata and does not include resolved
values. Still add regression tests so future changes do not accidentally leak
fixture strings.

Do not redact:

- Normal resolved config output.
- API `configorama(file)` return values.

Candidate later extension:

- If metadata views begin exposing resolved values per file ref, use
  `sensitive: true` to redact them with the same redaction helper used by
  requirements/setup output.

## Implementation Plan

### Phase 1: Dotenv Classification Helpers

Files:

- [src/resolvers/valueFromFile.js](../../src/resolvers/valueFromFile.js)
- [src/utils/introspection/model.js](../../src/utils/introspection/model.js)

Tasks:

1. Add `isDotenvFilePath(filePath)` helper.
2. Add `dotenvReadScopeFor(variableString, matchedFileString)` helper.
3. Export or duplicate a minimal helper in `model.js` so risk/severity can be
   computed from static variable strings.

Acceptance:

- `.env`, `.env.local`, `.env.production`, and absolute paths ending in those
  basenames classify as dotenv files.
- `env.yml`, `my.env.json`, and `dotenv.yml` do not classify as dotenv files.

### Phase 2: Propagate Sensitivity From Resolver Metadata

Files:

- [src/resolvers/valueFromFile.js](../../src/resolvers/valueFromFile.js)
- [src/utils/parsing/enrichMetadata.js](../../src/utils/parsing/enrichMetadata.js)

Tasks:

1. Add `sensitive`, `sensitivityReason`, `dotenvFile`, and `dotenvReadScope` to
   each relevant `fileRefEntry`.
2. When `enrichMetadata()` merges `fileRefsFound` into `fileDependencies` and
   `uniqueVariables`, preserve these fields.
3. Prefer data already recorded in `fileRefsFound` over reparsing where
   possible.

Acceptance:

- `returnMetadata: true` on a config with `${file(.env).API_KEY}` exposes a
  `uniqueVariables` entry and/or file dependency marked sensitive.
- Metadata contains no actual fixture secret values outside the resolved
  `config` object, which is expected.

### Phase 3: Introspection and Audit Surface

Files:

- [src/utils/introspection/model.js](../../src/utils/introspection/model.js)
- [src/utils/introspection/audit.js](../../src/utils/introspection/audit.js)

Tasks:

1. Extend variable nodes with dotenv sensitivity fields.
2. Extend file dependency nodes with dotenv sensitivity fields.
3. Add `severityForNode()` or equivalent logic so full-file dotenv imports can
   be medium while key-level reads remain low.
4. Update `messageForNode()` to emit dotenv-specific messages.
5. Keep IDs stable and avoid duplicate findings.

Acceptance:

- `configorama.audit()` returns one finding per dotenv file ref, with
  `sensitive: true`.
- Full-file dotenv import is medium severity.
- Key-level dotenv read is low severity unless future policy says otherwise.
- Messages do not include resolved secret values.

### Phase 4: Tests and Goldens

Files:

- Existing focused tests under [tests/fileValues](../../tests/fileValues).
- New or existing security/introspection tests under
  [tests/security](../../tests/security) or [tests/conformance](../../tests/conformance).

Recommended fixtures:

```yaml
fullEnv: ${file(.env)}
apiKey: ${file(.env).API_KEY}
token: ${file(.env):TOKEN}
ordinaryData: ${file(settings.yml).name}
```

`.env` fixture:

```text
API_KEY=secret-fixture-api-key
TOKEN=secret-fixture-token
```

Tests:

1. Metadata marks `.env` refs sensitive.
2. Audit marks key-level `.env` reads sensitive.
3. Audit marks full-file `.env` reads medium severity.
4. Audit JSON does not contain `secret-fixture-api-key` or
   `secret-fixture-token`.
5. Ordinary `.ini` and `.yml` file refs are unchanged.
6. Existing conformance audit golden remains deterministic, or add a new golden
   specifically for dotenv audit output.

Acceptance commands:

```bash
npm run typecheck
npx uvu tests/fileValues fileValues.test.js
npx uvu tests/security safeMode.test.js
npx uvu tests/conformance conformance.test.js
npm test
```

### Phase 5: Documentation

Files:

- [site/content/variables/file.mdx](../../site/content/variables/file.mdx)
- [site/content/guides/file-references.mdx](../../site/content/guides/file-references.mdx)
- [site/content/guides/inspect-config.mdx](../../site/content/guides/inspect-config.mdx)
- Possibly [README.md](../../README.md), if still carrying file-ref reference
  details after README slimming.

Docs points:

- `.env` files can be read with `file(.env).KEY`.
- Prefer key-level reads over full-file imports.
- `.env` file refs are local file reads and are marked sensitive in audit and
  introspection.
- `file(.env)` does not mutate `process.env`; `useDotenv` does.

Acceptance:

- Docs examples are synced if they use markdown-magic snippets.
- `npm run site:validate` passes.

## Edge Cases

### `.env` Parser Semantics

The current INI parser coerces `true` / `false` into booleans. This plan does
not change that. Tests should encode that behavior explicitly so it is not
mistaken for a secret-hardening regression.

### Absolute Paths

`${file(/Users/me/app/.env).API_KEY}` should classify as dotenv-sensitive based
on basename.

### Stage-Specific Dotenv Files

`${file(.env.production).API_KEY}` should classify as dotenv-sensitive.

### Dynamic Dotenv Paths

`${file(.env.${opt:stage}).API_KEY}` cannot always classify statically before
inner variables resolve. Runtime `fileRefsFound` should classify it after the
path resolves. Static introspection should still preserve the existing
`dynamic_file_target` diagnostic.

### Symlinked Configs

Keep the existing behavior from `54abf89`: root config symlinks resolve relative
refs beside the real target file. Dotenv sensitivity should apply after that
path normalization.

## Bead-Ready Task Breakdown

### Task 1: Classify Dotenv File References

Add dotenv path/read-scope helpers and mark `fileRefsFound` entries for `.env`
and `.env.*` paths.

Dependencies: none.

Acceptance:

- Unit tests cover `.env`, `.env.local`, absolute `.env`, and non-dotenv names.
- Existing `.env` file-reference resolution tests still pass.

### Task 2: Propagate Dotenv Sensitivity Through Metadata

Thread the resolver sensitivity fields through enriched metadata and file
dependency structures.

Dependencies: Task 1.

Acceptance:

- `returnMetadata: true` exposes sensitivity flags for dotenv file refs.
- Metadata tests assert no secret values in metadata-only structures.

### Task 3: Add Dotenv-Aware Audit Output

Surface dotenv sensitivity in introspection nodes and audit findings, with
different severity/messages for full-file and key-level reads.

Dependencies: Task 2.

Acceptance:

- Audit findings include `sensitive`, `sensitivityReason`, and
  `dotenvReadScope`.
- Full-file import is medium; key-level read is low.
- No duplicate audit findings.

### Task 4: Freeze Dotenv Audit Behavior

Add focused tests and, if appropriate, a conformance golden for dotenv audit
JSON.

Dependencies: Task 3.

Acceptance:

- Golden output is stable across two runs.
- Secret fixture values do not appear in audit output.

### Task 5: Document Safe Dotenv File Reference Usage

Document key-level `.env` reads, full-file caveat, and `file(.env)` versus
`useDotenv` distinction.

Dependencies: Task 3.

Acceptance:

- `npm run site:validate` passes.

## Review Prompt

Use this prompt for a deeper plan review:

```text
Carefully review this entire plan for me and come up with your best revisions in terms of better architecture, new features, changed features, etc. to make it better, more robust/reliable, more performant, more compelling/useful, etc. For each proposed change, give me your detailed analysis and rationale/justification for why it would make the project better along with the git-diff style change versus the original plan shown below:

<paste docs/plans/env-file-reference-hardening.md here>
```
