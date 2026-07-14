# Proposal: align-user-interface-with-main-conventions

## Motivation

`feat/user-interface` has accumulated Studio-specific capabilities while `main` has moved core composition, repository construction, VCS discovery, and host bootstrap to newer canonical patterns. Merging only at the text level would preserve two incompatible ways of wiring the same system and make future integrations increasingly risky.

## Current behaviour

The branch still uses `kernel-internals`, kernel-owned graph-store registration, direct construction of Git adapters, git-bounded config discovery, and the older synchronous `createConfigLoader` path. API and desktop hosts separately load config, create the kernel, configure logging, and build graph providers instead of sharing the current SDK host bootstrap.

Branch-only artifact, batch-validation, log-readback, API, and desktop capabilities do not exist on `main`. Their behaviour must be retained, but their factories currently follow the superseded branch composition model. CLI also retains direct core/code-graph dependencies and old loader entry points that `main` now routes through SDK.

## Proposed solution

Merge the post-2026-07-03 `main` changes and use the current mainline architecture as the canonical baseline. Replace branch-local kernel internals with the shared composition resolver, move graph-store ownership out of core, make VCS-sensitive factories consume resolved adapters, and adapt UI-branch hosts to the asynchronous default loader and SDK context APIs exactly as exposed by main.

Re-express branch-only use cases and Studio capabilities through `createX(deps)` plus resolver-backed convenience factories. API and desktop will compose their UI-specific hosts from main's existing `createDefaultConfigLoader` and `createSdkContext` APIs so directory discovery retains the complete config cascade, while preserving API auth/log readback and the Electron-specific graph provider. They will also map project status through one pure `@specd/client` presenter so HTTP and IPC expose the same canonical DTO without adding core or SDK dependencies to the client package. Deleted mainline abstractions will not be restored, and generic SDK improvements that belong on main will not be introduced here.

## Specs affected

### New specs

None.

### Modified specs

- `core:composition`: define shared dependency resolution, generalized storage factories, and kernel-equivalent standalone factories.
  - Depends on (added): none
  - Depends on (removed): none
- `core:kernel`: construct common and Studio-specific capabilities through one `CompositionResolver`.
  - Depends on (added): none
  - Depends on (removed): none
- `core:config`: align structured adapter bindings and storage configuration with generalized composition.
  - Depends on (added): none
  - Depends on (removed): none
- `core:config-loader`: use VCS-neutral root discovery and the asynchronous `createDefaultConfigLoader` entry point.
  - Depends on (added): none
  - Depends on (removed): none
- `core:get-project-context`: use resolver-provided parser, file, hash, and repository dependencies.
  - Depends on (added): none
  - Depends on (removed): none
- `core:get-spec-context`: use resolver-provided parser, hash, workspace, and repository dependencies.
  - Depends on (added): none
  - Depends on (removed): none
- `core:validate-specs`: resolve validation dependencies through shared composition helpers.
  - Depends on (added): none
  - Depends on (removed): none
- `core:get-change-artifact`: retain Studio artifact reads through a resolver-backed standalone factory.
  - Depends on (added): none
  - Depends on (removed): none
- `core:get-read-only-change-artifact`: retain draft/discard/archive reads through canonical composition.
  - Depends on (added): none
  - Depends on (removed): none
- `core:save-change-artifact`: retain optimistic artifact saves through resolver-provided repositories and hashing.
  - Depends on (added): none
  - Depends on (removed): none
- `core:outline-change-artifact`: retain Studio outlines through shared parser and artifact dependencies.
  - Depends on (added): none
  - Depends on (removed): none
- `core:validate-change-batch`: retain batch validation while composing the underlying validator canonically.
  - Depends on (added): none
  - Depends on (removed): none
- `core:read-log`: retain in-memory log readback while mapping logging options onto the mainline destination model.
  - Depends on (added): none
  - Depends on (removed): none
- `sdk:composition`: expose reconciled core/code-graph factories without restoring direct host coupling to infrastructure.
  - Depends on (added): none
  - Depends on (removed): none
- `sdk:host-context`: align the host bootstrap contract with the branch's adopted `createDefaultConfigLoader` and `createSdkContext` conventions, and restore spec/verify parity for Studio bootstrap requirements now exercised by API and desktop.
  - Depends on (added): none
  - Depends on (removed): none
- `code-graph-electron:composition`: provide the desktop-specific provider factory behind the same host-facing lifecycle contract.
  - Depends on (added): none
  - Depends on (removed): none
- `cli:entrypoint`: use the asynchronous default loader and preserve config warnings and no-subcommand discovery.
  - Depends on (added): none
  - Depends on (removed): none
- `api:composition-create-api-server`: compose API startup from main's default loader and SDK context while retaining auth and log destinations.
  - Depends on (added): none
  - Depends on (removed): none
- `api:routes-project-logs`: preserve ring-buffer log readback across the mainline logging-options migration.
  - Depends on (added): none
  - Depends on (removed): none
- `api:dto-project-status`: align the HTTP status contract with the canonical client DTO, including auth and optional graph/spec/approval sections.
  - Depends on (added): none
  - Depends on (removed): none
- `api:presenter-project`: delegate project-status mapping to the shared pure client presenter.
  - Depends on (added): `client:dto-project-status`, `api:dto-project-status`
  - Depends on (removed): none
- `api:handler-project`: preserve project handler behaviour while returning the unified project-status representation.
  - Depends on (added): none
  - Depends on (removed): none
- `client:dto-project-status`: remain the canonical DTO owner and expose a dependency-neutral mapper reusable by HTTP and IPC adapters.
  - Depends on (added): none
  - Depends on (removed): none
- `studio-desktop:main-kernel-lifecycle`: centralize local project bootstrap in desktop around main's config/kernel APIs plus the Electron graph provider.
  - Depends on (added): none
  - Depends on (removed): none
- `studio-desktop:ipc-handler-registry`: consume the centralized desktop host instead of constructing config, kernel, actor, and graph dependencies inside handlers.
  - Depends on (added): `client:dto-project-status`
  - Depends on (removed): none

## Impact

The highest-risk areas are core kernel composition, config loading, VCS-backed implementation tracking, SDK host context, and desktop IPC. Their graph blast radius includes lifecycle commands, context compilation, validation, CLI graph commands, API bootstrap, desktop local mode, and generated metadata.

The merge will also update core/SDK public exports, CLI package dependencies, API and desktop tests, `specd.yaml`, configuration documentation, spec locks, and metadata. Artifact semantics, authentication behaviour, and persisted data formats are not intended to change. The project-status HTTP and IPC representations will converge on the existing canonical client DTO. The current design-review blocker is an `sdk:host-context` spec/verify parity failure around Studio host bootstrap, so the proposal now explicitly includes that spec in scope.

## Technical context

The merge base is `971da76885d65ba238cec79cc9986c24ba695b04`; `main` was analyzed at `aa9c8ae3a3435fb8638ab97ce8bc918d888f5807`. The relevant incoming work is concentrated in decoupled composition factories, generalized repository factories, and elimination of Git-specific hardcoding.

`main` replaces `kernel-internals.ts` with `composition-resolver.ts`, renames kernel registries to composition registries, makes default config loading asynchronous, and removes graph-store registration from core. Branch-only factories must therefore be ported rather than copied from either side unchanged.

Desktop cannot use the standard SDK graph provider directly because its main process uses `@specd/code-graph-electron`. The reconciled design must preserve that runtime boundary in desktop-owned composition, reuse main's loader/kernel APIs, and eliminate unsafe host-context casts without extending the generic SDK from this branch. It must use discovery mode rather than forcing `<projectRoot>/specd.yaml`, so local config cascade layers remain active.

API and desktop currently duplicate project-status DTO presentation. The shared mapper will live in `@specd/client` and accept structural data, preserving the package boundary by avoiding core and SDK imports.

Compiled-context Markdown rendering is also duplicated between API and desktop, but its consolidation is explicitly deferred. It is an independent presentation refactor and is not part of this change's specs, design, implementation, or verification scope.

The repository-level validation failure that forced this redesign is outside pure implementation: `sdk:host-context` currently has verify scenarios for Studio host bootstrap that are not matched by requirement prose in `spec.md`. That semantic drift must be repaired in the design artifacts before the change can return to `ready`.
