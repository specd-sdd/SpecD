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

**Archiving** applies the spec deltas to the live specs directory and moves the completed change to `.specd/archive/`.

### Approval gates

Two optional approval gates can be configured between lifecycle steps:

```
  ready --> [gate: plan vs specs] --> implementing
  done  --> [gate: code vs specs] --> archivable
```

When enabled, specd runs a compliance check at each gate. If the planned artifacts or implementation do not satisfy the specs, the change is pushed back with a violation report. The agent must address the issues before advancing. See [Workflow Reference](../../workflow.md) for details.
