# configorama monorepo

This repo is a pnpm + lerna monorepo. The published packages live under [`packages/`](./packages).

| Package | npm | What it is |
|---------|-----|------------|
| [`configorama`](./packages/configorama) | `configorama` | Variable support for configuration files (the core library + CLI + bundled plugins) |
| [`@davidwells/configx`](./packages/configx) | `@davidwells/configx` | Resolve a configorama config and run a command with it as environment |

The `configorama` README (usage, syntax, plugins, API) is in [`packages/configorama/README.md`](./packages/configorama/README.md).

## Develop

```bash
pnpm install          # links the workspace (configx uses the local configorama)
pnpm test             # run every package's tests (pnpm -r test)
pnpm -r --if-present typecheck
```

Per package:

```bash
cd packages/configorama && npm test
cd packages/configx && npm test
```

Because it's a workspace, `configx` depends on `configorama` via `workspace:^`, so changes to the core are picked up locally without publishing.

## Release

Independent versioning per package (see [`lerna.json`](./lerna.json)). Versions are chosen from conventional-commit messages (`feat:` → minor, `fix:` → patch).

**Both packages changed** — coordinated release:

```bash
pnpm run release      # lerna publish: versions, tags, and publishes changed packages in order
```

**One package changed** — publish just that package (avoids re-versioning the other):

```bash
cd packages/configx && pnpm version patch && pnpm publish && git push --follow-tags
```

Two rules that keep releases correct:

- **Publish through pnpm/lerna, never `npm publish`.** Only pnpm/lerna rewrite `workspace:^` to a real version range in the tarball; `npm publish` would ship a literal `workspace:^` and break installs.
- **Don't mix the two flows without tagging.** A manual `pnpm publish` must be followed by a matching git tag (`<name>@<version>`), or lerna's history drifts behind npm and the next `lerna publish` gets confused.

See [`AGENTS.md`](./AGENTS.md) for contributor rules (stdout hygiene, type checks, layout).
