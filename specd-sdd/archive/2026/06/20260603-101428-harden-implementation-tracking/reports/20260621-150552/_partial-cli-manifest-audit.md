# Partial Spec Compliance Audit

Change: `harden-implementation-tracking`  
Scope: `cli:change-implementation`, `core:change-manifest`  
Mode: change-scoped partial audit, read-only

## Findings

### 1. High: `resolve` can resolve files that are not currently resolvable under the spec

Affected implementation:

- [packages/core/src/application/use-cases/update-implementation-tracking.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/update-implementation-tracking.ts:228)

Why this is a finding:

- The in-change `cli:change-implementation` spec says `resolve` marks tracked files as fully reviewed, must update tracked-file review state only, and files in `removed` state must not be resolved until refresh resurrects them.
- `_applyResolve()` only checks physical existence, then unconditionally calls `change.trackImplementationFile(file, 'resolved')`.
- That means:
  - an untracked existing file can be introduced directly as `resolved`
  - a tracked `removed` file that reappears on disk can be resolved directly without the required refresh-driven resurrection

Evidence:

- [packages/core/src/application/use-cases/update-implementation-tracking.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/update-implementation-tracking.ts:232)
- Current tests only cover missing-file rejection and the normal tracked-open happy path, not `removed`-but-existing or untracked-existing inputs: [packages/core/test/application/use-cases/update-implementation-tracking.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/update-implementation-tracking.spec.ts:74)

Assessment:

- Implementation bug.
- Test coverage gap.

### 2. High: `ignore` rejects linked files even though the scoped spec defines it as a tracked-state change, not a link mutation

Affected implementation:

- [packages/core/src/application/use-cases/update-implementation-tracking.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/update-implementation-tracking.ts:199)

Why this is a finding:

- The in-change `cli:change-implementation` spec defines `ignore` as moving tracked files into `ignored` review state while preserving tracked history.
- It does not require confirmed implementation links to be removed first.
- `_applyIgnore()` scans live links for the file and throws `ImplementationLinksExistError` when any exist, preventing the state change entirely.
- That behavior couples review-state management to link deletion, which conflicts with the scoped requirement that `ignore` operate on tracked-file state rather than rewriting implementation links.

Evidence:

- [packages/core/src/application/use-cases/update-implementation-tracking.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/application/use-cases/update-implementation-tracking.ts:210)
- The current tests encode the rejecting behavior rather than the scoped spec behavior: [packages/core/test/application/use-cases/update-implementation-tracking.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/core/test/application/use-cases/update-implementation-tracking.spec.ts:176)

Assessment:

- Implementation bug relative to the in-change CLI spec.
- Test suite currently reinforces the non-compliant behavior.

### 3. Medium: composed-member stale-symbol fallback ignores symbol kind, so it can clear stale diagnostics on the wrong symbol

Affected implementation:

- [packages/cli/src/commands/change/\_implementation-tracking.ts](/Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/change/_implementation-tracking.ts:83)

Why this is a finding:

- The in-change `cli:change-implementation` spec says the fallback should retry stale resolution using the rightmost member segment plus the graph-reported symbol kind.
- The implementation retries by `name + filePath` only.
- If the exact symbol string is absent and the same file contains exactly one suffix match of the wrong kind, the CLI will clear the stale diagnostic anyway.
- That weakens the review signal and can incorrectly present a stale archived/confirmed symbol link as healthy.

Evidence:

- Fallback query omits kind filtering: [packages/cli/src/commands/change/\_implementation-tracking.ts](/Users/monki/Documents/Proyectos/specd/packages/cli/src/commands/change/_implementation-tracking.ts:92)
- The current CLI test suite explicitly treats a unique `property` match as enough to clear stale for `Change.transition`, which demonstrates the missing kind check: [packages/cli/test/commands/change-implementation-tracking.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/cli/test/commands/change-implementation-tracking.spec.ts:85)
- This also conflicts with the dependency contract in `code-graph:symbol-model`, where relation staleness is tied to concrete symbol identity rather than best-guess same-name presence.

Assessment:

- Implementation bug.
- Test coverage gap for wrong-kind fallback cases.

### 4. Medium: the in-change `core:change-manifest` schema-name-mismatch rule contradicts both implementation and its `core:change` dependency

Affected implementation:

- [packages/core/src/infrastructure/fs/change-repository.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/change-repository.ts:1047)

Why this is a finding:

- The merged `core:change-manifest` preview says schema name and version differences should emit warnings and leave the change usable.
- `FsChangeRepository` still throws `SchemaMismatchError` on schema-name mismatch and only warns on version mismatch.
- The existing `core:change` dependency also still says schema-name mismatch throws.
- This is a spec inconsistency inside the scoped change: the merged manifest spec, the dependency spec, and the implementation do not agree on the same behavior.

Evidence:

- Throw on name mismatch: [packages/core/src/infrastructure/fs/change-repository.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/change-repository.ts:1048)
- Regression test locking in the throw behavior: [packages/core/test/infrastructure/fs/change-repository.spec.ts](/Users/monki/Documents/Proyectos/specd/packages/core/test/infrastructure/fs/change-repository.spec.ts:1914)

Assessment:

- Spec contradiction.
- Implementation currently matches the dependency spec, not the merged manifest spec.

### 5. Medium: `removed` tracking state is implemented and required by the scoped specs, but the direct dependency `core:change` still permits only three states

Affected implementation:

- [packages/core/src/domain/entities/change.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/domain/entities/change.ts:210)
- [packages/core/src/infrastructure/fs/manifest.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/manifest.ts:318)

Why this is a finding:

- The merged `cli:change-implementation` and `core:change-manifest` specs both rely on a fourth tracked-file state, `removed`.
- The implementation also already models and persists `removed`.
- But the direct dependency `core:change` still states that tracked implementation files carry only `open`, `resolved`, or `ignored`.
- That means the scoped change is not yet internally consistent with one of its declared dependencies.

Evidence:

- Domain model includes `removed`: [packages/core/src/domain/entities/change.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/domain/entities/change.ts:211)
- Manifest schema includes `removed`: [packages/core/src/infrastructure/fs/manifest.ts](/Users/monki/Documents/Proyectos/specd/packages/core/src/infrastructure/fs/manifest.ts:320)
- Dependency spec still lists only three states: [specs/core/change/spec.md](/Users/monki/Documents/Proyectos/specd/specs/core/change/spec.md:96)
- The current permanent `core:change-manifest` spec file is likewise still on the old three-state wording, which further indicates the in-change delta has not yet been reconciled with related specs: [specs/core/change-manifest/spec.md](/Users/monki/Documents/Proyectos/specd/specs/core/change-manifest/spec.md:60)

Assessment:

- Spec contradiction.
- Code and in-change deltas are aligned with each other here; the dependency/global spec surface is lagging.

## Coverage Notes

- `cli:change-implementation`
  - Good coverage exists for basic add/remove/ignore/unresolve flows and for ambiguous same-file fallback cases.
  - Missing coverage remains for:
    - `resolve` on a `removed` file that now exists again
    - `resolve` on an untracked existing file
    - `unresolve` on an untracked existing file
    - stale fallback where the only same-file suffix match has the wrong symbol kind

- `core:change-manifest`
  - Persistence coverage is strong for round-tripping implementation tracking, atomic writes, and filename normalization.
  - The current repository tests intentionally preserve the old schema-name mismatch throw behavior, so they currently expose the spec contradiction rather than resolving it.

## Residual Risks

- Because `review` and `list` share the same enrichment path, the stale-symbol fallback defect affects both operator-facing inspection commands.
- Because `resolve` mutates state through `trackImplementationFile(...)`, an agent can create a superficially complete implementation-review state without ever passing through the intended refresh/open workflow.
- The dependency-spec inconsistencies around `removed` and schema-name mismatch increase the chance of future regressions even if code is updated, because different packages are currently justified by different spec texts.

## Verdict

- Findings: 5
- Implementation mismatches: 3
- Spec contradictions: 2
- Testing gaps called out: 4
