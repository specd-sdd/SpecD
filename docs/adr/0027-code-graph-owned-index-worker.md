---
status: accepted
date: 2026-08-24
decision-makers: specd maintainer
consulted: '-'
informed: '-'
---

# ADR-0027: Code Graph-Owned Isolated Index Worker

## Context and Problem Statement

Graph indexing executes CPU-heavy parsing and native graph-store work while writing a
shared derived store. The former can block or terminate a delivery host; the latter
allows only one writer. The CLI previously coordinated a lock, a child process,
signals, and environment handoff itself, which duplicated graph-runtime concerns in a
delivery adapter and made the boundary difficult for other trusted hosts to reuse.

We need one version-affine, publish-shaped process boundary that preserves the CLI's
flags, output, busy behavior, and exit mapping without exposing locks or IPC as host
APIs.

## Decision Drivers

- **Host safety** — native crashes and synchronous work must not terminate or block
  the supervising host
- **Single-writer integrity** — one exact graph storage root has one lock owner for
  the child lifetime
- **Reusable ownership** — trusted SDK, CLI, MCP, or future hosts must not recreate
  lock, fork, signal, or IPC behavior
- **Clear package boundaries** — Code Graph owns graph-runtime infrastructure; SDK
  owns project orchestration; CLI presents delivery results
- **Typed failure handling** — hosts classify expected worker failures without parsing
  stderr or message text
- **Published execution** — worker and injected task resolve from installed ESM output,
  not source paths or the current working directory

## Considered Options

1. **Keep CLI-owned locking and subprocess supervision** — rejected because it makes
   graph-runtime correctness delivery-specific and cannot be reused safely by other
   hosts.
2. **Put worker supervision in SDK** — rejected because SDK would then own Code Graph
   lock and process infrastructure rather than only cross-package orchestration.
3. **Create a separate worker package** — rejected because it adds version and
   publication coordination for an implementation that is tightly coupled to the Code
   Graph storage and provider runtime.
4. **Put an isolated worker in Code Graph with an injected trusted task** — chosen.

## Decision Outcome

Code Graph exposes `runIsolatedGraphIndex` as the sole host-facing graph-index
isolation API. It accepts a storage root, one trusted installed task module, JSON
input, and an optional progress callback. Code Graph acquires the lock before forking
its own published ESM child, validates all IPC, forwards scoped `SIGINT`/`SIGTERM`,
classifies terminal outcomes as typed errors, and releases every resource before the
returned promise settles.

The parent lease is tokenized and handed only to the forked child environment so a
provider inside that child can avoid reacquiring the same exact-root lock. Lock paths,
lease tokens, handoff values, raw IPC, child bootstrap, and process adapters remain
internal. The public API is not a sandbox: callers select a version-affine task module
programmatically; no CLI task-module option exists.

SDK re-exports the high-level worker contracts and continues to own
`runIndexProjectGraph`. The CLI delegates once to the SDK worker with its packaged
task. Inside the child, that task reconstructs the selected configured or bootstrap
SDK context and invokes `runIndexProjectGraph` once. The CLI keeps flags, formatting,
per-file success semantics, busy presentation, and exit mapping, but owns no lock,
fork, IPC, or production in-process mode.

### Consequences

- Good, because graph writes are process-isolated for every production host
- Good, because all hosts share exact-root single-writer coordination and cleanup
- Good, because delivery adapters handle typed outcomes without protocol knowledge
- Good, because SDK remains a composition facade rather than a process-runtime owner
- Neutral, because task data, progress, and results must satisfy a runtime JSON model
- Bad, because child lifecycle and published-entry verification add implementation and
  test complexity

### Confirmation

This decision is confirmed when:

- a concurrent same-root run fails with the existing busy error before a second child
  starts, and every terminal path releases the lock exactly once
- a built Code Graph package forks its installed child from a CWD outside the monorepo
  and executes a built trusted task in a distinct process
- malformed, duplicate, late, and missing terminal messages produce typed worker
  failures without output or host exit side effects
- forwarded `SIGINT` and `SIGTERM` terminate only the active child, wait for cleanup,
  preserve unrelated host listeners, and permit a subsequent index
- SDK exports the high-level operation and typed failures but no raw lock or IPC API
- CLI graph indexing uses one packaged task through SDK, preserves its documented
  output and busy semantics, and has no direct Code Graph dependency or public
  in-process bypass

## Pros and Cons of the Options

### Keep CLI-owned locking and subprocess supervision

- Good, because it preserves the previous placement with little immediate movement
- Bad, because other hosts must duplicate a graph-runtime concern
- Bad, because lock and signal behavior can diverge across delivery adapters

### Put worker supervision in SDK

- Good, because hosts already depend on SDK
- Bad, because graph storage locking and process runtime would no longer be owned by
  the package that implements the provider

### Create a separate worker package

- Good, because process concerns could be independently packaged
- Bad, because tightly coupled Code Graph worker and task versions could drift
- Bad, because a new public/package publication boundary has no independent consumer

### Put an isolated worker in Code Graph with an injected trusted task

- Good, because one package owns the lock, worker entry, protocol, and provider handoff
- Good, because SDK and delivery hosts retain narrow, presentation-neutral boundaries
- Bad, because the Code Graph package must maintain child-process infrastructure

## More Information

### Spec

- [`code-graph:isolated-index-worker`](../../specs/code-graph/isolated-index-worker/spec.md)
- [`code-graph:composition`](../../specs/code-graph/composition/spec.md)
- [`sdk:composition`](../../specs/sdk/composition/spec.md)
- [`cli:graph-index`](../../specs/cli/graph-index/spec.md)
