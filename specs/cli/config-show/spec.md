# Config Show

## Purpose

When config discovery or path resolution behaves unexpectedly, users need to see exactly what specd resolved. The `specd config show` command prints the fully-resolved project configuration as loaded from `specd.yaml`, including absolute paths, workspace mappings, and approval gate settings.

## Requirements

### Requirement: Command signature

```
specd config show [--format text|json|toon]
```

- `--format text|json|toon` — optional; output format, defaults to `text`

### Requirement: Output format

In `text` mode (default), the command prints the resolved config as structured key-value output:

```
projectRoot:  <absolute-path>
schemaRef:    <schema-ref>
approvals:    spec=<true|false>  signoff=<true|false>

workspaces:
  <name>  <ownership>  <specsPath>
  ...

storage:
  changes:   <absolute-path>
  drafts:    <absolute-path>
  discarded: <absolute-path>
  archive:   <absolute-path>
```

Optional fields are shown only when present in the config:

```
context:
  file: <path>
  instruction: <text>
  ...

contextIncludeSpecs: <pattern>, <pattern>, ...
contextExcludeSpecs: <pattern>, <pattern>, ...
llmOptimizedContext: <true|false>
schemaPlugins: <ref>, <ref>, ...

workflow:
  <step>  pre: <count> hooks  post: <count> hooks
  ...

artifactRules:
  <artifactId>: <count> rules
  ...

schemaOverrides: (present)
```

The `schemaOverrides` field, when present, shows `(present)` in text mode — its structure is complex and best inspected via JSON output.

In `json` or `toon` mode, the command MUST serialize the `SpecdConfig` object directly — no manual field selection. The output is the config as-is, encoded in the respective format. This ensures that new fields added to `SpecdConfig` appear automatically without CLI changes. Optional fields that are `undefined` are omitted by the serializer.

### Requirement: Sensitive fields

The config contains no sensitive values — all fields are filesystem paths, schema references, and boolean flags. No redaction is required.

### Requirement: Error cases

If the config cannot be loaded (discovery failure or parse error), exits per the entrypoint exit code rules. This command is most useful precisely when config loading is suspected to be wrong — errors are printed with enough detail to diagnose the problem.

## Constraints

- All paths in the output are absolute — the same values as in the resolved `SpecdConfig`
- This command is read-only

## Examples

```
$ specd config show
projectRoot:  /home/user/project
schemaRef:    @specd/schema-std
approvals:    spec=false  signoff=false

workspaces:
  default   owned   /home/user/project/specs

storage:
  changes:   /home/user/project/.specd/changes
  drafts:    /home/user/project/.specd/drafts
  discarded: /home/user/project/.specd/discarded
  archive:   /home/user/project/.specd/archive

contextIncludeSpecs: default:*
llmOptimizedContext: true

workflow:
  implementing  pre: 0 hooks  post: 1 hooks
```

## Spec Dependencies

- [`specs/cli/entrypoint/spec.md`](../entrypoint/spec.md) — config discovery, exit codes, output conventions
- [`specs/core/config/spec.md`](../../core/config/spec.md) — SpecdConfig shape
