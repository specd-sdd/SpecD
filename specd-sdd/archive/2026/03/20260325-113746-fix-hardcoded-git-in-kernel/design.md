# Design: fix-hardcoded-git-in-kernel

## Non-goals

- Adding new VCS implementations (Fossil, Pijul, etc.) — out of scope
- Changing the `VcsAdapter` or `ActorResolver` port interfaces
- Making the kernel extensible with external adapters (tracked in issue #49)

## Affected areas

### `packages/core/src/composition/kernel-internals.ts`

- Line 181: `actor: new GitActorResolver()` → `actor: await createVcsActorResolver(config.projectRoot)`
- Line 182: `vcs: new GitVcsAdapter()` → `vcs: await createVcsAdapter(config.projectRoot)`
- Add import for `createVcsActorResolver` from `./actor-resolver.js`
- Remove direct import of `GitActorResolver` from `../../infrastructure/git/actor-resolver.js`
- Remove direct import of `GitVcsAdapter` from `../../infrastructure/git/vcs-adapter.js` (only if no other usage remains)

### `packages/core/src/composition/use-cases/*.ts` (10 files)

Each of these files hardcodes `new GitActorResolver()`:

- `create-change.ts` (line 76)
- `transition-change.ts` (line 147)
- `draft-change.ts` (line 73)
- `restore-change.ts` (line 73)
- `discard-change.ts` (line 73)
- `edit-change.ts` (line 68)
- `skip-artifact.ts` (line 63)
- `validate-artifacts.ts` (line 153)
- `approve-spec.ts` (line 98)
- `approve-signoff.ts` (line 98)
- `archive-change.ts` (line 186)

In each file:

- Replace `import { GitActorResolver } from '../../infrastructure/git/actor-resolver.js'` with `import { createVcsActorResolver } from '../actor-resolver.js'`
- Replace `const actor = new GitActorResolver()` with `const actor = await createVcsActorResolver()`
- The enclosing function is already `async`, so no signature change is needed

## New constructs

_(none — this change uses existing factories)_

## Approach

Direct replacement of hardcoded constructors with existing auto-detect factory functions. The factories `createVcsAdapter` and `createVcsActorResolver` already exist in `composition/` and are already used for per-workspace VCS detection. This change makes the project-level adapters consistent.

Passing `config.projectRoot` to both factories in `kernel-internals.ts` ensures they probe the correct directory (the project root, not `process.cwd()` which may differ). The standalone factories don't have access to `config.projectRoot`, so they use the default (`process.cwd()`), which is the existing behaviour.

## Key decisions

**Pass `config.projectRoot` in kernel-internals, default in standalone factories.** The kernel has the config available and should use the explicit project root. Standalone factories are called without full config context and rely on `process.cwd()`, which is the same default as before.

## Trade-offs

**Performance:** Each auto-detect call probes for git, then hg, then svn (three subprocess calls in the worst case). In a git project, the first probe succeeds immediately. In the kernel this runs once at startup. In standalone factories it runs per-call — but standalone factories were already constructing `GitActorResolver()` per call, so the overhead is minimal (one subprocess probe vs zero).

## Migration / Rollback

No migration needed. The change is backwards-compatible — git users see identical behaviour. Rollback is a single revert.

## Testing

- Existing tests pass (they run in a git repo, so auto-detect finds git)
- No new tests needed — the auto-detect factories are already tested in their own specs (`core:core/vcs-adapter`)

## Open questions

_(none)_
