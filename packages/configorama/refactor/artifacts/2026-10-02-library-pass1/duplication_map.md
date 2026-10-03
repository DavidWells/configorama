# Library simplification map

Baseline: 2cf0fe1. Scope: non-test JavaScript under packages/configorama/src.
Raw scans: scans/stabilized-before and scans/renamed-stabilized-before. Comments
ignored. jscpd found 12 exact blocks / 161 cloned lines (0.9940%); identifier
normalization found 30 blocks / 414 cloned lines (2.5560%). These are alternative modes,
not additive totals. cloc measures executable code separately from comments.

| ID | Sites / clone | Estimated code savings | LOC × confidence / risk | Decision |
|---|---|---:|---:|---|
| D1 | valueFromFile: three processExecutableFile argument packs, II | 20–35 | 3 × 4 / 3 = 4.0 | Accept |
| D2 | parse: TS/ESM root execution bodies, II | 15–25 | 3 × 4 / 2 = 6.0 | Accept |
| D3 | configWizard: four exact validation callbacks, I | 20–30 | 3 × 4 / 2 = 6.0 | Accept |
| R1 | JS vs TS/ESM export selection, IV | 20–50 | 3 × 2 / 5 = 1.2 | Reject: getters, receivers and error policy differ |
| R2 | quoteAware traversal loops, III/IV | 20–50 | 3 × 2 / 5 = 1.2 | Reject: ranges, boundaries and matcher timing differ |
| R3 | display report branches, III | 5–20 | 2 × 2 / 3 = 1.33 | Reject: two variants with different public presentation |
| R4 | index/sync custom metadata collection, I | 5–20 | 2 × 2 / 4 = 1.0 | Reject: only two sites, different process boundary |
| R5 | introspect/audit analysis setup, I | 5–20 | 2 × 2 / 3 = 1.33 | Reject: two sites; public API instrumentation differs |
| R6 | numeric/boolean compose replacement, I | 5–20 | 2 × 2 / 5 = 0.8 | Reject: two hot-path branches, evaluation/context differs |
| R7 | metadata/enrich documentation projections, III | 5–20 | 2 × 2 / 3 = 1.33 | Reject: only two sites, static/runtime semantics differ |
| R8 | INI/JSON5/TOML/YAML wrappers, II/III | 50–100 | 4 × 2 / 5 = 1.6 | Reject: lazy imports, error wrappers and parse/stringify contracts differ |
| R9 | wizard self/dotProp prompt loops, III | 20–50 | 3 × 2 / 5 = 1.2 | Reject: distinct input sections and presentation |
| R10 | alias and bracket traversal fragments, III | 5–20 | 2 × 2 / 4 = 1.0 | Reject: lookup strategy / bracket direction differ |
| R11 | resolver format imports appearing unused | <5 | 1 × 1 / 5 = 0.2 | Reject: removing require changes module evaluation |
| R12 | main upper/lower case filters, II | <5 | 1 × 2 / 3 = 0.67 | Reject: two sites, negligible savings after helper |
| R13 | expression scanner child-parent assignments, III | <5 | 1 × 2 / 5 = 0.4 | Reject: different item bounds and mutable node ownership |
| R14 | main whole/partial fallback guards, III | <5 | 1 × 3 / 5 = 0.6 | Reject: two sites, grammar predicates differ |
| R15 | metadata filter-field cleanup, III | 20–50 | 3 × 2 / 4 = 1.5 | Reject: suffix/whitespace contracts and regex accesses differ |
| R16 | filter/function extension registration, II | <5 | 1 × 2 / 2 = 1.0 | Reject: only two tiny sites |

No scanner block is merged without reading its enclosing contract. Diagnostic
comment removal is excluded from code savings. No files or tests are deleted.
One lever per commit; rescan after each collapse and audit newly surfaced blocks.

Final rescan: 9 exact blocks / 104 lines; normalized 26 blocks / 334 lines.
All remaining scanner blocks map to R1–R16. No newly surfaced candidate reaches
the acceptance threshold with an established equivalence contract. D1/D2/D3
shipped with measured savings 19/16/15; estimates were deliberately conservative
about type-documentation overhead and are replaced by cloc in the ledger.
