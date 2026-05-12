# Design: identity-extensibility-and-privacy

## Non-goals

- Implementation of actual LDAP or SSO providers (leaving this for future changes/plugins).
- Deep merging of `specd.local.yaml` (to be handled in a separate change).
- Automatic creation of `.env` files (users must manage them manually).

## Affected areas

- **`ActorIdentity`** in `packages/core/src/domain/entities/change.ts`
  Change: Add optional fields: `provider`, `providerId`, `metadata`.
  Risk: CRITICAL. This is a foundational type used across all use cases and the manifest.
- **`manifest.json` schema** in `packages/core/src/infrastructure/fs/manifest.ts`
  Change: Update Zod validation to accept new identity fields.
  Risk: HIGH. Must ensure backward compatibility with existing manifests.
- **`ActorResolver` Port** in `packages/core/src/application/ports/actor-resolver.ts`
  Change: Update the interface documentation to reflect richer identity.
- **`SpecdConfig`** in `packages/core/src/application/specd-config.ts`
  Change: Add `privacy` and `actorProvider` sections.
- **`FsConfigLoader`** in `packages/core/src/infrastructure/fs/config-loader.ts`
  Change: Add native `.env` loading and environment variable mapping to config object.
- **`KernelInternals`** in `packages/core/src/composition/kernel-internals.ts`
  Change: Update kernel wiring to handle forced providers and wrap results with the privacy decorator.

## New constructs

- **`ActorProvider` Interface**
  Location: `packages/core/src/composition/kernel-registries.ts`
  Shape: `{ name: string, create(options: Record<string, unknown>): Promise<ActorResolver> }`
  Responsibility: Base factory interface for explicitly selected identity providers.
- **`AutoDetectActorProvider` Interface**
  Location: `packages/core/src/composition/kernel-registries.ts`
  Shape: `extends ActorProvider { detect(cwd: string): Promise<ActorResolver | null> }`
  Responsibility: Specialized factory for providers capable of environmental detection.
- **`PrivacyActorResolver` Decorator**
  Location: `packages/core/src/composition/privacy-actor-resolver.ts`
  Shape: `class PrivacyActorResolver implements ActorResolver { constructor(inner: ActorResolver, privacy: PrivacyConfig) }`
  Responsibility: Applies obfuscation (HMAC, mask, anonymous) to identities.

## Approach

1. **Refactor Interfaces**: Split `ActorProvider` and `AutoDetectActorProvider`. Update existing VCS providers (Git, Hg, Svn, Null) to implement the specialized interface.
2. **Extend Identity**: Update `ActorIdentity` in the domain and allow these fields in the `manifest.json` Zod schema.
3. **Native .env Support**: Use Node's `process.loadEnvFile()` in `FsConfigLoader`. Implement a mapping function that merges `SPECD_*` environment variables into the raw YAML-parsed object before Zod validation.
4. **Privacy Logic**: Implement `PrivacyActorResolver`.
   - **Hash**: Use `node:crypto`'s `createHmac('sha256', salt)`.
   - **Mask**: Regexp-based replacement for email and name parts.
   - **Metadata Cleanup**: Filter `metadata` based on `allowedMetadataKeys`.
5. **Kernel Integration**: Modify kernel wiring to honor `config.actorProvider` and apply the privacy decorator.

## Key decisions

- **Decision** → Use Node.js native `.env` support (Node 20.6+) to keep `@specd/core` dependency-free.
- **Decision** → Privacy decorator as a wrapper. Rationale: keeps individual providers simple and ensures consistent privacy rules regardless of identity source.
- **Decision** → Mandatory salt for `hash` mode. Rationale: prevents a false sense of security.

## Trade-offs

- [Risk] Performance of `identity()` calls → HMAC and masking are fast, but adding layers to the resolver chain must stay efficient. Mitigation: caching identity in the decorator if needed.

## Spec impact

### `core:actor-resolver`

- Direct dependents: `core:composition`.
- Change: Now supports forced provider name, skipping VCS probes.

### `core:config`

- Direct dependents: `core:config-loader`, `core:composition`.
- Change: New root-level fields and environment override rules.

## Dependency map

```mermaid
graph TD
    Kernel --> ConfigLoader
    Kernel --> ActorResolverFactory
    ConfigLoader -- loads --> EnvFiles[.env, .env.local]
    ActorResolverFactory -- resolved by --> ActorProvider
    ActorResolverFactory -- wrapped by --> PrivacyDecorator
    ActorProvider <|-- GitProvider
    ActorProvider <|-- LdapProvider
```

```
┌──────────────┐      ┌─────────────────┐
│    Kernel    │─────▶│  ConfigLoader   │
└──────┬───────┘      └────────┬────────┘
       │                       │
       ▼                       ▼
┌──────────────┐      ┌─────────────────┐
│ ActorResolver│      │    EnvFiles     │
│   Factory    │      │ (.env, .local)  │
└──────┬───────┘      └─────────────────┘
       │
       ├───────────────┐
       ▼               ▼
┌──────────────┐      ┌─────────────────┐
│ActorProvider │      │ PrivacyDecorator│
└──────┬───────┘      └─────────────────┘
       │
       ├───────────────┐
       ▼               ▼
┌──────────────┐      ┌─────────────────┐
│ GitProvider  │      │  LdapProvider   │
└──────────────┘      └─────────────────┘
```

## Testing

**Automated tests**:

- `packages/core/test/composition/privacy-actor-resolver.spec.ts`: Unit tests for hashing, masking, and whitelisting.
- `packages/core/test/infrastructure/fs/config-loader.spec.ts`: Integration tests for `.env` loading and environment variable precedence.
- `packages/core/test/domain/entities/change.spec.ts`: Verify rich identity persistence and event history.

**Manual / E2E verification**:

1. Create a project with `privacy.mode: mask` in `specd.yaml`.
2. Run `specd changes create test-privacy`.
3. Verify `manifest.json` history events have masked name and email.
4. Set `SPECD_PRIVACY_MODE=hash` and `SPECD_PRIVACY_SALT=secret` in `.env`.
5. Run another operation and verify hashing in the manifest.

## Migration / Rollback

Existing manifests will load correctly as all new fields are optional. No migration script is required. Rollback involves removing the new fields from `specd.yaml`.

## Documentation

- **Update `docs/guide/configuration.md`**: Add sections for `privacy` settings and native `.env` support.
- **Update `docs/config/config-reference.md`**: Document the `privacy` block, `actorProvider` field, and `SPECD_*` environment variables.
- **Update `docs/guide/workflow.md`**: Add a note about privacy in public repositories.
