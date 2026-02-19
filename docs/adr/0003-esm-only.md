# ADR-0003: ESM Only

## Status
Accepted

## Context
Node.js has supported native ES Modules for several years and the ecosystem has largely converged on ESM for new packages. Maintaining dual CJS/ESM output adds build complexity, larger dist directories, and subtle interop bugs. specd targets Node.js >= 20 where ESM is fully stable.

## Decision
All packages use `"type": "module"` and `NodeNext` module resolution. No CJS output is produced. Imports must use explicit file extensions (`.js`) as required by NodeNext. tsup builds ESM-only output.

## Consequences
- No `require()` interop issues within the monorepo
- Consumers must use ESM — this is acceptable given the Node.js >= 20 requirement
- Dynamic `require()` patterns are not available; `import()` is used instead
- Some older tooling that does not support ESM may not work without workarounds

## Spec

- [`specs/_global/conventions/spec.md`](../../specs/_global/conventions/spec.md)
