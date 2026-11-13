---
title: Plugins
description: How SpecD plugins declare contributions, how projects select them, and how the CLI installs them.
sidebar_position: 13
---

# Plugins

A plugin is one package that contributes one or more features. The package manifest lists those contributions. The project config selects which plugins run and, optionally, which contributions.

## Names and addresses

Plugin package names are scoped: `@scope/name`. A contribution id is a single token such as `claude`. The address of a contribution is `@scope/name.id`, with exactly one dot between the package name and the id.

## Project config

```yaml
configVersion: 2
plugins:
  - name: '@specd/plugin-agent-claude'
  - name: '@acme/checks'
    contributions:
      - lint
    config:
      strict: true
```

`configVersion` may be absent and otherwise accepts any positive integer up to the current version (`2`); an absent version means the current one. A `plugins` object shaped like the old `plugins.agents` list is rejected with `LEGACY_CONFIG_FORMAT`. A newer `configVersion` than the current one is rejected with `UNSUPPORTED_CONFIG_VERSION`.

`contributions` is an allowlist of ids. Leave it out to select every contribution the manifest declares. `config` is validated against the manifest `configSchema` when the plugin loads.

Cascade layers merge plugins by name: the same name is replaced in place, and a new name is appended. An extending layer removes a plugin with `remove.plugins: [{ name: '@scope/name' }]`.

## Manifest

Each plugin package ships `specd-plugin.json`:

```json
{
  "schemaVersion": 2,
  "name": "@specd/plugin-agent-claude",
  "version": "0.2.0",
  "contributes": {
    "agents": {
      "claude": { "description": "Claude Code skills" }
    }
  },
  "configSchema": {
    "type": "object",
    "properties": {
      "model": { "type": "string" }
    },
    "additionalProperties": false
  },
  "defaultConfig": {}
}
```

`contributes` groups ids by kind. The built-in kind is `agents`. Other kinds are accepted only when the host registers a handler for them; the `specd` CLI registers none, so `specd plugins install` rejects a plugin that declares another kind with `UnknownContributionKindError`. Ids are unique across every kind in one manifest.

`configSchema` is a small JSON Schema subset: `type`, `properties`, `required`, `items`, `enum`, `default`, and `additionalProperties`. The root type is `object`, `required` must be an array of strings, `additionalProperties` a boolean, `items` a single schema, and `enum` a non-empty array. A node that breaks one of these rules, or any other keyword, is rejected when the plugin loads. `defaultConfig` is returned by install and written into `specd.yaml` only when the CLI persists a new declaration.

## Lifecycles

Install, update, and uninstall call the plugin's install or uninstall function with the project config, the selected contributions, and any options. They do not call `init`.

Host startup is separate. `createSdkContext` loads every declared plugin, calls `init` in declaration order, then activates handlers that define `activate`. `destroy` runs in reverse order when the host is disposed. Pass `plugins: false` when a command must read the config without initializing plugins. The CLI does this for `plugins`, `project init`, `project update`, `config show`, and the graph-index worker.

## Commands

```bash
specd plugins install @specd/plugin-agent-claude
specd plugins install @acme/checks --contributions lint,scan
specd plugins list
specd plugins show @specd/plugin-agent-claude
specd plugins update
specd plugins uninstall @specd/plugin-agent-claude
specd project update
```

`--contributions` applies to a single plugin and needs at least one id (an empty value is rejected with exit code `1`). A name that is already declared is skipped with a warning that points at `specd plugins update`. `plugins update` reports each plugin as `updated` or `error`, and its JSON output includes `hasErrors`. `project update` reinstalls every declared plugin, does not rewrite `specd.yaml`, and includes `hasErrors` in JSON output.

## Shared agent files

Agent plugins that write next to `shared.md` record their id in `<shared>/.owners.json`. They register it before the first shared file is written, so an install that fails after some shared files were written still leaves the marker and a later uninstall can release it:

```json
{ "owners": ["claude", "codex"] }
```

The list is sorted and unique. A missing or invalid marker is left untouched. The last owner removes the marker, `shared.md`, and the managed agent files, then removes the shared folder when it is empty. A foreign file in that folder keeps the folder. Uninstalling one skill or one agent does not release ownership.

## Claude skill frontmatter

The Claude plugin writes the skill keys that Claude Code reads, hyphenated: `allowed-tools`, `argument-hint`, `disable-model-invocation` and `user-invocable` (plus `when_to_use` and `model`). The manual-only `specd-fasttrack` skill carries `disable-model-invocation: true`. Earlier versions wrote snake_case keys, which Claude Code ignores; skills installed by those versions keep the old keys until you run `specd plugins update` (or `specd project update`).

## Safe uninstall

A filtered uninstall (`skills` or `agents` selection) only removes specd-managed items. Names that are not managed, or that contain a path separator or `..`, are skipped and never touched. A full uninstall removes the managed agent files from the runtime agents directory and from the shared folder.

## Errors

Every error that `@specd/plugin-manager` lets escape is a `SpecdError` with a stable `code`, so the CLI prints it with the standard exit code and, with `--format json|toon`, as structured output. Failures inside plugin code are wrapped with the original kept as `cause`:

| Phase                                                                                  | Error                                                       | Notes                                                                                                                     |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Package not found                                                                      | `PluginNotFoundError`                                       | install the package and check the name in `specd.yaml`                                                                    |
| Manifest missing, not JSON or invalid                                                  | `PluginValidationError`                                     | `fields` names what failed; `cause` holds the read or parse error                                                         |
| Entry module fails to import                                                           | `PluginValidationError` (`entry`)                           | `cause` is the import error                                                                                               |
| `create()` factory throws                                                              | `PluginValidationError` (`create`)                          | a `SpecdError` thrown by the factory is passed through unchanged                                                          |
| Config does not match `configSchema`                                                   | `InvalidPluginConfigError`                                  | lists every issue                                                                                                         |
| Unsupported or malformed schema keyword                                                | `UnsupportedSchemaKeywordError`                             | `keyword` names the offending keyword                                                                                     |
| Unknown contribution id or kind                                                        | `UnknownContributionError` / `UnknownContributionKindError` |                                                                                                                           |
| A contribution-kind handler (`validatePlugin`, block schema) or a plugin getter throws | `PluginValidationError` (`contributes.<kind>` / `plugin`)   | `cause` is the thrown value; a `SpecdError` is passed through                                                             |
| A caller-supplied loader rejects with a plain error                                    | `PluginValidationError` (`load`)                            | `cause` is the original error                                                                                             |
| `init` or handler `activate` throws                                                    | `PluginInitError`                                           | plugins already initialized are destroyed first; failures go in `rollbackErrors`                                          |
| One or more `destroy` calls throw                                                      | `PluginDestroyError`                                        | `errors` lists every failure in destroy order and `pluginNames` the plugin behind each one; all `destroy` calls still run |

When the kernel is disposed, the plugin disposer is one of the kernel disposers, so a `PluginDestroyError` reaches the caller as the `cause` of a `DisposerFailedError` (see [Core errors](../core/errors.md)).
