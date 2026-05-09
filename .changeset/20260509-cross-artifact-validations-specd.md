---
'@specd/specd': minor
---

20260509 - cross-artifact-validations: Add schema-level cross-artifact validation and richer intra-artifact constraints (count, unique, key extraction) for requirement mirroring, uniqueness, and structural consistency across spec and verify artifacts. Introduces crossArtifactValidations at schema root with all-equal/subset/superset relations, count cardinality (exactly/min/max), unique-key tracking (by/capture/strip), and keySelector for nested value extraction. Includes bug fix for duplicate crossArtifactValidations ID validation and comprehensive test coverage.

Modified packages:

- @specd/core

Specs affected:

- `core:schema-format`
- `core:validate-artifacts`
- `core:validate-specs`
