## The lifecycle at a glance

A change moves through a series of named states from creation to completion:

```
  create
    |
    v
  drafting --> designing --> ready --> implementing --> verifying --> done --> archivable
    ^                                                                              |
    |                                                                           archive
    |
  [pause: drafts]          [discard: discarded]
```

- **drafting** — the change exists but work has not fully started
- **designing** — the design and task artifacts are being produced
- **ready** — design is complete; the agent is ready to implement
- **implementing** — code is being written
- **verifying** — the implementation is being checked against the specs
- **done** — verification is complete; the change is ready to be archived
- **archivable** — all gates have passed; the change can be archived

**Pausing** a change moves it to `.specd/drafts/`. It is preserved as-is and can be resumed later.

**Discarding** a change moves it to `.specd/discarded/`. The work is retained for reference but the change is no longer active.

**Archiving** applies spec deltas to the live specs directory and moves the completed change to `.specd/archive/`. The change stays in `archivable` until preflight passes; it enters `archiving` only for the commit phase (publication and archive move). If that phase fails, batch restore may roll the change back to `archivable` for retry, or leave it in `archiving` with escape transitions to `archivable` or `designing`. See [Change Lifecycle Guide](../../workflow.md#archiving).

### Approval gates

Two optional human-approval gates can be configured on the same delivery edges:

```
  ready --> [approve spec, stay in ready] --> implementing
  done  --> [approve signoff, stay in done] --> archivable
```

When enabled, a human records consent with `specd changes approve spec` or `specd changes approve signoff`. The change does **not** move to a parking state. Until approval is recorded, `ready → implementing` / `done → archivable` is blocked (`APPROVAL_REQUIRED`). See [Change Lifecycle Guide](../../workflow.md#approval-gates) for details.

### Validity

Status reconciles fingerprints before it describes the change. A required spec approval that is stale or revoked returns the change to `designing` when the state is already later than `designing`. A required sign-off that is stale or revoked returns the change to `done` only when the state is later than `done`. Ordinary artifact drift returns to `designing` only when the change's workflow policy is `redesign`. `preserve` keeps the current phase and reviews artifacts in place. Recovery never moves a change forward, and stale verification never moves the lifecycle.

Verification evidence is recorded in place with `specd changes verification start` and `complete`. Transitions check that evidence at `verifying → done`. They do not capture or complete it. Task artifacts are left out of approval fingerprints. Incomplete tasks still block the transitions that require them. See [Validity and verification](../../workflow.md#validity-and-verification).
