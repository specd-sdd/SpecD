# Spec ID Format

## Overview

A **spec ID** is the canonical string that identifies a spec within a specd project. Every spec belongs to exactly one workspace and has a capability path within that workspace. This spec defines the canonical format, parsing rules, and storage conventions for spec IDs to eliminate ambiguity between workspace prefixes and capability path segments.

## Requirements

### Requirement: Canonical format

The canonical spec ID format SHALL be `workspace:capabilityPath`, where:

- `workspace` is the workspace name (e.g. `default`, `billing`)
- `capabilityPath` is the slash-separated path to the spec within the workspace (e.g. `auth/login`, `_global/architecture`)

The workspace and capability path are separated by `:` (colon). All `/` characters belong to the capability path.

This format is used everywhere: internal storage (`change.specIds`, manifest), domain-layer references, CLI input, metadata `dependsOn`, and user-facing output. There is a single format — no internal vs external distinction.

### Requirement: Bare path shorthand

When no `:` is present, the spec ID SHALL be interpreted as a capability path in the `default` workspace.

For example, `auth/login` with no colon resolves to workspace `default`, capability path `auth/login`. Its fully-qualified form is `default:auth/login`.

### Requirement: Unknown workspace rejection

When a colon-qualified spec ID specifies a workspace name that does not exist in the project configuration, the parser SHALL reject the input with an error.

### Requirement: Parsing rules

Parsing a spec ID string SHALL follow these steps:

1. Find the first `:` in the string.
2. If found: everything before `:` is the workspace, everything after is the capability path. Validate the workspace exists.
3. If not found: workspace is `default`, the entire string is the capability path.

There is no slash-based workspace detection. The `/` character is never used as a workspace separator.

### Requirement: Normalization

Functions that accept spec IDs SHOULD normalize bare paths to fully-qualified form (`default:capPath`) at the system boundary. Domain-layer code MAY assume spec IDs are already qualified.

## Constraints

- Workspace names MUST NOT contain `/` or `:` characters
- Capability paths MUST NOT contain `:` characters
- The separator is always `:` (colon) — `/` is never a workspace separator
- The `default` workspace is implicit when no colon is present

## Examples

| Input                        | Workspace | Capability path        | Fully-qualified                |
| ---------------------------- | --------- | ---------------------- | ------------------------------ |
| `auth/login`                 | `default` | `auth/login`           | `default:auth/login`           |
| `default:auth/login`         | `default` | `auth/login`           | `default:auth/login`           |
| `default:common/conventions` | `default` | `common/conventions`   | `default:common/conventions`   |
| `billing:auth/login`         | `billing` | `auth/login`           | `billing:auth/login`           |
| `billing:invoices/create`    | `billing` | `invoices/create`      | `billing:invoices/create`      |
| `_global/architecture`       | `default` | `_global/architecture` | `default:_global/architecture` |
| `unknown:some/path`          | _(error)_ | —                      | _(rejected)_                   |

## Spec Dependencies

- [change](../change/spec.md) — defines the Change entity that stores `specIds` and `specDependsOn`
- [change-manifest](../change-manifest/spec.md) — defines manifest serialization of `specIds`
- [spec-metadata](../spec-metadata/spec.md) — defines `dependsOn` field that uses colon-qualified format
- [compile-context](../compile-context/spec.md) — uses `_parseSpecId` to split canonical spec IDs
- [`specs/core/workspace/spec.md`](../workspace/spec.md) — workspace-qualified spec ID format definition
