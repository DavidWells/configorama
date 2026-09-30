# Test coverage review — 2026-09-30

Reviewed the resolver, parser edge cases, Git tests, fuzz generators, async API test, and CI configuration at `9c67c79`. This is a targeted review, not an exhaustive audit of plugins or every CLI mode. The findings below describe that baseline; the subsequent fixes are now implemented.

## Fix status

All reported failures are fixed and covered by the normal suite:

- Git commands use the config directory. Git caches live inside one resolver instance, so separate loads see their own repository and refreshed Git state.
- Preprocessing, dictionary copies, path assignment, date transport and literal decoding preserve own `__proto__` data properties. Path assignment does not follow inherited containers. Tracker dictionaries have no inherited properties, avoiding crashes on scalar self references under `constructor`, `hasOwnProperty` and `toString` too.
- Original-config snapshots safely clone dictionary keys; the old lodash clone also lost `__proto__`. Dates and other non-dictionary values retain the existing clone handling.
- Resolution caches, deferred-filter identities and cycle detection distinguish path segments. Literal `a.b` can coexist with nested `a.b`, including references to neighboring objects, without unfinished values or false cycles.
- A fresh fuzz run found an additional quote-style bug: a quoted argument containing `a(")` was interpreted as a function call. Function parsing now skips quoted literals, handles escapes, and treats a call's returned string as data. Its minimized counterexample is a permanent regression in `functionArgs.test.js`.

There are 11 isolated coverage regression cases, three clone/path-safety unit cases, three function-parser/argument regressions, and a new structure-preservation fuzz property. The latter generates nulls, mixed arrays, nested dictionaries, special keys and references; it also runs the sync transport.

## Reproduced bugs

The manual runner asserts the desired behavior, with each case in a fresh Node process:

```sh
cd packages/configorama
node scripts/test-gap-probes.js
# Or isolate a case:
node scripts/test-gap-probes.js git-remote-cache
```

The original eight cases failed at review time. They now pass, along with three added cases. [`coverageGaps.test.js`](../../tests/coverageGaps/coverageGaps.test.js) runs them in `npm test`; the manual runner returns exit code 1 if any case fails. Git probes create two local temporary repositories with different branches, remotes and pinned commit dates; no network access or global Git configuration changes are needed. Both repositories contain `data.txt`. Cache probes make A → B → A loads through the same process/worker, and a refresh probe changes Git state between loads.

### 1. Git metadata can describe the caller's repository

With `cwd` in repository alpha and `configDir` in repository bravo, `${git:name}`, `${git:branch}` and `${git:url}` report alpha. The timestamp resolver can meanwhile report bravo, so one config can contain metadata from two repositories.

- Probe: `git-config-directory`.
- Cause: [`gitExec` and `gitRemote`](../../src/resolvers/valueFromGit.js) check the config's repository but execute commands using the process's working directory.
- Coverage gap: [`gitVariables.test.js`](../../tests/gitVariables/gitVariables.test.js) expects this repository's metadata. Its config and caller live in the same Git repository. The no-repository tests cover absence, not two different repositories.
- Regression needed with a fix: keep `cwd` constant while changing `configDir`, and assert actual branch, remote and commit values from independently created repositories. Route all Git commands through the resolved config directory.

### 2. Git caches leak values between repositories

Resolving alpha and then bravo, with `cwd` correctly changed for each, still returns alpha's remote and alpha's timestamp for bravo. The same leak occurs across successive `configorama.sync()` calls.

- Probes: `git-remote-cache`, `git-timestamp-cache`, `git-sync-isolation`.
- Cause: [`remoteCache`](../../src/resolvers/valueFromGit.js) is module-wide and keyed only by remote name; timestamp `cache` is keyed only by file name. Neither key identifies the repository.
- Coverage gap: no sequence of two real repositories. Timestamp assertions currently check only the ISO date shape, which accepts a well-formed timestamp from the wrong repository.
- Regression needed with a fix: A → B → A sequences for async and sync, same remote/file names but different values, plus a command after changing a remote or committing the file again. Scope caches by repository and define whether cached values may survive separate loads after Git state changes.

### 3. Valid object keys can crash preprocessing or disappear

An object with an own `hasOwnProperty` data key throws `TypeError: obj.hasOwnProperty is not a function`. A null-prototype dictionary also throws. A JSON object with an own `__proto__` key loses that key, and its value becomes the output object's prototype instead. References inside that value remain unresolved.

```js
await configorama({ hasOwnProperty: 'data', out: '${opt:v}' }, { options: { v: 'ok' } })

await configorama(Object.assign(Object.create(null), { value: 'ok', out: '${self:value}' }))

await configorama(JSON.parse('{"__proto__":{"hidden":"${opt:v}"},"value":"ok"}'), {
  options: { v: 'resolved' }
})
```

- Probes: `has-own-property-key`, `null-prototype-input`, `proto-key-preservation`.
- Cause: [`traverseAndFix`](../../src/utils/parsing/preProcess.js) calls `obj.hasOwnProperty(key)` and assigns keys into `{}` using `result[key] = ...`.
- Observed scope: the returned object's prototype changes. This review did not demonstrate mutation of global `Object.prototype`.
- Coverage gap: value generators use object keys `a`, `b`, `k`; expression fuzzing generally keeps config structure fixed. They never generate these dictionary shapes.
- Regression needed with a fix: top-level and nested dictionaries, own keys `hasOwnProperty`, `__proto__`, `constructor`, `prototype`, and null-prototype inputs. Check own-key preservation, resolved values and prototype behavior, not only serialized output. Use a safe own-property check and safe creation of data properties.

### 4. Literal dotted keys collide with nested resolution paths

```js
await configorama({
  'a.b': 'literal',
  a: { b: '${self:alias}' },
  alias: '${self:value}',
  value: 'ok'
})
// Actual a.b (nested): '${deep:0}'
// Expected a.b (nested): 'ok'; literal 'a.b' remains 'literal'.
```

An option containing `${self:value}` can similarly leave the nested field as `${self:value}`. Resolution succeeds while returning unfinished output.

- Probe: `dotted-key-path-collision`.
- Cause: [`getProperties`](../../src/main.js) and related caches use `path.join('.')`: `['a.b']` and `['a', 'b']` get the same cache key. A literal sibling can make the nested slot appear already resolved.
- Coverage gap: [`keyPaths.js`](../../tests/fuzz/properties/keyPaths.js) intentionally excludes dots and brackets from lookup keys. That exclusion is sensible for the lookup syntax being tested, but another property must cover literal data keys coexisting with nested paths.
- Regression needed with a fix: both insertion orders, multiple resolution passes, options containing refs, alias chains, arrays, and literal delimiter keys. Encode path segments without ambiguity; do not change dotted lookup syntax merely to repair internal cache identity.

## Existing tests strengthened

Seven error tests could catch their own `assert.unreachable` failure and pass even when the operation succeeded. Two `allowUnknownVars` tests accepted either success or any exception. Changes in this review:

- Require actual rejections for empty/whitespace JSON, missing dynamic keys, directory file references, malformed references, and nested missing self references.
- Correct the empty-YAML contract to `{}`; it previously said "throws" while accepting successful resolution.
- Await the async API test's promise so its assertions finish before the test completes; keep its order array local.
- Assert exact CR-only YAML output, literal Unicode/emoji refs, BigInt value/type, YAML boolean spellings and Date values. These assertions preserve the existing Unicode/emoji lookup limitation rather than adding support for it.

A temporary mutation check replaced resolution with `{}` in error cases and with a thrown error for empty YAML. All nine old tests accepted the deliberately broken behavior; all nine strengthened versions rejected it. No production files were modified during that check. The five affected test files pass all 161 tests against the real implementation.

## Further gaps to cover

- [`arbitraries.js`](../../tests/fuzz/arbitraries.js) calls its generator "Any JSON value", but excludes null, recursively nested containers, arbitrary object keys and mixed arrays. More iterations of the same grammar cannot find the missing object shapes. Add a separate structure-preservation property with safe literal values, then combine structures with references after fixing the failures above.
- Add cross-load invariants: resolving B after A should match resolving B alone, for async and sync, including Git state, config directories, options and file caches. Include repository/file changes between calls.
- [CI](../../../../.github/workflows/test.yml) runs Ubuntu with Node 22. It does not exercise Bun or native macOS/Windows path behavior. Run at least a Bun/macOS job for the project-manager use case; add Windows if it is a supported target. Windows-shaped strings on Unix do not exercise native Windows filesystem behavior.
- Tighten identity checks for external sources. A value being a string or a timestamp matching an ISO regex does not establish that it came from the requested source.

## Validation

- Original review: 8/8 failures reproduced against unchanged production code.
- Fixed implementation: 11/11 isolated coverage regression cases passed under Node.
- Deliberately broken behavior: 9/9 strengthened tests detect it, where their baseline versions passed.
- Targeted tests: 161/161 passed.
- `pnpm -r --if-present typecheck`: passed.
- `pnpm test`: all 2,664 tests passed (2,494 in configorama); five existing skipped tests remain.
- `npm run fuzz`: all 11 properties passed 2,000 fresh-seed cases each, 22,000 cases total.
- Saved failing fuzz seed/path `-464770790` / `513:0:4:13:14:10:10:10:10:10:10`: the minimized quote-style case passes after its fix.
- Bun async checks: Git directory/cache cases, special keys, metadata config snapshots, dotted paths and quoted function arguments passed.
- Bun sync limitation: the expanded suite hits a `sync-rpc` server startup timeout. A plain `configorama.sync({ value: 'plain' }, { options: {} })` call from a Bun stdin script also times out on an isolated unchanged `master` checkout. This is an existing runtime compatibility issue, not fixed by this work; Node sync regressions pass.
- `git diff --check`: passed.

The four reported bug groups and the additional quote-style bug are fixed. CI platform coverage and the existing Bun sync startup issue remain separate follow-up work.
