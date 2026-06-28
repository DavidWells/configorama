# Config Wizard Enhancements — Plan

Status: decisions locked (2026-06-27); ready to build. Revised after external review.

## Goals & Why

The `--setup` wizard already prompts for unresolved variables. We want to make it
declarative and agent-friendly so that:

1. Config authors can describe variables once (help text, allowed values, type) and
   have that drive both the interactive wizard and machine consumers.
2. An AI agent can ask configorama "what does this config need from me / the human?"
   and get a clean JSON contract back — no screen-scraping the TUI.

Four asks:
1. Use **leading comments** as help text (fallback for `help()`).
2. **Allowed values / enum** per variable (e.g. `stage` ∈ `${stages}`).
3. **Type** declaration (string/number/array/…).
4. Emit a **JSON instruction object** for an AI agent.

## Current State (grounded)

| Capability | Status | Where |
|---|---|---|
| Help text via `help('...')` filter | ✅ works (single arg only) | `src/utils/parsing/enrichMetadata.js:29,53`; `src/utils/ui/configWizard.js:322` |
| Type via capitalized filter (`Number`, `Array`, …) | ✅ recognized | `src/utils/parsing/enrichMetadata.js:8,15`; `src/utils/ui/configWizard.js:291` |
| Type validation in wizard | ⚠️ only Boolean/Number/Json/String | `src/utils/ui/configWizard.js:254` |
| Allowed values | ⚠️ scraped from trailing `()` in help text | `src/utils/ui/configWizard.js:355` |
| Leading comments as help | ❌ not built | path-aware `findLineByPath` exists at `src/utils/paths/findLineForKey.js:53` |
| Per-variable metadata (`analyze`/`returnMetadata`) | ✅ ~70% of agent JSON | `src/index.js:124` (analyze); `src/utils/parsing/enrichMetadata.js` |
| Sensitivity detection | ✅ name-based | `src/utils/ui/configWizard.js:209` |

`help()` extraction regex is single-arg (`^help\(['"](.+)['"]\)$`), so a second arg
(`help('text', ${stages})`) breaks it today.

## Core architectural idea: one Config Requirements Model

Today the wizard re-derives help/type/allowed/sensitive inline while prompting, and
the metadata path emits a *different* shape. Both should consume **one normalized
model** built from enriched metadata:

```jsonc
// ConfigRequirement (one per unique variable)
{
  "name": "stage",
  "variableType": "option",     // option | env | self | dotProp | file | git | ...
  "sourceClass": "user",        // user | config | readonly | remote (drives how/ask)
  "type": "string",             // value type from type filter; default "string"
  "description": "Deployment stage",
  "descriptionSource": "help",  // help | comment | null
  "allowedValues": ["dev","staging","prod"],  // or null (from oneOf)
  "sensitive": false,
  "required": true,             // no fallback and used
  "default": null,              // clean (quotes stripped)
  "obtainHint": null,           // reserved for future author-supplied obtain guidance
  "paths": ["stage", "fullName"]
}
// `how` (e.g. "Pass --stage") is derived at serialize-time from variableType, not stored.
```

- Runtime aliases are normalized in the model. Existing `${opt:stage}` and new
  `${option:stage}` are the same thing; both serialize as `variableType: "option"`.
  The current resolver is named `options` internally (`src/resolvers/valueFromOptions.js`)
  with prefix `opt`; the model builder must map `options`/`opt`/`option` → `option`.
- The interactive wizard becomes a **renderer** over this model.
- The agent JSON output is a **serializer** of this model.
- Comments / allowed-values / type all enrich the *same* model.

This removes the current duplication and is the prerequisite that makes features
1–4 cheap. Build it first.

### Conflict handling across occurrences

"One per unique variable" requires a deterministic rule when the same variable
(e.g. `${opt:stage}`) appears at multiple paths with different annotations. Today
enrichment just collects `types[]`/`descriptions[]` and the wizard silently takes
`[0]` (`enrichMetadata.js:665-694`) — unsafe for constraints. The model builder rules:

| Field | Identical across occurrences | Conflicting |
|---|---|---|
| `type` | merge to the one value | **error** in serializer (ambiguous type) |
| `allowedValues` (`oneOf`) | merge | **error** (conflicting constraints) |
| `description` | merge | take by precedence (help > comment), first non-empty |
| `default` | merge | **error** (ambiguous default) |
| `sensitive` | OR together | n/a (true wins) |

Errors are deterministic and name the variable + conflicting paths. The interactive
wizard surfaces them as a warning and falls back to first-value (non-fatal) so setup
isn't blocked; the `requirements` serializer treats them as hard errors so agents get
a clean contract. Record this asymmetry in tests.

## Feature 1 — Leading comments as help (fallback)

Goal: an author who already comments their config gets wizard/agent help text for
free, without adding `help()`.

```yaml
# Deployment stage for the service
stage: ${opt:stage}                         # leading comment block

region: ${env:AWS_REGION}  # AWS region     # trailing inline comment
```

Mechanism (new pure helper `extractComment(path, lines, fileType)`):
1. **Path-aware lookup**: use `findLineByPath(path, lines, fileType)`
   (`src/utils/paths/findLineForKey.js:53`, handles YAML/JSON via path segments) so
   nested/duplicate keys resolve correctly. Fall back to `findLineForKey(key, ...)`
   only for formats `findLineByPath` doesn't cover (toml/ini/hcl).
2. **Trailing inline**: on the key line, take text after the format's comment marker
   that is outside the `${...}` value. (Careful: `#`/`//` can appear inside values;
   only treat as a comment if it's after the resolved value token / quoted region.)
3. **Leading block**: walk upward from keyLine-1 over *contiguous* comment lines,
   stop at the first blank or non-comment line; reverse; strip marker + one space;
   join with `\n` (or space).
4. **Decoration guard**: drop lines that are pure decoration / section banners —
   `^[\s#/*=\-_]+$` (e.g. `### Database ###`, `# -----`).
5. Comment marker by format: `#` (yml/yaml/toml/ini), `//` and `#` (hcl), `//`
   (json5). JSON → no comments, skip. (Block `/* */` out of scope for v1.)

Precedence for `description` (record which in `descriptionSource`):
`help()`  >  trailing inline comment  >  leading comment block.

Risks / guards:
- Path-aware lookup handles nested/duplicate keys for YAML/JSON; toml/ini/hcl use the
  first-match fallback (acceptable for v1, flagged for revisit).
- Never throw — best-effort fallback only; failure → no description.

## Feature 2 — Allowed values / enum

Authoring: dedicated **`oneOf()`** filter.

```yaml
stages: [dev, staging, prod]
stage: ${opt:stage | oneOf(${stages}) | help('Deployment stage')}   # ref a list var
tier:  ${opt:tier | oneOf('free','pro')}                            # inline literals
```

Behavior:
- `oneOf` is a real filter (like `Number`): on resolution it **errors** if the value
  isn't in the set — `Error: 'stage' must be one of: dev, staging, prod`.
- The set is captured into the model as `allowedValues: string[]`.
- Wizard renders a `p.select` from `allowedValues` (picker already exists at
  `configWizard.js:528`).

**Scope distinction (implemented in two steps):**
- *v1:* `oneOf('a','b')` inline literals.
- *v1.1:* `oneOf(${listVar})` resolves a list variable to an array before validation.

**Filter-argument resolution is the hard part — explicit task required.** Today filter
args are tokenized as raw strings by `splitCsv`/`formatFunctionArgs` (`main.js:2514`),
and preprocessing only protects `${vars}` inside `help()` (`preProcess.js` base64
escape). Nothing resolves `${stages}` inside `oneOf(...)` → the filter would receive
the literal string `"${stages}"`, not an array. So:

- **v1 scope: inline literals first** — `oneOf('dev','staging','prod')`. This needs
  only the tokenizer + a validating runtime filter. Ship and test this first.
- **v1.1: `${listVar}` args** — requires a filter-argument resolver that resolves a
  `${var}` arg (incl. `${self:list}`) to its array *before* the `oneOf` filter runs,
  with a defined error if it doesn't resolve to an array. Treat as its own subtask
  with tests proving the runtime filter receives an actual array, not a string.

Runtime filter behavior: `oneOf` errors on out-of-set values
(`Error: 'stage' must be one of: dev, staging, prod`), like the `Number` filter throws.

**Comparison semantics (with type filters).** `${opt:threads | Number | oneOf(1,2,4)}`
mixes a coerced number with literal args. Rules:
- Run `oneOf` *after* type coercion — recommend authors place the type filter first
  (`| Number | oneOf(...)`); document this ordering.
- `oneOf` parses unquoted numeric literals as numbers, quoted as strings.
- Membership test: compare by **string-normalized equality** (`String(value)` vs
  `String(arg)`) so a coerced `4` matches literal `4` regardless of type; the resolved
  value keeps its (coerced) type. `allowedValues` is stored as `string[]` for display.
- Tests must cover: `Number | oneOf(...)`, `oneOf(...) | Number` (wrong order),
  string enums, and a value that fails the set.

Wizard rendering (`p.select` over `allowedValues`) depends on the wizard being
migrated to the model (phase 4), so oneOf's *runtime validation* lands in phase 3 but
its *select UI* lands with/after phase 4.

Sub-question (resolved): `oneOf` does NOT inject a default; `required` semantics stand,
the wizard select pre-selects index 0.

## Feature 3 — Type declaration (mostly exists; round out)

How it works today: a **capitalized filter** is the type, and it's a real
**validating coercer** applied at resolution (`main.js:564-586`):

| Filter | Resolution behavior |
|---|---|
| `Number` | `Number(v)`, throws if NaN |
| `Boolean` | true/false/yes/no/on/off/1/0 → bool, else throws |
| `String` | coerce to string (null → '') |
| `Json` | `JSON.parse` |
| `toNumber`/`toString`/`toBoolean`/`toJson`/`toObject` | non-throwing coercers |

So types already validate during normal resolution — the wizard's separate
`validateType` (`configWizard.js:254`) is a UX pre-check, not the source of truth.

Gaps to close:
- **`Array` / `Object` are half-wired**: listed in `TYPE_FILTERS` (`enrichMetadata.js:8`)
  but have **no filter function** → `${x | Array}` doesn't actually work. Add real
  `Array` (split / JSON5 array) and `Object` (JSON5 object) coercing+validating filters.
- Default `type` to `"string"` in the model when no type filter present.
- Extend wizard `validateType` to Array/Object to match.
- Type-aware prompts: `Boolean` → `p.confirm`; allowedValues → `p.select` (done);
  `Array` → comma-split text (or `p.multiselect` when allowedValues present);
  `Json`/`Object` → text + parse validation.

## Feature 4 — Agent instruction JSON

Read-only, no prompting, no side effects. Two entry points over the same serializer.

**Critical:** the CLI command must route through `analyze()` (sets
`returnPreResolvedVariableDetails` — `src/index.js:124`), NOT the normal
`configorama(inputFile, options)` flow at `cli.js:221`. That flow runs the full
resolver and would error on missing required vars *before* emitting requirements,
violating the read-only contract. Add a dedicated branch in cli.js that calls analyze
and prints, short-circuiting before the resolver.

**Environment-aware, not zero-resolution.** `analyze()` skips the *full* resolver but
enrichment still pre-resolves `git`/`env`/`self`/`dot.prop` required vars via
`preResolveSingle` (`enrichMetadata.js:701-707`) to detect what's already available.
That's intended: `ask[]` reflects what's *missing in the current environment* (e.g. an
env var already set is dropped from `ask`). Document the output as environment-aware,
and make tests set/unset env to prove `ask[]` changes accordingly.

```js
const plan = await configorama.analyze('config.yml', { instructions: true })
```
```bash
configorama requirements config.yml      # subcommand → analyze() → JSON to stdout
# (also: configorama config.yml --requirements)
```

CLI parsing rule:
1. Before the existing positional file/path loop, check `argv._[0] === 'requirements'`.
2. If true, treat `argv._[1]` as the input file, validate it exists, call
   `configorama.analyze(inputFile, { ...options, instructions: true })`, print JSON,
   and `process.exit(0)`.
3. For `configorama config.yml --requirements`, detect the boolean flag before output
   formatting and use the same analyze-only branch.
4. Neither form may fall through to the normal `configorama(inputFile, options)` call.

Shape:
```jsonc
{
  "schemaVersion": 1,
  "config": "config.yml",
  "summary": { "total": 5, "required": 2, "optional": 2, "sensitive": 1 },
  "requirements": [ /* ConfigRequirement[] */ ],
  "ask": [
    {
      "name": "STRIPE_SECRET_KEY",
      "variableType": "env",
      "sourceClass": "user",
      "type": "string",
      "sensitive": true,
      "required": true,
      "allowedValues": null,
      "description": "Stripe live secret key",
      "how": "Set environment variable STRIPE_SECRET_KEY",   // derived from variableType
      "obtainHint": null // reserved for future author-supplied obtain guidance
    }
  ]
}
```

This is the key feature for David's use case: an agent reads `ask[]` and knows what
it lacks, **how** to supply it, and **where to get it** — so it can fetch from a
SaaS UI, read a file, or ask the human.

`how` is derived from `variableType`:
- `env`  → "Set environment variable X" (or read from .env)
- `option` → "Pass --X on the CLI" (`${opt:X}` / `${option:X}` aliases)
- `file` → "Provide file at path Y"
- `git`/`cron`/`eval` → "Derived automatically — no input needed" (excluded from `ask`)

`ask` includes:
- scalar user inputs where `required && default == null && sourceClass === 'user'`
  (i.e. `option`/`env`/`param` — things a human/agent actually supplies).
- fully resolved missing local file/text dependencies (`variableType` `file`/`text`,
  `fileExists === false`) because an agent can create/download/provide the file.

Exclude readonly sources (`git`/`cron`/`eval`) and resolvable config sources. For
dynamic file paths with unresolved inner variables, ask for the inner variables first;
do not emit a file ask until the path is concrete.

`obtainHint` is reserved for future author-supplied "where does this come from"
guidance. Do not add a `from()` identity filter; keep `help()` as the only metadata
filter in variable expressions until a cleaner comment-annotation syntax is planned.

- Pure function over the model → trivially testable, no TTY.

## Decisions (locked 2026-06-27)

1. **Allowed-values syntax**: dedicated `oneOf()` filter, NOT overloading `help()`.
   Supported forms: `oneOf('a','b')` and `oneOf(${listVar})`.
2. **Allowed-values enforcement**: validate **everywhere** (normal resolution errors
   on out-of-set values), not just the wizard. `oneOf` is a true constraint.
3. **Comments-as-help**: YES, as a fallback below `help()`. Mechanism below.
4. **Agent JSON**: option on `analyze()` **plus** a CLI command that emits the JSON
   to stdout. Must tell the agent where to look / what to ask the human for.
5. **Option naming**: support `${opt:name}` for backward compatibility and add
   `${option:name}` as an alias. Requirements JSON uses normalized
   `variableType: "option"`; never expose internal resolver type `"options"`.
6. **Requirements schema**: include `schemaVersion: 1` at the top level so agents can
   pin behavior.
7. **File asks**: missing concrete file/text dependencies are agent-actionable and
   belong in `ask[]`; dynamic unresolved file paths do not until their inner variables
   are known.

## Phased Tasks & Dependencies

Split to avoid a big-bang refactor (per review): build the pure model + serializer
over `analyze()`'s existing output FIRST, migrate the wizard behind the model LATER.

- **P1** — `ConfigRequirements` model: pure builder over `analyze()` output
  (`returnPreResolvedVariableDetails` enriched `uniqueVariables`). Normalize
  `variableType` + `sourceClass` (`options`/`opt`/`option` → `option`);
  add `sensitive` (reuse `isSensitiveVariable`),
  clean `default`. No wizard changes. Fully unit-testable. Blocks the rest.
- **P2** — Agent JSON: serializer + `how` derivation + `ask` filter +
  `analyze({ instructions: true })` + `configorama requirements` CLI branch that calls
  analyze only (never the `cli.js:221` resolver). depends: P1. Highest leverage.
- **P3a** — `oneOf()` v1: validating runtime filter for inline literals only;
  capture `allowedValues` into model. depends: P1.
- **P3b** — `oneOf(${listVar})` v1.1: filter-arg resolver that turns `${listVar}`
  into an actual array before the filter runs. depends: P3a.
- **P4** — Migrate wizard to render from the model (keep the just-shipped
  quote/placeholder fixes intact; re-verify). Enables oneOf `p.select` UI. depends: P1.
- **P5** — Type round-out: real `Array`/`Object` filters; extend `validateType`;
  type-aware prompts. depends: P4 (prompt changes).
- **P6** — Option alias: support `${option:name}` as an alias for `${opt:name}`;
  keep `${opt:name}` fully backward-compatible. depends: P1.
- **P7** — Comments-as-help: `extractComment(path,…)` via `findLineByPath`. depends: P1.
- **P8** — Reserved: comment annotations for obtain guidance if `how` proves insufficient.
- **P9** — Docs (README wizard/help/type/oneOf/agent JSON) + tests throughout.

Rationale: P1+P2 deliver the agent contract with zero TTY risk and no wizard churn;
oneOf runtime validation (P3) is independent of the wizard migration (P4); the type
and comment enrichers (P5/P7) are parallelizable once the model exists.

## Test Strategy

Only the actual clack keypress loop needs a human. Decompose so the *decisions* are
pure and unit-tested (no TTY):

- **Model/serializer (P1/P2):** model builder, normalized option naming
  (`opt`/`option`/`options` → `option`), conflict rules (merge vs error),
  `how` derivation, `ask` filtering, environment-aware `ask` (set/unset env → `ask`
  changes), missing-file ask behavior, full `requirements` JSON snapshot including
  `schemaVersion: 1`.
- **oneOf (P3):** membership pass/fail, `Number | oneOf` vs wrong order, string enums.
- **Wizard decisions (P4/P5) — unit-testable without a TTY:** model→group mapping,
  prompt-type selection (`Boolean`→confirm, `allowedValues`→select, `Array`→split,
  default→text), and value normalization (quote-strip, type coercion). Extract these
  as pure functions returning a *prompt descriptor*, then assert on the descriptor.
- **Comments (P7):** `extractComment` over fixtures (leading block, inline,
  decoration-guarded banners, nested via `findLineByPath`).
- **Manual only:** the live clack render/keypress interaction.
- Reuse fixtures in `tests/setupMode/` and `tests/filterHelper/`.

## Risks / YAGNI

- Don't over-build comment parsing; best-effort fallback only.
- Keep `help()` single-arg behavior intact (we chose `oneOf`, not a help 2nd arg).
- One model, two renderers — resist a third bespoke metadata shape.
- `${listVar}` in `oneOf` is explicitly v1.1 — don't let it creep into the first pass.
