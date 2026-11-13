---
'@specd/specd': patch
---

20261113 - verify-scenario-gwt-list-validation: Tightens @specd/schema-std verify scenario validation to require at least one WHEN and one THEN list item (with GIVEN optional) while keeping schema.yaml at version: 1 and clarifying that "Never bullets" applies only to scenario headings. Updates the guide documentation and @specd/guide catalog, and adds a dev-only Vitest suite in @specd/schema-std covering standard-schema, templates, and GWT validation without changing the published npm package files.

Modified packages:

- @specd/schema-std

Specs affected:

- `schema-std:standard-schema`
- `schema-std:templates`
- `default:_global/continuous-integration`
