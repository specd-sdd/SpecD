# Example: Multi-repo coordinator

## When to use this setup

Use this setup when one repository acts as a coordinator for spec work that spans multiple service repositories. The coordinator declares each service as a workspace pointing at that service's spec directory. Changes can target specs across any combination of workspaces, and the coordinator's archive records the full history of cross-service spec work.

This pattern is also common in monorepos where different packages have separate spec directories and different teams own each area.

## specd.yaml

```yaml
schema: '@specd/schema-std'

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/
    codeRoot: ./

  auth:
    specs:
      adapter: fs
      fs:
        path: ../auth-service/specd/specs
    codeRoot: ../auth-service
    ownership: owned

  payments:
    specs:
      adapter: fs
      fs:
        path: ../payments-service/specd/specs
    codeRoot: ../payments-service
    ownership: owned

  platform:
    specs:
      adapter: fs
      fs:
        path: ../platform-repo/specd/specs
    codeRoot: ../platform-repo
    ownership: readOnly

storage:
  changes:
    adapter: fs
    fs:
      path: specd/changes
  drafts:
    adapter: fs
    fs:
      path: specd/drafts
  discarded:
    adapter: fs
    fs:
      path: specd/discarded
  archive:
    adapter: fs
    fs:
      path: specd/archive
      pattern: '{{year}}/{{change.archivedName}}'

workflow:
  - step: archiving
    hooks:
      post:
        - run: 'git -C {{codeRoot}} checkout -b specd/{{change.name}}'
```

## What this configuration does

**Workspaces** — each service repository is declared as a named workspace with its own `specs.fs.path` and `codeRoot`. specd reads specs from those paths at their locations on disk relative to the coordinator's `specd.yaml`; the service repos are not required to have their own `specd.yaml`.

**Ownership** — `auth` and `payments` are marked `owned`, meaning the coordinator freely proposes changes to their specs. `platform` is `readOnly` — the coordinator can read its specs for context but does not modify them. The `readOnly` designation is enforced by specd when a change attempts to create or modify specs under that workspace.

**Archive pattern** — `{{year}}/{{change.archivedName}}` organises archived changes into yearly subdirectories, e.g. `specd/archive/2024/2024-01-15-add-auth-flow/`. This makes the archive easier to browse as it grows.

**Post-archive hook** — after each change is archived, specd runs `git -C {{codeRoot}} checkout -b specd/{{change.name}}` in the primary workspace's code root. `{{codeRoot}}` resolves to the absolute path of the active workspace's `codeRoot` at runtime — for a change in the `auth` workspace, it resolves to the absolute path of `../auth-service`.

**Context** — with no `contextIncludeSpecs` declared at the project or workspace level, the defaults apply: each workspace includes all its own specs when it is active in the current change. A change that touches both `auth` and `payments` specs activates both workspaces and loads all specs from each.

**Independent configs** — each service repo may have its own `specd.yaml` where it is the `default` (`owned`) workspace. The coordinator's config coexists with those independently — specd never reads the `specd.yaml` of an external workspace. If a service repo's spec directory changes path, the coordinator's config must be updated manually.
