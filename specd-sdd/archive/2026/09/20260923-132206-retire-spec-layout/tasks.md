# Tasks: retire-spec-layout

## 1. Documentation

- [x] 1.1 Add amendment note to ADR-0011
      `docs/adr/0011-spec-layout.md`: `## Amendment (2026-09-23)` — document that spec layout rules are superseded by `@specd/schema-std`
      Approach: append an amendment section explaining that the markdown document structure, AST-based validations, and scenario conventions originally outlined in this ADR are now formally specified and strictly validated by `@specd/schema-std` (`schema-std:standard-schema`), rendering `default:_global/spec-layout` neutralized
      (Req: Superseded by schema-std)

## 2. Verification and Testing

- [x] 2.1 Verify preview of neutralized spec and updated dependencies
      `specs/_global/spec-layout/spec.md`: `specd changes spec-preview` — confirm deltas merge cleanly for both specs
      Approach: run `specd changes spec-preview retire-spec-layout default:_global/spec-layout` and `specd changes spec-preview retire-spec-layout cli:spec-search` to assert the merged markdown matches the design specification
      (Req: Superseded by schema-std)
- [x] 2.2 Execute test suite, typecheck, and linter
      Monorepo root: `pnpm test`, `pnpm typecheck`, `pnpm lint` — verify no regressions across workspace packages
      Approach: run the automated verification commands across the monorepo to ensure clean test passes
      (Req: Superseded by schema-std)
