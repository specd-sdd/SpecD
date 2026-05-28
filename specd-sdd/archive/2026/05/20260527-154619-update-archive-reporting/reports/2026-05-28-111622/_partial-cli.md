## Package: @specd/cli

### Overview

Audited specs: `cli:archive-show`, `cli:archive-list`.
Both specs were reviewed against their respective test coverage in `packages/cli/test/commands/`.

### Implementation Status

- **`cli:archive-show`**: Implementation correctly outputs enriched metadata (`description`, `archivedBy`) as required by the `spec.md`. The `--format json` output correctly includes these fields.
- **`cli:archive-list`**: Implementation removes the legacy `WORKSPACE` column and correctly introduces pagination (`--limit`, `--page`, `--start-at`), outputting an object with `items` and `meta` fields.

### Test Coverage

- **`cli:archive-show`**: **Missing test coverage.** The `verify.md` specifies a scenario `Display enriched metadata` (checking for `description:`, `specs:`, and `schema:` inclusion), but this scenario is entirely absent from `packages/cli/test/commands/archive-show.spec.ts`.
- **`cli:archive-list`**: Test coverage matches the code. Legacy `WORKSPACE` removal is explicitly tested.

### Discrepancies

- **`cli:archive-list`**: Spec drift/contradiction. Under `Requirement: Empty archive`, the spec claims the command prints `[]` in JSON/toon mode if there are no changes. However, under `Requirement: Output format — JSON`, the spec mandates returning an object `{ items: [...], meta: {...} }`. The implementation returns the object format `{ items: [], meta: { total: 0, count: 0, ... } }` and the test verifies this behavior. The `Empty archive` requirement needs to be updated to reflect the new paginated JSON envelope.
