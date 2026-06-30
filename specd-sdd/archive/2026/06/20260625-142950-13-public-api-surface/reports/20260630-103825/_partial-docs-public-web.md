# Spec compliance partial: docs + public-web

**Change:** `13-public-api-surface`  
**Specs audited:** `default:_global/docs`, `public-web:api-reference`  
**Report slice:** docs + public-web integration  
**Date:** 2026-06-30

## Executive summary

| Area                                                  | Verdict                            |
| ----------------------------------------------------- | ---------------------------------- |
| `apps/public-web` API generation & navigation         | **PASS**                           |
| `apps/public-web` tests                               | **PASS** (17/17)                   |
| `docs/sdk/` integrator guide                          | **PARTIAL**                        |
| `docs/core/` + `docs/code-graph/` callouts & audience | **FAIL** (multiple contradictions) |
| Docusaurus docs sidebar structure                     | **PASS** (minor label nuance)      |

**Overall:** Public-web implementation matches `public-web:api-reference` verify scenarios. Documentation work is incomplete relative to `default:_global/docs` — especially `docs/core/overview.md`, `docs/core/use-cases.md`, and `docs/sdk/index.md` assembly-path coverage.

---

## Spec: `default:_global/docs`

### Requirement: SDK documentation

#### Scenario: docs/sdk is the only integrator entry point

| Check                                           | Status  | Evidence                                                                          |
| ----------------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| **SDK** sidebar category exists                 | PASS    | `apps/public-web/sidebars.ts` — category `SDK` at position after CLI              |
| `docs/sdk/` canonical host guide                | PARTIAL | `docs/sdk/index.md` exists; missing items below                                   |
| Core/Code graph positioned as package reference | PASS    | Sidebar order: SDK → Core → Code graph; index pages say "Package reference for …" |

**Gaps**

1. **`createSdkContext` not documented** — Spec requires host bootstrap (`openSpecdHost`, `createSdkContext`). `docs/sdk/index.md` documents `openSpecdHost` only; `createSdkContext` is exported from `@specd/sdk` (`packages/sdk/src/index.ts`) but absent from docs.
2. **Assembly paths incomplete** — Spec requires examples for both `createKernel` + `kernel.*.execute()` and standalone `createX` / `create*Repository` factories from `@specd/sdk`. Re-exports section lists symbols; no runnable examples for either path.
3. **Subpaths** — `./ports` and `./extensions` table present (PASS).

#### Scenario: package-reference indexes redirect hosts to SDK

| File                                     | Status | Evidence                                                  |
| ---------------------------------------- | ------ | --------------------------------------------------------- |
| `docs/core/index.md`                     | PASS   | Callout: "Hosts: start at SDK … import `@specd/sdk` only" |
| `docs/code-graph/index.md`               | PASS   | Same callout pattern                                      |
| No mixed-import host guidance on indexes | PASS   | Indexes do not instruct mixed imports                     |

#### Scenario: sdk docs forbid mixed host imports

| Check                                                        | Status | Evidence                        |
| ------------------------------------------------------------ | ------ | ------------------------------- |
| States hosts import `@specd/sdk` only                        | PASS   | `docs/sdk/index.md` lines 8–12  |
| No combined `@specd/core` + `@specd/code-graph` host pattern | PASS   | Explicit prohibition in callout |

#### Scenario: core use-cases label core-only audience

| Check                                             | Status   | Evidence                                                                                             |
| ------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `docs/core/use-cases.md` labeled plugin/core-only | **FAIL** | Opens with generic `@specd/core` construction pattern; no audience label; no redirect to `docs/sdk/` |
| Examples use `@specd/core` without label          | **FAIL** | `import { CreateChange, … } from '@specd/core'` at line 11+                                          |

#### Scenario: Legacy `docs/core/sdk.md` migrated

| Check                  | Status      | Evidence                                                         |
| ---------------------- | ----------- | ---------------------------------------------------------------- |
| Content in `docs/sdk/` | PASS        | Full integrator guide at `docs/sdk/index.md`                     |
| Legacy file handling   | PASS (stub) | `docs/core/sdk.md` is a redirect stub; not in Docusaurus sidebar |

### Requirement: Core documentation

| Check                                           | Status   | Evidence                                                                                                        |
| ----------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `docs/core/index.md` callout                    | PASS     | See above                                                                                                       |
| `@specd/core` examples labeled plugin/core-only | **FAIL** | Sweep claimed in tasks 4.4 but multiple core pages still target integrators or hosts with `@specd/core` imports |

**Critical contradictions**

| File                                        | Issue                                                                                                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/core/overview.md`                     | "Who this documentation is for" says `docs/core/` **targets integrators** building delivery adapters — directly contradicts spec (integrators → `docs/sdk/`, `@specd/sdk`) |
| `docs/core/get-config.md`                   | Labels usage for "Hosts (CLI, SDK, API, MCP)" with `@specd/core` `createKernel` example                                                                                    |
| `docs/core/ports.md`                        | "To use `@specd/core` from your own adapter" — no plugin/core-only label                                                                                                   |
| `docs/core/examples/implementing-a-port.md` | Multiple `@specd/core` imports; no audience label or SDK redirect                                                                                                          |
| `docs/core/use-cases.md`                    | See verify scenario failure above                                                                                                                                          |

**Import counts (for remediation scope):** `@specd/core` import examples appear in 9 `docs/core/*` files (99 total occurrences across those files).

### Requirement: SDK documentation — Docusaurus positioning

| Check                                 | Status  | Notes                                                                                                                                                                            |
| ------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SDK before package-reference sections | PASS    | `sidebars.ts` order                                                                                                                                                              |
| Sidebar label "Package reference"     | PARTIAL | Categories labeled **Core** / **Code graph**, not literally "Package reference"; index copy uses "Package reference for …" — likely acceptable under "labeled **or** positioned" |

---

## Spec: `public-web:api-reference`

### Requirement: Public API reference section

| Check                  | Status | Evidence                                                                     |
| ---------------------- | ------ | ---------------------------------------------------------------------------- |
| Dedicated `/api` route | PASS   | `publicApiHref = '/api'`; Docusaurus plugin `routeBasePath: 'api'`           |
| Same-site experience   | PASS   | Navbar/footer API links; `docusaurus.config.ts` mounts generated docs plugin |

### Requirement: Generated API content

| Check                           | Status | Evidence                                                                   |
| ------------------------------- | ------ | -------------------------------------------------------------------------- |
| Generated from package surfaces | PASS   | `generate-api-docs.mjs` + TypeDoc                                          |
| Not handwritten duplicate       | PASS   | `.generated/api/**` produced at build; `pnpm generate:api` in build script |
| TypeDoc resolves public barrels | PASS   | `tsconfig.typedoc.json` paths → `public.ts` barrels                        |

### Requirement: Initial API coverage

#### Scenario: TypeDoc entry points cover sdk, core, code-graph public barrels

| Check                               | Status | Evidence                                          |
| ----------------------------------- | ------ | ------------------------------------------------- |
| Three entry points in order         | PASS   | `public-docs-config.ts` `apiPackageEntryPoints`   |
| `packages/sdk/src/index.ts`         | PASS   | id `sdk`                                          |
| `packages/core/src/public.ts`       | PASS   | id `core` — not `index.ts`                        |
| `packages/code-graph/src/public.ts` | PASS   | id `code-graph`                                   |
| No internal barrels                 | PASS   | No `ports`, `extensions`, `internal` entry points |

```86:102:apps/public-web/src/lib/public-docs-config.ts
export const apiPackageEntryPoints = [
  {
    id: 'sdk',
    packageName: '@specd/sdk',
    entryPoint: '../../packages/sdk/src/index.ts',
  },
  {
    id: 'core',
    packageName: '@specd/core',
    entryPoint: '../../packages/core/src/public.ts',
  },
  {
    id: 'code-graph',
    packageName: '@specd/code-graph',
    entryPoint: '../../packages/code-graph/src/public.ts',
  },
] as const satisfies readonly ApiPackageEntryPoint[]
```

#### Scenario: Generated API output partitioned by package

| Check                                    | Status | Evidence                                                                      |
| ---------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| Per-package TypeDoc pass                 | PASS   | `generateApiDocs()` loops `apiPackageEntryPoints`                             |
| Output dirs `sdk`, `core`, `code-graph`  | PASS   | `path.join(outputRoot, pkg.id)` under `.generated/api`                        |
| Landing links each package               | PASS   | `buildApiIndexContent()` — `/api/${pkg.id}/` links                            |
| Host integrator messaging on API landing | PASS   | "Host integrations MUST import from `@specd/sdk`" in `buildApiIndexContent()` |

#### Scenario: API sidebar lists packages in integrator-first order

| Check                         | Status | Evidence                                     |
| ----------------------------- | ------ | -------------------------------------------- |
| Order sdk → core → code-graph | PASS   | `api-sidebars.ts` + `sidebar-config.spec.ts` |

```26:33:apps/public-web/api-sidebars.ts
const sidebars: SidebarsConfig = {
  apiSidebar: [
    'index',
    buildPackageSidebar('sdk', '@specd/sdk'),
    buildPackageSidebar('core', '@specd/core'),
    buildPackageSidebar('code-graph', '@specd/code-graph'),
  ],
}
```

### Requirement: Public-site integration

| Check                                   | Status | Evidence                                                                                      |
| --------------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| Navbar Docs + API links                 | PASS   | `docusaurus.config.ts`                                                                        |
| MDX brace sanitization                  | PASS   | `escapeMdxBracesInLine`, tests                                                                |
| Inherited node_modules member stripping | PASS   | `stripExternallyDefinedMembers`, tests                                                        |
| TypeDoc source links pinned to `main`   | PASS   | `typedoc.json` `gitRevision: "main"`, `gitRemote: "origin"`; test in `api-generation.spec.ts` |

```1:13:apps/public-web/typedoc.json
{
  "plugin": ["typedoc-plugin-markdown"],
  "out": ".generated/api",
  "readme": "none",
  "skipErrorChecking": true,
  "excludePrivate": true,
  "excludeInternal": true,
  "gitRevision": "main",
  "gitRemote": "origin",
  ...
}
```

**Minor gap:** Homepage CTA (`landing-page.tsx`) says "Generated reference for the exported `@specd/sdk` surface" only — does not mention core/code-graph package sections. API index page (`buildApiIndexContent`) satisfies the spec's integrator-first landing copy; homepage CTA is narrower than `/api` landing.

---

## Tests

| Suite                                 | Result | Coverage                                                                                     |
| ------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| `test/lib/api-generation.spec.ts`     | PASS   | Entry points, order, `buildApiIndexContent`, MDX sanitization, `gitRevision`, tsconfig paths |
| `test/lib/public-docs-config.spec.ts` | PASS   | `apiPackageEntryPoints`, routes, env disable                                                 |
| `test/lib/sidebar-config.spec.ts`     | PASS   | Docs sidebar SDK position; API sidebar package order                                         |

**Command run:** `pnpm exec vitest run test/lib/api-generation.spec.ts test/lib/public-docs-config.spec.ts test/lib/sidebar-config.spec.ts` → **17 passed, 0 failed**

**Test gap:** No automated assertions on `docs/sdk/` content, `docs/core/index.md` callouts, or `docs/core/use-cases.md` audience labels — verify scenarios for `default:_global/docs` are manual-only.

---

## Findings by severity

### High

1. **`docs/core/overview.md` integrator audience** — Contradicts "integrators MUST import from `@specd/sdk`" and `docs/sdk/` as sole integrator entry. Section "Who this documentation is for" must be rewritten for plugin/core-only audience with SDK redirect.

### Medium

2. **`docs/core/use-cases.md` missing audience label** — Fails verify scenario explicitly named in change delta.
3. **`docs/sdk/index.md` missing `createSdkContext`** — Required bootstrap helper undocumented.
4. **`docs/sdk/index.md` missing assembly-path examples** — `createKernel` + `kernel.*.execute()` and standalone factory examples required by spec.
5. **`docs/core/get-config.md` host-oriented `@specd/core` examples** — Should be plugin-labeled or replaced with `@specd/sdk` host examples + link to SDK.
6. **Additional `docs/core/*` pages** — `ports.md`, `examples/implementing-a-port.md`, and others use `@specd/core` without plugin/core-only labeling.

### Low

7. **Homepage API CTA copy** — Mentions only `@specd/sdk`; `/api` index is complete.
8. **Sidebar labels** — "Core" / "Code graph" vs optional "Package reference" wording.
9. **`docs/core/sdk.md` redirect stub** — Acceptable; content migrated; not linked in sidebar.

---

## Recommended remediation (docs-only)

1. Rewrite `docs/core/overview.md` "Who this documentation is for" → plugin authors / core semantics; point hosts to `docs/sdk/`.
2. Add top-of-page callout to `docs/core/use-cases.md`: **Plugin / core-only** + link to `docs/sdk/`.
3. Extend `docs/sdk/index.md`:
   - Section for `createSdkContext` (when to use vs `openSpecdHost`)
   - Runnable `createKernel` + `kernel.changes.getStatus.execute()` example from `@specd/sdk`
   - Runnable standalone `createGetStatus(config).execute()` (or similar) from `@specd/sdk`
4. Label or refactor `docs/core/get-config.md`, `ports.md`, `examples/implementing-a-port.md` for plugin/core-only audience.
5. (Optional) Broaden homepage API CTA to mention three-package generated reference.

Public-web code changes are **not required** for spec compliance in this slice — implementation already matches `public-web:api-reference` verify scenarios.

---

## Task checklist cross-reference

| Task                     | Claimed | Audit                                                       |
| ------------------------ | ------- | ----------------------------------------------------------- |
| 4.1 `docs/sdk/`          | done    | PARTIAL — missing `createSdkContext` + assembly examples    |
| 4.2 index callouts       | done    | PASS                                                        |
| 4.3 sidebar relabel      | done    | PASS (positioning); label nuance LOW                        |
| 4.4 audience label sweep | done    | **FAIL** — overview, use-cases, get-config, ports, examples |
| 5.1–5.7 public-web       | done    | PASS                                                        |
