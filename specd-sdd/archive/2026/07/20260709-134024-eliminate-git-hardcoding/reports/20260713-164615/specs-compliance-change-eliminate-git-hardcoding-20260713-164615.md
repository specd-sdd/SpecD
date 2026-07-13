# Spec Compliance Audit

- Mode: `--change eliminate-git-hardcoding`
- Timestamp: `20260713-164615`
- Change path: `/Users/monki/Documents/Proyectos/specd/specd-sdd/changes/20260709-134024-eliminate-git-hardcoding`
- Graph status: fresh, `stale: false`, `fingerprintMismatch: false`

## Scope

- Change specs audited:
  - `core:vcs-adapter-port`
  - `core:vcs-adapter`
  - `core:actor-resolver-port`
  - `core:actor-resolver`
  - `core:actor-resolver-git`
  - `core:actor-resolver-hg`
  - `core:actor-resolver-svn`
  - `core:actor-provider`
  - `core:config-loader`
  - `code-graph:indexer`
  - `core:config`
  - `code-graph:workspace-integration`
  - `cli:entrypoint`
  - `cli:host-context`
  - `core:vcs-actor-resolver`
  - `core:composition`
  - `sdk:host-context`

## Verification Evidence

- Verifying pre-hooks passed:
  - `pnpm test`
  - `pnpm lint`
  - `pnpm typecheck`
- Additional focused checks passed:
  - `packages/core`: `pnpm run typecheck`
  - `packages/code-graph`: `pnpm run typecheck`
- Implementation-level scenario coverage observed in updated tests:
  - `packages/core/test/infrastructure/git/vcs-adapter.spec.ts`
  - `packages/core/test/infrastructure/hg/vcs-adapter.spec.ts`
  - `packages/core/test/infrastructure/svn/vcs-adapter.spec.ts`
  - `packages/core/test/infrastructure/null/vcs-adapter.spec.ts`
  - `packages/core/test/infrastructure/vcs-actor-resolver.spec.ts`
  - `packages/core/test/composition/actor-resolver.spec.ts`
  - `packages/core/test/infrastructure/vcs/vcs-implementation-detector.spec.ts`
  - `packages/code-graph/test/application/use-cases/discover-files.spec.ts`
  - `packages/code-graph/test/application/use-cases/index-project-graph.spec.ts`
  - `packages/code-graph/test/application/use-cases/index-project-graph-integration.spec.ts`
  - `packages/code-graph/test/application/use-cases/workspace-indexing.spec.ts`
  - `packages/code-graph/test/composition/code-graph-provider.spec.ts`

## Findings

### 1. Documentation and public examples are not aligned with the implemented API rename and VCS-neutral behavior

- Severity: medium
- Type: implementation/documentation gap
- Evidence:
  - `docs/sdk/index.md:89` still documents `createConfigLoader`
  - `docs/core/examples/implementing-a-port.md:473-487` still imports and uses `createConfigLoader`
  - `docs/core/overview.md:249`, `docs/core/get-config.md:14-16`, and `packages/core/README.md:59-115` still refer to `createConfigLoader`
  - `docs/config/config-reference.md:18-19` and `docs/guide/configuration.md:164` still describe discovery as bounded by the `git` root rather than a VCS root
  - `docs/core/ports.md` still describes repository externality in terms of the current `git root`
- Why it matters:
  - The implemented public entrypoint is `createDefaultConfigLoader`, not `createConfigLoader`
  - The implemented behavior is VCS-neutral (`git`, `hg`, `svn`, or null), so public docs that still describe `.git/`-only or git-root-only behavior are now stale
- Interpretation:
  - Code behavior appears consistent with the change specs
  - The drift is in consumer-facing documentation and examples, not in the implementation contract itself

## No Additional Compliance Findings Observed

- No implementation mismatch was observed in the changed code paths for:
  - abstract `VcsAdapter` contract
  - adapter detection order and null fallback
  - `VcsActorResolver` delegation and null resolver fallback
  - `createDefaultConfigLoader` factory wiring
  - explicit `vcsRoot` propagation into code-graph indexing/discovery
- No failing tests, lint errors, or typecheck errors remained after the focused fixes

## Summary

- Implementation/spec mismatches found: `0`
- Test/type/lint gate failures remaining: `0`
- Compliance/documentation drift findings: `1`

## Recommendation

- The change is functionally ready from a code-verification perspective.
- Before transition beyond verification, update docs/examples/comments that still expose the old `createConfigLoader` name or `git root` wording if those surfaces are intended to stay in sync with this change.
