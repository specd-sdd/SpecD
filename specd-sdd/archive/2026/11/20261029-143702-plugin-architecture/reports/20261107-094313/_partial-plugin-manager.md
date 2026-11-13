# Partial compliance: plugin-manager last round (change plugin-architecture)

Full package suite: `pnpm vitest run` in packages/plugin-manager -> 21 files, 283 tests, all pass. No regression.

## (1) Install/update/uninstall guarded manifest walk + loop in resolve-contributions: OK

- install-plugin.ts: try block wraps resolveContributions, installContextContributions, `manifest.contributes['agents']`, `manifest.defaultConfig`. Non-SpecdError becomes `PluginValidationError(name, ['load'], error)`; SpecdError rethrown unchanged.
- update-plugin.ts: same guarded block. uninstall-plugin.ts: same guarded block.
- resolve-contributions.ts: `declaredContributionIds` uses loops with `ids.push` (no spread). `[...allowlist]` copies only the caller allowlist (not a push(...spread)), so 130k is safe.
- Tests: test/application/hardening.spec.ts: 130,000 ids install succeeds (a spread/apply would RangeError); getter throwing on 2nd read, run for Install/Update/Uninstall, asserts PluginValidationError + cause message. Would fail if the walk were outside the guard.
- Gaps (minor): 130k only tested through InstallPlugin, not Update/Uninstall (same shared code). The throwing getter hits at the first `contributes` read inside the guarded block; no test for a throwing `defaultConfig` getter (install only).

## (2) `__proto__` in configSchema properties: OK

- plugin-config-schema.ts:165 (assertSupportedConfigSchema walk) and :267 (second check in the resolve path) throw `UnsupportedSchemaKeywordError(pluginName, 'properties', "a property named '__proto__' is not allowed")`.
- Test hardening.spec.ts:102 uses JSON.parse (own `__proto__`), checks both assertSupportedConfigSchema and resolvePluginConfig, class, `keyword: 'properties'`, message contains `__proto__`. Would fail if not rejected.
- Spec note (minor): plugin-config-schema spec text has no mention of `__proto__`/prototype (grep empty); behaviour is a hardening beyond the spec text. Spec-silent, not contradictory.

## (3) registerPlugins disposer failure naming, concurrent dispose: OK

- register-plugins.ts:183-187: registerDisposer failure sets `current = entries.map(name).join(', ')` then rollback -> PluginInitError naming `'@acme/a, @acme/b'`; rollback destroys initialized plugins, no disposer registered. Test hardening.spec.ts:~125 asserts `pluginName: '@acme/a, @acme/b'`.
- destroyReverse (:113-130): concurrent call returns the same `disposing` promise; later sequential call resolves (idempotent). Test hardening.spec.ts:~140 uses Promise.allSettled with both rejected and `reason` toBe same instance. Would fail if a second call returned a fresh promise/resolved early.
- Gaps (minor): spec text (register-plugins-use-case) does not mention the registerDisposer-failure naming format or concurrent-dispose semantic; only "MUST be idempotent" (satisfied) and "no disposer remains registered". Spec-silent. Minor: test for registerDisposer failure does not assert rollback destroyed already-initialized plugins (destroy spy) or that no disposer remains.
- Note: `disposed` set true on rollback, so a handle `dispose()` after a failed register is a no-op; consistent with spec.

## (4) specd-plugin-type spec text on zod: OK

- spec-preview line 125: "The plugin-manager domain layer MAY import `zod` ... accepted exception ... `ContributionKindHandler.blockSchema` is a `ZodType`". Code: domain/types/contribution-kind-handler.ts:2, domain/handlers/agents-handler.ts:1, domain/services/plugin-config-schema.ts:1 import zod. Consistent.

## Discrepancies

- critical: none
- major: none
- minor: (a) specs for the use cases/plugin-errors do not explicitly state the guarded-walk `['load']` wrapping nor `__proto__` rejection nor joined-names/concurrent-dispose; the behaviour is implemented and tested but not traceable to a verify scenario (consider adding scenarios). (b) minor test gaps listed above.

Counts: items OK 4, PARTIAL 0, MISSING 0; discrepancies critical 0, major 0, minor 2.
