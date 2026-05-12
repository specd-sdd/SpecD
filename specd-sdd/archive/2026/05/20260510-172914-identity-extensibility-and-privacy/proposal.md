# Proposal: identity-extensibility-and-privacy

## Motivation

The current `ActorIdentity` structure is too limited, supporting only `name` and `email`. This restricts integration with richer identity providers like LDAP or SSO and poses privacy risks in public repositories where real emails are exposed in change manifests.

## Current behaviour

Currently, `ActorIdentity` is a hardcoded interface with only `name` and `email` fields. All change events (creation, transitions, approvals) and archived change metadata store these two fields verbatim. There is no mechanism to obfuscate or anonymize actor information, nor to store additional audit metadata required by enterprise identity systems. Project configuration is strictly loaded from YAML files, with no native support for environment variables or `.env` files for secrets. Actor resolution is exclusively driven by auto-detection of the underlying VCS.

## Proposed solution

We will extend the `ActorIdentity` domain interface to include optional fields for `provider`, `providerId`, and a flexible `metadata` bag. We will also introduce a `privacy` configuration section in `specd.yaml` to control how these identities are processed before being persisted.

To allow users to bypass auto-detection and force a specific identity provider (e.g., LDAP), we will introduce an optional `actorProvider` field at the project level.

Example `specd.yaml` section:

```yaml
actorProvider: 'ldap' # optional: forces a specific provider name

privacy:
  mode: hash # options: hash | mask | anonymous
  salt: '...' # optional in YAML, recommended via SPECD_PRIVACY_SALT env var
  excludeActors: # optional list of actor names/emails to skip obfuscation.
    # Defaults to ["specd", "system@getspecd.dev"] if omitted.
    - 'specd'
  allowedMetadataKeys: # optional whitelist of metadata keys to preserve under privacy
    - 'department'
```

To support this new selection mechanism, the actor resolution architecture will be refactored into a more granular set of specifications. We will separate the factory interfaces, the selection logic, the privacy decorator, and each concrete implementation (Git, Hg, Svn, Null) into their own specs.

To handle secrets like the HMAC salt securely, we will introduce native support for `.env` and `.env.local` files. The `ConfigLoader` will map environment variables to root-level, non-hierarchical configuration values. A new `PrivacyActorResolver` decorator will apply hashing (using HMAC with salt), masking, or anonymization rules based on the project's privacy settings.

## Environment Variable Mapping

The following environment variables will be supported in `.env` files and the system environment, mapping to root-level configuration settings. They take precedence over values in both `specd.yaml` and `specd.local.yaml`.

| Variable               | Config Mapping        | Description                                                  |
| ---------------------- | --------------------- | ------------------------------------------------------------ |
| `SPECD_ACTOR_PROVIDER` | `actorProvider`       | Forces a specific actor provider (e.g., `ldap`, `git`).      |
| `SPECD_PRIVACY_SALT`   | `privacy.salt`        | Salt used for HMAC hashing in `hash` privacy mode.           |
| `SPECD_PRIVACY_MODE`   | `privacy.mode`        | Privacy mode: `hash`, `mask`, or `anonymous`.                |
| `SPECD_LOG_LEVEL`      | `logging.level`       | Minimum log level (e.g., `debug`, `info`, `error`).          |
| `SPECD_CONTEXT_MODE`   | `contextMode`         | Display mode for compiled context (e.g., `summary`, `full`). |
| `SPECD_LLM_OPTIMIZED`  | `llmOptimizedContext` | Boolean (`true`/`false`) to enable LLM-optimized output.     |
| `SPECD_SCHEMA`         | `schemaRef`           | Reference to the active schema (e.g., `@specd/schema-std`).  |

## Specs affected

### New specs

- `core:actor-provider`: Defines the factory interfaces (`ActorProvider` and `AutoDetectActorProvider`) used to register and create resolvers.
  - Depends on: `core:actor-resolver-port`
- `core:actor-resolver-privacy`: Defines the rules and requirements for the `PrivacyActorResolver` decorator (HMAC, masking, metadata whitelisting).
  - Depends on: `core:actor-resolver-port`, `core:config`
- `core:actor-resolver-git`: Requirements for the Git-backed identity provider.
  - Depends on: `core:actor-provider`
- `core:actor-resolver-hg`: Requirements for the Mercurial-backed identity provider.
  - Depends on: `core:actor-provider`
- `core:actor-resolver-svn`: Requirements for the SVN-backed identity provider.
  - Depends on: `core:actor-provider`
- `core:actor-resolver-null`: Requirements for the fallback/null identity provider.
  - Depends on: `core:actor-provider`

### Modified specs

- `core:change`: Update the `ActorIdentity` interface and its usages in change events.
  - Depends on (added): none
- `core:actor-resolver-port`: Update the `ActorResolver` port to return the extended `ActorIdentity`.
  - Depends on (added): `core:change`
- `core:actor-resolver`: Update the factory logic to support explicit selection via `actorProvider` and wrap results with the privacy decorator.
  - Depends on (added): `core:actor-provider`, `core:actor-resolver-privacy`
- `core:change-manifest`: Update the manifest and history event structures to support the extended `ActorIdentity` fields.
  - Depends on (added): `core:change`
- `core:config`: Define the new `privacy` and `actorProvider` sections and establish the rules for environment variable overrides.
  - Depends on (added): none
- `core:config-loader`: Implement native `.env` loading and environment mapping.
  - Depends on (added): `core:config`

## Impact

- **Domain**: `ActorIdentity` and `ChangeEvent` types will be updated.
- **Persistence**: `manifest.json` will now store additional identity fields.
- **Configuration**: `specd.yaml` gains a new `privacy` section and `actorProvider` field. Native support for `.env` files is added to the system.
- **Composition**: The kernel will be updated to:
  1. Resolve the actor using either the configured `actorProvider` or the existing auto-detection logic.
  2. Wrap the active `ActorResolver` with a `PrivacyActorResolver` when privacy settings are enabled.
- **Refactoring**: Existing VCS providers (Git, Hg, Svn, Null) will be updated to implement the new `AutoDetectActorProvider` interface.
- **Documentation**:
  - Update `docs/guide/configuration.md` with `.env` support, privacy settings, and forced actor providers.
  - Update `docs/config/config-reference.md` with the new `privacy` schema, `actorProvider`, and environment variables.
  - Update `docs/guide/workflow.md` (or relevant guide) to explain how identity and audit trails work with the new extensibility.

## Technical context

- **Extensibility**: The `metadata` field will be a `Record<string, string>` to allow for arbitrary provider-specific data.
- **Actor Resolution Architecture**:
  - **`ActorProvider` (Base)**: Interface for providers that can be explicitly selected via configuration. Requires a `create(options)` method.
  - **`AutoDetectActorProvider` (Specialized)**: Interface for providers that can detect the environment (like VCS). Extends `ActorProvider` and adds a \`detect(cwd)\` method.
  - **Kernel Logic**: When \`actorProvider\` is configured, the kernel bypasses detection and calls \`create()\` on the named provider. Otherwise, it iterates through all registered \`AutoDetectActorProvider\` instances calling \`detect()\`.
- **Privacy Decorator**: A decorator pattern keeps privacy logic decoupled from specific identity providers.
- **Backwards Compatibility**: All new fields in `ActorIdentity` must be optional.
- **Secret Handling**: Native Node.js `process.loadEnvFile()` will be used to load `.env` and `.env.local`. `.env.local` has higher priority.
- **Hashing**: For the `hash` privacy mode, HMAC with a salt (from `SPECD_PRIVACY_SALT` env var) will be used for emails. **If `mode: hash` is selected but no salt is provided, configuration validation will fail.**
- **Masking**: For the `mask` privacy mode:
  - **Email**: The local part will be obfuscated by keeping the first and last characters and replacing the middle with `***` (e.g., `j***z@...`). If the local part has 2 or fewer characters, it will be fully replaced with `***`. The domain part will keep the first character and the full extension (e.g., `e***.com`).
  - **Name**: The name will be similarly masked (e.g., `J***n`).
- **Anonymization**: For the `anonymous` privacy mode, the identity will be replaced with a generic `Anonymous` name and `anonymous@getspecd.dev` email.
- **Metadata Privacy**: When a privacy mode is active, `providerId` and all `metadata` fields are removed by default to prevent leaking PII. Only keys explicitly listed in `allowedMetadataKeys` are preserved. `providerId` is never preserved under privacy modes.

## Open questions

- none
