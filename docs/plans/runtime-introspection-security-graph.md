# Runtime Introspection, Security, and Graph Plan

Status: revised core plan. Conformance/perf and docs-site work are split into
separate plans:

- `docs/plans/conformance-and-performance-guardrails.md`
- `docs/plans/nextra-docs-site.md`

## Goal

Make configorama inspectable and safe enough for CI and agents without creating
another metadata system. The core product work is:

1. Extract a shared discovery/introspection layer from the existing metadata and
   requirements paths.
2. Centralize sensitivity/redaction.
3. Add stable structured errors.
4. Add safe/audit modes for untrusted configs.
5. Add file-root restrictions.
6. Add dependency graph export.

This plan intentionally excludes broad conformance/perf guardrails and the docs
site. Those are valuable, but they are independent initiatives.

## Current Reality

Do not build a fourth discovery walker.

Configorama already discovers variables and requirements through:

- `src/metadata.js`: traverses config with `traverse`, collects variables,
  filters, fallbacks, file refs, and per-path metadata.
- `src/utils/parsing/enrichMetadata.js`: enriches metadata with source info,
  descriptions, comment annotations, allowed values, defaults, file-ref metadata,
  and resolved/pre-resolved details.
- `src/utils/requirements/configRequirements.js`: normalizes requirements for
  `analyze({ instructions: true })`, setup wizard prompt descriptors, and
  `configorama requirements <file>`.

The introspection layer must be an extraction and normalization of these paths,
not a parallel `src/introspection/collect.js` walker that rediscovers variables.
The failure mode to avoid is graph/audit/explain seeing different facts than
requirements JSON and setup mode.

## Core Architecture

Create a shared discovery layer around the existing metadata pipeline.

Proposed shape:

```text
src/utils/introspection/
  buildIntrospection.js
  graph.js
  audit.js
  errors.js
  redaction.js
  policy.js
  schemas.js
```

`buildIntrospection()` should consume existing analysis/metadata output first:

```js
const analysis = await configorama.analyze(configPath, {
  returnPreResolvedVariableDetails: true,
  safeMode: true
})

const introspection = buildIntrospection(analysis, {
  mode: 'static',
  includeResolvedValues: false,
  redact: true
})
```

If a new helper needs to walk config paths, extract it from `src/metadata.js` and
make `metadata.js`, `enrichMetadata.js`, `configRequirements.js`, graph, audit,
and explain consume the shared helper. Do not add a second independent traversal
with its own syntax interpretation.

## Shared Data Model

Use one origin/source vocabulary and separate it from risk.

### Source Class

Keep and extend the shipped requirements vocabulary:

```text
user | config | readonly | remote
```

Meanings:

- `user`: supplied by user/environment/CLI, such as env, option, param.
- `config`: supplied by this config or local config files, such as self/file/text.
- `readonly`: derived local readonly value, such as git metadata, cron, eval/if.
- `remote`: external service or custom resolver with remote behavior.

Do not add `executable` to `sourceClass`; execution is a risk dimension.

### Risk Kind

Add a separate `riskKind` field for audit/security classification:

```text
none | local_file_read | data_flow_expression | executable_code | process_spawn | environment_mutation | custom_extension
```

Examples:

| Variable/source | sourceClass | riskKind | Notes |
|---|---:|---:|---|
| `${env:API_KEY}` | user | none | User input; sensitive possible. |
| `${opt:stage}` | user | none | CLI input. |
| `${self:service}` | config | none | Internal dependency. |
| `${file(./config.yml)}` | config | local_file_read | File read, root policy applies. |
| `${text(./README.md)}` | config | local_file_read | File read, root policy applies. |
| `${file(./secret.js)}` | config | executable_code | JS/TS execution surface. |
| `${eval(1 + 2)}` | readonly | data_flow_expression | Sandboxed expression, not JS RCE. |
| `${if(stage === "prod")}` | readonly | data_flow_expression | Alias to eval resolver. |
| `${git:branch}` | readonly | process_spawn | Git command/process interaction. |
| Custom resolver | remote/custom | custom_extension | Depends on resolver contract. |

### Audit Severity

Severity is derived from source/risk/policy:

| Severity | Condition |
|---|---|
| `high` | executable code, custom extension in safe mode, root escape, blocked unsafe policy |
| `medium` | local file read, process spawn, environment mutation |
| `low` | missing user input, sensitive input name, optional file dependency |
| `info` | self refs, readonly data-flow expressions, static derived values |

This mapping should be centralized in `audit.js` and covered by tests.

## Eval/If Classification

`eval` and `if` are not arbitrary JavaScript execution in the current code.

`src/resolvers/valueFromEval.js` uses `subscript/justin` with a small context of
decoded values and `null`. `src/resolvers/valueFromIf.js` delegates to the same
resolver. They should be classified as sandboxed data-flow expressions, not RCE.

They still deserve tests because expression evaluators can have prototype escape
bugs. Add a focused verification test suite before relying on the classification:

- Attempt constructor access: `''.constructor.constructor(...)`.
- Attempt prototype traversal.
- Attempt global/process access.
- Attempt object constructor escape through decoded object/array placeholders.
- Confirm failures are safe and do not execute code.

If those tests fail, treat eval/if as high-risk until patched. If they pass,
audit severity should be `info` or `low`, not `high`, unless the expression
itself leaks sensitive data in diagnostic output.

## Real Unsafe Execution Surfaces

These are the primary unsafe surfaces for safe mode:

- JS/TS file references through `file(...)`.
- JS/TS config files when loaded/executed.
- User-defined functions loaded from files.
- Custom variable sources/resolvers.
- Plugins with arbitrary resolver code.
- Dotenv/environment mutation.
- Git spawning/process interaction.
- File/text reads outside allowed roots.

Safe mode should primarily block or report these surfaces.

## Static vs Resolved Introspection

Dynamic targets are the central hard problem. The plan must be honest about
lossiness.

Example:

```yaml
stage: ${opt:stage, 'dev'}
vars: ${file(./vars.${stage}.yml)}
```

Static/safe graph mode cannot know the concrete file without resolving `stage`.
It should emit partial edges and diagnostics:

```text
path:vars -> dynamic:file("./vars.${stage}.yml")   dynamicFileReference
dynamic:file("./vars.${stage}.yml") -> path:stage  dynamicTargetInput
diagnostic: file target unresolved until stage is known
```

Two modes:

### Static Mode

- Does not execute JS/TS refs, custom resolvers, or unsafe sources.
- Uses parsed config and existing pre-resolved metadata.
- Emits partial edges for dynamic targets.
- Emits diagnostics for unknown targets.
- Best for audit, CI, and untrusted repos.

### Resolved Mode

- Runs normal resolution under configured policy.
- Can show concrete dynamic file targets, deep refs, and actual resolution edges.
- Best for trusted local debugging and complete graphs.

The CLI should make the distinction explicit:

```bash
configorama graph config.yml --mode static
configorama graph config.yml --mode resolved
configorama audit config.yml --safe
```

Default graph mode should be `static`.

## Dependency Graph Export

Graph export is a projection of shared introspection data.

For this config:

```yaml
service: billing
stage: ${opt:stage, 'dev'}
name: ${service}-${stage}
secret: ${env:STRIPE_SECRET_KEY}
extra: ${file(./extra.yml):value}
```

Logical edges:

```text
path:name   -> path:service            selfReference
path:name   -> path:stage              selfReference
path:stage  -> option:stage            optionInput
path:secret -> env:STRIPE_SECRET_KEY   envInput
path:extra  -> file:./extra.yml        fileReference
```

CLI:

```bash
configorama graph config.yml
configorama graph config.yml --format json
configorama graph config.yml --format mermaid
configorama graph config.yml --format dot
configorama graph config.yml --mode static
configorama graph config.yml --mode resolved
```

Default output should be JSON. `--format` is subcommand-scoped: under `graph`,
it means graph report format (`json|mermaid|dot`); under root resolution, it
keeps the existing resolved-output meaning (`json|yaml|js`).

Graph output requirements:

- Stable schema version.
- Deterministic sorting of nodes and edges.
- Redaction by default.
- File/line information where available.
- Explicit diagnostics for partial/dynamic data.
- Byte-identical output across repeated runs for the same inputs.

## Safe Mode And File Root Restrictions

Safe mode should be policy-driven:

```js
{
  safeMode: true,
  disableExecutableFileRefs: true,
  disableCustomSources: true,
  disableUserFunctions: true,
  disableDotenvMutation: true,
  allowedFileRoots: [process.cwd()],
  rootPolicy: 'config-dir'
}
```

File root policy:

- Normalize absolute paths before checking.
- Resolve `..` segments.
- Prefer realpath checks for symlinks so symlinks cannot escape allowed roots.
- Apply to file/text/JS/TS refs and filePathOverrides.
- Missing in-root files are missing-file findings.
- Missing out-of-root files are policy violations.
- Dynamic paths get diagnostics until concrete.

## Audit Output

Audit answers: "What would this config read, require, spawn, mutate, or execute?"

CLI:

```bash
configorama audit config.yml
configorama audit config.yml --safe
configorama audit config.yml --format json
```

Output:

```json
{
  "schemaVersion": 1,
  "config": "config.yml",
  "summary": {
    "files": 3,
    "executableSurfaces": 1,
    "blockedByPolicy": 1,
    "sensitiveInputs": 2
  },
  "findings": [
    {
      "severity": "high",
      "sourceClass": "config",
      "riskKind": "executable_code",
      "kind": "executable_file_ref",
      "path": "secrets.value",
      "variable": "${file(./secret.js)}",
      "target": "./secret.js",
      "line": 18,
      "blocked": true,
      "policy": "disableExecutableFileRefs"
    }
  ]
}
```

Audit should be able to run without executing unsafe code.

## Stable Machine-Readable Errors

Add structured error fields and a JSON error renderer:

```bash
configorama config.yml --error-format json
```

Shape:

```js
{
  schemaVersion: 1,
  code: 'missing_env',
  message: 'Missing required environment variable STRIPE_SECRET_KEY',
  path: 'billing.secretKey',
  variable: '${env:STRIPE_SECRET_KEY}',
  source: 'env',
  line: 42,
  file: 'config.yml',
  sensitive: true,
  blocked: false,
  policy: null,
  suggestions: []
}
```

Initial codes:

- `missing_env`
- `missing_option`
- `missing_param`
- `missing_file`
- `unknown_variable_type`
- `unknown_filter`
- `unknown_function`
- `circular_reference`
- `parse_error`
- `type_validation_failed`
- `one_of_validation_failed`
- `blocked_by_safe_mode`
- `file_root_violation`
- `executable_source_blocked`
- `custom_source_blocked`

Human mode can keep decorative boxes. JSON mode must be plain JSON suitable for
CI and agents.

## Central Redaction

Centralize existing sensitivity logic instead of adding a third path.

Existing call sites include:

- `src/utils/requirements/configRequirements.js`
- `src/utils/ui/configWizard.js`
- `src/display.js`
- `src/utils/redaction/setupRedaction.js`

Create one shared redaction/sensitivity helper and migrate these call sites to
it. The helper should support comment annotations and user-configurable
patterns.

Default patterns:

- secret
- password
- token
- key
- credential
- auth
- privateKey
- clientSecret

Rules:

- Redact by default in graph/audit/explain JSON.
- Redact by default in human CLI diagnostics.
- Requirements JSON may include names/descriptions but not secret values.
- Error JSON must not include secret values.
- Exposing sensitive values requires an explicit unsafe flag.

## Phased Implementation

### Phase 1: Extract Shared Discovery

Refactor existing metadata/requirements discovery into reusable helpers.

Done when:

- `metadata.js`, `enrichMetadata.js`, and `configRequirements.js` use shared
  discovery helpers where practical.
- No graph/audit-specific walker exists.
- Tests prove requirements JSON is unchanged.

### Phase 2: Redaction And Structured Errors

Build shared redaction and structured error primitives.

Done when:

- Existing sensitivity call sites use shared helper.
- At least missing env, missing file, unknown filter, and safe-mode errors can
  render as JSON.

### Phase 3: Safe Mode And Root Policy

Add policy checks for executable code and file roots.

Done when:

- JS/TS file refs can be blocked.
- Custom sources/functions can be blocked.
- File roots are enforced.
- Eval/if prototype escape tests exist.

### Phase 4: Audit

Build audit JSON from shared introspection.

Done when:

- Audit reports executable surfaces without executing them.
- Audit severity uses the centralized source/risk mapping.
- Safe audit mode is deterministic.

### Phase 5: Graph

Build graph JSON, Mermaid, and DOT projections.

Done when:

- Static and resolved modes are documented and tested.
- Dynamic file targets emit partial edges and diagnostics.
- Output is byte-identical across repeated runs.

## Open Decisions

1. Should graph default to JSON or human output? Recommendation: JSON.
2. Should graph default to static or resolved mode? Recommendation: static.
3. Should audit imply safe behavior by default? Recommendation: yes for audit,
   no for normal resolution.
4. Should file-root policy default to config directory in safe mode?
   Recommendation: yes.
5. What is the exact sourceClass/riskKind mapping for custom resolvers that
   declare themselves readonly? Recommendation: allow resolver metadata, but
   treat unknown custom resolvers as `custom_extension`.

