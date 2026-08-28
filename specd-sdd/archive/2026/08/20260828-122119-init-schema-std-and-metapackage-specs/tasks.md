# Tasks: init-schema-std-and-metapackage-specs

## 1. Schema DAG Updates

- [x] 1.1 Update tasks prerequisite dependencies in standard schema
      `packages/schema-std/schema.yaml`: `artifacts[id=tasks].requires` — add `verify` to ensure DAG sequence `specs`, `verify`, and `design`
      Approach: Edit `packages/schema-std/schema.yaml` under `id: tasks` to set `requires: [specs, verify, design]`
      (Req: Artifact Dependency Graph (DAG) Invariants)
- [x] 1.2 Review and align schema documentation
      `docs/schemas/schema-format.md`: Schema DAG diagrams and examples — verify consistency with updated `tasks` prerequisites
      Approach: Inspect `schema-format.md` for DAG examples and update references if necessary
      (Req: Canonical Schema Definition)

## 2. Monorepo Quality Gates & Verification

- [x] 2.1 Validate workspace specs against updated schema
      `packages/cli/dist/index.js`: Execute specs validation across all workspace packages
      Approach: Run `node packages/cli/dist/index.js specs validate` and verify 276+ specs pass
      (Req: Canonical Schema Definition, Artifact Dependency Graph (DAG) Invariants)
- [x] 2.2 Run monorepo typecheck
      Root monorepo: Turbo typecheck
      Approach: Run `pnpm typecheck` and ensure zero TypeScript compiler errors
      (Req: Schema Package Distribution, Pure Aggregator Contract)
- [x] 2.3 Run monorepo linting
      Root monorepo: ESLint and Prettier checks
      Approach: Run `pnpm lint` and ensure clean code formatting and lint rules compliance
      (Req: Pure Aggregator Contract)
- [x] 2.4 Run monorepo unit and integration tests
      Root monorepo: Vitest / Turbo test runner
      Approach: Run `pnpm test` and assert all test suites in core, cli, and code-graph pass
      (Req: Canonical Schema Definition, Lifecycle Steps and State Transitions)

## 3. Change Verification

- [x] 3.1 Validate all change artifacts and check status
      `specd-sdd/changes/20260828-122119-init-schema-std-and-metapackage-specs/`: Change verification
      Approach: Run `node packages/cli/dist/index.js changes validate init-schema-std-and-metapackage-specs --format text` and `node packages/cli/dist/index.js changes status init-schema-std-and-metapackage-specs --format text`
      (Req: Canonical Schema Definition, Proposal Artifact Contract and Instructions, Specs Artifact Contract, Instructions, and Deltas, Verify Artifact Contract, Instructions, and Deltas, Design Artifact Contract and Instructions, Tasks Artifact Contract, Instructions, and Tracking)
