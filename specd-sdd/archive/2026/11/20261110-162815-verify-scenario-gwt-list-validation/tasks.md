# Tasks: verify-scenario-gwt-list-validation

## 1. Verify instruction (keep schema version at 1)

- [x] 1.1 Clarify verify Format-requirements instruction wording
      `packages/schema-std/schema.yaml`: `artifacts[id=verify].instruction` Format requirements bullet (keep root `version: 1` unchanged)
      Approach: replace the “Never three, never bullets” bullet with wording that (a) requires GWT Markdown list items for optional GIVEN then WHEN/THEN (+ AND/OR), (b) requires exactly four hashtags for scenario headings, (c) states “never bullets” applies only to scenario titles
      (Req: Canonical Schema Definition; Verify Artifact Contract, Instructions, and Deltas — instruction clarity)

## 2. Nested GWT list-item validations

- [x] 2.1 Add has-when list-item child under has-scenario
      `packages/schema-std/schema.yaml`: `artifacts[id=verify].validations` → `has-scenario.children`
      Approach: add `{ id: has-when, type: list-item, matches: '^WHEN\b', required: true, count: { min: 1 } }` nested under `has-scenario`, matching `metadataExtraction` WHEN matcher
      (Req: Verify Artifact Contract — structural WHEN list items)

- [x] 2.2 Add has-then list-item child under has-scenario
      `packages/schema-std/schema.yaml`: same `has-scenario.children`
      Approach: add `{ id: has-then, type: list-item, matches: '^THEN\b', required: true, count: { min: 1 } }`
      (Req: Verify Artifact Contract — structural THEN list items)

- [x] 2.3 Add optional has-given list-item child under has-scenario
      `packages/schema-std/schema.yaml`: same `has-scenario.children`
      Approach: add `{ id: has-given, type: list-item, matches: '^GIVEN\b', required: false }` so missing GIVEN does not fail validation
      (Req: Verify Artifact Contract — optional GIVEN)

- [x] 2.4 Leave deltaValidations, extractors, and templates/verify.md unchanged
      `packages/schema-std/schema.yaml` + `packages/schema-std/templates/verify.md`
      Approach: do not edit `deltaValidations`, `metadataExtraction.scenarios`, or `templates/verify.md` in this change; rely on merged full-file validations
      (Req: Verify Artifact Contract; Templates — Verify Template Structure)

## 3. Documentation

- [x] 3.1 Update selectors guide nested-structure example for GWT list items
      `docs/guide/selectors.md`: “Asserting nested structure” example
      Approach: extend the Scenario children example to require WHEN/THEN `list-item` validations and optional GIVEN, matching the new schema.yaml shape
      (Req: Verify Artifact Contract; default:\_global/docs)

- [x] 3.2 Update standard-schema guide verify conventions
      `docs/guide/standard-schema.md`: verify conventions bullet list
      Approach: state that scenario bodies MUST use GWT list items and that structural validation enforces WHEN/THEN list items (GIVEN optional)
      (Req: Verify Artifact Contract; default:\_global/docs)

- [x] 3.3 Align other guide pages if they claim validations end at Scenario headings
      `docs/guide/schemas.md`, `docs/guide/specs.md`, `docs/guide/artifacts.md`
      Approach: only edit if wording claims validation stops at Scenario headings; add one accurate sentence about WHEN/THEN list-item enforcement
      (Req: default:\_global/docs)

- [x] 3.4 Regenerate guide package artifacts if required
      `packages/guide/generated/` (or project docs→guide pipeline)
      Approach: run the repo’s existing guide generation/update path after markdown edits so shipped guides match `docs/guide`
      (Req: default:\_global/docs)

## 4. Verification

- [x] 4.1 Confirm well-formed verifies still pass under the tightened schema
      CLI: `node packages/cli/dist/index.js specs validate schema-std:standard-schema --format text` (and/or project specsHealth)
      Approach: after schema.yaml edits, validate existing schema-std verify content that uses `- **GIVEN**` / `- **WHEN**` / `- **THEN**` list items; expect pass
      (Req: verify scenario — Verify definition configures scenario structure…; Scenario with WHEN and THEN… passes)

- [x] 4.2 Confirm missing WHEN/THEN list items fail validation
      Disposable fixture or temp change verify.md with prose-only Scenario body
      Approach: validate against updated schema; expect failure for `has-when` and/or `has-then`
      (Req: verify scenario — Scenario without WHEN or THEN list items fails)

- [x] 4.3 Confirm WHEN+THEN without GIVEN passes
      Disposable fixture Scenario body with only WHEN and THEN list items
      Approach: validate against updated schema; expect pass for GWT list-item rules
      (Req: verify scenario — Scenario with WHEN and THEN list items and no GIVEN passes)

## 5. Automated Vitest tests in `@specd/schema-std` (dev-only, excluded from npm package)

- [x] 5.1 Configure Vitest and dev-only `@specd/core` dependency in `packages/schema-std`
      `packages/schema-std/package.json`, `packages/schema-std/vitest.config.ts`, `packages/schema-std/tsconfig.json`, `package.json`
      Approach: add `"@specd/core": "workspace:^"` and `"vitest": "^4.1.10"` to `devDependencies`, add `"test": "vitest run"` and `"typecheck": "tsc --noEmit"`, keep `"files": ["schema.yaml", "templates/"]` unchanged so tests are never packaged, and add `--filter=@specd/schema-std` to root `package.json` `"test"`
      (Req: Verify Artifact Contract; default:\_global/testing)

- [x] 5.2 Add Vitest spec covering all requirements of `schema-std:standard-schema`
      `packages/schema-std/test/standard-schema.spec.ts`
      Approach: load real `schema.yaml` and `templates/`, assert `buildSchema` succeeds, and verify root fields, artifact DAG & acyclicity, proposal/specs/verify/design/tasks contracts, `crossArtifactValidations`, `metadataExtraction`, `workflow` steps/transitions, and `package.json` distribution fields
      (Req: schema-std:standard-schema — all requirements; default:\_global/testing)

- [x] 5.3 Add Vitest spec covering all requirements of `schema-std:templates`
      `packages/schema-std/test/templates.spec.ts`
      Approach: load all files under `packages/schema-std/templates/` and verify required sections, Gherkin list scaffolding, task checklist format, `{{variable}}` placeholders, and `<!-- ... -->` guidance comments
      (Req: schema-std:templates — all requirements; default:\_global/testing)

- [x] 5.4 Add Vitest spec testing GWT list-item validation and `verify-scenarios` metadata extraction
      `packages/schema-std/test/verify-gwt-validation.spec.ts`
      Approach: run `@specd/core` structural validation and metadata extraction against the real `schema.yaml` for (a) GIVEN+WHEN+THEN list items (including bold `- **WHEN**`), (b) WHEN+THEN without GIVEN, and (c) prose-only scenario failure (`has-when` / `has-then`)
      (Req: Verify Artifact Contract — structural WHEN/THEN list items, optional GIVEN, extraction parity; default:\_global/testing)

- [x] 5.5 Run `@specd/schema-std` tests, typecheck, and `pnpm pack --dry-run`
      CLI: `pnpm --filter @specd/schema-std test && pnpm --filter @specd/schema-std typecheck && pnpm --filter @specd/schema-std pack --dry-run`
      Approach: verify all tests and typecheck pass and confirm `pack --dry-run` includes only `schema.yaml`, `templates/`, and `package.json` (no `test/`, `vitest.config.ts`, or `tsconfig.json`)
      (Req: default:\_global/testing)
