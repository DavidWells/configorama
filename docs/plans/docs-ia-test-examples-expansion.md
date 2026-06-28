# Docs IA Consolidation and Test-Backed Example Expansion

## Goal

Consolidate the current `Tutorials` and `Guides` sections into one task-oriented section, then use the high-value fixtures in `tests/` as the source material for richer docs examples. The docs should feel like practical workflows first, with concepts and reference pages supporting them.

## Current State

The site currently has four primary content sections:

- `Tutorials`
  - `get-started`
  - `first-config`
- `Guides`
  - `custom-resolvers`
  - `inspect-requirements`
  - `safe-inspection`
  - `dependency-graphs`
  - `debug-resolution`
  - `use-in-ci`
  - `typescript-configs`
- `Concepts`
- `Reference`

The split between `Tutorials` and `Guides` is not pulling enough weight. Both sections are task pages. Users should not have to decide whether "resolve your first config" is a tutorial while "use Configorama in CI" is a guide.

## Proposed IA

Use one `Guides` section for all task-oriented pages.

```text
content/
  guides/
    get-started.mdx
    first-config.mdx
    file-references.mdx
    custom-resolvers.mdx
    inspect-requirements.mdx
    safe-inspection.mdx
    dependency-graphs.mdx
    debug-resolution.mdx
    use-in-ci.mdx
    executable-configs.mdx
    dynamic-configuration.mdx
    cloudformation-serverless.mdx
    frontmatter-and-formats.mdx
```

Keep `Concepts` for mental models:

```text
content/concepts/
  architecture.mdx
  resolution-model.mdx
  introspection-model.mdx
  security-model.mdx
  cross-format-semantics.mdx
```

Keep `Reference` for exact contracts:

```text
content/reference/
  cli.mdx
  api.mdx
  variable-sources.mdx
  filters-functions.mdx
  requirements-schema.mdx
  audit-schema.mdx
  graph-schema.mdx
  error-codes.mdx
  security-policies.mdx
```

## Ordering Decision

Use product-onboarding order. `get-started` and `first-config` should be the first two pages because every other workflow assumes users understand basic resolution. Place `custom-resolvers` after `file-references`; custom resolvers are an extension point for people who already understand built-in sources like `file`, `env`, `opt`, and `param`.

```js
export default {
  'get-started': 'Get started',
  'first-config': 'Resolve your first config',
  'file-references': 'Load files and secrets',
  'custom-resolvers': 'Write a custom resolver',
  'inspect-requirements': 'Inspect required inputs',
  'safe-inspection': 'Safely inspect untrusted config',
  'dependency-graphs': 'Generate dependency graphs',
  'debug-resolution': 'Debug resolution',
  'use-in-ci': 'Use in CI',
  'executable-configs': 'Use JS, TS, and ESM config',
  'dynamic-configuration': 'Build dynamic config',
  'cloudformation-serverless': 'Use CloudFormation and Serverless',
  'frontmatter-and-formats': 'Use frontmatter and other formats'
}
```

## Migration Tasks

1. Move `site/content/tutorials/get-started.mdx` to `site/content/guides/get-started.mdx`.
2. Move `site/content/tutorials/first-config.mdx` to `site/content/guides/first-config.mdx`.
3. Remove `site/content/tutorials/_meta.js`.
4. Remove `tutorials` from `site/app/_meta.global.tsx`.
5. Update links from `/tutorials/get-started` to `/guides/get-started`.
6. Update links from `/tutorials/first-config` to `/guides/first-config`.
7. Update cards on the home page to point at the new guide paths.
8. Add redirects only if needed. For a pre-launch docs site, direct link replacement is probably enough.
9. Run `npm --prefix site run validate`.

## Test Suite Content Inventory

The `tests/` directory has enough real examples to materially improve the docs. The key is to select small, representative examples rather than copying giant fixtures.

### Strong Docs Candidates

| Test Area | Why It Matters | Where It Fits |
|---|---|---|
| `tests/requirementsCli` | Shows `requirements` as a pre-resolution input contract with `help()` annotations and conflicts. | `guides/inspect-requirements`, `reference/requirements-schema` |
| `tests/security` | Shows safe mode blocking JS refs, root traversal, dotenv mutation, custom resolvers, and custom functions. | `guides/safe-inspection`, `concepts/security-model`, `reference/security-policies` |
| `tests/aliasValues` | Clear example of alias-based file refs such as `@config`, `@data`, and nested property reads. | New `guides/file-references`, `reference/variable-sources` |
| `tests/fileValues` | Broad file loading examples: full objects, partial keys, dot accessor syntax, dynamic filenames, JS/TS/ESM refs. | New `guides/file-references`, new `guides/executable-configs`, `reference/variable-sources` |
| `tests/dynamicKeys` | Excellent real-world dynamic paths: stage config, tenants, regions, feature flags, routing. | New `guides/dynamic-configuration`, `concepts/resolution-model` |
| `tests/conformance` | Shows equivalent YAML/JSON/TOML/INI/HCL/Markdown/JS/TS behavior and documented discrepancies. | `concepts/cross-format-semantics`, new `guides/frontmatter-and-formats` |
| `tests/markdown` | Concrete frontmatter examples: YAML, TOML, JSON, hidden comment frontmatter, `_content` behavior. | New `guides/frontmatter-and-formats`, `reference/variable-sources` |
| `tests/fnSubPassthrough` | High-value Serverless/CloudFormation behavior: preserve CFN refs while resolving Configorama refs. | New `guides/cloudformation-serverless`, `concepts/resolution-model` |
| `tests/jsTests`, `tests/tsTests`, `tests/esmTests` | Object/function/async config exports and `dynamicArgs`. | New `guides/executable-configs`, existing `guides/typescript-configs` folded into it |
| `tests/functionTests`, `tests/filterTests`, `tests/filters`, `tests/cronValues` | Good examples for filters/functions, `split`, `join`, `merge`, `oneOf`, cron helpers. | `reference/filters-functions`, possible `guides/dynamic-configuration` |
| `tests/evalValues`, `tests/ifValues` | Shows sandboxed expression/data-flow behavior and ternary conditions. | `guides/dynamic-configuration`, `concepts/security-model` |
| `tests/metadata` | Good source for explaining file dependency metadata and introspection output. | `concepts/introspection-model`, `guides/dependency-graphs` |
| `tests/errors`, `tests/failCases`, `tests/lineNumbers` | Good examples for structured errors and debugging. | `guides/debug-resolution`, `reference/error-codes` |
| `tests/parse-file`, `tests/ymlTests`, `tests/tomlTests`, `tests/iniTests`, `tests/hclTests` | Format support examples and parser behavior. | `guides/frontmatter-and-formats`, `concepts/cross-format-semantics` |
| `tests/annotations` | Strong example of comments becoming requirements metadata: descriptions, hints, examples, sensitivity, groups, deprecations. | `guides/inspect-requirements`, `reference/requirements-schema` |
| `tests/setupMode`, `tests/filterHelper` | Shows setup wizard behavior and `help()` acting as user-facing metadata while preserving values. | `guides/get-started`, `guides/inspect-requirements` |
| `tests/yamlAnchors` | Shows YAML anchors, aliases, merge keys, and variables interacting correctly. | New `guides/frontmatter-and-formats`, `guides/dynamic-configuration` |
| `tests/paramValues`, `tests/optionsAlias` | Documents `param:`, stage params, CLI param precedence, and `option:` alias behavior. | `reference/variable-sources`, `guides/dynamic-configuration` |
| `tests/type-checks`, `tests/typeCoercion`, `tests/valueTypes`, `tests/numberValues` | Clear examples for type preservation and filters like `String`, `Number`, `Boolean`, `Json`. | `reference/filters-functions`, `concepts/resolution-model` |
| `tests/variableSources`, `tests/variableRegex` | Custom source resolver behavior, custom metadata collection, and custom delimiter syntax. | `guides/custom-resolvers`, `reference/variable-sources` |
| `tests/pathExtraction` | CLI path extraction, `--raw`, array indices, bracket notation, copy support. | `reference/cli`, possible `guides/debug-resolution` |
| `tests/ignorePaths`, `tests/preprocess` | Opaque embedded language paths and CloudFormation dynamic references that should not be resolved. | `guides/cloudformation-serverless`, `reference/security-policies` |
| `tests/edgeCases`, `tests/pathologicalCases`, `tests/platformSpecific`, `tests/security/path-traversal.test.js` | Useful gotchas: deep fallback chains, circular refs, Windows paths, path traversal, malformed input. | `guides/debug-resolution`, `reference/error-codes`, `concepts/security-model` |

## Proposed New Guide Pages

### `guides/file-references.mdx`

Purpose: Teach users how to compose config from other files.

Source material:

- `tests/fileValues/fileValues.yml`
- `tests/fileValues/fileValues.test.js`
- `tests/aliasValues/aliasValues.yml`
- `tests/filePathOverrides/config.yml`
- `tests/allowUnknownFileRefs/config.yml`

Include:

- Full file import: `${file(./settings.yml)}`
- Nested property import: `${file(./settings.yml):database.host}`
- Dot accessor syntax: `${file(./settings.yml).database.host}`
- Dynamic file path: `${file(./config.${opt:stage}.json)}`
- Missing file fallback: `${file(./missing.yml), "default"}`
- Alias paths: `${file(@config/app-config.yml):appName}`
- File path overrides for env-specific replacements.
- Unknown/missing file refs as either errors, fallbacks, or pass-through when allowed.
- A warning that JS/TS file refs are executable surfaces and belong in `executable-configs`.

Avoid:

- Copying the giant `fileValues.yml` wholesale.
- Showing secret-looking values from `tests/aliasValues/data/secrets.json` without redaction.

### `guides/executable-configs.mdx`

Purpose: Combine the current TypeScript guide with JS, TS, ESM, sync, async, object, and function export behavior.

Source material:

- `tests/jsTests`
- `tests/tsTests`
- `tests/esmTests`
- `tests/fileValues/*.{js,ts,mjs}`
- `tests/asyncValues`
- `tests/syncValues`

Include:

- JS object export.
- JS function export receiving dynamic args/options.
- Async ESM export.
- TypeScript object/function examples.
- How `safeMode` treats executable refs.
- Link to `safe-inspection` before automation usage.

Replace:

- Fold `guides/typescript-configs.mdx` into this broader page.

### `guides/dynamic-configuration.mdx`

Purpose: Show the core power feature: variables inside paths, object keys, file paths, and conditional choices.

Source material:

- `tests/dynamicKeys/dynamicKeys.test.js`
- `tests/recursive/recursive.yml`
- `tests/conditional-yml/conditionalYaml.yml`
- `tests/evalValues`
- `tests/ifValues`
- `tests/paramValues/paramValues.yml`
- `tests/yamlAnchors/anchors.yml`
- `tests/type-checks/type-checks.yml`

Include:

- Stage-specific service URL:
  `${self:configs.${self:stage}.${self:service}}`
- Multi-tenant/region config:
  `${self:tenantConfigs.${self:tenant}.${self:region}.database}`
- Feature flag by environment:
  `${self:features.${self:environment}.${self:checkFeature}}`
- Dynamic file path:
  `${file(./config.${opt:stage}.json)}`
- `if()` and `eval()` as sandboxed expression/data-flow, not JavaScript execution.
- Stage params and CLI params:
  `${param:domain}`, `${param:dbPort, 5432}`
- YAML anchors and merge keys as valid composition tools before variable resolution.
- Type filters where dynamic config must preserve booleans, numbers, or parsed JSON.

### `guides/cloudformation-serverless.mdx`

Purpose: Explain how Configorama behaves with Serverless Framework and CloudFormation templates.

Source material:

- `tests/fnSubPassthrough/fnSubPassthrough.test.js`
- `tests/_fixtures/serverless.yml`
- `tests/_fixtures/cloudformation.yml`
- `tests/mergeKeys`
- `tests/ignorePaths/ignorePaths.test.js`
- `tests/preprocess/preprocess.test.js`

Include:

- CloudFormation refs inside `Fn::Sub` stay verbatim:
  `${ApiGatewayRestApi}`, `${AWS::Region}`, `${AWS::AccountId}`
- Configorama typed refs inside `Fn::Sub` can resolve:
  `${env:...}`, `${file(...)}`, `${cron(...)}`, custom sources.
- `Fn::Sub` list form behavior: template string preserved, variable map resolved.
- File inlining in `Fn::Sub` body.
- CloudFormation merge-key/import examples from `tests/mergeKeys`.
- Default ignored embedded code paths such as Lambda `Code.ZipFile`, CloudFront `FunctionCode`, IAM `${aws:username}`, and shell `UserData`.
- CloudFormation dynamic references such as `{{resolve:ssm:...}}` and `{{resolve:secretsmanager:...}}` should pass through.

### `guides/frontmatter-and-formats.mdx`

Purpose: Show practical format support and where formats differ.

Source material:

- `tests/markdown/fixtures`
- `tests/conformance/fixtures`
- `tests/conformance/DISCREPANCIES.md`
- `tests/parse-file`
- `tests/hclTests`, `tests/iniTests`, `tests/tomlTests`
- `tests/yamlAnchors`

Include:

- YAML frontmatter with `_content`.
- TOML frontmatter.
- JSON frontmatter.
- Hidden HTML comment frontmatter.
- No frontmatter returns `_content`.
- Cross-format fixture matrix: YAML, JSON, TOML, INI, HCL, Markdown, JS, TS.
- Explicit discrepancy callout for the HCL boolean filter divergence currently documented in `tests/conformance/DISCREPANCIES.md`.
- YAML anchors and merge keys with variables.
- Frontmatter `_content`, `_body`, and collision behavior.

## Existing Page Upgrades

### `guides/inspect-requirements.mdx`

Use `tests/requirementsCli/config.yml` as the primary example:

```yaml
service: requirements-cli
apiKey: ${env:CONFIGORAMA_REQUIREMENTS_CLI_API_KEY | help("API key")}
stage: ${opt:stage, "dev"}
```

Add:

- CLI example: `configorama requirements config.yml`
- Example `ask[]` item showing `env:CONFIGORAMA_REQUIREMENTS_CLI_API_KEY`.
- Conflict example from `tests/requirementsCli/conflict.yml`.
- Note that requirements mode analyzes and does not resolve missing values.
- Comment annotation example from `tests/annotations/config.yml`:
  - leading comments become descriptions.
  - `@from` becomes `obtainHint`.
  - `@example` becomes examples.
  - `@default` becomes default hints.
  - `@sensitive`, `@group`, and `@deprecated` feed requirements metadata.
- `help()` filter example from `tests/filterHelper/help-filter.yml`, making clear that `help()` is metadata/identity and can be combined with type filters.

### `guides/safe-inspection.mdx`

Use `tests/security/fixtures/config.yml`:

```yaml
safeData: ${file(./data.yml):value}
unsafeData: ${file(./unsafe.js):secret}
```

Add:

- Safe mode blocks executable JS refs during resolution.
- Audit reports executable refs without running them.
- Eval/if are data-flow expression findings, not RCE.
- Root restriction example from `file_root_forbidden`.
- Dotenv/custom resolver/custom function blocked examples.

### `guides/dependency-graphs.mdx`

Use security fixture plus a dynamic file path example:

- Static graph from `tests/security/fixtures/config.yml`.
- Dynamic edge caveat from `${file(./config.${opt:stage}.json)}`.
- Link to `concepts/introspection-model`.

### `guides/debug-resolution.mdx`

Use tests from:

- `tests/errors/jsonErrors.test.js`
- `tests/failCases/failCases.test.js`
- `tests/lineNumbers`

Add:

- JSON error mode examples.
- Missing env example.
- Circular dependency example.
- Line number example for bad config.
- CLI path extraction examples from `tests/pathExtraction/pathExtraction.test.js`:
  - `configorama config.yml .database.host`
  - `configorama config.yml ".servers[0].name"`
  - `--raw` for unquoted scalar output.
  - bracket notation for keys with dashes.

### `guides/use-in-ci.mdx`

Use:

- `tests/conformance/conformance.test.js`
- `tests/performance/benchmarkSmoke.test.js`
- `tests/performance/memorySmoke.test.js`

Add:

- CI workflow that runs requirements, audit, graph, and conformance.
- Golden outputs as docs-backed automation contract.
- Performance guardrails as smoke tests, not microbenchmarks.

### `reference/filters-functions.mdx`

Use:

- `tests/functionTests/functions.yml`
- `tests/filterTests/filters.yml`
- `tests/filters/oneOf.yml`
- `tests/cronValues/cronValue.yml`
- `tests/type-checks/type-checks.yml`
- `tests/typeCoercion/typeCoercion.test.js`
- `tests/valueTypes/valueTypes.yml`
- `tests/filterHelper/help-filter.yml`

Add:

- Table of filter/function examples.
- `oneOf` as validation-like filter.
- Cron helper examples.
- A warning when filters coerce type.
- Type preservation examples:
  - standalone boolean and number refs preserve their types.
  - string values that look like booleans/numbers remain strings unless filtered.
  - `String`, `Number`, `Boolean`, and `Json` filters are explicit type gates.
- `help()` is an identity filter that contributes requirements/setup metadata.

### `reference/variable-sources.mdx`

Use:

- `tests/optionsAlias/optionsAlias.test.js`
- `tests/paramValues/paramValues.yml`
- `tests/gitVariables/gitVariables.yml`
- `tests/variableRegex/variableRegex.test.js`
- `tests/variableSources/variableSources.test.js`
- `tests/variableSources/cf.test.js`

Add:

- `opt:` and `option:` alias relationship.
- `param:` examples.
- Git variable examples with non-git fallback caveat.
- Supported variable delimiter syntaxes as reference, not a guide.
- Custom variable source resolver examples:
  - regex match.
  - function match.
  - metadata collector for downstream tooling.
- `cf:` custom source example should be documented as a pattern users can implement, not necessarily a built-in guarantee unless the public API confirms it.

### `reference/cli.mdx`

Use:

- `tests/pathExtraction/pathExtraction.test.js`

Add:

- Path extraction after file: `configorama config.yml .service`
- Path extraction before file: `configorama .database.name config.yml`
- Array indexing: `".servers[0].name"` and negative indices.
- Bracket notation: `'.["special-keys"]["key-with-dash"]'`
- `--raw` / `-r`.
- `--copy` / `-c`, including the `CONFIGORAMA_CLIPBOARD_COMMAND` test hook as implementation detail only if useful.

### `concepts/resolution-model.mdx`

Use:

- `tests/typeCoercion/typeCoercion.test.js`
- `tests/valueTypes/valueTypes.yml`
- `tests/edgeCases/edgeCases.test.js`

Add:

- Standalone references preserve non-string types.
- Interpolated strings become strings.
- Deep resolution and fallback chains are multi-pass.
- Circular dependencies are detected and fail explicitly.

### `guides/get-started.mdx`

Use:

- `tests/setupMode/setupMode.test.js`
- `tests/filterHelper/help-filter.yml`

Add:

- A short "make this interactive later" note:
  `setup: true` runs the configuration wizard.
- `help()` descriptions make setup and requirements output more useful.

## Markdown Magic Example Sync Strategy

Use Markdown Magic to keep docs examples synchronized with fixtures and tests. Markdown Magic is designed around hidden comment blocks that can be updated from local/remote code sources, supports built-in `CODE` and `FILE` transforms, and supports custom transforms. For this repo, use it as a docs source-of-truth bridge, not as a prose generator.

### Why Use It

The docs should not manually copy snippets from tests. Manual copies will drift quickly because the test suite is now the best behavioral contract. Example sync should make it cheap to update docs when fixtures change and obvious when docs examples are stale.

### Recommended Approach

Use a custom transform instead of line-number-only `CODE` blocks for most examples.

Line ranges are acceptable for tiny stable files, but most useful examples live inside large tests or fixtures. Line ranges will drift whenever nearby tests change. Marker-based extraction is more robust.

### Marker Format

Add explicit source markers in fixtures/tests around documentation-worthy examples:

```yaml
# docs:start basic-file-ref
database:
  host: ${file(./env.yml):dbHost}
# docs:end basic-file-ref
```

```js
// docs:start async-api
const config = await configorama('config.yml', {
  options: { stage: 'prod' }
})
// docs:end async-api
```

### MDX Comment Blocks

Do not use raw HTML comments in `.mdx` files. MDX 3 rejects `<!-- ... -->` comments. Nextra accepts JSX-style MDX comments, and Markdown Magic maps `syntax: 'mdx'` to JSX comment delimiters.

Use JSX block comments in MDX:

````mdx
{/* docs CONFIGORAMA_EXAMPLE id="basic-file-ref" lang="yaml" */}

```yaml
database:
  host: ${file(./env.yml):dbHost}
```

{/* /docs */}
````

The transform should replace only the body between the comments. The comments must remain in source MDX so future runs can update the snippet.

### Transform Design

Create `site/scripts/markdown-magic.config.cjs` with transforms. Markdown Magic loads config with `require()`, so use CommonJS unless the implementation wraps the API directly from a custom script.

- `CONFIGORAMA_EXAMPLE`
  - Inputs: `id`, `src` optional, `lang` optional, `redact` optional.
  - Reads from marker registry or scans `tests/`.
  - Extracts marker-delimited content.
  - Dedents content.
  - Wraps in a fenced code block.
  - Redacts known fake secrets by default.
- `CONFIGORAMA_RESULT`
  - Inputs: `id`, `src` optional.
  - Prefer static expected JSON files or conformance goldens.
  - Only run code when deterministic and safe.
  - Never execute JS/TS fixtures from untrusted paths during docs generation.
- `CONFIGORAMA_TEST_LINK`
  - Optional maintainer-only link/comment showing which test owns the example.

### Example Registry

Maintain a small registry instead of scanning every file on every run:

```js
export default {
  'requirements-annotations': {
    src: 'tests/annotations/config.yml',
    marker: 'requirements-annotations',
    lang: 'yaml'
  },
  'safe-mode-fixture': {
    src: 'tests/security/fixtures/config.yml',
    marker: 'safe-mode-fixture',
    lang: 'yaml'
  }
}
```

This keeps example ownership explicit and makes deleted/renamed examples fail loudly.

### Scripts

Add site scripts and configure Markdown Magic with `syntax: 'mdx'` in `site/scripts/markdown-magic.config.cjs`:

```js
module.exports = {
  files: 'content/**/*.mdx',
  syntax: 'mdx',
  open: 'docs',
  close: '/docs',
  transforms: {
    CONFIGORAMA_EXAMPLE() {
      // Extract marker-delimited examples from tests.
    },
    CONFIGORAMA_RESULT() {
      // Insert committed golden outputs or deterministic safe results.
    }
  }
}
```

```json
{
  "docs:examples": "md-magic --config ./scripts/markdown-magic.config.cjs --files 'content/**/*.mdx'",
  "docs:examples:check": "md-magic --config ./scripts/markdown-magic.config.cjs --files 'content/**/*.mdx' --dry"
}
```

Fold `docs:examples:check` into `validate` after it exists. If `--dry` cannot reliably fail on stale output, add a wrapper script that runs Markdown Magic, checks `git diff --exit-code site/content`, and exits nonzero on generated changes.

### Safety Policy

- Default to copying static fixture snippets.
- Do not execute arbitrary fixture JS/TS during docs generation.
- Use already committed golden outputs when output examples are needed.
- Allow generated outputs only from safe, deterministic harnesses.
- Redact values that look like API keys, passwords, tokens, or secrets.
- Require every synced example to have a marker ID and source path.

### Initial Synced Examples

Start with static examples that are obviously useful and low-risk:

- `tests/requirementsCli/config.yml`
- `tests/annotations/config.yml`
- `tests/security/fixtures/config.yml`
- selected snippets from `tests/fileValues/fileValues.yml`
- selected snippets from `tests/aliasValues/aliasValues.yml`
- selected snippets from `tests/markdown/fixtures/*.md`
- `tests/conformance/fixtures/equivalent.yml`
- selected snippets from `tests/yamlAnchors/anchors.yml`

After the machinery is stable, add examples from JS tests using marker-delimited snippets, not whole test files.

## Content Rules for Pulling from Tests

1. Use tests as source material, not final prose.
2. Prefer fixtures with short inputs and visible outputs.
3. If a fixture is huge, extract the smallest representative slice.
4. Do not publish fake secrets from tests without redaction.
5. Every copied example should include the expected output or observable behavior.
6. Put "how to do X" in `guides`, "why it works" in `concepts`, and exact fields/options in `reference`.
7. Add links back to source test fixtures in comments only if useful for maintainers; user-facing docs should not require reading tests.
8. Prefer Markdown Magic marker sync over manual copies once marker infrastructure exists.
9. Avoid Markdown Magic line ranges except for very small files; markers are more durable.

## Implementation Phases

### Phase 1: Consolidate IA

- Move tutorial pages into `guides`.
- Remove the top-level `Tutorials` nav item.
- Update route links.
- Put `get-started` first, `first-config` second, and `custom-resolvers` after `file-references`.
- Run full site validation.

### Phase 2: Add Test-Backed Guide Pages

- Add Markdown Magic example sync infrastructure and seed marker registry.
- Add `file-references`.
- Add `executable-configs`.
- Add `dynamic-configuration`.
- Add `cloudformation-serverless`.
- Add `frontmatter-and-formats`.
- Fold `typescript-configs` into `executable-configs`.

### Phase 3: Upgrade Existing Guides

- Enrich `inspect-requirements`.
- Enrich `safe-inspection`.
- Enrich `dependency-graphs`.
- Enrich `debug-resolution`.
- Enrich `use-in-ci`.

### Phase 4: Upgrade Reference Pages

- Expand `filters-functions`.
- Expand `variable-sources`.
- Add examples to `security-policies`.
- Add small JSON examples to schema pages.

### Phase 5: Quality Gates

- `npm --prefix site run docs:examples:check`
- `npm --prefix site run content:lint`
- `npm --prefix site run link:check`
- `npm --prefix site run typecheck`
- `npm --prefix site run build`
- `npm --prefix site run smoke`
- Check rendered examples for Mermaid errors and code block readability.

## Bead Breakdown

Suggested bead grouping:

- `docs-ia.1` Consolidate Tutorials and Guides
- `docs-ia.2` Add file references guide from tests
- `docs-ia.3` Add Markdown Magic example sync infrastructure
- `docs-ia.4` Add executable configs guide from JS/TS/ESM tests
- `docs-ia.5` Add dynamic configuration guide from dynamic key tests
- `docs-ia.6` Add CloudFormation/Serverless guide from Fn::Sub tests
- `docs-ia.7` Add frontmatter/formats guide from markdown/conformance tests
- `docs-ia.8` Upgrade requirements and safe-inspection guides
- `docs-ia.9` Upgrade debug, graph, and CI guides
- `docs-ia.10` Upgrade reference pages with test-backed examples
- `docs-ia.11` Final docs validation and rendered QA pass

## Open Decisions

1. Should the unified task section stay named `Guides`, or should it become `Learn`?
2. Should `custom-resolvers` live immediately after `file-references`, or later after the core inspection/security guides?
3. Should we keep old `/tutorials/*` routes via redirects, or is direct link replacement enough pre-launch?
4. Should the docs link to test fixture source files for maintainers, or keep source attribution internal?
5. Should examples use the local binary `configorama` everywhere, or keep `npx configorama` in CI-oriented pages?
6. Should Markdown Magic generated examples run during normal `npm run validate`, or only in CI/precommit?
7. Should docs examples be marker-delimited in existing tests, or should we create dedicated `tests/docs-examples/` fixtures that tests import?
