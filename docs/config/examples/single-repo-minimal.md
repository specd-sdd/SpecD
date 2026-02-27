# Example: Single-repo project with minimal configuration

## When to use this setup

This is the starting point for most projects: a single git repository, a published npm schema, and no approval gates or external workspaces. If you are setting up specd for the first time, start here. Run `specd init` to generate this structure automatically.

## specd.yaml

```yaml
schema: '@specd/schema-std'

workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs/

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
```

## What this configuration does

**Schema** — `@specd/schema-std` is the standard specd schema, installed as an npm package. specd loads it from `node_modules/@specd/schema-std/schema.yaml`. Schema version selection is handled by npm via your `package.json`.

**Workspace** — the single `default` workspace points specd at `specs/` in your project root. All spec files live there. `codeRoot`, `schemas`, and `ownership` are omitted and take their defaults: the project root, `specd/schemas`, and `owned` respectively.

**Storage** — the four storage directories map the full lifecycle: `specd/changes/` for active work, `specd/drafts/` for shelved changes, `specd/discarded/` for abandoned changes, and `specd/archive/` for completed work. `specd init` adds `specd/drafts/` and `specd/discarded/` to `.gitignore` by default — they are local-only unless your team opts in to committing them.

**Context** — with no `contextIncludeSpecs` declared, the default applies: all specs in the `default` workspace are included in compiled context. No specs are excluded.

**Approvals** — both gates (`spec` and `signoff`) are disabled by default. The change lifecycle flows freely: `ready → implementing` and `done → archivable` require no human approval.
