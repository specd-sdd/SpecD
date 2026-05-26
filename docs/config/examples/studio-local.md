---
title: Studio local development
sidebar_position: 5
---

# Studio local development

Example `specd.yaml` for running SpecD Studio on a developer machine with a **dev-server UI plugin** and optional extra CORS origins.

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
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive

plugins:
  agents:
    - name: '@specd/plugin-agent-claude'
  ui:
    - name: '@specd/studio-web'

api:
  auth:
    type: disabled
  cors:
    origins:
      - http://127.0.0.1:5174
      - http://localhost:5174
```

## Notes

- Install plugins with `specd plugins install` before relying on this file.
- `specd ui serve` adds the plugin’s live UI origin to CORS automatically; explicit `api.cors.origins` covers standalone Vite (`pnpm --filter @specd/studio-web dev`) or custom clients.
- For a single-origin setup without Vite, switch `plugins.ui` to `@specd/plugin-ui-studio` and omit `cors` unless you need additional origins.

## Commands

```bash
specd plugins install @specd/studio-web
specd ui serve --open
```

See [Studio getting started](../../studio/getting-started.md).
