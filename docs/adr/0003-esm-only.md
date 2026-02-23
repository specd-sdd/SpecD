| status   | date       | decision-makers  | consulted | informed |
| -------- | ---------- | ---------------- | --------- | -------- |
| accepted | 2026-02-19 | specd maintainer | -         | -        |

# ADR-0003: ESM Only

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

- Good, because there are no `require()` interop issues within the monorepo
- Good, because build configuration is simpler — one output format, one set of entry points
- Good, because it is compatible with ESM-native dependencies without workarounds
- Bad, because consumers must use ESM — this is acceptable given the Node.js >= 20 requirement
- Bad, because dynamic `require()` patterns are not available; `import()` must be used instead
- Bad, because some older tooling that does not support ESM may not work without workarounds

### Confirmation

All `package.json` files in `packages/` contain `"type": "module"`. The root TypeScript config sets `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`. tsup config produces no `cjs` format output. CI build verifies no `.cjs` artifacts are emitted.

## Pros and Cons of the Options

### Dual CJS/ESM output

- Good, because it provides maximum consumer compatibility, including older Node.js versions and bundlers
- Bad, because it doubles dist size and build time
- Bad, because subtle differences between CJS and ESM module evaluation can cause hard-to-debug issues
- Bad, because the `package.json` `exports` map becomes complex to maintain correctly

### ESM-only

- Good, because it produces simple, single-format output
- Good, because there are no interop edge cases within the monorepo
- Good, because it aligns with the direction of the Node.js ecosystem
- Bad, because it is incompatible with consumers that cannot use ESM (legacy environments)

## More Information

### Spec

- [`specs/_global/conventions/spec.md`](../../specs/_global/conventions/spec.md)
