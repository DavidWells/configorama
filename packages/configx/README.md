# configx

Resolve a [configorama](https://github.com/DavidWells/configorama) config file and run a command with the resolved values as environment variables.

`configx` is a thin execution wrapper. All resolution — `${opt:...}`, `${env:...}`, `.env` files, custom resolvers like the 1Password plugin — is done by configorama. `configx` maps the resolved top-level keys into the child process environment and execs your command.

```bash
configx <file> [configorama options] -- <command and args...>
```

## Example

```yaml
# deploy.yml
API_URL: https://api.example.com
STAGE: ${opt:stage, "dev"}
```

```bash
configx deploy.yml --stage prod -- node deploy.js
# child sees API_URL=https://api.example.com and STAGE=prod
```

## Using resolvers (1Password, etc.)

Resolvers are registered in an optional `configx.config.js` in the working directory (or via `--config <path>`). The file exports a configorama settings object:

```js
// configx.config.js
const createOnePasswordResolver = require('configorama/plugins/onepassword')

module.exports = {
  variableSources: [
    createOnePasswordResolver({
      refs: { npm: 'op://production/npm-automation/notesPlain' }
    })
  ]
}
```

```yaml
# secrets.yml
NPM_TOKEN: ${op:npm.NPM_TOKEN}
```

```bash
configx secrets.yml -- npm publish
# NPM_TOKEN is fetched from 1Password at run time and passed to npm publish
```

## Loading into the current shell

A child process can't change its parent shell's environment, so `configx <file> -- <command>` only affects that one command. To load resolved values into your current terminal, install the shell helper once:

```bash
configx setup-shell
```

Then use:

```bash
config-env .env --stage prod
```

`config-env` is a shell function, not a separate binary. It evaluates `configx --export` in your current shell so the resolved values are available to commands you run afterward.

The setup command also installs the explicit long-form alias:

```bash
configx-env .env --stage prod
```

For manual installation:

```bash
configx setup-shell --shell zsh --print >> ~/.zshrc
source ~/.zshrc
```

`--export` prints `export KEY='value'` lines to stdout instead of running a command. Values are single-quoted with embedded quotes escaped, so a secret containing shell metacharacters (`$`, `` ` ``, `;`, `'`) cannot inject commands when evaluated. Diagnostics go to stderr, so only the export lines reach `eval`.

Advanced/manual current-shell loading still works:

```bash
eval "$(configx .env --export)"
# or
source <(configx .env --export)
```

This puts resolved values (including secrets) into your interactive shell and every command you run after — convenient, but they're then visible to `env` and child processes. Prefer `configx <file> -- <command>` when you only need them for one command.

## Setup wizard

`configx setup <file>` walks through the config's unresolved values (missing env vars, CLI flags, config references), prompts for each, and applies the answers to exactly one target you choose. It shares the prompt engine with `configorama setup`, so both wizards behave identically.

Two commands, two jobs:

- `configx setup-shell` — install the `config-env` helper function once.
- `configx setup <file>` — walk through config values and apply them to a target.

### Current shell

A child process cannot set variables in your terminal, so current-shell setup goes through the `config-env` shell function:

```bash
configx setup-shell            # once
config-env setup .env --stage dev
```

This prompts for missing values (prompt UI on stderr), then sets the answered and resolved values in your current shell. Prefer this over the raw form it expands to:

```bash
eval "$(configx setup .env --stage dev --export)"
```

### One command

Safest for secrets — values live only in the `configx` process and the child command's environment, never in your shell or on disk:

```bash
configx setup .env --stage dev -- npm run dev
```

### Write to a local env file

Explicit persistence, guarded:

```bash
configx setup .env --stage dev --write .env.local
```

- Writes only the answered env values, in dotenv syntax, with `0600` permissions.
- Refuses an existing file unless `--merge` (updates only a `configx` managed block) or `--force`.
- Warns and asks for confirmation before writing values that look sensitive (`--yes` skips for scripted runs).
- `--dry-run` shows the keys and target path without writing.

Note: `config-env setup .env --write x` fails with a target conflict because the shell function appends `--export`. Call `configx setup .env --write x` directly for file writes.

### Answers file (automation)

```bash
configx setup app.yml --write-answers configx.answers.json
```

Writes all answer groups as versioned JSON (`schemaVersion: 1`) with the same safety rules (0600, `--force` to overwrite, confirmation for sensitive values). Useful for agents and CI.

### Targets

Exactly one apply target per invocation:

| Target | Example | Effect |
| --- | --- | --- |
| Child command | `configx setup .env -- npm run dev` | Prompt, resolve, run command with env. |
| Shell exports | `configx setup .env --export` | Prompt, print export lines to stdout. |
| Current shell | `config-env setup .env` | Shell function evals the `--export` form. |
| Dotenv write | `configx setup .env --write .env.local` | Prompt, write env answers to a dotenv file. |
| Answers write | `configx setup app.yml --write-answers a.json` | Prompt, write structured answers JSON. |

Plain `configx setup .env` (no target) shows a menu after prompting. It never claims to have set your current shell — it prints the exact `config-env` command to run instead.

Cancelling the wizard (Ctrl-C or closed input) is fail-closed: non-zero exit, no exports on stdout, no child command, no files written.

### Secrets guidance

- Prefer storing a 1Password reference (`${op://vault/item/field}`) in the config and resolving at run time over persisting raw secret values.
- `configx` never writes secrets to `.zshrc`/`.bashrc` or any shell startup file, and never prints secret values in summaries or errors.
- Safest to riskiest: `configx setup <file> -- <command>` → `config-env setup <file>` → `--write-answers` → `--write`.

## .env files

`.env` files (`.env`, `.env.local`, `deploy.env`, ...) are parsed as dotenv, then their values are resolved by configorama. This lets you keep secret references in a `.env` and have them fetched at run time:

```bash
# .env
DB_PASSWORD=${op://vault/database/password}
API_URL=https://api.example.com
```

```bash
configx .env -- ./my-app
# DB_PASSWORD is fetched from 1Password; API_URL passes through
```

`${op://vault/item/field}` is the 1Password secret-reference URI — it points directly at a single field. For a key path into a structured note (`${op:alias.KEY}`), use the alias form via a `configx.config.js`. Both need the 1Password resolver registered.

To reduce repeated 1Password prompts across fresh agent commands, opt into `@davidwells/op-stash` in the Configorama 1Password resolver. `configx` remains only the runner; cache semantics live in the resolver/package docs.

## Behavior

- **Top-level scalar keys only.** `string`, `number`, and `boolean` values become env vars (numbers/booleans stringified). `null`/`undefined` are skipped. Nested objects/arrays are an error — env vars are flat.
- **Portable key names required.** Keys must match `^[A-Za-z_][A-Za-z0-9_]*$`, else `configx` errors before running the command.
- **Parent environment wins.** A value already present in the shell environment is not overwritten by the resolved config. This keeps CI/platform-injected variables authoritative.
- **`--` is the separator.** Configorama options go on the left; the command and its flags go on the right. There is no shell-string form — the command is spawned with `shell: false`, so there is no shell-injection surface.
- **Current-shell loading uses shell functions.** Run `configx setup-shell`, then `config-env <file> [options]` when you intentionally want values in the current terminal.
- **Status and signals propagate.** The child inherits stdio; `configx` forwards `SIGINT`/`SIGTERM`/`SIGHUP` and exits with the child's code (or `128 + signal` if the child was killed).

## Pre-flight (avoids prompting on a doomed run)

configorama resolves variables in parallel, so a secret resolver can fire its side effect — like a 1Password prompt — before an unrelated variable fails and aborts the run. To avoid prompting for a run that was going to fail anyway, configx does a **pre-flight pass** whenever a resolver (custom `variableSources`) is configured:

- It resolves the config once with the custom resolvers stubbed out. Built-in resolvers (`opt`/`env`/`self`) run for real, so a missing `${opt:...}` value with no fallback, a missing env var, or a bad reference fails **here** — before any secret resolver runs.
- Only if the pre-flight passes does configx do the real resolve (where secret resolvers actually fetch).

Pre-flight catches structural/input failures only. A reference that is valid but fails at fetch time (a deleted item, a revoked session) still reaches the real pass and may prompt. Disable with `--no-preflight`.

## Security

- Resolved values may be secrets. `configx` never prints them; errors name offending keys and types, never values.
- Injected values are visible to the child and its subprocesses, and to anything that can read the child's environment. Treat the command as trusted.
- `configx` resolves everything the config references, including remote secret resolvers, with no safe-mode gate — this is an execution tool by design. For untrusted config, inspect the resolved output first (`configorama <file>`), do not `configx` it.

## Exit codes

| Code | Meaning |
|------|---------|
| child's code | Command ran and exited normally |
| `128 + n` | Command was killed by signal `n` |
| `2` | Usage error (missing file/command) or config value/key rejected |
| `127` | Command not found |
| `1` | Config resolution failed |
