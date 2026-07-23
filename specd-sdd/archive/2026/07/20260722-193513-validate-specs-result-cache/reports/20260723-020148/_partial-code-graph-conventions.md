# Partial Audit: Code-Graph & Global Conventions

**Batch:** code-graph:workspace-integration, default:\_global/conventions  
**Auditor:** specd-compliance subagent  
**Date:** 20260723-020148

---

## code-graph:workspace-integration

**Status:** NON-COMPLIANT

### Requirements Summary

| Requirement                            | Status | Evidence                                                                           |
| -------------------------------------- | ------ | ---------------------------------------------------------------------------------- |
| Spec resolution via SpecRepository     | ⚠️     | Uses list() + get() + artifact/metadata APIs                                       |
| Enumerate via repo.list()              | ✅     | index-code-graph.ts:958                                                            |
| Freshness via persistedStateHash()     | ❌     | Never called in indexer; uses content hash from concatenated artifacts (line 1033) |
| Artifact filenames from spec.artifacts | ⚠️     | Uses `repoSpec.filenames` (derived from artifacts)                                 |
| Load metadata/dependsOn/implementation | ✅     | metadata(), readPersistedDependsOn(), readPersistedImplementation()                |

### Known Failure (User-Reported)

**5 tests fail** in `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`:

```
ws.specRepo.get is not a function
```

**Root cause:** `IndexCodeGraph` now calls `ws.specRepo.get(SpecPath.parse(entry.path))` after listing specs (index-code-graph.ts:961), but `makeMockRepo()` in workspace-indexing.spec.ts only stubs `list`, `count`, `metadata`, `artifact`, `persistedStateHash` — no `get()` implementation.

**Affected scenarios:**

- indexes multiple workspaces with package identities
- assigns specs to the correct workspace and specId
- two workspaces with same spec name produce unique specIds
- prefers optimizedDescription when indexing specs
- computes contentHash from content artifacts excluding sidecars with spec.md first

### Implementation vs Spec Text

The change delta for "Spec resolution via SpecRepository" lists step 2 as `repo.persistedStateHash()` for freshness. The indexer instead:

1. Calls `get()` to materialize `Spec` entities (not listed in spec steps)
2. Compares `computeContentHash(content)` from concatenated artifact bytes against stored `SpecNode.contentHash`

**Assessment:** Could be spec drift (content-hash approach predates/is more accurate) or incomplete spec update. The `get()` addition is necessary for stamp-aware consumers but broke tests and wasn't reflected in verify scenarios.

### Test Coverage

Integration tests exist but 5/12 workspace-indexing tests currently fail. Passing tests do not exercise the new `get()` code path.

---

## default:\_global/conventions

**Status:** PARTIAL

### Requirements Summary

| Requirement                                | Status | Evidence                                    |
| ------------------------------------------ | ------ | ------------------------------------------- |
| Lazy loading — list returns metadata only  | ✅     | SpecRepository.list() returns SpecListEntry |
| get() returns stamps without content       | ✅     | FsSpecRepository.\_buildSpec()              |
| Spec MUST NOT carry derived filenames list | ❌     | Contradicts core:spec-repository-port delta |

### Cross-Spec Consistency Issue

**Within this change, two specs contradict:**

| Spec                                  | Statement                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| `default:_global/conventions` (delta) | "`Spec` MUST NOT carry a derived `filenames` list"                           |
| `core:spec-repository-port` (delta)   | "`Spec` MUST expose derived `filenames` and `hasArtifact(filename)` helpers" |

**Code follows** `core:spec-repository-port`: `Spec.filenames` getter exists in `packages/core/src/domain/entities/spec.ts:74`.

**Consumers using filenames:** `GetSpec`, `IndexCodeGraph` (content artifact selection).

**Resolution needed:** Reconcile conventions delta with spec-repository-port before archive — either restore filenames as permitted derived helper in conventions or remove filenames from Spec and update all call sites.

### Test Coverage

Conventions are enforced via ESLint/TypeScript project-wide; no change-specific verify scenarios. Lazy-loading pattern partially tested via repository and validate-specs tests.

---

## Batch Summary

| Spec                             | Compliant | Partial | Non-compliant |
| -------------------------------- | --------- | ------- | ------------- |
| code-graph:workspace-integration | 0         | 0       | 1             |
| default:\_global/conventions     | 0         | 1       | 0             |
| **Total**                        | **0**     | **1**   | **1**         |
