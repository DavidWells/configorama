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

## Behavior

- **Top-level scalar keys only.** `string`, `number`, and `boolean` values become env vars (numbers/booleans stringified). `null`/`undefined` are skipped. Nested objects/arrays are an error — env vars are flat.
- **Portable key names required.** Keys must match `^[A-Za-z_][A-Za-z0-9_]*$`, else `configx` errors before running the command.
- **Parent environment wins.** A value already present in the shell environment is not overwritten by the resolved config. This keeps CI/platform-injected variables authoritative.
- **`--` is the separator.** Configorama options go on the left; the command and its flags go on the right. There is no shell-string form — the command is spawned with `shell: false`, so there is no shell-injection surface.
- **Status and signals propagate.** The child inherits stdio; `configx` forwards `SIGINT`/`SIGTERM`/`SIGHUP` and exits with the child's code (or `128 + signal` if the child was killed).

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
