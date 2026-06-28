# Comment Annotations for Config Requirements - Plan

Status: draft plan (2026-06-27). This is a follow-up to the config wizard and
requirements JSON work. It plans the comment-tag approach only; it does not
reintroduce a `from()` filter.

## Goal

Move non-runtime metadata out of variable filter chains and into comments attached
to the config value they describe.

Runtime filters should continue to affect values:

```yaml
stage: ${option:stage | oneOf("dev", "prod")}
port: ${env:PORT | Number}
```

Comment annotations should describe values for humans, the wizard, and agents:

```yaml
secrets:
  # Stripe live secret key
  # @from Stripe dashboard > Developers > API keys
  # @sensitive true
  stripeSecret: ${env:STRIPE_SECRET_KEY}
```

This gives config authors a language-neutral way to document requirements in YAML,
TOML, INI, HCL, JS-ish configs, JSON5, and JSONC. JSON remains unsupported for
comment annotations because JSON has no comments.

## Current State

The current implementation already has the right foundation:

| Capability | Current behavior | Location |
|---|---|---|
| Plain comments as descriptions | Leading/inline comments become description fallback | `src/utils/parsing/extractComment.js` |
| Metadata attachment point | `enrichMetadata` attaches comment text to occurrences | `src/utils/parsing/enrichMetadata.js` |
| Normalized model | Requirements model merges occurrences by variable | `src/utils/requirements/configRequirements.js` |
| Agent contract | `schemaVersion: 1`, `requirements[]`, `ask[]` | `src/utils/requirements/serializeRequirements.js` |
| Wizard renderer | Prompt descriptors consume requirements | `src/utils/ui/promptDescriptors.js` |
| `obtainHint` plumbing | Model, serializer, `ask[]`, and wizard descriptor already carry it when produced | `configRequirements.js`, `serializeRequirements.js`, `promptDescriptors.js` |
| `from()` filter | Removed by design | keep it removed |

Today `extractComment()` returns only:

```js
{
  description: "API key from dashboard",
  descriptionSource: "comment" // or "leadingComment"
}
```

This plan changes that to return structured metadata while keeping plain comments
as the zero-cost description fallback.

## Design Principle

Filters affect values. Comments describe values.

Keep these as filters:

```yaml
stage: ${option:stage | oneOf("dev", "prod")}
port: ${env:PORT | Number}
flags: ${option:flags | Array}
```

Move these to comments:

```yaml
# @description Stripe live secret key
# @from Stripe dashboard > Developers > API keys
# @example sk_live_...
# @default Set this in CI, not in the config file
# @sensitive true
# @group Payments
# @deprecated Use STRIPE_RESTRICTED_KEY instead
stripeSecret: ${env:STRIPE_SECRET_KEY}
```

`help()` stays supported for compatibility, but docs should recommend comment
annotations for new human/agent metadata.

## Decision: No `meta()` Filter in v1

Do not add a `meta()` identity filter for v1.

The competing syntax is format-neutral and works in JSON:

```yaml
stripeSecret: ${env:STRIPE_SECRET_KEY | meta({
  "description": "Stripe live secret key",
  "from": "Stripe dashboard > Developers > API keys"
})}
```

But it violates the core design line: it is another filter that does not affect the
resolved value. It also makes YAML/TOML/HCL authoring noisy, especially when the
metadata is longer than the variable expression.

Decision:

- Comment annotations are the primary and only v1 metadata authoring mechanism.
- JSON metadata is out of scope for v1 because JSON has no comments.
- Do not keep or add positive `meta()` fixtures.
- If JSON metadata becomes necessary later, consider `meta()` as a JSON-only escape
  hatch, not as the recommended cross-format mechanism.
- If a `meta()` fixture is kept for parser coverage, it must be a negative fixture
  that proves the syntax is not currently supported.

## Decision: Do Not Depend on `jsdoc-parser` Directly in v1

`/Users/david/Workspace/repos/jsdoc-parser` already has useful JSDoc tag parsing,
and its core can parse stripped blocks such as:

```text
Stripe live secret key
@from Stripe dashboard > Developers > API keys
@sensitive true
```

That is conceptually close to what configorama needs. However, the package is a
full JSDoc parser stack, not a small config-comment parser. Pulling it directly
would bring JSDoc semantics and dependencies such as markdown rendering, type
parsing, TypeScript/import helpers, and block-comment assumptions into a feature
that only needs line-oriented `@tag value` parsing.

Decision:

- Implement a small local parser in configorama for v1.
- Keep the parser deliberately config-specific: known tags only, unknown tag-shaped
  lines become plain description text, strict `@sensitive true|false`, no JSDoc type
  grammar.
- Do not add `jsdoc-parser` as a runtime dependency of configorama for v1.
- After v1 works, optionally extract the small primitive into `jsdoc-parser` as a
  dependency-light helper such as:

```js
parseLooseTags(text, {
  knownTags: ['description', 'from', 'example', 'default', 'sensitive', 'group', 'deprecated'],
  unknown: 'text'
})
```

That helper must live outside the existing markdown/type/import pipeline so other
projects can reuse it without inheriting JSDoc-specific behavior.

## Annotation Syntax

### Plain Description

Normal leading or trailing comment text remains the description:

```yaml
# Stripe live secret key
stripeSecret: ${env:STRIPE_SECRET_KEY}

region: ${option:region, "us-east-1"} # AWS region
```

### Explicit Tags

Known tags start at the beginning of comment text after the comment marker:

```yaml
# @description Stripe live secret key
# @from Stripe dashboard > Developers > API keys
# @sensitive true
stripeSecret: ${env:STRIPE_SECRET_KEY}
```

Grammar:

```text
comment-marker whitespace? @tag whitespace value
```

Examples:

```text
# @from Stripe dashboard > Developers > API keys
// @group Payments
# @sensitive false
```

Rules:

- Tag names are case-sensitive lowercase in docs: `description`, `from`,
  `example`, `default`, `sensitive`, `group`, `deprecated`.
- Parser should accept tag names by `/^@([a-z][a-z0-9_-]*)\b(.*)$/`.
- Tag value is the rest of the comment line after trimming one leading whitespace.
- Only known tag names become structured metadata. Unknown tag-shaped lines are not
  dropped; they fall back to plain description text so comments like
  `# ping @david before rotating this key` do not lose their description.
- Tags inside quoted values or inside `${...}` are ignored because
  `findCommentStart()` already scans outside quotes and variable braces.
- Inline comments may contain one plain description or one tag. Multi-tag inline
  comments such as `# @from ... @group ...` are out of scope for v1; use a leading
  block for multiple annotations.
- Block comments like `/* ... */` are out of scope for v1.

### Supported Tags

| Tag | Model field | Meaning |
|---|---|---|
| `@description ...` | `description` | Explicit description. Overrides normal comment text and legacy `help()` for the same occurrence. |
| `@from ...` | `obtainHint` | Where a human or agent should obtain the value. This is a comment tag, not a filter. |
| `@example ...` | `examples[]` | Example value or shape. Never used as a runtime value. |
| `@default ...` | `defaultHint` | Documentation-only default hint. Never used as a fallback. |
| `@sensitive true|false` | `sensitive` override | Overrides name-based sensitive detection. |
| `@group ...` | `group` | Wizard display grouping/label. Does not change `variableType` or `sourceClass`. |
| `@deprecated ...` | `deprecationMessage` | Warning text shown in requirements JSON and wizard descriptors. |

Important naming decision: use `defaultHint`, not `default`, in the model. The
existing `default` field is a runtime fallback or resolved environment value.
`@default` must not pretend to supply a value.

`@sensitive` parsing is strict: only `true` and `false`, case-insensitive, are
recognized. Any other value is ignored and the normal name heuristic remains in
effect. Do not accept `yes`, `no`, `1`, or `0` in v1; config comments should be
unambiguous.

## Cross-Format Examples

YAML:

```yaml
secrets:
  # Stripe live secret key
  # @from Stripe dashboard > Developers > API keys
  # @sensitive true
  stripeSecret: ${env:STRIPE_SECRET_KEY}
```

TOML:

```toml
# Stripe live secret key
# @from Stripe dashboard > Developers > API keys
stripe_secret = "${env:STRIPE_SECRET_KEY}"
```

INI:

```ini
# Stripe live secret key
# @from Stripe dashboard > Developers > API keys
stripe_secret = ${env:STRIPE_SECRET_KEY}
```

HCL:

```hcl
// Stripe live secret key
// @from Stripe dashboard > Developers > API keys
stripe_secret = "${env:STRIPE_SECRET_KEY}"
```

JS-ish config:

```js
module.exports = {
  // Stripe live secret key
  // @from Stripe dashboard > Developers > API keys
  stripeSecret: '${env:STRIPE_SECRET_KEY}',
}
```

JSON5:

```json5
{
  // Stripe live secret key
  // @from Stripe dashboard > Developers > API keys
  stripeSecret: "${env:STRIPE_SECRET_KEY}",
}
```

JSON:

```json
{
  "stripeSecret": "${env:STRIPE_SECRET_KEY}"
}
```

JSON gets no annotations because comments are invalid.

## Association Rules

Annotations attach to a config value occurrence, not just to a variable name.

Use the existing `extractComment(path, lines, fileType)` path lookup as the base:

1. Find the source line for the occurrence path.
2. Parse the trailing inline comment on that line, if any.
3. Parse the contiguous leading comment block immediately above that line.
4. Ignore blank-separated comment blocks.
5. Ignore decoration-only comments such as `# -----`.
6. Return both plain comment text and structured tags.

Precedence by source:

| Field | Rule |
|---|---|
| `description` | `@description` > `help()` > inline plain comment > leading plain comment |
| `obtainHint` | `@from`; no filter equivalent |
| `examples` | merge unique examples from all attached annotations |
| `defaultHint` | `@default`; documentation only |
| `sensitive` | `@sensitive` override > name heuristic |
| `group` | `@group` override > derived source group in wizard |
| `deprecationMessage` | `@deprecated`; null when absent |

Why `@description` beats `help()`: adding an explicit comment tag is an intentional
author action in the new metadata system. Existing configs with `help()` and normal
comments keep compatibility because normal comments remain lower precedence than
`help()`.

Implementation requirement: `ConfigRequirements` description selection must learn
the new source explicitly. Today `getDescriptionPriority()` falls through unknown
sources to the lowest priority. Add `commentTag` above `help`:

```diff
 function getDescriptionPriority(source) {
+  if (source === 'commentTag') return -1
   if (source === 'help') return 0
   if (source === 'inlineComment' || source === 'comment') return 1
   if (source === 'leadingComment') return 2
   return 3
 }
```

Do not rely on the fallback branch for any known source.

## Parser Output

Replace the description-only result with a richer shape:

```js
{
  description: "Stripe live secret key",
  descriptionSource: "commentTag", // commentTag | help | comment | leadingComment
  annotations: {
    description: "Stripe live secret key",
    obtainHint: "Stripe dashboard > Developers > API keys",
    examples: ["sk_live_..."],
    defaultHint: "Set in CI",
    sensitive: true,
    group: "Payments",
    deprecationMessage: "Use STRIPE_RESTRICTED_KEY instead"
  }
}
```

Implementation detail: keep `extractComment()` as a compatibility wrapper if that
keeps call sites simple, but add a pure parser such as:

```js
parseCommentAnnotations(commentLines)
```

where each line is already stripped of the comment marker.

Suggested internal return:

```js
{
  plainLeadingText: "Stripe live secret key",
  plainInlineText: null,
  tags: {
    description: ["Stripe live secret key"],
    from: ["Stripe dashboard > Developers > API keys"],
    example: ["sk_live_..."],
    default: ["Set in CI"],
    sensitive: ["true"],
    group: ["Payments"],
    deprecated: ["Use STRIPE_RESTRICTED_KEY instead"]
  }
}
```

Then normalize tags into model fields in one place.

## Requirements Model Changes

Extend `ConfigRequirement` additively:

```jsonc
{
  "name": "STRIPE_SECRET_KEY",
  "variable": "env:STRIPE_SECRET_KEY",
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
  "deprecationMessage": null,
  "paths": ["secrets.stripeSecret"],
  "conflicts": []
}
```

Additive fields can remain under `schemaVersion: 1` because existing consumers can
ignore unknown fields. A future incompatible rename or removal should bump the
integer schema version to `2`.

`sensitiveSource` is included in `requirements[]` for auditability. It is omitted
from `ask[]` by design unless a later consumer needs provenance there; the boolean
`sensitive` is the actionable field for prompting and masking.

Mirror the same useful fields into `ask[]`:

```jsonc
{
  "name": "STRIPE_SECRET_KEY",
  "variable": "env:STRIPE_SECRET_KEY",
  "variableType": "env",
  "type": "string",
  "sensitive": true,
  "description": "Stripe live secret key",
  "obtainHint": "Stripe dashboard > Developers > API keys",
  "examples": ["sk_live_..."],
  "defaultHint": "Set in CI or local shell profile",
  "group": "Payments",
  "deprecationMessage": null,
  "paths": ["secrets.stripeSecret"],
  "how": "Set environment variable STRIPE_SECRET_KEY"
}
```

## Conflict Rules

The same variable can appear at multiple paths. The model builder must merge
annotations deterministically and report meaningful conflicts.

| Field | Same value across occurrences | Different values across occurrences |
|---|---|---|
| `description` | take by precedence | take by precedence, no conflict |
| `obtainHint` | merge one value | conflict |
| `examples` | merge unique values | merge unique values, no conflict |
| `defaultHint` | merge one value | conflict |
| `sensitive` override | merge one value | conflict |
| `group` | merge one value | conflict |
| `deprecationMessage` | merge one value | conflict |

Keep the existing asymmetry:

- Wizard descriptors warn and pick a deterministic first value, so interactive setup
  is not blocked.
- Requirements serializer hard-errors on conflicts, so agents get a clean contract.

Conflict messages should name the variable, field, conflicting values, and paths.

## Wizard Behavior

Prompt descriptors should carry the new fields:

```js
{
  description,
  obtainHint,
  examples,
  defaultHint,
  sensitive,
  group,
  deprecationMessage
}
```

Behavior:

- `@group` controls the displayed group label when present; otherwise keep the
  current source-derived group (`env`, `options`, `files`, etc.).
- `@sensitive false` should turn off password masking even for names containing
  `token`, `secret`, `key`, etc.
- `@sensitive true` should force password masking for non-obvious names.
- `@deprecated` should be surfaced as a warning in descriptors and requirements
  JSON. The first implementation can expose the data without adding new TUI copy if
  the clack UI would need more design.
- `@default` is a hint only. It can appear in descriptor metadata, but it must not
  become `defaultValue` and must not resolve the config.

## Implementation Phases

### P1 - Pure annotation parser

Add a parser that receives stripped comment lines and returns plain text plus known
tags.

Do this locally in configorama first. Do not call `jsdoc-parser` from this feature.
Keep the implementation small enough that it can later be extracted into
`jsdoc-parser` as `parseLooseTags()` if reuse becomes valuable.

Files:

- `src/utils/parsing/commentAnnotations.js`
- `src/utils/parsing/commentAnnotations.test.js`

Tests:

- Parses each known tag.
- Keeps plain text separate from tag lines.
- Treats unknown tag-shaped lines as plain description text.
- Handles empty tag values.
- Parses only `true`/`false` values for `@sensitive`; invalid values are ignored.
- Supports repeated `@description` lines by joining them with a space.
- Supports repeated `@example` lines by collecting unique examples.
- Does not require or import `jsdoc-parser`.

### P2 - Attach annotations in `extractComment`

Change `extractComment()` to collect both leading and inline comment text, then feed
the stripped lines into the parser.

Files:

- `src/utils/parsing/extractComment.js`
- `src/utils/parsing/extractComment.test.js`

Tests:

- YAML leading tags.
- YAML inline plain description.
- YAML inline tag.
- JSON returns null.
- JSON5 and JSONC `//` comments.
- HCL `#` and `//` comments.
- Comment markers inside quotes and `${...}` ignored.
- Tag lines are not included in the plain description.

### P3 - Map occurrence annotations

Update `enrichMetadata` so each occurrence can carry:

- `description`
- `descriptionSource`
- `obtainHint`
- `examples`
- `defaultHint`
- `sensitive`
- `sensitiveSource`
- `group`
- `deprecationMessage`

Files:

- `src/utils/parsing/enrichMetadata.js`

Tests:

- `@description` overrides normal comment for the same occurrence.
- `@description` overrides `help()` when both are present.
- Normal comment remains lower precedence than `help()`.
- `@from` populates `obtainHint`.
- `@default` populates `defaultHint` and does not resolve the variable.
- `@sensitive false` survives to the occurrence.

### P4 - Extend requirements model and conflict rules

Extend `buildConfigRequirements()` to merge the new fields and detect conflicts.
Also update `getDescriptionPriority()` so `commentTag` outranks `help`.

Files:

- `src/utils/requirements/configRequirements.js`
- `src/utils/requirements/configRequirements.test.js`

Tests:

- `obtainHint`, `defaultHint`, `group`, and `deprecationMessage` merge when
  identical.
- Conflicting scalar annotation values are recorded in `conflicts`.
- `examples` merge unique values without conflicts.
- `@sensitive false` overrides name heuristic.
- `@sensitive true` overrides non-sensitive names.
- Invalid `@sensitive yes`/`1` values are ignored and fall back to the name
  heuristic.
- Conflicting sensitive overrides are conflicts.

### P5 - Extend serializer and prompt descriptors

Expose the new fields in `requirements[]`, `ask[]`, and prompt descriptors.
`obtainHint` is already plumbed end-to-end, so P5 is mostly regression coverage for
`@from` plus serialization for `examples`, `defaultHint`, `group`,
`deprecationMessage`, and `sensitiveSource`.

Files:

- `src/utils/requirements/serializeRequirements.js`
- `src/utils/ui/promptDescriptors.js`
- `src/utils/ui/promptDescriptors.test.js`

Tests:

- Requirements JSON includes annotation fields.
- `ask[]` includes annotation fields.
- `ask[]` does not include `sensitiveSource` unless this decision is revisited.
- Serializer hard-errors on new annotation conflicts.
- Prompt descriptor uses annotation group when present.
- Prompt descriptor uses sensitive override when present.

### P6 - Documentation and fixtures

Document the split between runtime filters and comment metadata.

Files:

- `README.md`
- `docs/config-wizard-smoke.md`
- `tests/filters/oneOf.yml` or a new `tests/annotations/` fixture

Docs must explicitly say:

- `from()` is not a filter.
- `@from` is a comment annotation.
- `@default` is doc-only and does not resolve missing values.
- JSON cannot use comment annotations.
- `help()` remains supported but comment annotations are preferred for new metadata.

### P7 - Final validation

Run:

```bash
npx uvu src/utils/parsing ".*\\.test\\.js$"
npx uvu src/utils/requirements ".*\\.test\\.js$"
npx uvu src/utils/ui promptDescriptors.test.js
npx uvu tests/requirementsCli requirementsCli.test.js
npm run test:lib
```

Add CLI smoke checks:

```bash
node cli.js requirements tests/annotations/config.yml
node cli.js tests/annotations/config.yml --requirements
```

## Bead Breakdown

Suggested bead graph:

| Bead | Title | Depends on |
|---|---|---|
| annotation-parser | Build pure comment annotation parser | none |
| annotation-extract | Attach parsed annotations to comment extraction | annotation-parser |
| annotation-metadata | Map comment annotations into variable occurrences | annotation-extract |
| annotation-model | Extend ConfigRequirements fields and conflict rules | annotation-metadata |
| annotation-serializer | Serialize annotation fields into requirements JSON and ask[] | annotation-model |
| annotation-wizard | Carry annotation fields through prompt descriptors | annotation-model |
| annotation-docs | Document comment annotations and metadata split | annotation-serializer, annotation-wizard |
| annotation-validation | Add fixtures and run final validation | annotation-docs |
| loose-tags-extraction | Optional: extract local parser primitive into `jsdoc-parser` | annotation-validation |

## Resolved Review Decisions

1. `@description` overrides `help()` because an explicit comment tag is the new
   first-class metadata system. Normal comments still remain lower precedence than
   `help()`.
2. Unknown tag-shaped lines are treated as plain description text, not silently
   dropped and not surfaced as diagnostics.
3. `@deprecated` is exposed in requirements JSON and prompt descriptors first. A
   richer TUI warning can be designed separately.
4. `@group` overrides display grouping, while `variableType` and `sourceClass`
   preserve the real source metadata.
5. `meta()` is not part of v1. JSON metadata remains out of scope unless a future
   JSON-only escape hatch is explicitly planned.
6. `jsdoc-parser` is not a direct v1 dependency. The parser can be extracted there
   later as a small dependency-light primitive after configorama proves the shape.

## Risks and Guards

- Ambiguous comments in TOML/INI/HCL can be path-limited by the current fallback
  lookup. Guard with tests and document v1 as best-effort for duplicate keys in
  these formats.
- `@default` can be mistaken for a runtime fallback. Use `defaultHint` internally and
  in JSON, and add tests proving it does not resolve values.
- `@from` might be confused with the removed `from()` filter. Docs must show comment
  syntax only and include a negative note.
- Overloading comments can become too broad. Keep v1 tags limited to non-runtime
  metadata and refuse to add `@type` or `@oneOf`; those remain filters.
- Reusing the full `jsdoc-parser` package would couple configorama metadata to
  JSDoc parsing, markdown rendering, type grammar, and TypeScript/import behavior.
  Avoid that coupling in v1; extract only the tiny line-tag primitive later if it
  proves generally useful.

## Review Prompt

Use this plan with the standard planning-workflow review prompt:

```text
Carefully review this entire plan for me and come up with your best revisions in
terms of better architecture, new features, changed features, etc. to make it
better, more robust/reliable, more performant, more compelling/useful, etc. For
each proposed change, give me your detailed analysis and rationale/justification
for why it would make the project better along with the git-diff style change
versus the original plan shown below:

<paste docs/plans/comment-annotations-requirements.md>
```
