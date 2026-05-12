# Proposal: fix-hardcoded-git-in-kernel

## Motivation

`createKernelInternals` hardcodes `new GitActorResolver()` and `new GitVcsAdapter()` for the project-level adapters. This means specd silently fails or produces incorrect results when the project uses Mercurial, Subversion, or no VCS at all. The auto-detect factories (`createVcsAdapter`, `createVcsActorResolver`) already exist and are already used for per-workspace VCS detection — they just aren't used for the project-level adapters.

The same problem exists in the 10 standalone use-case factory functions under `composition/use-cases/`, which all hardcode `new GitActorResolver()`.

## Current behaviour

- `createKernelInternals()` (lines 181–182) constructs `new GitActorResolver()` and `new GitVcsAdapter()` without passing a `cwd`, defaulting to `process.cwd()`. If the project is not a git repo, `GitVcsAdapter` methods fail and `GitActorResolver` returns empty/incorrect identity.
- The per-workspace VCS detection (line 129) correctly uses `createVcsAdapter(ws.specsPath)`, which auto-detects git/hg/svn/null.
- The standalone use-case factories in `composition/use-cases/` (create-change, transition-change, draft-change, restore-change, discard-change, edit-change, skip-artifact, validate-artifacts, approve-spec, approve-signoff, archive-change) all hardcode `new GitActorResolver()`.

## Proposed solution

Replace the hardcoded git constructors with the existing auto-detect factories:

1. In `createKernelInternals()`: replace `new GitActorResolver()` with `await createVcsActorResolver(config.projectRoot)` and `new GitVcsAdapter()` with `await createVcsAdapter(config.projectRoot)`.
2. In each standalone use-case factory: replace `new GitActorResolver()` with `await createVcsActorResolver()`.

No new code is needed — the factories already exist and handle the full detection chain (git → hg → svn → null).

## Specs affected

### New specs

_(none)_

### Modified specs

- `core:core/kernel`: add requirement that project-level VCS and actor adapters must use auto-detect factories, not hardcoded implementations.

## Impact

- `packages/core/src/composition/kernel-internals.ts` — two lines changed
- `packages/core/src/composition/use-cases/*.ts` — 10 files, one line each
- No API changes — `Kernel` interface and `KernelOptions` are unchanged
- No behaviour change for git users — auto-detect finds git first

## Open questions

_(none — the auto-detect factories already exist and are battle-tested in the workspace loop)_
