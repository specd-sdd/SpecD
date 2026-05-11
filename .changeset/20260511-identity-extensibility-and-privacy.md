---
'@specd/core': minor
---

20260511 - identity-extensibility-and-privacy: Extends ActorIdentity with optional provider, providerId, and metadata fields to support richer identity sources (LDAP, SSO) and audit trails. Introduces a project-level privacy configuration (hash/mask/anonymous) that automatically obfuscates actor data in change manifests to protect user privacy in public repositories. Adds native .env file support via process.loadEnvFile() with environment variable overrides for all privacy and config settings. Refactors actor resolution into separate ActorProvider/AutoDetectActorProvider interfaces to enable extensible identity providers beyond built-in VCS backends (Git, Hg, Svn, Null).

Specs affected:

- `core:actor-resolver-port`
- `core:change-manifest`
- `core:config`
- `core:config-loader`
- `core:change`
- `core:actor-resolver`
- `core:actor-provider`
- `core:actor-resolver-privacy`
- `core:actor-resolver-git`
- `core:actor-resolver-hg`
- `core:actor-resolver-svn`
- `core:actor-resolver-null`
