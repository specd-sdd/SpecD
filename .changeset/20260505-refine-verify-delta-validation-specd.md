---
"@specd/specd": patch
---

20260505 - refine-verify-delta-validation: Refines verify delta validation in the standard schema to make verification scenarios conditional on requirement changes. This prevents validation failures when only removing requirements or editing other sections. Includes documentation updates for cross-field validation and a new integration test in core for complex delta validation regexes.

Specs affected:

- `core:schema-format`
- `core:delta-format`
