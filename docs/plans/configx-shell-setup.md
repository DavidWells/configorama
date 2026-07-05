# Configx Shell Setup Plan

## Status

Draft plan only. No implementation should happen until this plan is reviewed and accepted.

## Goal

Make loading resolved Configorama values into the current interactive shell easy, memorable, and safe enough for normal daily use.

Today the correct command is:

```bash
eval "$(configx .env --stage wooo --export)"
```

That works, but it is awkward to type, easy to forget, and visually exposes the risky part of the mechanism (`eval`) every time. The user-facing workflow should become:

```bash
configx setup-shell
config-env .env --stage wooo
```

`config-env` should be a shell function installed into the user's shell startup file. It should call `configx --export` and evaluate the export output in the current shell.

The setup should also install `configx-env` as an explicit long-form alias for users who prefer the function to match the binary name.

## Non-Goals

This feature should not replace `configx <file> -- <command>`. One-shot execution remains the safest and most contained workflow when values are only needed by one child command.

This feature should not make a standalone binary that claims to modify the current shell environment. A child process cannot mutate its parent shell. Current-shell loading requires a shell function, `source`, or `eval`.

This feature should not silently edit shell startup files without either an explicit install flag or an interactive confirmation.

This feature should not use the old `confx-load` name. The project and binary are named `configx`; the shell helpers should be `config-env` and `configx-env`.

## Problem Statement

`configx --export` already provides the primitive needed for current-shell loading:

```bash
eval "$(configx .env --export)"
```

The drawback is ergonomics. Users need to remember:

- that current-shell loading needs `eval` or `source`;
- that `--export` goes on the `configx` command;
- that configorama options like `--stage` still pass through;
- that stdout must be evaluated, while diagnostics go to stderr.

The command is also visually noisy in docs, READMEs, demos, and terminal history.

We need a first-class setup path that installs a small shell helper once, then gives users a short command for everyday use.

## Recommended Naming

Recommended shell function names:

```bash
config-env
configx-env
```

Example:

```bash
config-env .env --stage wooo
# or
configx-env .env --stage wooo
```

Rationale:

- `config-env` is the nicest daily command: short, readable, and directly tied to environment loading.
- `configx-env` keeps the `configx` prefix, matching the binary users installed.
- Both names say what the function affects: environment variables.
- It avoids the stale `confx` spelling and the vague `load` verb.
- It is unlikely to be confused with one-shot execution, which remains `configx <file> -- <command>`.

Rejected names:

| Name | Reason |
| --- | --- |
| `confx-load` | Wrong project name and old shorthand. |
| `configx-load` | Better than `confx-load`, but `load` does not say what gets loaded or where. |
| `configx-source` | Overly shell-specific and less natural to read. |
| `configx-export` | Confusing because `configx --export` already means "print export lines." |
| `cxenv` | Short, but too cryptic for docs and support. |

V1 should install and document both `config-env` and `configx-env`. `config-env` should be the primary docs path; `configx-env` should be presented as the explicit long-form equivalent.

## User Experience

### First-Time Setup

Recommended happy path:

```bash
configx setup-shell
```

In an interactive TTY, `configx setup-shell` should:

1. Detect the user's shell from `$SHELL`.
2. Pick the appropriate startup file.
3. Show the exact managed block it will install.
4. Ask for confirmation.
5. Add or update the managed block idempotently.
6. Tell the user how to activate it in the current terminal.

Example output:

```text
configx: detected zsh
configx: shell startup file: /Users/david/.zshrc

This will install the config-env shell function and configx-env alias:

  config-env .env --stage prod

Add configx shell integration to /Users/david/.zshrc? [Y/n]
configx: installed configx shell integration
configx: restart your shell or run: source ~/.zshrc
```

After setup:

```bash
config-env .env --stage wooo
node -e 'console.log(process.env.stage)'
```

### Explicit Install

For scripts, docs, and users who prefer non-interactive commands:

```bash
configx setup-shell --shell zsh --install
```

If `--install` is used in a TTY, it can still print what it is doing, but should not prompt unless the target file looks unusual or unsafe.

For fully non-interactive usage:

```bash
configx setup-shell --shell zsh --install --yes
```

### Print-Only Mode

Users should be able to inspect or manually install the integration:

```bash
configx setup-shell --shell zsh --print
```

Expected stdout:

```sh
# >>> configx shell integration >>>
configx-env() {
  eval "$(configx "$@" --export)"
}

config-env() {
  configx-env "$@"
}
# <<< configx shell integration <<<
```

Manual install:

```bash
configx setup-shell --shell zsh --print >> ~/.zshrc
source ~/.zshrc
```

### Current-Session Setup

For users who want to try it without editing startup files:

```bash
eval "$(configx setup-shell --shell zsh --print)"
config-env .env --stage wooo
```

This works because the printed output defines a shell function. It does not persist after the terminal exits.

### Uninstall

If `setup-shell` writes a managed block, it should also remove that managed block:

```bash
configx setup-shell --uninstall
```

This should only remove text between Configx's managed markers. It must not attempt to edit or interpret unrelated user shell config.

## Shell Function Behavior

V1 function:

```sh
# >>> configx shell integration >>>
configx-env() {
  eval "$(configx "$@" --export)"
}

config-env() {
  configx-env "$@"
}
# <<< configx shell integration <<<
```

This intentionally keeps the functions small. All parsing, resolution, escaping, preflight behavior, and error handling remain in `configx`.

`configx-env` should pass all arguments through to `configx` unchanged, then append `--export`. `config-env` should delegate to `configx-env`.

Example:

```bash
config-env .env --stage prod --config ./configx.config.js
```

Equivalent to:

```bash
eval "$(configx .env --stage prod --config ./configx.config.js --export)"
```

Important implementation detail: appending `--export` after `"$@"` is acceptable because `configx` uses minimist and treats `--export` as a configx flag. If future parsing changes make flag position stricter, this function must be updated in the same release.

## Setup Command Interface

Recommended CLI:

```bash
configx setup-shell [options]
```

Options:

| Option | Behavior |
| --- | --- |
| `--shell <zsh\|bash\|fish>` | Override shell detection. |
| `--print` | Print the shell integration to stdout and do not edit files. |
| `--install` | Install or update the managed block in the shell startup file. |
| `--yes` | Skip confirmation prompts for install/uninstall. |
| `--rc-file <path>` | Override the startup file path. Useful for tests and custom setups. |
| `--uninstall` | Remove the managed configx block from the target startup file. |
| `--function-name <name>` | Advanced escape hatch for the primary helper. Defaults to `config-env`; not documented in quickstart. |
| `--no-long-alias` | Do not install `configx-env`; install only the primary helper. |

Default behavior:

- If stdout is not a TTY: behave like `--print`.
- If stdin/stdout are TTYs: run the guided interactive setup flow.
- If shell detection fails: print instructions and suggest `--shell zsh` or `--shell bash`.

Rationale: this gives a friendly `configx setup-shell` path for humans, while keeping automation predictable.

Function name validation should be shell-aware. For zsh and bash, `config-env` is valid and tested, so validation must allow hyphenated function names. A conservative v1 pattern for zsh/bash custom names is:

```js
/^[A-Za-z_][A-Za-z0-9_-]*$/
```

If fish support is added, validate names against fish's function naming rules separately.

## Shell Detection

Detect shell in this order:

1. Explicit `--shell`.
2. Basename of `$SHELL`.
3. Parent process name, if practical and reliable enough.
4. Fail with a clear message and show examples.

Supported v1 shells:

| Shell | Startup file default | Function syntax |
| --- | --- | --- |
| `zsh` | `~/.zshrc` | POSIX-style function. |
| `bash` | `~/.bashrc` | POSIX-style function. |

Optional v1 or v1.1:

| Shell | Startup file default | Function syntax |
| --- | --- | --- |
| `fish` | `~/.config/fish/config.fish` | Fish function syntax. |

Recommendation: support zsh and bash in v1. Add fish only if the implementation includes tests for fish syntax.

## Startup File Selection

Default startup files:

| Shell | Target |
| --- | --- |
| zsh | `~/.zshrc` |
| bash | `~/.bashrc` |
| fish | `~/.config/fish/config.fish` |

If the file does not exist, `--install` may create it after confirmation.

If the parent directory does not exist, `--install` may create it only for known config directories such as `~/.config/fish`. It should not create arbitrary parent directories unless the user supplied `--rc-file`.

If `--rc-file` is supplied, use that exact file and do not guess.

## Managed Block Format

Use stable markers:

```sh
# >>> configx shell integration >>>
configx-env() {
  eval "$(configx "$@" --export)"
}

config-env() {
  configx-env "$@"
}
# <<< configx shell integration <<<
```

Install behavior:

- If no managed block exists, append it with a leading blank line unless the file is empty.
- If exactly one managed block exists, replace it.
- If multiple managed blocks exist, fail with a clear error and ask the user to clean up manually.
- Preserve all unrelated file content exactly.
- Ensure the file ends with a newline after installation.

Uninstall behavior:

- If no managed block exists, print "not installed" and exit 0.
- If exactly one managed block exists, remove it and clean up one adjacent blank line if safe.
- If multiple managed blocks exist, fail and avoid editing.

## Safety and Security

The helper uses `eval`, so the safety contract depends on `configx --export` stdout staying shell-safe and export-only.

Existing requirements that must remain true:

- `--export` prints only shell assignments to stdout.
- Diagnostics, summaries, and prompts go to stderr.
- Values are shell-escaped so metacharacters cannot execute commands.
- Tests cover malicious values containing `$`, backticks, semicolons, and quotes.

New setup-specific requirements:

- `setup-shell --install` must never print secrets.
- `setup-shell --print` only prints the function body, never resolved config values.
- The generated function should not add extra logging around `eval`.
- The installer should not modify shell files without confirmation, `--install`, or `--yes` depending on mode.
- The installer must only edit the managed block.

User-facing docs must say:

- `config-env` loads values into the current shell and future child processes.
- `configx-env` is the equivalent long-form helper.
- Secrets loaded this way remain in the shell until unset or the terminal exits.
- Prefer `configx <file> -- <command>` for one command.
- Use `env | grep KEY`, `echo "$KEY"`, or the target command to verify, but avoid printing secrets.

## Error Handling

Likely errors:

| Code | Condition |
| --- | --- |
| `unsupported_shell` | Shell is not zsh/bash/fish or could not be detected. |
| `setup_shell_conflict` | Multiple managed blocks found. |
| `setup_shell_write_failed` | Could not write startup file. |
| `setup_shell_invalid_function_name` | Custom function name is not safe. |
| `setup_shell_invalid_rc_file` | Target rc file path is unusable. |

The existing CLI exits with code `2` for usage/config validation errors and `1` for resolution failures. `setup-shell` should use:

- `0` for successful print/install/uninstall/no-op uninstall.
- `2` for invalid usage or unsupported shell.
- `1` for filesystem failures.

## Documentation Requirements

Update `packages/configx/README.md` with:

- Quickstart:

```bash
configx setup-shell
config-env .env --stage prod
```

- Manual install:

```bash
configx setup-shell --shell zsh --print >> ~/.zshrc
source ~/.zshrc
```

- Explanation that `config-env` and `configx-env` are shell functions, not separate binaries.
- Explanation that current-shell mutation requires shell integration.
- Warning that loaded secrets persist in the current shell.
- Note that `confx-load` is not the documented name.

The README section currently titled "Loading into the current shell (`--export`)" should be reframed:

1. Recommended: `configx setup-shell` then `config-env`.
2. Advanced/manual: `eval "$(configx .env --export)"`.
3. One-shot alternative: `configx .env -- <command>`.

## Test Plan

Add focused tests for `setup-shell` in `packages/configx/cli.test.js` or a new `packages/configx/setup-shell.test.js`.

Required tests:

1. `configx setup-shell --shell zsh --print` prints the zsh managed block to stdout.
2. `configx setup-shell --shell bash --print` prints the bash managed block to stdout.
3. Print mode does not write any files.
4. `--install --rc-file <tmp>` appends the block to an empty file.
5. `--install --rc-file <tmp>` replaces an existing managed block instead of duplicating it.
6. `--uninstall --rc-file <tmp>` removes the managed block.
7. `--uninstall` exits 0 when the block is not present.
8. Multiple managed blocks fail without editing the file.
9. Unsupported shell fails with a clear message.
10. Non-TTY default behavior is print-only.
11. Custom function names are rejected unless they match the supported shell's function-name pattern.
12. The generated `config-env` function works in zsh or bash by loading a fixture `.env` into the current shell.
13. The generated `configx-env` long-form alias works in zsh or bash.

For test 12, run a shell subprocess like:

```bash
zsh -lc 'eval "$(node ./packages/configx/cli.js setup-shell --shell zsh --print)"; config-env ./packages/configx/test/sample.env --name Dave; test "$GREETING" = "hello Dave"'
```

Skip zsh-specific integration tests when zsh is unavailable on the test machine, but keep print/string tests always running.

## Implementation Outline

1. Extend `packages/configx/cli.js` to detect `setup-shell` before normal config-file parsing.
2. Parse setup-specific flags separately from config resolution flags.
3. Add a small setup module, for example `packages/configx/src/setupShell.js`.
4. Implement shell detection and startup file selection.
5. Implement shell block generation for zsh and bash.
6. Implement managed block install/update/uninstall helpers.
7. Add validation for custom function names.
8. Add tests for print, install, update, uninstall, and generated function behavior.
9. Update README current-shell loading docs.
10. Update example docs under `_misc/configx-example` if useful.

## Recommended V1 Decisions

- Command: `configx setup-shell`.
- Primary helper name: `config-env`.
- Long-form helper alias: `configx-env`.
- Supported shells: zsh and bash.
- Default TTY behavior: guided interactive install.
- Default non-TTY behavior: print-only.
- Persistent install: managed block in `~/.zshrc` or `~/.bashrc`.
- Manual setup: `configx setup-shell --shell zsh --print`.
- Uninstall: `configx setup-shell --uninstall`.
- Old name: do not document or install `confx-load`.

These choices keep setup easy for humans while preserving the important shell truth: only shell code evaluated by the current shell can set variables in that shell.
