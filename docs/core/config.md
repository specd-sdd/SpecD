# Core Config

This document summarizes the project-level config shape used by core use cases and adapters.

## Config file

Core writes and mutates `specd.yaml` through `ConfigWriter` and reads it through `ConfigLoader`.

For plugin management, the relevant section is:

```yaml
plugins:
  agents:
    - name: '@specd/plugin-agent-claude'
    - name: '@specd/plugin-agent-copilot'
    - name: '@specd/plugin-agent-codex'
    - name: '@specd/plugin-agent-opencode'
      config:
        someKey: someValue
```

## Plugin declaration model

- `plugins` is a map of plugin type buckets.
- The current CLI flow uses `agents`.
- Each entry has:
  - `name` (required package name)
  - `config` (optional object passed to plugin update/install flows)

Core guarantees:

- Add/update declaration by `(type, name)` key.
- Remove declaration by `(type, name)`.
- List declarations by type or across all types.

## Initialization defaults

`InitProject` writes a baseline `specd.yaml` with:

- `schema`
- `workspaces`
- `storage`

Plugin declarations are optional at initialization and are added later by plugin commands or `project init --plugin`.
