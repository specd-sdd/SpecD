# Tasks: fix-graph-cli-context-explicit-config

## 1. Shared graph context

- [x] 1.1 Make configured VCS state optional
      `packages/cli/src/commands/graph/resolve-graph-cli-context.ts`: `GraphCliContext` — allow configured contexts to represent unavailable repository state.
      Approach: widen `vcsRoot` from `string` to `string | null`; preserve a non-null root for the bootstrap return value.
      (Req: resolveGraphCliContext uses SDK imports)
- [x] 1.2 Bypass repository resolution for configured context
      `packages/cli/src/commands/graph/resolve-graph-cli-context.ts`: `resolveGraphCliContext` — keep explicit and discovered config paths independent of bootstrap validation.
      Approach: after each `resolveCliContext` call, return its config, kernel, config-file path, and project root with `vcsRoot: null`; call `resolveRepoRoot` only through `createBootstrapContext` for `--path` and no-config fallback.
      (Req: resolveGraphCliContext uses SDK imports)

## 2. Regression coverage

- [x] 2.1 Test configured context outside VCS
      `packages/cli/test/commands/graph-cli-context.spec.ts`: `resolveGraphCliContext` tests — prove explicit and discovered valid configuration resolves without repository detection.
      Approach: mock config resolution and VCS failure, assert configured mode preserves config/kernel/project root and returns `vcsRoot: null` without a bootstrap error.
      (Req: resolveGraphCliContext uses SDK imports, scenario: Configured mode outside a repository)
- [x] 2.2 Preserve bootstrap repository validation tests
      `packages/cli/test/commands/graph-cli-context.spec.ts`: bootstrap tests — retain the VCS-only boundary.
      Approach: assert `--path` and no-config fallback reject outside VCS, while an in-repository bootstrap returns the synthetic default workspace and non-null VCS root.
      (Req: resolveGraphCliContext uses SDK imports, scenario: Bootstrap mode uses synthetic default workspace, scenario: Bootstrap mode outside a repository fails)
- [x] 2.3 Cover stats with a non-VCS configured context
      `packages/cli/test/commands/graph-stats.spec.ts`: `registerGraphStats` tests — protect the user-visible regression path.
      Approach: invoke stats with `--config`, resolve a configured context with `vcsRoot: null`, and assert `withProvider` and the canonical health call execute instead of bootstrap validation.
      (Req: Command signature, scenario: Explicit config works outside VCS)

## 3. Validation

- [x] 3.1 Run focused CLI automated checks
      `packages/cli`: graph context and stats test suites plus CLI lint.
      Approach: run the focused Vitest files and `pnpm --filter @specd/cli lint`; resolve strict TypeScript or lint regressions before completion.
      (Req: resolveGraphCliContext uses SDK imports, Command signature)
- [x] 3.2 Verify end-to-end configured and bootstrap behavior
      `packages/cli/dist/index.js`: graph stats CLI execution.
      Approach: run `graph stats --config` against a valid temporary non-VCS project and confirm it reaches provider-owned health output; run `graph stats --path` against a non-VCS path and confirm the bootstrap validation error remains; run repository typecheck.
      (Req: Command signature, scenario: Explicit config works outside VCS, scenario: Bootstrap mode outside a repository fails)
