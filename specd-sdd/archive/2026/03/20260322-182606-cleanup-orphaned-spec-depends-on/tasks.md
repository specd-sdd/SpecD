# Tasks: cleanup-orphaned-spec-depends-on

## 1. Domain entity

- [x] 1.1 Add specDependsOn cleanup to updateSpecIds
      `packages/core/src/domain/entities/change.ts`: `updateSpecIds()` — after setting `_specIds`, remove orphaned `_specDependsOn` entries
      Approach: build `new Set(this._specIds)` from the already-deduplicated list, iterate `this._specDependsOn.keys()`, delete any key not in the set. Place before `this.invalidate()`.
      (Req: Workspaces and specs — specDependsOn cleanup on updateSpecIds)

## 2. Tests

- [x] 2.1 Test orphaned specDependsOn removed when spec removed
      `packages/core/test/domain/entities/change.spec.ts`: `specDependsOn` describe block — add test for partial removal
      Approach: create change with specIds `['auth/login', 'auth/session']`, set specDependsOn for both, call `updateSpecIds(['auth/login'], actor)`, assert `auth/session` entry gone, `auth/login` entry remains.
      (Req: Workspaces and specs — scenario: Orphaned specDependsOn removed when spec removed from specIds)

- [x] 2.2 Test specDependsOn fully cleared when all specs with deps removed
      `packages/core/test/domain/entities/change.spec.ts`: `specDependsOn` describe block — add test for full cleanup
      Approach: create change with specIds `['auth/login']`, set specDependsOn for it, call `updateSpecIds(['billing/core'], actor)`, assert specDependsOn is empty.
      (Req: Workspaces and specs — scenario: specDependsOn fully cleared when all specs with deps removed)

- [x] 2.3 Test specDependsOn unchanged when no orphans
      `packages/core/test/domain/entities/change.spec.ts`: `specDependsOn` describe block — add test for no-op case
      Approach: create change with specIds `['auth/login', 'auth/session']`, set specDependsOn for `auth/login` only, call `updateSpecIds(['auth/login', 'auth/session'], actor)`, assert specDependsOn unchanged.
      (Req: Workspaces and specs — scenario: specDependsOn unchanged when no orphans exist)
