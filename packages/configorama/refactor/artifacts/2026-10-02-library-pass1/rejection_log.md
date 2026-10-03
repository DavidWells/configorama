# Rejections

Scores and sites are in duplication_map.md. No rejected code was edited.

| IDs | Reason | Why merging would cost more than it saves |
|---|---|---|
| R1 | Different contracts | JS selection differs from TS/ESM; catch/receiver/getter semantics matter |
| R2, R10, R13, R14 | Grammar/state differences | Bounds, traversal direction, parent ownership and fallback predicates differ |
| R3, R9 | Presentation variants | Separate user-visible sections/defaults/hints; validator-only sharing shipped |
| R4, R5, R12, R16 | Two sites / small gain | Adding a helper introduces indirection without three matching consumers |
| R6 | Evaluation context | Number/boolean replacement guards preserve different fallback behavior |
| R7, R15 | Metadata semantics | Static/runtime projections and delimiter/whitespace rules differ |
| R8, R11 | Module lifecycle | Format imports, side effects, lazy loading and wrapped errors differ |

Rescans after D1, D2, D3 show no unexplained new duplicate class. Remaining exact
wizard loop duplication is R9; the common validation body is already removed.
No source files, tests, imports, public exports or dependencies were deleted.
