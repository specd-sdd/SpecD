---
title: SpecdDataPort
sidebar_position: 2
---

# SpecdDataPort

`SpecdDataPort` is the **single aggregated interface** for Studio data access. `@specd/ui` hooks depend on this type via React context — they never call `fetch` directly.

It is the intersection of port slices:

| Port                    | Responsibility                                                   |
| ----------------------- | ---------------------------------------------------------------- |
| `PortProject`           | `getProject`, `getProjectStatus`, project context/schema         |
| `PortChangesCollection` | List/create changes, drafts, discarded, overlaps                 |
| `PortChangesRead`       | Change detail, status, artifacts, preview, context, instructions |
| `PortChangesMutate`     | Save, transition, validate, archive, edit, approvals, …          |
| `PortArchivedChanges`   | Archived change reads                                            |
| `PortWorkspacesSpecs`   | Workspaces, spec tree, spec detail/search paths                  |
| `PortGraph`             | Graph status, search, impact, index, change graph view           |
| `PortStudioPanel`       | Project logs and Studio output buffer                            |

## Implementations

| Adapter                  | Use case                                |
| ------------------------ | --------------------------------------- |
| `RemoteSpecdDataAdapter` | Browser Studio, tests against real API  |
| `MemorySpecdDataAdapter` | Unit tests, UI fixtures without network |
| Desktop IPC              | Electron renderer (envelope in `ipc/`)  |

## Typing

```typescript
import type { SpecdDataPort } from '@specd/client'
```

Method signatures live on the individual `port-*.ts` modules; `SpecdDataPort` re-exports their union.

Input types for mutating calls are in `inputs.ts` (`CreateChangeInput`, `SaveChangeArtifactInput`, `TransitionChangeInput`, …).

## DTOs

Response types are in `packages/client/src/dto/` and match API presenters. Import from `@specd/client` (barrel re-exports `dto/index`).

When the API adds a field, update the presenter, client DTO, and port method together.
