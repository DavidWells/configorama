# Configorama `exec` Command Plan

## Status

Draft plan only. No implementation should happen until this plan is reviewed and accepted.

## Goal

Add a Configorama CLI command that resolves a config file, converts the resolved top-level config entries into environment variables, and executes a child command with those environment values available.

The command should make Configorama useful as a runtime environment injector:

```bash
config exec ./config.yml -- npm run deploy
```

The important behavior is that Configorama resolves the same config it already knows how to resolve, then gives the child process an environment derived from the resolved config.

## Non-Goal

This feature is not a general config flattening system in the first version.

It should not invent nested names like `DATABASE_HOST` from `database.host` until we explicitly design that behavior. It should not assume `.environment` or `.env` is special unless the final reviewed plan adds that as an explicit option. It should not overwrite existing process environment values by default.

## Problem Statement

Today Configorama can resolve and print a config:

```bash
configorama config.yml --stage prod
```

That works for scripts that want JSON or a single extracted value, but it does not support a common deployment workflow:

```bash
configorama exec config.yml -- npm run deploy
```

In that workflow, the command being executed expects configuration in `process.env`, shell env vars, or environment-based SDK clients. The user does not want to manually export every value or write glue code that parses Configorama output.

## Proposed User Experience

Primary syntax:

```bash
config exec <file> [configorama options] -- <command and args...>
configorama exec <file> [configorama options] -- <command and args...>
```

Convenience syntax:

```bash
config exec <file> 'command string'
configorama exec <file> 'command string'
```

Example:

```yaml
# deploy.yml
API_KEY: ${env:API_KEY_FROM_MACHINE}
STAGE: ${opt:stage, "dev"}
REGION: us-east-1
```

```bash
API_KEY_FROM_MACHINE=secret config exec deploy.yml --stage prod -- node -e "console.log(process.env.STAGE)"
```

Expected child environment:

```text
API_KEY=secret
STAGE=prod
REGION=us-east-1
```

Important: if `REGION` or `STAGE` already exists in the parent process environment, Configorama should not overwrite it by default.

## Environment Merge Semantics

The child environment should start as a copy of `process.env`.

Resolved config values should be added only when the target key is not already present in `process.env`.

Pseudocode:

```js
const childEnv = { ...process.env }
const envKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/

for (const [key, value] of Object.entries(resolvedConfig)) {
  if (!envKeyPattern.test(key)) {
    throw new ConfigoramaError("invalid_exec_env_key", { key })
  }

  if (value === null || value === undefined) continue
  if (!["string", "number", "boolean"].includes(typeof value)) {
    throw new ConfigoramaError("invalid_exec_env_value", {
      key,
      valueType: Array.isArray(value) ? "array" : typeof value,
    })
  }

  if (Object.prototype.hasOwnProperty.call(childEnv, key)) continue
  childEnv[key] = String(value)
}
```

This makes existing shell state authoritative. It also avoids surprising overwrites in CI, where environment variables may be injected by the platform, secrets manager, or workflow runner.

The implementation must build the child environment in memory and pass it directly to `spawn`. It must not emit shell `export` statements, write a temporary `.env` file, or print injected values as part of normal operation.

## Top-Level Key Rule

Version 1 should map only top-level resolved config keys to environment variable names.

This config:

```yaml
API_KEY: abc
STAGE: prod
database:
  host: localhost
```

Should attempt to export:

```text
API_KEY=abc
STAGE=prod
```

It should not export:

```text
database=[object Object]
DATABASE_HOST=localhost
database.host=localhost
```

Nested object values need explicit design before implementation. They raise naming, casing, collision, and leakage questions.

## Environment Key Validation

V1 should reject top-level keys that are not portable environment variable names.

Recommended validation:

```js
/^[A-Za-z_][A-Za-z0-9_]*$/
```

Examples:

| Key | Behavior |
| --- | --- |
| `API_KEY` | Allowed. |
| `_CONFIGORAMA_TEST` | Allowed. |
| `database.host` | Rejected. |
| `1PASSWORD_TOKEN` | Rejected because it starts with a digit. |
| `API-KEY` | Rejected. |
| `API KEY` | Rejected. |

Rationale: even if an operating system accepts unusual names, many shells, package managers, process managers, and deployment tools do not. Passing through arbitrary top-level keys makes behavior harder to reason about and increases the risk of accidentally setting a surprising variable.

V1 should not maintain a hard-coded denylist for names like `PATH`, `NODE_OPTIONS`, `LD_PRELOAD`, `AWS_PROFILE`, or `GITHUB_TOKEN`. A denylist will be incomplete and may block legitimate use cases. Instead:

- Parent environment values still win by default, which prevents Configorama from overwriting common inherited variables such as `PATH`.
- Documentation should explicitly warn that top-level keys can affect child behavior.
- A future hardening flag can be designed if real-world usage shows a need for allowlists or denylists.

## Value Conversion Rules

Allowed top-level values for v1:

| Resolved value type | Behavior |
| --- | --- |
| `string` | Export unchanged. |
| `number` | Convert with `String(value)`. |
| `boolean` | Convert with `String(value)`, producing `true` or `false`. |
| `null` | Skip by default. |
| `undefined` | Skip by default. |
| `object` | Skip or error; see decision below. |
| `array` | Skip or error; see decision below. |

Recommended v1 behavior: reject non-scalar top-level values with a clear error unless an explicit flag chooses skipping.

Rationale: silently skipping nested values may hide config mistakes, while exporting them as strings would be actively wrong. A clear error tells the user to adjust the config or wait for a designed flattening mode.

Possible future flag:

```bash
config exec config.yml --ignore-non-scalar -- npm run deploy
```

That flag is not required for v1.

## Existing Environment Precedence

Default: parent environment wins.

Example:

```yaml
STAGE: prod
REGION: us-east-1
```

```bash
STAGE=staging config exec config.yml -- node deploy.js
```

Child process should see:

```text
STAGE=staging
REGION=us-east-1
```

This should be documented prominently because it is the opposite of many dotenv loaders, where file values can override depending on flags.

Possible future override flag:

```bash
config exec config.yml --override-env -- node deploy.js
```

This flag should not be implemented unless explicitly accepted in plan review.

## Command Parsing

The least surprising command form is:

```bash
config exec <file> [configorama options] -- <command and args...>
```

Examples:

```bash
config exec config.yml -- npm run deploy
config exec config.yml -- node scripts/deploy.js --dry-run
config exec config.yml --stage prod -- npm run deploy
```

Also support a single quoted command string for convenience:

```bash
config exec config.yml 'node scripts/deploy.js --dry-run'
config exec config.yml --stage prod 'npm run deploy'
```

Open decision: whether to support file-first syntax:

```bash
config config.yml exec 'npm run deploy'
```

Recommendation: do not support file-first syntax in v1 unless we explicitly want it.

Rationale: the current CLI already has positional path extraction after the file. Adding a mid-stream verb increases ambiguity. `exec <file> -- <command>` is easier to document, parse, and suggest in errors.

## CLI Naming and Packaging

Open decision: whether this behavior should live only as a Configorama subcommand or also have a shorter dedicated executable.

Options:

| Option | Example | Pros | Cons |
| --- | --- | --- | --- |
| Configorama subcommand only | `config exec app.yml -- npm run deploy` | Clear ownership; no new package or binary name; easiest to document with existing CLI. | Slightly longer; users must remember the `exec` subcommand. |
| Separate package/CLI | `confx app.yml -- npm run deploy` | Very short; focused mental model as "config execute"; avoids adding more surface to the main CLI. | Splits packaging, docs, versioning, support, and bug reports; may confuse users about whether `confx` and Configorama resolve config identically. |
| Same package with alias binary | `confx app.yml -- npm run deploy` | Short command while sharing implementation, version, resolver behavior, docs, tests, and release lifecycle. | Adds another public binary name that must be maintained; potential name collision with existing tools. |

Recommended v1 decision: implement `exec` inside Configorama first, and optionally expose `confx` as a thin same-package binary alias after the behavior is tested.

The alias should not be a separate implementation. It should call the same code path as `config exec` so config resolution, environment merge semantics, error handling, and security behavior cannot drift.

If `confx` is added, recommended alias syntax:

```bash
confx <file> [configorama options] -- <command and args...>
```

Equivalent commands:

```bash
config exec deploy.yml --stage prod -- npm run deploy
confx deploy.yml --stage prod -- npm run deploy
```

The `confx` alias should be documented as a convenience wrapper for execution only. It should not become a second general-purpose Configorama CLI.

## Option Passing

Configorama options such as `--stage prod` must remain available to config resolution because config files may use `${opt:stage}`.

The child command may also need flags. That creates parsing ambiguity.

Recommended syntax:

```bash
config exec <file> [configorama options] -- <command and args...>
```

Examples:

```bash
config exec deploy.yml --stage prod -- npm run deploy
config exec deploy.yml --stage prod -- node deploy.js --dry-run
```

Also support a single quoted command without `--` for convenience:

```bash
config exec deploy.yml 'npm run deploy'
```

Implementation should treat `--` as the reliable separator. Docs should prefer the `--` form for commands with flags.

## Process Execution Semantics

The child command should:

- Inherit stdio by default so interactive commands, build logs, and deploy prompts work naturally.
- Run in the current working directory.
- Receive `process.env` plus non-overwriting resolved config values.
- Propagate the child exit code.
- Propagate termination signals in the standard Node CLI style where practical.

Implementation should use `child_process.spawn`, not `spawnSync`, so long-running deploy commands stream output and can handle interaction.

V1 should support two execution paths.

Preferred path for `--` syntax:

```js
spawn(command, args, { shell: false, stdio: 'inherit', env })
```

Pros:

- Avoids shell parsing and shell injection risks for the documented syntax.
- Preserves child arguments exactly.
- Works naturally with package-manager commands such as `npm run deploy`.

Cons:

- Does not support shell builtins, pipes, redirects, aliases, or compound shell expressions.

Convenience path for a single quoted command string:

```js
spawn(commandString, { shell: true, stdio: 'inherit', env })
```

Pros:

- Supports the requested quoted command-string UX.
- Works with shell features when users intentionally ask for shell behavior.

Cons:

- Shell quoting semantics vary by platform.
- Shell injection is possible if callers construct command strings from untrusted input.

Recommendation for v1: prefer `shell: false` for the documented `--` syntax and reserve `shell: true` for the single-string convenience form. Docs should prefer the `--` form and explicitly say the quoted form is shell-executed.

## Security and Safety

This command is intentionally executable. That means it should not be confused with inspect/audit safe-mode behavior.

Security concerns and v1 requirements:

- Resolved config may contain secrets. The command must not print injected environment values.
- Adding config values to env makes them visible to the child and possibly child subprocesses.
- On some systems, process environments may be inspectable by same-user processes.
- CI systems, test runners, crash reporters, and deployment tooling may log environment values.
- A malicious or compromised child command can read and exfiltrate every injected value.
- Parent env wins by default. This avoids overwriting CI/platform values, but it also means a stale or hostile parent variable can shadow the resolved config.
- The documented `--` form should avoid shell execution by using `spawn(command, args, { shell: false })`.
- The single quoted command convenience form is shell-executed. It must be documented as unsafe for untrusted input.
- Top-level env keys must be validated with the portable pattern in the Environment Key Validation section.

V1 should document these facts and enforce the concrete requirements above. It should not try to make execution of untrusted config files or untrusted child commands safe.

The implementation should treat both the config file and the child command as trusted inputs. If either comes from an untrusted source, the safe guidance is to inspect the resolved config first and avoid `exec`.

Errors must avoid dumping the full resolved config. If a non-scalar key fails validation, show the key name and type, not the value.

## Error Handling

New stable error codes should be added only after plan approval.

Likely errors:

| Code | Condition |
| --- | --- |
| `missing_exec_command` | User invoked `exec` without a command. |
| `invalid_exec_env_key` | A top-level resolved config key is not a portable environment variable name. |
| `invalid_exec_env_value` | A top-level resolved config value is object/array/function/symbol. |
| `exec_spawn_failed` | Node failed to spawn the child process. |

Resolve errors should use existing Configorama error handling.

The `exec` command is not a structured-output command. Human-readable stderr is appropriate by default, with `--error-format json` still honored if the CLI already supports it consistently.

## Documentation Requirements

Docs must include:

- Basic example with flat top-level keys.
- Example proving parent env wins.
- Example using `${opt:stage}`.
- Example using `--` to pass child command flags.
- Explicit statement that nested values are not flattened in v1.
- Explicit statement that existing environment variables are not overwritten by default.
- Explicit statement that `--` form avoids shell execution.
- Explicit statement that quoted command-string form is shell-executed.
- Explicit statement that injected values may be secrets and can be read by the child process.
- Explicit statement that top-level keys must be portable env var names.
- If `confx` is added, explain that it is an alias for the same implementation rather than a separate resolver.

Suggested docs example:

```yaml
API_URL: https://api.example.com
STAGE: ${opt:stage, "dev"}
```

```bash
STAGE=local config exec deploy.yml --stage prod -- node -e 'console.log(process.env.STAGE)'
```

Expected:

```text
local
```

## Test Plan

Add CLI tests under a new focused test directory only after plan approval.

Required tests:

1. `exec` resolves flat top-level config values into child env.
2. Existing parent env values are not overwritten.
3. `${opt:...}` values still resolve from Configorama CLI flags.
4. `null` and `undefined` values are skipped.
5. Non-scalar top-level values fail with a clear error and do not run the child command.
6. Child exit code is propagated.
7. Missing command fails before config resolution if possible.
8. `--` separator allows flags to be passed to the child command.
9. `--` separator uses argv spawning without shell interpretation.
10. Single quoted command string still works and uses shell execution.
11. Invalid env keys fail with a clear error and do not run the child command.
12. Error messages do not include secret values from resolved config.
13. Existing inspect/requirements CLI tests still pass.
14. If `confx` is added, it behaves identically to `config exec` for env merge, validation, child status, and errors.

Example test fixture:

```yaml
API_URL: https://api.example.com
STAGE: ${opt:stage, "dev"}
FEATURE_ENABLED: true
TIMEOUT_MS: 5000
```

Example child assertion:

```bash
node -e "process.stdout.write([process.env.API_URL, process.env.STAGE].join('|'))"
```

## Implementation Outline

Do not implement until plan review is complete.

Proposed implementation steps:

1. Extend CLI command detection to recognize `exec` as a real subcommand.
2. Parse `exec <file>` separately from default resolve/path extraction.
3. Preserve configorama option parsing for values used by `${opt:...}`.
4. Identify command args after `--` or a single command string without `--`.
5. Resolve config through the existing async API.
6. Validate top-level env key names before spawning.
7. Validate scalar values before spawning.
8. Convert top-level resolved config values into env additions without overwriting `process.env`.
9. Spawn the child process with inherited stdio.
10. Use `shell: false` for `--` syntax and `shell: true` only for the single-string convenience syntax.
11. Propagate child status.
12. If accepted, add `confx` as a same-package thin alias to the same exec handler.
13. Update capabilities only after behavior is final.
14. Update README only after tests lock the behavior.

## Open Questions

1. Should non-scalar top-level values be an error or skipped with a warning?
2. Should there be an explicit `--override-env` flag in v1, or should parent-env precedence be the only behavior initially?
3. Should file-first syntax ever be supported, or should `exec <file> -- <command>` be the only documented form?
4. Should command execution require `--` for reliability, or should quoted commands remain fully supported?
5. Should `confx` be included in v1 as a same-package alias, or wait until `config exec` proves useful?
6. Is `confx` the right alias name, or is there an existing command/package conflict that makes another name safer?

## Recommended V1 Decisions

Recommended starting point:

- Syntax: `config exec <file> [configorama options] -- <command>`.
- Convenience syntax: `config exec <file> 'command string'`.
- Optional same-package alias: `confx <file> [configorama options] -- <command>`.
- Env mapping: top-level keys only.
- Env key validation: require `^[A-Za-z_][A-Za-z0-9_]*$`.
- Existing env precedence: parent environment wins.
- Non-scalar values: error.
- Nested flattening: not in v1.
- Override behavior: not in v1.
- File-first syntax: not in v1.
- Shell execution: no for `--` syntax; yes only for single-string convenience syntax.
- Secret handling: never print injected values or resolved config on exec errors.

These choices keep v1 small, predictable, and aligned with the stated requirement without inventing extra config-shape conventions.
