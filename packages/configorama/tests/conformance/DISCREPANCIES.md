# Known Conformance Divergences

## DISC-001: HCL Boolean Filter In Fixture Matrix

- Reference: YAML/JSON/TOML/INI/Markdown/JS/TS fixtures resolve `${opt:enabled, true | Boolean}` to boolean `false`.
- HCL fixture: `$[opt:enabled, true | Boolean]` currently resolves the option value to string `"false"`.
- Impact: Boolean filter behavior differs for this HCL fixture shape, so the cross-format equivalence test compares shared scalar/string/numeric fields and records this difference as a golden artifact.
- Resolution: RESOLVED. Filters after the last fallback now run on whichever value wins, in every format; `enabled` is part of the cross-format equivalence check.
- Tests affected: `tests/conformance/conformance.test.js`.
- Review date: 2026-06-28.
