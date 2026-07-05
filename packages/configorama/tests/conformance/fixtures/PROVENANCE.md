# Conformance Fixture Provenance

These fixtures are hand-authored for Configorama behavior in this repository.

- Generator: none
- Review workflow: run `UPDATE_GOLDENS=1 npm run test:tests -- conformance`, inspect `tests/conformance/goldens/`, then commit intentional changes.
- Scope: stable machine-readable CLI/API outputs and cross-format equivalence where YAML, JSON, TOML, INI, HCL, Markdown frontmatter, JS, and TS overlap.

Known format differences are tested by projecting comparable fields instead of pretending all formats support identical syntax and data types.
