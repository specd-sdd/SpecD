# Tasks: enrich-create-output

## 1. Core

- [x] 1.1 Add `CreateChangeResult` interface and update return type
- [x] 1.2 Return `{ change, changePath }` from execute

## 2. CLI

- [x] 2.1 Update `change create` to include `changePath` in JSON output

## 3. Tests

- [x] 3.1 Update core tests for new result shape
- [x] 3.2 Update CLI tests for changePath in output
- [x] 3.3 Run full test suite
