# Config Wizard Smoke Test

Manual check for the live `@clack/prompts` loop:

1. Run `node cli.js --setup tests/requirementsCli/config.yml`.
2. Confirm the wizard opens and shows the config file path.
3. Confirm enum-style `oneOf(...)` values render as a select when present.
4. Confirm conflict text appears as a warning and does not block prompting.
5. Cancel with Ctrl+C and confirm setup exits cleanly.

Comment annotation requirements smoke:

1. Run `node cli.js requirements tests/annotations/config.yml`.
2. Confirm output includes `"schemaVersion": 1`.
3. Confirm `env:CONFIGORAMA_ANNOTATION_STRIPE_SECRET` includes:
   - `description`
   - `obtainHint`
   - `examples`
   - `defaultHint`
   - `group`
   - `deprecationMessage`
4. Confirm `ask[]` includes the same actionable metadata but does not include
   `sensitiveSource`.
5. Run `node cli.js tests/annotations/config.yml --requirements` and confirm it
   emits the same requirements shape.
