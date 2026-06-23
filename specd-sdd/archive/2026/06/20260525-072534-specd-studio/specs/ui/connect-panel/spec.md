# Connect Panel

## Purpose

Studio UI for **Connect Panel**: user-visible layout and actions driven exclusively through `SpecdDataPort` hooks. Remote Studio connection: API base URL and optional token (standalone web and desktop remote profile).

## Requirements

### Requirement: view is composed using shadcn primitives

The Connect Panel MUST be composed using shadcn `Card`, `Input`, `Button`, and `Alert` components to ensure consistency with the Studio design system.

### Requirement: connect panel collects API URL and optional token

The form MUST require API base URL and MAY collect an optional bearer token. “Test connection” MUST call `GET /v1/project` or health before saving the profile.

### Requirement: connect panel displays auth type from API only

After a successful test, the UI MUST show `auth.type` from the API response and MUST NOT read `specd.yaml` in the browser renderer.

### Requirement: embedded Studio skips connect panel gating

When `SpecdApp` runs in embedded mode (`specd ui serve`), the connect panel MUST NOT block access to the IDE.

## Spec Dependencies

- [`client:specd-data-port`](../../client/specd-data-port/spec.md) — data access
- [`client:adapter-remote-specd-data`](../../client/adapter-remote-specd-data/spec.md) — remote profile
