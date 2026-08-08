---
id: 01KWSTY38GXM2HHMRQWP4KAJJ2
status: draft
createdAt: 2026-07-05T12:08:58-07:00
updatedAt: 2026-07-05T13:03:52-07:00
origin: manual
type: plan
---

# Configx Setup Wizard Targets Plan

## Status

Implemented (2026-07-05). Tracked as beads `configorama-idrd` / `configorama-idrd.1` through `.16`. Deviations from plan: clack 0.11 lacks per-prompt output streams, so stream routing uses a scoped stdout redirect in the wizard runner instead of a prompt adapter; the emitted `config-env` shell function captures exports before `eval` so configx failures propagate their exit status.

## Goal

Make `configx` able to run the existing Configorama setup wizard, collect missing values from the user, and then do something useful with those values.

The current Configorama setup flow already prompts for values:

```bash
configorama setup config.yml
configorama --setup config.yml
```

But the end of that flow is incomplete for day-to-day `configx` usage:

- it prints a redacted summary;
- it applies answers to the current Configorama process so resolution can continue;
- it does not persist the answers;
- it does not set the user's parent shell;
- it does not offer a clean "prompt, then run my command" `configx` workflow.

The desired user-facing workflows are:

```bash
# Prompt for missing values, load them into the current shell.
config-env setup .env --stage dev

# Prompt for missing values, then run one command with them.
configx setup .env --stage dev -- npm run dev

# Prompt for missing values, write non-secret/project-safe values to a local file.
configx setup .env --stage dev --write .env.local
```

## Key Shell Constraint

A normal CLI process cannot modify its parent shell's environment.

Therefore:

```bash
configx setup .env
```

cannot set values in the terminal that launched it.

Current-shell loading must go through shell code that is evaluated by the current shell. The shell integration added by `configx setup-shell` gives us exactly that path:

```sh
configx-env() {
  eval "$(configx "$@" --export)"
}

config-env() {
  configx-env "$@"
}
```

That means the natural current-shell setup command should be:

```bash
config-env setup .env --stage dev
```

The shell function expands this to:

```bash
eval "$(configx setup .env --stage dev --export)"
```

`configx setup ... --export` can prompt interactively, then print shell-safe `export KEY='value'` lines to stdout. The function evaluates those exports in the current shell.

Critical stdout rule: in this mode, stdout is captured by command substitution. Prompts, spinners, notes, summaries, and warnings must go to stderr or `/dev/tty`; stdout must contain only export lines after prompting completes.

This is broader than prompt UI. The current setup path also prints through `logHeader(...)`, `console.log(...)`, `displayUniqueVariables(...)`, and `displayConfigurableVariables(...)` in `src/main.js`. The extracted setup engine must bypass or reroute all of that stdout output for `configx setup ... --export`; adapting only `@clack/prompts` is not enough.

## Existing Implementation Facts

Current Configorama setup behavior lives in:

- `src/main.js`, where setup mode calls `runConfigWizard(...)`.
- `src/utils/ui/configWizard.js`, where prompts are rendered and answers are returned as:

```js
{
  options: { stage: "dev" },
  env: { API_KEY: "..." },
  self: { ... },
  dotProp: { ... }
}
```

The current gap is visible in `src/main.js` after the redacted summary:

```js
// TODO set values
```

The code then applies answers only in-process:

```js
Object.assign(this.options, userInputs.options)
Object.assign(process.env, userInputs.env)
Object.assign(this.config, userInputs.self)
dotProp.set(this.config, key, value)
```

That is enough for the current `configorama setup` process to continue resolving, but it is not enough for:

- future terminal commands;
- future shells;
- checked-in or local setup files;
- `configx` command execution;
- machine/agent workflows.

## Non-Goals

This feature should not silently write secrets to disk.

This feature should not silently edit `.zshrc`, `.bashrc`, `.env`, or the source config file.

This feature should not claim that `configx setup <file>` sets the current shell. It cannot.

This feature should not make the Configorama wizard and Configx wizard diverge. There should be one prompt/answer engine with multiple apply targets.

This feature should not print secret values in human summaries, logs, or diagnostics.

## Proposed User Experience

### Current Shell

First-time setup:

```bash
configx setup-shell
```

Daily usage:

```bash
config-env setup .env --stage dev
```

This prompts for missing values, then sets the answered environment variables in the current shell.

Equivalent manual form:

```bash
eval "$(configx setup .env --stage dev --export)"
```

Docs should prefer `config-env setup ...`, because it hides the fragile `eval` syntax behind a named shell function.

### One Command

Prompt and immediately run one command with the answered values:

```bash
configx setup .env --stage dev -- npm run dev
```

Behavior:

1. Analyze the config and prompt for unresolved inputs.
2. Apply answers to an in-memory resolution context.
3. Resolve the config.
4. Convert resolved top-level scalar keys into child environment variables.
5. Run the child command with that environment.

This is the safest default when values are only needed by one command because secrets do not persist in the user's shell or on disk.

### Export Only

Prompt and print shell exports:

```bash
configx setup .env --stage dev --export
```

Stdout must contain only shell-safe export lines:

```sh
export API_KEY='...'
```

`--stage dev` is an option answer, not automatically an environment variable. Option answers affect config resolution only. They should appear in export output only if the resolved config contains a top-level scalar key such as `STAGE: ${opt:stage}`.

Human summaries and prompts go to stderr.

This mode exists primarily for shell functions and advanced users.

### Write to Local Env File

Prompt and write answers to a local file:

```bash
configx setup .env --stage dev --write .env.local
```

Recommended v1 behavior:

- Write only environment-variable answers by default.
- Use dotenv syntax.
- Create the file with mode `0600` when possible.
- Refuse to overwrite existing unrelated lines unless `--merge` or `--force` is supplied.
- Never write to `.env` by default unless the user explicitly names it.

Example output file:

```dotenv
API_KEY=...
REGION=us-east-1
```

### Answers File

For agents and CI, provide a structured answer target:

```bash
configx setup config.yml --write-answers configx.answers.json
```

Example:

```json
{
  "schemaVersion": 1,
  "answers": {
    "options": { "stage": "dev" },
    "env": { "API_KEY": "..." }
  }
}
```

Non-interactive usage:

```bash
configx setup config.yml --answers configx.answers.json -- npm run dev
```

This should reuse the same validation path as the interactive wizard.

## Command Design

Recommended new command:

```bash
configx setup <file> [configorama options] [target]
```

Targets:

| Target | Example | Effect |
| --- | --- | --- |
| Child command | `configx setup .env -- npm run dev` | Prompt, resolve, run command with env. |
| Shell exports | `configx setup .env --export` | Prompt, print export lines to stdout. |
| Current shell | `config-env setup .env` | Shell function evals `configx setup .env --export`. |
| Dotenv write | `configx setup .env --write .env.local` | Prompt, write env answers to dotenv file. |
| Answers write | `configx setup app.yml --write-answers configx.answers.json` | Prompt, write structured answers. |
| Dry run modifier | `configx setup .env --dry-run --write .env.local` | Modify a write/export target to show what would happen with values redacted. |

Default behavior if no target is supplied:

```bash
configx setup .env
```

Recommended v1 behavior: run the prompts, then show a target selection menu:

1. Load into current shell by printing the exact command to run with `config-env`.
2. Write `.env.local`.
3. Print export lines.
4. Exit without applying.

Do not prompt for an arbitrary command string in the default menu in v1. It is awkward to quote correctly and easy to confuse with shell execution. The menu should instead show the explicit command form:

```bash
configx setup .env --stage dev -- <command>
```

Important: because plain `configx setup .env` cannot set the current shell, it should not pretend it did. If the user picks current-shell loading from the menu, `configx` should explain:

```text
To set this terminal, run:

  config-env setup .env --stage dev
```

It may offer to install shell integration if `config-env` is not available:

```text
configx setup-shell
```

## Apply Target Semantics

### Target Selection

`configx setup` should accept exactly one apply target per invocation.

Targets are mutually exclusive:

- child command after `--`;
- `--export`;
- `--write <file>`;
- `--write-resolved <file>`;
- `--write-answers <file>`;
- interactive menu target when no explicit target is supplied.

If multiple explicit targets are supplied, fail before prompting.

Examples that should fail:

```bash
configx setup .env --export --write .env.local
configx setup .env --write .env.local -- npm run dev
```

Special shell-function case:

```bash
config-env setup .env --write .env.local
```

Because `config-env` appends `--export`, this expands to both `--write` and `--export`. V1 should fail with a clear error:

```text
configx: setup target conflict: --export cannot be combined with --write
```

Docs should tell users to call `configx setup .env --write .env.local` directly for file writes.

### Cancellation and Atomicity

Cancellation must be fail-closed.

If the user cancels with Ctrl-C, Esc, or any prompt-library cancel path:

- exit non-zero;
- write no exports to stdout;
- run no child command;
- write no dotenv or answers file;
- leave any existing target file unchanged.

For `--export`, empty stdout on cancellation is important because shells commonly run:

```bash
eval "$(configx setup .env --export)"
```

An empty non-zero command substitution should not apply partial exports silently. The implementation should collect all answers in memory first, and only emit export lines after the wizard has completed successfully.

For file targets, write to a temporary file and rename atomically where possible, or otherwise guarantee that cancellation and validation errors happen before opening the target for write.

### Target: Child Command

Use existing `configx` execution semantics:

- `shell: false`;
- `--` separates Configorama/setup options from child command args;
- child inherits stdio;
- child exit status propagates;
- top-level scalar resolved config keys become env vars;
- parent env wins unless a future explicit override flag is accepted.

Setup answers should feed resolution before child env conversion.

### Target: Shell Export

Use existing `configx --export` formatting and tests:

- stdout contains only `export KEY='value'` lines;
- values are single-quoted with embedded single quotes escaped;
- diagnostics and summaries go to stderr;
- no banners on stdout;
- no secret values in stderr.

For `configx setup ... --export`, the export lines should represent the final environment variables that should be set in the shell. In practice that means:

- include answered env variables;
- include resolved top-level scalar config keys if they are missing from parent env, matching existing `configx --export`;
- do not include option answers directly;
- do not include self/dotProp answers directly unless they become top-level scalar resolved config keys.

Precedence:

1. Parent environment values remain authoritative for resolved top-level keys, matching existing `configx --export`.
2. Answered env values are intentional setup answers and should be exported even if they were missing before the wizard.
3. If an answered env key collides with a resolved top-level key, the answered env value wins in the export output because it is the value the user just provided for that environment variable.
4. Always export keys present in the answer set, including cases where a parent env value already existed and the user accepted it by pressing enter. This keeps `config-env setup ...` deterministic and testable.

This gives the user exactly what they need for `config-env setup ...`.

Prompt rendering requirement:

- If the current Configorama wizard writes any prompt UI to stdout, it cannot be used directly in `--export` mode.
- The setup engine must support a prompt adapter or stream option that routes interactive UI to stderr or `/dev/tty`.
- Tests must prove `configx setup ... --export` stdout is valid shell export text with no prompt frames, notes, or summaries mixed in.
- If prompt stream control is not possible with the current prompt library, `configx setup ... --export` should fail with a clear implementation error until the wizard is adapted; it must not risk emitting mixed stdout that `eval` would execute.

### Target: Dotenv Write

Writing raw secrets to disk is convenient but risky. V1 should make it explicit and conservative.

Recommended behavior:

- Only write `env` answers unless `--write-resolved` is supplied.
- Write dotenv key names only if they match `^[A-Za-z_][A-Za-z0-9_]*$`.
- Use `KEY=value` with dotenv-safe quoting.
- Preserve existing file content only in explicit merge mode.
- If the output file already exists with any content, refuse unless `--merge` or `--force` is supplied.
- Create files with `0600` permissions where supported.
- Print only key names in summaries.

Recommended managed block for merge mode:

```dotenv
# >>> configx setup values >>>
API_KEY=...
STAGE=dev
# <<< configx setup values <<<
```

`--merge` behavior:

- If the target file contains exactly one managed block, replace that block.
- If the target file exists but has no managed block, append a new managed block.
- If the target file contains multiple managed blocks or an incomplete marker pair, fail without editing.
- If the target file does not exist, create it with a managed block.

Without `--merge`, an existing target file with any content should be refused unless `--force` is supplied.

### Target: Answers File

The answers file is better for automation than dotenv because it preserves source groups:

- `options`;
- `env`;
- `self`;
- `dotProp`.

It should be JSON, versioned, and secret-aware in docs.

Because answers files can contain raw secrets, they need the same write safety rules as dotenv targets:

- Create files with mode `0600` where supported.
- Refuse to overwrite existing files unless `--force` is supplied.
- If a sensitive answer is present, require confirmation unless `--yes` is supplied.
- Print only group names and key names in summaries, never values.
- Write atomically where possible.

V1 should support both writing and reading answers files. Readback is needed for reliable noninteractive tests and for agent workflows. It must reuse prompt descriptor validation rather than trusting the file blindly.

## Security Guidance

### Preferred Security Order

From safest to riskiest for secrets:

1. `configx setup <file> -- <command>`: values live only in the `configx` process and child command environment.
2. `config-env setup <file>`: values live in the current shell until unset or shell exit.
3. `configx setup <file> --write-answers <file>`: values persist on disk in structured form.
4. `configx setup <file> --write <dotenv>`: values persist on disk in a common env file format that many tools auto-load.
5. Editing shell startup files with secret exports: should not be offered.

### What Not To Do

Do not write secret values into `.zshrc`, `.bashrc`, or shell integration files.

Do not automatically append `export API_KEY=...` to startup files.

Do not print secrets in "copy this command" guidance.

Do not write raw secret values to disk without an explicit `--write` or selected menu action.

Do not use shell `eval` except through the existing `--export` stdout contract.

### 1Password and Secret References

When configs use 1Password references such as:

```dotenv
API_KEY=${op://vault/item/field}
```

the best persistent value is usually the reference, not the resolved secret.

For setup prompts, distinguish two cases:

1. The user is missing a non-secret value, such as `STAGE` or `REGION`.
2. The user is missing a secret value, such as `API_KEY`.

For secrets, docs should recommend:

- store a 1Password reference in the config or `.env`;
- use `configx <file> -- <command>` or `config-env <file>` to resolve at runtime;
- avoid writing resolved secret values to disk.

If the wizard prompts for a sensitive env var and the user chooses `--write .env.local`, show a warning:

```text
configx: API_KEY looks sensitive and will be written to .env.local.
configx: prefer a 1Password reference when possible.
Continue? [y/N]
```

Use `--yes` only for non-interactive flows where the user has explicitly chosen the target.

## Architecture

### Extract Setup Engine

The setup wizard should become a reusable engine:

```js
const result = await configorama.setup(configPath, settings)
```

Proposed result shape:

```js
{
  schemaVersion: 1,
  configPath: "/abs/path/.env",
  requirements: [...],
  answers: {
    options: {},
    env: {},
    self: {},
    dotProp: {}
  },
  redactedAnswers: {
    options: {},
    env: {},
    self: {},
    dotProp: {}
  }
}
```

The existing `runConfigWizard(...)` can remain the prompt renderer, but the orchestration should move out of `src/main.js` so `configx` can call it without scraping CLI output.

The extraction should also remove setup mode's require-time argv dependency. Today `src/main.js` has a global `SETUP_MODE = process.argv.includes('--setup')` check. That is hazardous for library callers: a command such as `configx .env -- node app.js --setup` can accidentally flip Configorama setup mode when `configx` uses Configorama as a library. The setup engine must be opt-in through explicit settings such as `options.setup` or `configorama.setup(...)`, never through process-wide argv sniffing.

The prompt renderer also needs stream control:

```js
await runConfigWizard(metadata, originalConfig, configFilePath, {
  stdout: process.stderr,
  stderr: process.stderr,
  input: process.stdin,
})
```

The exact adapter shape can differ, but the setup engine must make it possible for `configx setup --export` to preserve stdout for machine-consumable export lines.

All setup-mode display helpers must be controlled by the same output policy. That includes existing variable-detail display and redacted summaries from `src/main.js`, not only `runConfigWizard(...)`.

Recommended modules:

- `src/utils/setup/setupEngine.js`: analyze, build requirements, run prompts or answers file, validate, return answers.
- `src/utils/setup/applyAnswers.js`: apply answers to options/env/config in memory.
- `src/utils/setup/writeDotenv.js`: write env answers safely.
- `src/utils/setup/writeAnswers.js`: write structured answers safely.
- `packages/configx/src/setupConfig.js`: Configx command orchestration and target handling.

### Avoid Child CLI Scraping

`configx` should not spawn `configorama setup` and parse the printed summary.

Instead, Configorama should expose a library API for setup, and `configx` should call that API. This avoids:

- fragile stdout parsing;
- accidental secret leakage;
- double prompting;
- impossible structured error handling;
- drift between CLI and package behavior.

### Preserve Existing CLI

Keep:

```bash
configorama setup config.yml
```

But update its behavior to use the same setup engine. It can keep printing the redacted summary, then offer/write targets if accepted by this plan.

## Interaction With `configx setup-shell`

`configx setup-shell` installs the shell functions.

`configx setup <file>` prompts for config values.

They should stay separate commands:

```bash
configx setup-shell
config-env setup .env
```

Docs should make this distinction clear:

- `setup-shell`: install the helper function once.
- `setup`: walk through config values and apply them to a chosen target.

## CLI Option Details

Recommended options for `configx setup`:

| Option | Behavior |
| --- | --- |
| `--export` | Print shell exports after prompting. Used by `config-env setup ...`. |
| `--write <file>` | Write env answers to dotenv file. |
| `--write-resolved <file>` | Write final resolved top-level scalar config values to dotenv file. More dangerous; not default. |
| `--write-answers <file>` | Write structured answers JSON. |
| `--answers <file>` | Read structured answers JSON instead of prompting. |
| `--dry-run` | Modifier for write/export targets: show target actions with values redacted. |
| `--yes` | Skip confirmation prompts for explicit write targets. |
| `--merge` | For dotenv writes, replace an existing managed block or append a new managed block instead of refusing an existing file. |
| `--force` | Overwrite target file or unmanaged keys. Dangerous; explicit only. |
| `--no-preflight` | Match existing configx preflight semantics where relevant. |

Configorama options such as `--stage`, `--param`, and `--config` should still pass through exactly as they do for normal `configx`.

Implementation detail: setup-only flags must be stripped before forwarding options into Configorama resolution. This includes `--export`, `--write`, `--write-resolved`, `--write-answers`, `--answers`, `--dry-run`, `--yes`, `--merge`, `--force`, and `--no-preflight`, following the same pattern as the existing configx `_exportFlag` handling.

## Documentation Requirements

Update `packages/configx/README.md` with a setup section:

```bash
configx setup-shell
config-env setup .env --stage dev
```

Explain:

- why current-shell setup requires `config-env`;
- when to use `configx setup .env -- npm run dev`;
- when to use `--write .env.local`;
- why writing secrets to shell startup files is not supported;
- why 1Password references are preferable to persisted raw secrets;
- how `configorama setup` relates to `configx setup`.

Update Configorama docs/help:

- mention that setup answers can now be applied to explicit targets;
- document the redacted summary;
- document safe write behavior.

## Test Plan

Unit tests:

1. Setup engine returns answer groups without printing secrets.
2. Applying answers mutates only the in-memory resolution context.
3. Prompt renderer can route all interactive UI away from stdout.
4. Non-prompt setup display and redacted summaries can route away from stdout.
5. Cancellation returns non-zero and produces no target output.
6. Dotenv writer quotes values safely.
7. Dotenv writer refuses bad keys.
8. Dotenv writer creates files with restrictive permissions where supported.
9. Dotenv writer replaces an existing managed block in merge mode.
10. Dotenv writer appends a new managed block in merge mode when no block exists.
11. Dotenv writer refuses any existing file with content unless `--merge` or `--force` is supplied.
12. Answers writer emits `schemaVersion: 1`.
13. Answers writer uses restrictive permissions and refuses overwrite without `--force`.
14. Answers reader validates values using prompt descriptors.

CLI tests:

1. `configx setup fixture.env --export` prompts via mocked prompt adapter and prints only export lines to stdout.
2. `config-env setup fixture.env --answers answers.json` works through a real shell function by evaluating `configx setup ... --export` without requiring interactive stdin inside command substitution.
3. `configx setup fixture.env -- node ...` runs the child with answered values.
4. `configx setup fixture.env --write .env.local` writes env answers and prints only key names.
5. Sensitive writes require confirmation unless `--yes` is supplied.
6. `--dry-run` shows key names and target path, not values.
7. `--export --write`, `--export --write-answers`, and `--write -- <command>` fail before prompting.
8. `config-env setup fixture.env --write .env.local` fails clearly because the shell function appends `--export`.
9. Cancellation in `--export` mode exits non-zero and leaves stdout empty.
10. Cancellation in `--write` mode leaves the target file absent or unchanged.
11. Option answers affect resolution but are not exported directly unless they become top-level resolved scalar keys.
12. Existing `configx --export` and `configx setup-shell` tests still pass.
13. Existing `configorama setup` tests still pass.

Manual smoke:

```bash
configx setup-shell
config-env setup _misc/configx-example/.env --stage wooo
node -e 'console.log(process.env.stage)'
```

For sensitive values, smoke tests should print lengths only, never raw values.

## Implementation Outline

1. Extract Configorama setup orchestration from `src/main.js` into a reusable setup engine.
2. Remove or neutralize require-time `process.argv.includes('--setup')`; setup must be explicit via API/settings.
3. Keep `runConfigWizard` as the interactive renderer, but make its return shape stable and documented.
4. Thread output stream control through every prompt and setup display call that can run under `--export`.
5. Add target selection validation and fail before prompting when targets conflict.
6. Add cancellation handling that produces no partial stdout, child execution, or file writes.
7. Add in-memory answer application helper shared by Configorama CLI and Configx.
8. Add safe dotenv and answers writers.
9. Add `configx setup <file>` command routing before normal file resolution, next to `setup-shell`.
10. Strip setup-only flags before forwarding options to Configorama.
11. Support `--export` target first because it unlocks `config-env setup ...`.
12. Support child command target by feeding setup answers into existing `configx` resolution/env execution.
13. Support `--answers` readback using the same validation as prompts.
14. Support `--write` after export/child command behavior is tested.
15. Update `configorama setup` to use the extracted engine and remove the TODO.
16. Update docs and examples.

## Recommended V1 Decisions

- Ship `configx setup <file> --export`.
- Make `config-env setup <file>` the recommended current-shell flow.
- Ship `configx setup <file> -- <command>`.
- Ship `configx setup <file> --answers answers.json` for noninteractive setup.
- Ship `configx setup <file> --write .env.local` only with explicit warnings for sensitive values.
- Enforce exactly one setup target per invocation.
- Treat cancellation as non-zero with no partial output or writes.
- Do not write secrets to shell startup files.
- Do not make plain `configx setup <file>` claim to set the current shell.
- Extract a shared setup engine instead of parsing `configorama setup` output.

This gives users the easy setup path they want while keeping the security model honest: values can be applied to the current process, a child command, the current shell through `config-env`, or an explicit file target, but never magically to a parent shell from a normal binary.
