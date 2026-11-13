# Spec Compliance Audit Report

- **Mode:** `--change verify-scenario-gwt-list-validation`
- **Timestamp:** `20261113-161730`
- **Specs Audited:** `schema-std:standard-schema`, `schema-std:templates`, `default:_global/continuous-integration`
- **Global / Dependency Specs Checked:** `default:_global/testing`, `default:_global/cross-platform`, `default:_global/docs`, `default:_global/conventions`, `default:_global/eslint`

## Summary

| Spec                                     | Requirements | Implemented | Discrepancies | Test Coverage                                                                |
| ---------------------------------------- | ------------ | ----------- | ------------- | ---------------------------------------------------------------------------- |
| `schema-std:standard-schema`             | 11           | 11          | 0             | 14 Vitest tests (`standard-schema.spec.ts`, `verify-gwt-validation.spec.ts`) |
| `schema-std:templates`                   | 6            | 6           | 0             | 6 Vitest tests (`templates.spec.ts`)                                         |
| `default:_global/continuous-integration` | 6            | 6           | 0             | Verified via `pnpm test` (13 packages) & `npm pack --dry-run`                |

## Detailed Findings

### 1. `schema-std:standard-schema`

- **Implementation:** `packages/schema-std/schema.yaml`, `packages/schema-std/package.json`, `docs/guide/selectors.md`, `docs/guide/standard-schema.md`, `packages/guide/generated/guides*.json`.
- **Verification:**
  - `has-when` (`type: list-item`, `matches: '^WHEN\b'`, `required: true`, `count: { min: 1 }`), `has-then` (`type: list-item`, `matches: '^THEN\b'`, `required: true`, `count: { min: 1 }`), and `has-given` (`type: list-item`, `matches: '^GIVEN\b'`, `required: false`) are nested under `has-scenario` in `packages/schema-std/schema.yaml`.
  - `verify.instruction` clarifies that “Never bullets” applies only to scenario titles while GWT clauses MUST be list items.
  - `schema.yaml` `version` remains `1` per user direction while closing the current version.
- **Test Coverage:** `packages/schema-std/test/standard-schema.spec.ts` (11/11 passing) and `packages/schema-std/test/verify-gwt-validation.spec.ts` (3/3 passing).
- **Discrepancies:** None.

### 2. `schema-std:templates`

- **Implementation:** `packages/schema-std/templates/{proposal,spec,verify,design,tasks}.md` (unchanged / `no-op`).
- **Test Coverage:** `packages/schema-std/test/templates.spec.ts` (6/6 passing), covering all required sections, Gherkin list scaffolding, task checklist format, `{{variable}}` placeholders, and `<!-- ... -->` comment syntax.
- **Discrepancies:** None.

### 3. `default:_global/continuous-integration`

- **Implementation:** Root `package.json` `"test"` script updated to include `--filter=@specd/schema-std`. `packages/schema-std/package.json` adds `@specd/core` and `vitest` in `devDependencies` only while preserving `"files": ["schema.yaml", "templates/"]` and `"type": "module"`.
- **Verification:** `pnpm test` passed across all 13 packages (including `@specd/schema-std`), `pnpm lint` passed, `pnpm typecheck` passed (26/26 tasks), and `npm pack --dry-run` confirmed only the 8 production files are packaged.
- **Discrepancies:** None.
