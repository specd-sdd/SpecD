# ADR-0003: ESM Only

## Status

Accepted — 2026-02-19

## Context and Problem Statement

Node.js has supported native ES Modules for several years and the ecosystem has largely converged on ESM for new packages. Maintaining dual CJS/ESM output adds build complexity, larger dist directories, and subtle interop bugs. specd targets Node.js >= 20 where ESM is fully stable.

## Decision Drivers

- Node.js >= 20 fully supports ESM — no polyfills or workarounds required
- Dual CJS/ESM output doubles build complexity and dist size for no benefit given the target runtime
- ESM-native dependencies cannot be `require()`d — forcing ESM throughout eliminates interop issues

## Considered Options

- Dual CJS/ESM output — produce both formats from tsup
- ESM-only — ship `.js` with `"type": "module"`, no CJS output

## Decision Outcome

Chosen option: "ESM-only", because the Node.js >= 20 requirement makes CJS compatibility unnecessary, and eliminating dual output removes a class of interop bugs entirely.

All packages use `"type": "module"` and `NodeNext` module resolution. No CJS output is produced. Imports must use explicit file extensions (`.js`) as required by NodeNext. tsup builds ESM-only output.

### Consequences

- Good: No `require()` interop issues within the monorepo
- Good: Simpler build configuration — one output format, one set of entry points
- Good: Compatible with ESM-native dependencies without workarounds
- Bad: Consumers must use ESM — this is acceptable given the Node.js >= 20 requirement
- Bad: Dynamic `require()` patterns are not available; `import()` must be used instead
- Bad: Some older tooling that does not support ESM may not work without workarounds

### Confirmation

All `package.json` files in `packages/` contain `"type": "module"`. The root TypeScript config sets `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`. tsup config produces no `cjs` format output. CI build verifies no `.cjs` artifacts are emitted.

## Pros and Cons of the Options

### Dual CJS/ESM output

- Good: Maximum consumer compatibility, including older Node.js versions and bundlers
- Bad: Doubles dist size and build time
- Bad: Subtle differences between CJS and ESM module evaluation can cause hard-to-debug issues
- Bad: `package.json` `exports` map becomes complex to maintain correctly

### ESM-only

- Good: Simple, single-format output
- Good: No interop edge cases within the monorepo
- Good: Aligns with the direction of the Node.js ecosystem
- Bad: Incompatible with consumers that cannot use ESM (legacy environments)

## Spec

- [`specs/_global/conventions/spec.md`](../../specs/_global/conventions/spec.md)
