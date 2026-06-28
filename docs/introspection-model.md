# Configorama Introspection Model

Configorama uses the existing metadata discovery flow as the source of truth for introspection:

- `src/metadata.js` walks unresolved config values, records variables, fallback order, filters, and static file/text dependencies.
- `src/utils/parsing/enrichMetadata.js` enriches that discovery with comments, help text, oneOf values, source classes, file existence, and `uniqueVariables`.
- `src/utils/requirements/configRequirements.js` consumes `uniqueVariables` to build user-facing requirements.
- `src/utils/introspection/model.js` projects the same enriched metadata into graph and audit models. It does not add another config walker.

## Source Classes

The requirements and introspection layers use one source-class vocabulary:

| Source Class | Meaning | Examples |
|---|---|---|
| `user` | Supplied by a user, agent, shell, or CLI caller. | `env`, `opt`/`option`, `param` |
| `config` | Read from the config file or files it references. | `self`, bare dot-prop, `file`, `text` |
| `readonly` | Derived from local readonly state or expression evaluation. | `git`, `cron`, `eval`, `if` |
| `remote` | Reserved for future resolvers that read remote systems. | plugin resolvers for secret stores |

## Risk Classes

Risk is separate from source class:

| Risk | Meaning | Severity |
|---|---|---|
| `none` | No additional inspection risk. | `info` |
| `local_file_read` | Reads from the local filesystem. | `low` |
| `data_flow_expression` | Sandboxed expression can read resolved config values. | `low` |
| `executable_code` | JavaScript/TypeScript/ESM can execute. | `high` |
| `process_spawn` | A subprocess can be spawned. | `medium` |
| `environment_mutation` | Runtime can mutate `process.env`. | `high` |
| `custom_extension` | User-provided resolver/function/plugin code can run. | `high` |

`eval` and `if` are classified as `data_flow_expression`, not arbitrary JavaScript execution. They are still tested for constructor/prototype escape attempts.

## Static And Dynamic Dependencies

Graph and audit output are static projections. Dynamic file targets such as `${file(./${opt:stage}.yml)}` produce partial edges plus a `dynamic_file_target` diagnostic. Audit mode still reports the risk surface even when the final file path cannot be known without resolution.
