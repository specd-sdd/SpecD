---
status: accepted
date: 2026-03-13
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0017: Infrastructure Adapter Auto-Detection with Graceful Degradation

## Context and Problem Statement

specd supports multiple version control systems (Git, Mercurial, SVN) and needs to determine which VCS is in use at runtime. Two composition factories — `createVcsAdapter` and `createVcsActorResolver` — must select the correct concrete implementation without exposing VCS-specific classes to callers. The question is: should the system require explicit configuration, or should it probe the environment automatically? And when no VCS is detected (e.g. in a fresh directory or CI without checkout), should it fail or continue with reduced functionality?

## Decision Drivers

- Zero-configuration experience: `specd project init` should work without the user specifying which VCS they use
- Graceful degradation: specd must function (with reduced capabilities) in environments without a VCS — CI pipelines, sandboxed editors, fresh directories
- Concrete adapter classes must never appear in public exports (ADR-0015)
- The pattern should be consistent and reusable across all infrastructure adapters that have multiple implementations

## Considered Options

- Explicit configuration — user declares `vcs: git` in `specd.yaml`
- Auto-detection with hard failure — probe for VCS, throw if none found
- Auto-detection with graceful degradation — probe for VCS, fall back to a null adapter

## Decision Outcome

Chosen option: "Auto-detection with graceful degradation", because it provides the best out-of-the-box experience and handles edge environments without configuration burden.

The pattern works as follows:

1. **Ordered probing**: the factory checks for VCS presence in priority order (Git > Mercurial > SVN). Each probe is a cheap filesystem check (e.g. `.git/` directory exists, `hg root` succeeds). The first match wins.

2. **Immediate construction**: on first match, the factory constructs and returns the concrete adapter. No further probing occurs.

3. **Null adapter fallback**: when no VCS is detected, the factory returns null implementations of the VCS and actor ports. In the current implementation, `NullVcsAdapter.rootDir()` rejects, `branch()` returns `'none'`, `isClean()` returns `true`, `ref()` returns `null`, `show()` returns `null`, and `NullActorResolver.identity()` rejects because there is no identity source available.

4. **No public exposure**: the original design intent was that concrete adapter classes (`GitVcsAdapter`, `HgVcsAdapter`, `NullVcsAdapter`) remain internal to the composition layer and callers depend only on the port interfaces.

This pattern is applied identically to both `createVcsAdapter` and `createVcsActorResolver` and can be adopted by future infrastructure adapters with multiple implementations.

### Consequences

- Good, because `specd project init` works without VCS configuration — detection is automatic
- Good, because environments without a VCS (CI, sandboxed editors) still function — features that depend on VCS are gracefully disabled rather than crashing
- Good, because the pattern is reusable — any future adapter with multiple backends (e.g. artifact parsers, hook runners) can follow the same probe-then-fallback approach
- Good, because callers can still rely on the auto-detect composition entry points instead of reproducing VCS detection logic themselves
- Neutral, because the probe order is hardcoded (Git > Hg > SVN) — if a directory has both `.git/` and `.hg/`, Git wins. This is acceptable because dual-VCS setups are rare and Git is the dominant system
- Bad, because silent degradation via null adapter could mask real misconfiguration — mitigated by logging a warning when the null adapter is selected in environments where a VCS was expected

### Confirmation

- `createVcsAdapter` probes in order and returns `NullVcsAdapter` when no VCS is found
- Tests cover the null adapter path (no VCS present) and the Git adapter path

### Current implementation note

The public export surface has since evolved. Concrete VCS and actor adapters, including the null implementations, are now exported from `@specd/core` even though this ADR records the earlier intention to keep them internal. The auto-detection decision still stands; the export-surface part should be read as historical context.

## More Information

### Spec

- [`specs/core/vcs-adapter/spec.md`](../../specs/core/vcs-adapter/spec.md)
- [`specs/core/actor-resolver/spec.md`](../../specs/core/actor-resolver/spec.md)
- [`specs/_global/architecture/spec.md`](../../specs/_global/architecture/spec.md)
