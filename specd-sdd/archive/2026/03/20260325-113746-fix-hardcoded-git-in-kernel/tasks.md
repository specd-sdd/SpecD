# Tasks: fix-hardcoded-git-in-kernel

## 1. Fix kernel-internals.ts

- [x] 1.1 Replace hardcoded git adapters with auto-detect
      `packages/core/src/composition/kernel-internals.ts`: lines 181–182
      Replace `new GitActorResolver()` → `await createVcsActorResolver(config.projectRoot)`
      Replace `new GitVcsAdapter()` → `await createVcsAdapter(config.projectRoot)`
      Add import for `createVcsActorResolver` from `./actor-resolver.js`
      Remove unused `GitActorResolver` and `GitVcsAdapter` imports
      (Req: Project-level VCS and actor adapters must use auto-detect)

## 2. Fix standalone use-case factories

- [x] 2.1 Fix create-change.ts
      `packages/core/src/composition/use-cases/create-change.ts`: line 76
      Replace `import { GitActorResolver }` → `import { createVcsActorResolver }`
      Replace `const actor = new GitActorResolver()` → `const actor = await createVcsActorResolver()`
      (Req: Use-case factories must use auto-detect for VCS-dependent adapters)

- [x] 2.2 Fix transition-change.ts
      `packages/core/src/composition/use-cases/transition-change.ts`: line 147
      Same pattern as 2.1
      (Req: Use-case factories must use auto-detect for VCS-dependent adapters)

- [x] 2.3 Fix draft-change.ts
      `packages/core/src/composition/use-cases/draft-change.ts`: line 73
      Same pattern as 2.1
      (Req: Use-case factories must use auto-detect for VCS-dependent adapters)

- [x] 2.4 Fix restore-change.ts
      `packages/core/src/composition/use-cases/restore-change.ts`: line 73
      Same pattern as 2.1
      (Req: Use-case factories must use auto-detect for VCS-dependent adapters)

- [x] 2.5 Fix discard-change.ts
      `packages/core/src/composition/use-cases/discard-change.ts`: line 73
      Same pattern as 2.1
      (Req: Use-case factories must use auto-detect for VCS-dependent adapters)

- [x] 2.6 Fix edit-change.ts
      `packages/core/src/composition/use-cases/edit-change.ts`: line 68
      Same pattern as 2.1
      (Req: Use-case factories must use auto-detect for VCS-dependent adapters)

- [x] 2.7 Fix skip-artifact.ts
      `packages/core/src/composition/use-cases/skip-artifact.ts`: line 63
      Same pattern as 2.1
      (Req: Use-case factories must use auto-detect for VCS-dependent adapters)

- [x] 2.8 Fix validate-artifacts.ts
      `packages/core/src/composition/use-cases/validate-artifacts.ts`: line 153
      Same pattern as 2.1
      (Req: Use-case factories must use auto-detect for VCS-dependent adapters)

- [x] 2.9 Fix approve-spec.ts
      `packages/core/src/composition/use-cases/approve-spec.ts`: line 98
      Same pattern as 2.1
      (Req: Use-case factories must use auto-detect for VCS-dependent adapters)

- [x] 2.10 Fix approve-signoff.ts
      `packages/core/src/composition/use-cases/approve-signoff.ts`: line 98
      Same pattern as 2.1
      (Req: Use-case factories must use auto-detect for VCS-dependent adapters)

- [x] 2.11 Fix archive-change.ts
      `packages/core/src/composition/use-cases/archive-change.ts`: line 186
      Same pattern as 2.1
      (Req: Use-case factories must use auto-detect for VCS-dependent adapters)

## 3. Verify

- [x] 3.1 Run typecheck
      `pnpm typecheck` — confirm no type errors after changes
      (Req: Project-level VCS and actor adapters must use auto-detect)

- [x] 3.2 Run tests
      `pnpm test` — confirm all tests pass
      (Req: Project-level VCS and actor adapters must use auto-detect)
