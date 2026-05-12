# Tasks: identity-extensibility-and-privacy

## 1. Domain and Port Updates

- [x] 1.1 Extend `ActorIdentity` interface
      `packages/core/src/domain/entities/change.ts`: `ActorIdentity` — add optional `provider`, `providerId`, and `metadata` fields
      Approach: update interface definition to include new optional fields as strings/records
      (Req: Identity)
- [x] 1.2 Update `SYSTEM_ACTOR` constant
      `packages/core/src/domain/entities/change.ts`: `SYSTEM_ACTOR` — add `provider: 'system'`
      Approach: add the property to the exported constant
      (Req: Artifact sync)
- [x] 1.3 Update `ActorResolver` port documentation
      `packages/core/src/application/ports/actor-resolver.ts`: `ActorResolver` — update JSDoc to reflect richer identity
      Approach: update comments to mention that `identity()` returns extended fields
      (Req: identity returns the current actor)

## 2. Infrastructure and Persistence

- [x] 2.1 Update manifest JSON schema
      `packages/core/src/infrastructure/fs/manifest.ts`: `actorSchema` (or equivalent Zod schema) — allow new identity fields
      Approach: add `provider`, `providerId`, and `metadata` as optional Zod strings/records; ensure backward compatibility
      (Req: Manifest structure)
- [x] 2.2 Implement native `.env` loading
      `packages/core/src/infrastructure/fs/config-loader.ts`: `FsConfigLoader.load()` — call `process.loadEnvFile()`
      Approach: try loading `.env` then `.env.local` (higher priority) using Node.js native API; wrap in try/catch to handle missing files
      (Req: Native environment file support)
- [x] 2.3 Implement environment variable mapping
      `packages/core/src/infrastructure/fs/config-loader.ts`: new helper function — map `SPECD_*` to config object
      Approach: create a function that takes `process.env` and merges supported keys into the raw YAML object before Zod validation
      (Req: Environment variable overrides)
- [x] 2.4 Update `SpecdConfig` type and Zod schema
      `packages/core/src/application/specd-config.ts`: `specdConfigShape` — add `privacy` and `actorProvider`
      Approach: update Zod object to include the new hierarchical `privacy` section and top-level string field
      (Req: Privacy settings, Forced actor provider)

## 3. Actor Resolution Refactor

- [x] 3.1 Define new provider interfaces
      `packages/core/src/composition/kernel-registries.ts`: `ActorProvider` and `AutoDetectActorProvider` — split interfaces
      Approach: create base interface with `name` and `create()`, and specialized one with `detect()`
      (Req: Base ActorProvider interface, AutoDetectActorProvider interface)
- [x] 3.2 Update existing VCS providers
      `packages/core/src/infrastructure/git/actor-resolver.ts`, etc. — implement new interfaces
      Approach: update `GitActorProvider`, `HgActorProvider`, `SvnActorProvider`, and `NullActorProvider` to implement `AutoDetectActorProvider`
      (Req: Implementation of AutoDetectActorProvider)
- [x] 3.3 Implement `PrivacyActorResolver` decorator
      `packages/core/src/composition/privacy-actor-resolver.ts`: new class — implement identity obfuscation
      Approach: create a decorator that wraps another `ActorResolver` and applies HMAC, masking, and metadata filtering based on config
      (Req: Privacy modes, HMAC hashing, Masking strategy, Metadata privacy)
- [x] 3.4 Update factory logic for forced selection
      `packages/core/src/composition/actor-resolver.ts`: `createVcsActorResolver()` — honor `actorProvider` and apply decorator
      Approach: check `config.actorProvider` first; if not set, use auto-detection; always wrap with `PrivacyActorResolver` if `config.privacy` is present
      (Req: Detection probes in priority order, Privacy wrapping)

## 4. Testing and Documentation

- [x] 4.1 Unit tests for privacy decorator
      `packages/core/test/composition/privacy-actor-resolver.spec.ts`: new test file — verify obfuscation rules
      Approach: test all three modes and `excludeActors` logic using a mock inner resolver
      (Req: Privacy modes)
- [x] 4.2 Integration tests for `.env` and config
      `packages/core/test/infrastructure/fs/config-loader.spec.ts`: update tests — verify precedence and mapping
      Approach: use temporary files to verify that environment variables correctly override YAML values
      (Req: Environment variable overrides)
- [x] 4.3 Manual E2E verification
      root: manual check — verify manifest contents
      Approach: configure masking, create a change, and inspect `manifest.json` to ensure real PII is not leaked
- [x] 4.4 Update configuration guide
      `docs/guide/configuration.md`: update content — document `.env` support and privacy settings
      Approach: add sections explaining native environment file loading and the new `privacy` block
- [x] 4.5 Update config reference
      `docs/config/config-reference.md`: update schema — add `privacy`, `actorProvider`, and environment variables
      Approach: document the new YAML fields and their corresponding `SPECD_*` environment overrides
- [x] 4.6 Update workflow guide
      `docs/guide/workflow.md`: update identity section — explain audit trails and privacy
      Approach: explain how identity is captured and how to use privacy modes in public repositories
