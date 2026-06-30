# core:implementation-detector-port

## Purpose

Change lifecycle entry points need a backend-agnostic way to discover potentially relevant implementation files without binding themselves directly to VCS tools or future alternative detectors. `ImplementationDetector` is the application-layer port that exposes that detection capability.

## Requirements

### Requirement: Detector interface

The implementation detector SHALL expose an operation that returns modified implementation-file candidates for a change.

```typescript
interface ImplementationDetectorOptions {
  readonly excludePaths?: readonly string[]
}
```

- `detectModifiedFiles(change, options?)` MUST return project-relative file paths representing files changed for the supplied change context
- when `options.excludePaths` is provided, the detector MUST exclude any returned path that falls under one of those project-relative portable directory prefixes

The detector itself owns baseline-resolution policy for that change context. Callers provide the change; they do not compute or pass a raw VCS baseline reference themselves.

The returned paths are candidate inputs for tracked implementation review. The detector does not itself classify files as linked, resolved, or ignored.

### Requirement: Targeted lifecycle use

Implementation detection MUST be demand-driven rather than background-driven.

The port MUST be invoked by `RefreshImplementationTracking` when VCS-backed candidate discovery is required.

The port MUST NOT be invoked directly by `GetStatus`, `TransitionChange`, or `CompileContext`.

The `Change` entity itself MUST NOT invoke the port.

### Requirement: Backend independence

The port MUST remain independent of any specific backend technology.

VCS-backed detection is the first implementation, but future implementations MAY use other strategies as long as they return the same project-relative candidate path contract.

## Constraints

- Returned paths MUST be forward-slash-normalized.
- Returned paths MUST be relative to the project root.
- The detector MUST NOT assign workspace identities to returned paths.
- `excludePaths` entries MUST be interpreted as forward-slash-normalized project-relative paths.

## Spec Dependencies

- [`core:change`](../change/spec.md) — change context supplied to the detector
- [`core:refresh-implementation-tracking`](../refresh-implementation-tracking/spec.md) — application use case that invokes this port
