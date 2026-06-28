# Conformance and Performance Guardrails Plan

Status: split from the runtime introspection plan. This plan is independently
shippable and should not block the core audit/graph work.

## Goal

Make configorama safer to change by locking down behavior that users rely on and
making performance regressions visible. This plan covers:

1. Golden conformance harness.
2. Cross-format equivalence tests.
3. Resolver edge-case fixtures.
4. Security/audit conformance fixtures.
5. Performance benchmark expansion.
6. Repeated-resolution memory smoke tests.

## Why This Is Separate

Conformance and performance guardrails are critical, but they do not need to be
implemented in the same branch as safe mode, audit, or graph export. Keeping this
separate avoids turning the runtime introspection project into a sprawling
multi-quarter initiative.

The conformance suite should consume new JSON outputs once they exist, but its
initial harness can start with current CLI/API behavior.

## Golden Conformance Harness

Directory shape:

```text
tests/conformance/
  harness.js
  fixtures/
    cli/
    api/
    cross-format/
    resolver-edge-cases/
    security/
  golden/
    cli/
    api/
    cross-format/
    resolver-edge-cases/
    security/
```

Harness responsibilities:

- Run CLI commands and API calls.
- Normalize absolute temp paths, platform separators, volatile git hashes, and
  timing fields.
- Compare normalized actual output to checked-in golden artifacts.
- Print command, fixture, stdout, stderr, exit code, expected path, actual path,
  and a concise diff.
- Support explicit update mode:

```bash
UPDATE_GOLDEN=1 npm run test:conformance
```

Do not silently rewrite golden files.

## What To Freeze First

Freeze stable machine outputs first:

- Requirements JSON.
- Future audit JSON.
- Future graph JSON/Mermaid/DOT.
- Future structured error JSON.
- CLI raw output for simple scalar path extraction.
- API resolved config output for deterministic fixtures.
- Cross-format normalized resolved output.

Do not freeze decorative human output until it is intentionally stable.

## Cross-Format Equivalence

Goal: prove equivalent configs resolve the same way across supported formats
where those formats can express the same data.

Core group:

- YAML
- JSON
- JSON5
- TOML
- JS object/config
- TS object/config

Partial group:

- INI, where nested objects/arrays are limited.
- HCL, where parser and Terraform expression semantics differ.
- Markdown frontmatter, where only frontmatter participates.

Logical fixture example:

```js
{
  service: 'billing',
  stage: '${opt:stage, "dev"}',
  region: '${env:AWS_REGION, "us-east-1"}',
  name: '${service}-${stage}',
  nested: {
    enabled: '${param:enabled, true}'
  }
}
```

Each core-format fixture should produce the same normalized output under the
same env/options/params. Partial formats get documented exceptions.

Keep a differences file:

```text
tests/conformance/fixtures/cross-format/DIFFERENCES.md
```

It should explain why INI, HCL, or Markdown diverges instead of hiding those
cases in test code.

## Resolver Edge Cases

Add fixtures for high-risk parser/resolver behavior:

- Nested variables inside filter args.
- `oneOf(${listVar})` and inline `oneOf(...)`.
- Deep refs and `${deep:N}` deferral behavior.
- Fallback values with spaces and commas.
- Fallback values that are themselves variables.
- `if()` expressions with bare refs.
- `eval()` data-flow expressions.
- File refs with subpaths.
- Dynamic file paths.
- Param stage/default precedence.
- Unknown vars allowed vs disallowed.
- Type coercion filters.
- Git values in and out of a repo.

Each fixture should state the semantic rule it protects.

## Security/Audit Conformance

Once safe mode and audit JSON exist, add fixtures for:

- JS file ref blocked in safe mode.
- TS file ref blocked in safe mode.
- Plain YAML/JSON file ref allowed inside allowed root.
- Path traversal blocked.
- Symlink root escape blocked or explicitly documented.
- Custom resolver blocked when disabled.
- User-defined function blocked when disabled.
- `eval`/`if` classified as data-flow expression, not executable code.
- Prototype/constructor escape attempts fail safely.
- Audit reports blocked findings without executing unsafe code.

These tests should be deterministic and not require external network services.

## Performance Guardrails

Expand `scripts/bench.js` or create a companion benchmark harness that emits
machine-readable output.

Scenarios:

- Small config with no variables.
- Typical serverless-style config.
- Large config with hundreds of variables.
- Nested self references.
- File refs and nested file refs.
- Filters and functions.
- Metadata mode.
- `analyze()` mode.
- Requirements JSON mode.
- Future audit mode.
- Future graph mode.
- Safe mode.

Output:

```json
{
  "schemaVersion": 1,
  "node": "v22.x",
  "platform": "darwin-arm64",
  "scenarios": [
    {
      "name": "large-nested-yaml",
      "bytes": 84000,
      "variables": 420,
      "runs": 100,
      "meanMs": 4.7,
      "p95Ms": 5.5,
      "heapDeltaMb": 1.2
    }
  ]
}
```

Start reporting-only. Add thresholds later only for low-noise cases where the
regression would be obvious and meaningful.

## Memory Smoke Tests

Add a repeated-resolution smoke test:

- Resolve representative configs many times in one process.
- Track heap before/after and peak heap.
- Exercise metadata/analyze paths as well as normal resolution.
- Fail only on conservative thresholds to avoid CI flakes.

The point is to catch unbounded caches or tracking structures, not prove precise
heap behavior.

## Phased Implementation

### Phase 1: Harness

Build the golden harness with one CLI fixture and one API fixture.

Done when:

- `npm run test:conformance` exists.
- `UPDATE_GOLDEN=1` workflow is explicit.
- Failure diffs are actionable.

### Phase 2: Cross-Format Fixtures

Add core-format equivalence fixtures and partial-format difference docs.

Done when:

- YAML/JSON/JSON5/TOML/JS/TS equivalent fixtures pass.
- INI/HCL/Markdown differences are documented.

### Phase 3: Resolver Edge Fixtures

Add high-risk resolver and parser fixtures.

Done when:

- Each fixture names the semantic rule it protects.
- Full conformance suite passes.

### Phase 4: Security/Audit Fixtures

Add safe-mode/audit fixtures after core security features land.

Done when:

- Unsafe execution surfaces are covered.
- Eval/if data-flow classification is covered.

### Phase 5: Performance And Memory

Expand benchmarks and add memory smoke tests.

Done when:

- Machine-readable benchmark output exists.
- Repeated-resolution smoke test runs reliably.
- CI can run reporting-only perf without flakiness.

## Open Decisions

1. Should conformance run inside `npm test` by default? Recommendation: start as
   a separate script, then include fast subsets in full test once stable.
2. Should golden update mode write all artifacts or only selected fixtures?
   Recommendation: support selected fixture updates before full updates.
3. Should perf run in CI? Recommendation: reporting-only CI job, not a blocking
   status until variance is understood.

