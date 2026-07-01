# Análisis de merge: `main` → `feat/user-interface`

Documento de preparación para mergear `main` en la rama de feature del Studio. Describe qué cambió en `main` desde el último merge, dónde hay solapamiento con el trabajo del Studio, y qué habrá que adaptar en la capa API/IPC.

**Fecha:** 2026-06-30 (post-merge)  
**Rama feature:** `feat/user-interface` — **integrada en `main`**  
**Último merge de main → feature:** `f2a3de90` — _merge(main): Track A SDK refactor_  
**Merge feature → main:** fast-forward `87401d64` → `fed3b7e4` (2026-06-30)  
**`main` actual:** `fed3b7e4` — _fix(cli): route plugins uninstall and update by type bucket_

**Documentos relacionados:**

- **[Refactorización en `main`](./core-refactor-on-main.md)** — Track A **completado** en `main`.
- Este documento — merge `main` → feature, Track B (api/IPC/desktop → `@specd/sdk`), estado post-merge.
- **Change archivado (specs):** `20260630-171934-align-studio-specs-post-merge` — specs Studio/API alineados con `@specd/sdk` + runtime desktop.

---

## Estado post-merge (2026-06-30)

| Hito                                          | Estado | Notas                                                                                |
| --------------------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| Track A (`@specd/sdk`, CLI/MCP)               | ✅     | En `main` desde `87401d64`                                                           |
| Merge `main` → `feat/user-interface`          | ✅     | `f2a3de90`                                                                           |
| Track B api + desktop → `@specd/sdk`          | ✅     | `0cc90abb`; sin imports directos `@specd/core` en `packages/api` / desktop IPC       |
| Plugin CLI install/uninstall/update buckets   | ✅     | Archivados; en `main` (`38cff059`, `fed3b7e4`)                                       |
| Merge `feat/user-interface` → `main`          | ✅     | FF `fed3b7e4`                                                                        |
| Specs Studio/API vs código                    | ✅     | Change `align-studio-specs-post-merge`: 113 deltas, 134 impl links, validate 229/229 |
| Workspaces `api` / `studio-*` en `specd.yaml` | ✅     | `api`, `client`, `studio-desktop`, `studio-web`, `code-graph-electron` registrados   |
| E2E Studio skips sin changes activos          | ⚠️     | Esperado; no bloquea                                                                 |
| `change-validate.spec.ts` (graph lock)        | ✅     | Mock `validateBatch` en helpers; suite CLI verde                                     |

---

## Estado Track A (`main`) — **completado**

| Bloque                                     | Estado | Commit representativo  |
| ------------------------------------------ | ------ | ---------------------- |
| Archive paginado + index/detail            | ✅     | `cf05a50b`, `5b8dc7a0` |
| `specDependsOn` + schema-walking en status | ✅     | `02b39469`, `2294d54e` |
| Implementation tracking endurecido         | ✅     | `b9251e1d`             |
| Extracción graph logic → code-graph        | ✅     | `4de31d39`             |
| P0c–P0b core (GetConfig, refresh bakeado)  | ✅     | `d478f732`, `42a7e7cd` |
| P1a–P1b (context defaults, CreateChange)   | ✅     | `3ec7bb33`, `83bb8b99` |
| P1c ListPlugins fuera del kernel           | ✅     | `d65d60b2`             |
| P1e edición yaml vía `createConfigWriter`  | ✅     | `ab061b4f`             |
| P1d auditoría kernel inputs                | ✅     | `54f37f36`             |
| P2 `GetProjectSummary`                     | ✅     | `0c59ac6f`             |
| P3 approvals bakeados                      | ✅     | `4741b743`             |
| G1 graph host use cases                    | ✅     | `51b87583`             |
| A2a `@specd/sdk` + orquestación            | ✅     | `b1a842df`             |
| A2b CLI + MCP → solo `@specd/sdk`          | ✅     | `bbeee9f5`             |
| A3 public barrels core/code-graph          | ✅     | `87401d64`             |

**Siguiente paso:** ~~Track B~~ **completado.** Specs Studio/API: change `align-studio-specs-post-merge`.

**No está en `main` (solo feature — conservar en merge):**

- `ifModifiedSince` / `unchanged` en `GetStatus` y polling UI
- Use cases Studio (`getArtifact`, `saveArtifact`, `readLog`, …)
- `packages/api`, `packages/client`, `packages/ui`, desktop IPC

---

## Resumen ejecutivo

| Métrica                                                       | Valor                                                                                                                                   |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Commits en `main` desde el último merge                       | **31**                                                                                                                                  |
| Archivos tocados en `packages/` + `apps/` (solo lado main)    | **295**                                                                                                                                 |
| Archivos tocados en feature desde el merge                    | **457**                                                                                                                                 |
| Archivos con cambios en **ambas** ramas (riesgo de conflicto) | **~207**                                                                                                                                |
| Workspaces solo en feature (no existen en main)               | `packages/api`, `apps/specd-studio-desktop`, `packages/code-graph-electron`, gran parte del Studio en `packages/ui` / `packages/client` |

La feature **incorporó en paralelo** parte del trabajo de `main` (archive paginado, `ListWorkspaces`, metadata LLM, `specDependsOn` en IPC). Tras Track A, `main` añade además **`@specd/sdk`**, public barrels, refresh bakeado en use cases, `GetProjectSummary`, graph host use cases y CLI/MCP migrados.

El merge será delicado sobre todo en **`kernel.ts`** (base main + extensiones Studio), **`get-status.ts`** (fusionar `ifModifiedSince` de feature con schema-walking de main), **code-graph** (`sqlite-graph-store`, `in-memory-index-session`) y **cableado api/IPC** (orquestación inline → SDK).

`main` **no contiene** el stack Studio. Esos módulos no generan conflictos de archivo con main, pero **deben migrar** de imports directos `@specd/core` / `@specd/code-graph` a `@specd/sdk`.

---

## Commits en `main` desde el último merge (orden cronológico)

| SHA        | Mensaje                                                     | Área principal                                                 |
| ---------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| `cf05a50b` | split archive index and detail models                       | core archive, ADR 0022                                         |
| `5b8dc7a0` | enrich archive metadata and support paginated listings      | core archive, CLI archive                                      |
| `5884b5e2` | enforce spec dependency registration on schema-std          | schema-std                                                     |
| `02b39469` | improve change dependency visibility and status ux          | core get-status, CLI change/deps                               |
| `2294d54e` | improve change dependency visibility and status ux          | (continuación)                                                 |
| `50015cfb` | route agent-plugin installs through resolve-bundle          | skills, plugin-agent-\*                                        |
| `550dde1f` | refine graph search, indexing, & project orchestration      | docs, specs                                                    |
| `89ce22a9` | finalize archival of improve-code-graph-path-search         | specs/docs                                                     |
| `ffbe60a4` | improve graph search snippet context                        | code-graph, CLI graph search                                   |
| `c1cbe0df` | exclude public-web workspace from code graph                | turbo, graph config                                            |
| `f5b2cda7` | add llm-optimized metadata and project context              | core, CLI project context                                      |
| `6bf68a95` | optimize indexer performance using unified session          | code-graph indexer                                             |
| `184198ef` | optimize indexer performance using unified session          | (continuación)                                                 |
| `d6a81289` | add llm-optimized metadata support                          | skills templates, metadata                                     |
| `8e9fa6bc` | improve graph search identity ranking                       | sqlite-graph-store                                             |
| `eb8303fa` | sanitize graph search snippet output                        | graph search                                                   |
| `b9251e1d` | harden implementation tracking workflow                     | refresh/update impl tracking, kernel                           |
| `4de31d39` | extract graph logic to code-graph                           | code-graph provider, CLI graph commands, staleness/locks       |
| `d478f732` | expose readonly config snapshot on kernel project           | core GetConfig (P0c)                                           |
| `42a7e7cd` | bake implementation refresh into host use cases             | core GetStatus, TransitionChange, CompileContext (P0a/P0b/P1a) |
| `3ec7bb33` | bake context config defaults at kernel                      | core CompileContext, GetProjectContext (P1a)                   |
| `83bb8b99` | resolve active schema inside create-change                  | core CreateChange (P1b)                                        |
| `d65d60b2` | remove listplugins from kernel; read from config            | core kernel (P1c)                                              |
| `ab061b4f` | route yaml edits through createconfigwriter                 | core composition (P1e)                                         |
| `54f37f36` | codify kernel execute input boundary                        | specs core/kernel, P1d audit                                   |
| `0c59ac6f` | add get-project-summary for project status counts           | core P2                                                        |
| `4741b743` | bake approval gates and relocate kernel approve use cases   | core P3; approve en `kernel.changes`                           |
| `51b87583` | add code-graph host use cases for health index and coverage | code-graph G1                                                  |
| `b1a842df` | add @specd/sdk host facade package                          | packages/sdk A2a                                               |
| `bbeee9f5` | migrate cli and mcp to @specd/sdk host                      | CLI/MCP A2b                                                    |
| `87401d64` | add curated public barrels for core sdk code-graph          | public.ts A3                                                   |

---

## Cambios por tema (detalle)

### 1. Archive: índice vs detalle + paginación

**Qué hace main**

- Nuevo tipo `ArchivedChangeIndexEntry` para listados ligeros (desde `index.jsonl`, sin leer manifests).
- `ArchivedChange` pasa a ser modelo de detalle completo (manifest).
- `ListArchived.execute()` devuelve `ArchiveListResult` paginado (`items` + `meta.total`) en lugar de `ArchivedChange[]`.
- `FsArchiveRepository` reescrito; nuevo `manifest-change-loader.ts`.
- CLI `archive show` enriquecido.

**Estado en feature**

- **Ya alineado** en lo esencial: `list-archived.ts` idéntico a main; IPC `listArchived` y `getProjectStatus` ya usan `archived.items` / `archived.meta.total`.
- Revisar tras merge: mapeo DTO en `ipc-handlers.ts` (`description` vs `archivedName`) y handlers HTTP en `packages/api` — deben seguir el contrato de `ArchivedChangeIndexEntry` (campos `workspaces`, `archivedBy`, etc.).

**Adaptación API/IPC:** baja prioridad salvo regresiones en tests; verificar presenters y OpenAPI de archive.

---

### 2. Change status y dependencias (`specDependsOn`)

**Qué hace main**

- `GetStatusResult` incluye `specDependsOn: Record<string, string[]>`.
- Status recorre **todos** los artifact types del schema (no solo los presentes en el change); artifacts ausentes → `state: 'missing'`.
- CLI `change deps` admite `specId` opcional: sin flags lista todas las deps del change.

**Estado en feature**

- Feature **ya expone** `specDependsOn` en IPC (`toChangeDetailDto`) y OpenAPI.
- Feature **añade** polling optimizado: `ifModifiedSince` en `getChangeStatus` / draft / discarded con short-circuit `unchanged: true` — **`main` no tiene `ifModifiedSince`**; hay que **conservarlo en feature** al fusionar `get-status.ts`.
- Posible divergencia en la lógica de artifact statuses (schema-walking de main vs lógica previa en feature).

**Adaptación API/IPC (prioridad alta)**

| Archivo                                    | Acción                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/.../get-status.ts`          | **Merge manual**: conservar `ifModifiedSince` + `unchanged` de feature; integrar schema-walking y `specDependsOn` de main |
| `apps/.../ipc-handlers.ts`                 | Verificar que `toChangeStatusDto` refleje `unchanged` y artifacts `missing`                                               |
| `packages/api/.../handler-changes-read.ts` | Igual que IPC                                                                                                             |
| `packages/api/.../openapi-schemas.ts`      | Añadir/validar `unchanged`, `hasTasks` si aplica                                                                          |
| UI hooks (`use-change-*`)                  | Comprobar que el polling con `ifModifiedSince` sigue funcionando con el nuevo shape de artifacts                          |

---

### 3. Implementation tracking (endurecimiento)

**Qué hace main (`b9251e1d`)**

- `RefreshImplementationTracking`: algoritmo de 4 fases (exclusiones archive, detección VCS, existence sweep, cleanup de links).
- Nuevas dependencias en constructor: `ArchiveRepository`, `FileReader`, `projectRoot`.
- `UpdateImplementationTracking`: validación de paths más estricta, integración con `files` + `projectRoot`.
- `kernel.ts` actualiza wiring de ambos use cases.

**Estado en feature**

- Feature tiene la **versión anterior** (constructor simple: solo `ChangeRepository` + detector).
- IPC y HTTP pasan `refreshImplementation: true` en status poll hoy. Con core default `true` **si activo**, el poll puede omitir el flag; usar `refreshImplementation=false` solo para lectura rápida sin refresh.

**Adaptación API/IPC (prioridad alta)**

1. Aceptar cambios de main en `refresh-implementation-tracking.ts` y `update-implementation-tracking.ts`.
2. En `kernel.ts`, fusionar wiring de main **sin perder** use cases solo-Studio (`getArtifact`, `saveArtifact`, `readLog`, etc.).
3. Wire: `refreshImplementation` en query/body **default `true`** (alineado con core); documentar opt-out. Re-ejecutar tests de status poll e implementation review.

---

### 4. Kernel: refactor `ListWorkspaces`

**Qué hace main**

- Sustituye inyección directa de `i.specs` por `listWorkspaces` en: `CreateChange`, `ArchiveChange`, `ValidateArtifacts`, `CompileContext`, `EditChange`, `ListSpecs`, `SearchSpecs`, `GetSpecContext`, `GetProjectContext`.
- Extrae `generateMetadata` / `saveMetadata` / `updateSpecMetadata` / `updateProjectMetadata` / `getProjectMetadata` como instancias compartidas.
- Elimina `createArchiveWorkspaceImplementationConfig` del archive.
- Expone `project.listWorkspaces`, `specs.updateMetadata`, `project.getMetadata`, `project.updateMetadata`.

**Estado en feature**

- Feature **ya tiene** la mayor parte de este refactor (commit `39ed679f` y posteriores).
- Feature **añade** use cases que main no tiene:

| Use case solo en feature       | Uso Studio                         |
| ------------------------------ | ---------------------------------- |
| `getArtifact` / `saveArtifact` | edición de artifacts en UI         |
| `getReadOnlyChangeArtifact`    | draft/discarded/archived read-only |
| `validateBatch`                | validate all artifacts             |
| `outlineChangeArtifact`        | outline en inspector               |
| `readLog`                      | panel de logs desktop              |
| `ValidateChangeBatch`          | IPC `validateChangeAll`            |

**Adaptación API/IPC (prioridad crítica)**

- **`packages/core/src/composition/kernel.ts`** será el conflicto más importante (~150 líneas de diferencia estructural).
- Regla de merge: **base = main**, re-aplicar bloques Studio (imports, campos en `Kernel` interface, instanciación de use cases extra, `ReadLog` + log formatter).
- Tras merge, compilar `packages/api`, `apps/specd-studio-desktop` y ejecutar tests IPC.

---

### 5. Code graph: indexer + búsqueda

**Qué hace main**

- Nuevo `IndexSession` / `in-memory-index-session.ts` — sesión unificada para rendimiento del indexer.
- Reescritura grande de `sqlite-graph-store.ts` (+780 líneas netas): ranking por identidad, snippets con contexto, sanitización de snippets.
- CLI `graph search`: flag `--snippet`, bloques `startLine`/`endLine`/`snippet` en JSON/TOON.
- `normalize-snippet.ts` para salida CLI segura.
- Exclusión de workspace `public-web` del grafo.

**Estado en feature**

- Feature tiene `code-graph-electron` (sqlite vendored para Electron) — **no existe en main**.
- `code-graph-electron` re-exporta `@specd/code-graph` (`export * from '../../code-graph/src/index.js'`), así que **cualquier cambio en exports de code-graph afecta al IPC desktop automáticamente**.
- `sqlite-graph-store.ts` diverge fuertemente (~378 líneas de diff vs main).
- Feature **no tiene** `in-memory-index-session.ts` (main lo añade).
- IPC `searchGraph` ya devuelve snippets en DTOs (`toGraphSearchResultDto`); alineado con intención de main pero implementación distinta.

**Adaptación API/IPC (prioridad alta)**

| Componente                           | Acción                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `sqlite-graph-store.ts`              | Merge manual; validar que `code-graph-electron` sigue compilando el binding  |
| `index-code-graph.ts`                | Adoptar sesión unificada de main                                             |
| `ipc-handlers.ts` → `searchGraph`    | Verificar shape de respuesta tras cambios en provider (snippets sanitizados) |
| `packages/client` `PortGraph` / DTOs | Actualizar si cambian campos de búsqueda                                     |
| Tests                                | `ipc-graph-provider.spec.ts`, `desktop-graph-runtime.spec.ts`, e2e graph     |

Ver también **§9** (extracción de lógica graph desde CLI) — impacto directo en `getGraphStatus`, `indexGraph`, `getImpact`.

---

### 9. Code graph: extracción de lógica desde CLI (`4de31d39`) — **NUEVO**

**Qué hace main**

Refactor archivado como change `code-graph-logic-refactor`. Mueve responsabilidades que vivían en `packages/cli/src/commands/graph/` hacia `@specd/code-graph`:

| Antes (CLI local)               | Después (`@specd/code-graph`)                          |
| ------------------------------- | ------------------------------------------------------ |
| `bootstrap-graph-config.ts`     | `application/services/bootstrap-graph-config.ts`       |
| `build-project-graph-config.ts` | `application/services/build-project-graph-config.ts`   |
| `graph-index-lock.ts`           | `infrastructure/index-lock.ts`                         |
| Lógica inline en commands       | `domain/services/is-graph-stale.ts`                    |
| —                               | `domain/services/analyze-files-impact.ts`              |
| Traversal ad hoc                | `get-upstream.ts` / `get-downstream.ts` refactorizados |
| —                               | `domain/errors/spec-not-found-error.ts`                |

**API pública nueva en `@specd/code-graph`** (relevante para Studio):

- `isGraphStale(lastIndexedRef, currentRef)` — sustituye comparaciones VCS inline.
- `buildProjectGraphConfig`, `createBootstrapGraphConfig` — exportados desde el paquete (ya no solo desde CLI).
- `acquireGraphIndexLock` / `assertGraphIndexUnlocked` — también en `CodeGraphProvider`.
- `analyzeFilesImpact` en provider — impacto multi-archivo.
- `SpecNotFoundError`, `normalizeFileSelectorPath` — errores/rutas normalizadas en impact.
- CLI nuevo `warn-graph-staleness.ts` — warnings de stale + fingerprint mismatch (stderr).

**Comandos CLI afectados:** `graph impact`, `graph index`, `graph stats`, `graph search`, `graph hotspots`, `project status` — todos delegan más en `CodeGraphProvider`.

**Estado en feature (desalineación con main)**

| Área                                                      | Feature hoy                                                | Main tras `4de31d39`                          |
| --------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------- |
| `packages/cli/src/commands/graph/graph-index-lock.ts`     | **Existe** (copia local)                                   | **Eliminado** — usa `@specd/code-graph`       |
| `packages/cli/.../build-project-graph-config.ts`          | **Existe** (copia local)                                   | **Movido** a code-graph                       |
| `CodeGraphProvider`                                       | Sin `analyzeFilesImpact`, sin métodos de lock en provider  | Con lock + multi-file impact                  |
| `ipc-handlers.ts` → `getProjectStatus` / `getGraphStatus` | Staleness **inline** (VCS ref + fallback 24h)              | Debería usar `isGraphStale`                   |
| `ipc-handlers.ts` → `indexGraph`                          | Sin `acquireGraphIndexLock`                                | CLI index usa lock vía provider               |
| `packages/api/.../handler-graph.ts`                       | Misma lógica stale inline que IPC                          | Idem                                          |
| `packages/api/.../handler-graph.ts`                       | Import `buildProjectGraphConfig` desde `@specd/code-graph` | OK tras merge si exports coinciden            |
| `ipc-handlers.ts` imports                                 | `@specd/code-graph-electron` (re-export)                   | Seguirá funcionando si code-graph mergea bien |

**Adaptación API/IPC (prioridad alta — nuevo bloque)**

1. **`getProjectStatus` / `getGraphStatus` (IPC + HTTP)**  
   Reemplazar bloques duplicados (~líneas 1237–1244 y 1776–1784 en `ipc-handlers.ts`; ~40–48 en `handler-graph.ts` y `handler-project.ts`) por:

   ```ts
   import { isGraphStale } from '@specd/code-graph'
   // stale = isGraphStale(stats.lastIndexedRef, currentRef)
   ```

   Valorar si el fallback de 24h en `getGraphStatus` se mantiene (Studio-only) o se alinea solo con `isGraphStale` (main devuelve `null` si refs desconocidos).

2. **`indexGraph` (IPC + HTTP)**  
   Adoptar patrón de main: `provider.acquireGraphIndexLock(config)` o import directo antes de `provider.index()`, con `release()` en `finally`.

3. **`getImpact` (IPC + HTTP)**  
   Revisar manejo de errores: main usa `SpecNotFoundError` y `normalizeFileSelectorPath` para rutas de archivo; alinear mensajes/DTO con CLI.

4. **Eliminar duplicados CLI tras merge**  
   Los archivos locales `graph-index-lock.ts`, `build-project-graph-config.ts`, `bootstrap-graph-config.ts` en feature **desaparecen** en main — no reintroducirlos al resolver conflictos.

5. **`CodeGraphProvider`**  
   Aceptar métodos de main (`analyzeFilesImpact`, locks). Renombres menores en main: `getCoveringSpecsForFile` → `getCoveringSpecs`, `getCoveringSpecsForSymbol` → `getSymbolCoveringSpecs` (verificar si algún handler Studio usa los nombres viejos).

6. **Fingerprint mismatch (opcional pero recomendado)**  
   Main advierte en CLI vía `warnGraphStale` + `detectFingerprintMismatch`. Studio podría exponer warning en `GraphStatusDto` o banner UI — no bloqueante para merge, pero paridad deseable.

**Tests nuevos en main a usar como referencia:**  
`is-graph-stale.spec.ts`, `traversal.spec.ts`, `analyze-files-impact.spec.ts`, `index-lock.spec.ts`, `compute-graph-fingerprint.spec.ts`.

---

### 6. Metadata LLM y project context

**Qué hace main**

- `GetProjectContext` refactorizado con `ListWorkspaces`, freshness de project metadata, soporte `llmOptimizedContext`.
- CLI `project context`: flags `--optimized` / `--no-optimized`.
- Skills: templates `.tpl` + `skill.meta.json`, agentes optimizadores de contexto, `resolve-bundle` ampliado.

**Estado en feature**

- Commit `39ed679f` — _feat(core): add llm-optimized metadata and project context infrastructure_ — solapa con main.
- Commit `76fdb090` — skills capability-aware templates — solapa con `50015cfb` / `d6a81289`.

**Adaptación:** merge en `get-project-context.ts`, `packages/skills`, y plugin-agent `install-skills.ts` (5 plugins). No hay endpoints Studio dedicados a metadata LLM aún; impacto indirecto vía kernel.

---

### 7. Agent plugins → `resolve-bundle`

**Qué hace main**

- Los cinco `plugin-agent-*` enrutan instalación por `ResolveBundle` en lugar de lógica ad hoc.
- Nuevos dominios: `shared-folder`, `skill-template-metadata`, errores de validación.

**Estado en feature:** cambios paralelos en los mismos archivos (~207 archivos en conflicto incluyen los 5 `install-skills.ts`).

**Adaptación:** preferir implementación de main; re-ejecutar tests de install-skills. Sin impacto directo en IPC Studio.

---

### 10. WIP local en feature — **resuelto (2026-06-30)**

El WIP de polling UI / e2e quedó integrado en el merge y verificado en Fase 4. Pendiente solo QA manual opcional (Fase 4).

---

### 8. schema-std: registro de dependencias de spec

**Qué hace main (`5884b5e2`)**

- `schema.yaml` y `proposal.md` exigen registro explícito de dependencias de spec.

**Adaptación Studio:** bajo impacto en runtime; puede afectar validación de changes creados desde UI si el schema activo cambia.

---

## `@specd/sdk` — implementado en `main`

Track A creó `packages/sdk` (`@specd/sdk`). Detalle completo en [core-refactor-on-main.md](./core-refactor-on-main.md). Resumen para el merge Studio:

### Paquete y exports reales

```json
{
  "name": "@specd/sdk",
  "exports": {
    ".": "./dist/index.js",
    "./ports": "./dist/ports.js",
    "./extensions": "./dist/extensions.js"
  }
}
```

**No** hay subpaths `./core`, `./graph`, `./project` — todo va por el barrel principal `.` (curado en `core-reexports.ts` + re-export selectivo de code-graph).

### API pública del SDK (lo que usarán api/IPC)

| Módulo                             | Símbolos clave                                                                                                                                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **composition**                    | `openSpecdHost`, `createSdkContext`, `withOpenGraphProvider`                                                                                                                                          |
| **orchestration**                  | `buildProjectStatusSnapshot`, `runIndexProjectGraph`                                                                                                                                                  |
| **core** (vía `core-reexports.ts`) | `createKernel`, `Kernel`, use cases, `createConfigWriter`, `GetProjectSummary`, …                                                                                                                     |
| **code-graph** (vía `index.ts`)    | `createGetGraphHealth`, `createIndexProjectGraph`, `createGetSpecCoverage`, `createGetChangeSpecCoverage`, `isGraphStale`, `acquireGraphIndexLock`, `buildProjectGraphConfig`, `CodeGraphProvider`, … |

### Deltas vs plan original (importante para cableado)

| Plan original                                        | Realidad en `main`                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| `createSdkContext({ kernel, createGraphProvider? })` | `createSdkContext(config, kernelOptions?)` — **siempre crea kernel** desde config |
| `openSpecdHost` sin `config` en resultado            | `OpenSpecdHostResult` incluye `config` + `configFilePath` además de kernel        |
| `fetchGraphStatus` / `runGraphIndex` en SDK          | `createGetGraphHealth` en **code-graph**; `runIndexProjectGraph` en SDK           |
| `kernel.specs.approveSpec`                           | `kernel.changes.approveSpec` / `approveSignoff`                                   |
| `createAddPlugin` / `createRemovePlugin`             | `createConfigWriter` en borde (CLI `plugins install`)                             |
| `listPluginDeclarations` en core                     | `getDeclaredPlugins` helper en CLI (`plugins/get-declared-plugins.ts`)            |
| `buildProjectStatusSnapshot` → `{ summary, graph }`  | `{ summary, graphHealth, approvals, llmOptimizedContext, hotspots? }`             |
| `orchestration/changes/*` en SDK                     | **No implementado** — hosts llaman `kernel.changes.*` directo                     |
| Hosts sin import de core/graph                       | ✅ CLI, MCP, `api`, desktop IPC — solo `@specd/sdk` (Track B + post-archive)      |

### Estructura de archivos (`packages/sdk/src/`)

```
composition/
  host-context.ts          # openSpecdHost, createSdkContext, SdkHostContext
  with-open-graph-provider.ts
orchestration/
  build-project-status-snapshot.ts
  run-index-project-graph.ts   # beforeOpen hook para lock CLI
core-reexports.ts            # barrel curado de @specd/core/public
index.ts
```

Specs archivadas en `main`: `specs/sdk/{composition,host-context,build-project-status-snapshot,run-index-project-graph,with-open-graph-provider}/`.

### Catálogo Studio → capa real (post-merge)

| Operación `SpecdDataPort`                   | Llamar a                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `getProjectStatus`                          | `buildProjectStatusSnapshot(ctx, { includeGraph })` → presenter                                    |
| `getGraphStatus`                            | `withOpenGraphProvider` + `createGetGraphHealth().execute(...)` → presenter                        |
| `indexGraph`                                | `runIndexProjectGraph(ctx, { force, beforeOpen: lock })` → presenter                               |
| `getChangeStatus`                           | `kernel.changes.status.execute({ name, ifModifiedSince })` — **añadir `ifModifiedSince` en merge** |
| `getSpecGraphView`                          | `createGetSpecCoverage().execute(...)` → presenter                                                 |
| `getChangeGraphView`                        | `createGetChangeSpecCoverage().execute(...)` + `kernel.changes.repo` → presenter                   |
| `searchGraph` / `getImpact` / `getHotspots` | `provider.*` dentro de `withOpenGraphProvider`                                                     |
| `listChangeArtifacts`                       | `repo.get*` + `GetStatus` → presenter (sin SDK)                                                    |

---

## Esbozo histórico: `@specd/sdk` — orquestación + re-export de dominios

> Sección conservada como referencia del diseño original. **La implementación vigente es la de arriba.**

Objetivo: **un solo paquete para hosts** (`cli`, `api`, `ipc`, `mcp`) que (1) **re-exporta** las superficies de `@specd/core` y `@specd/code-graph` y (2) añade **orquestaciones** que hoy están duplicadas entre adaptadores.

### Nombre: `@specd/sdk` (no `@specd/app`)

| Paquete             | Rol                                                   | Consumidores                          |
| ------------------- | ----------------------------------------------------- | ------------------------------------- |
| **`@specd/sdk`**    | SDK de **servidor / host** — dominios + orquestación  | `cli`, `api`, `studio-desktop`, `mcp` |
| **`@specd/client`** | SDK de **cliente / wire** — DTOs, HTTP, IPC envelopes | `@specd/ui` únicamente                |

Evitar llamarlo solo `app`: choca con “aplicación Studio” y no deja claro que también alimenta el CLI. **`sdk`** comunica “punto de entrada para integradores/host”, en paralelo a `client` para UI.

### Alcance completo en `main` (no SDK mínimo)

`main` no tiene `api` ni Studio, pero el SDK **no se limita a lo que el CLI usa hoy**. Se diseña contra el catálogo **`SpecdDataPort`** y los handlers duplicados de la rama feature (`handler-*.ts`, `ipc-handlers.ts`):

- Implementar en `packages/sdk` **toda la orquestación** que hoy repiten API e IPC.
- Validar en `main` con tests unitarios/integración del SDK (y CLI/MCP como primer consumidor).
- Tras el merge, **api/IPC/desktop solo cablean**: `import { … } from '@specd/sdk'` + presenters → DTO (`@specd/client`).

**No** añadir módulos al SDK post-merge salvo gaps nuevos; el merge Studio es migración de adaptadores, no diseño del SDK., main movió lógica de **dominio grafo** al paquete `code-graph`, pero la **orquestación cross-cutting** sigue repartida entre:

- `packages/cli/src/commands/graph/*` (`withProvider`, `warn-graph-staleness`, index, impact, …)
- `packages/api/src/delivery/http/handlers/*`
- `apps/specd-studio-desktop/.../ipc-handlers.ts`
- (futuro) `@specd/mcp` donde componga kernel + graph

Studio duplica más y peor; el CLI **también** debe consumir el mismo SDK.

### Superficie del paquete: re-exports + orquestación

**Dependencias internas:** `@specd/core`, `@specd/code-graph` (desktop: factory sqlite vía `code-graph-electron` inyectada en runtime, no como dep transitiva obligatoria del SDK).

**Exports recomendados** (`packages/sdk/package.json`):

```json
{
  "name": "@specd/sdk",
  "exports": {
    ".": "./dist/index.js",
    "./core": "./dist/re-exports/core.js",
    "./code-graph": "./dist/re-exports/code-graph.js",
    "./graph": "./dist/orchestration/graph/index.js",
    "./project": "./dist/orchestration/project/index.js",
    "./changes": "./dist/orchestration/changes/index.js"
  }
}
```

**Barrel principal** — dominios re-exportados + orquestación de primer nivel:

```ts
// packages/sdk/src/index.ts (esbozo)

// Re-export dominios (hosts pueden seguir usando kernel/provider directamente)
export * from '@specd/core'
export * from '@specd/code-graph'

// Orquestación (valor añadido del SDK)
export { fetchGraphStatus, runGraphIndex, runGraphSearch } from './orchestration/graph/index.js'
export { buildProjectStatusSnapshot } from './orchestration/project/index.js'
export { withOpenGraphProvider } from './orchestration/context/with-graph-provider.js'
```

**Alternativa más explícita** (si el barrel plano es demasiado ancho):

```ts
export * as core from '@specd/core'
export * as codeGraph from '@specd/code-graph'
export * from './orchestration/index.js'
```

Uso en hosts:

```ts
// Preferido tras migración
import { createKernel, fetchGraphStatus, isGraphStale } from '@specd/sdk'

// O subpaths si el barrel es pesado
import { createKernel } from '@specd/sdk/core'
import { runGraphIndex } from '@specd/sdk/graph'
```

**Política de re-export:**

| Re-exportar                                                            | Motivo                                         |
| ---------------------------------------------------------------------- | ---------------------------------------------- |
| API pública estable de `core` y `code-graph`                           | Un solo `package.json` dependency en hosts     |
| Tipos `Kernel`, `SpecdConfig`, `CodeGraphProvider`, errores de dominio | Evitar `core` + `sdk` en paralelo              |
| **No** re-exportar `@specd/client`                                     | Frontera UI intacta                            |
| Orquestación solo en `./orchestration/*`                               | Diferenciar “dominio” vs “composition” en docs |

Si un símbolo es interno o experimental en `core`/`code-graph`, **no** re-exportarlo desde `sdk` (barrel selectivo o `export type` only).

### ¿Es un SDK? ¿No es “core otra vez”?

**Sí y no** — y aplica al CLI igual que a API/IPC.

| Paquete            | Qué es                                                                   | Depende de core/graph                |
| ------------------ | ------------------------------------------------------------------------ | ------------------------------------ |
| `@specd/client`    | **SDK de cliente / wire** — `SpecdDataPort`, DTOs, HTTP, envelopes IPC   | **No**                               |
| `@specd/sdk`       | **SDK de host** — re-export `core` + `code-graph` + orquestación         | **Sí** (vía deps + re-exports)       |
| `@specd/cli`       | **Adaptador CLI** — argv, formato text/json/toon, stderr, `process.exit` | Vía capa compartida + kernel         |
| `@specd/api` / IPC | **Adaptadores de transporte** — HTTP o Electron                          | Vía capa compartida + presenters/DTO |

La capa compartida **no reimplementa** dominio. Orquesta:

- `kernel.*` → `@specd/core`
- `CodeGraphProvider` + exports → `@specd/code-graph`

Ejemplos de **application services** (hoy triplicados o duplicados):

| Operación              | Hoy en CLI                                               | Hoy en Studio                                   |
| ---------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| Indexar grafo          | `graph index` + `withProvider` + lock + `listWorkspaces` | `indexGraph` IPC/HTTP                           |
| Staleness              | `warn-graph-staleness` (main)                            | inline en `getProjectStatus` / `getGraphStatus` |
| Impact multi-file      | `graph impact` + provider                                | `getImpact` IPC/HTTP                            |
| Project status + graph | `project status` + kernel parallel + stats               | `getProjectStatus`                              |

`4de31d39` fue **medio paso**: bajó lógica al **dominio** `code-graph`; no creó aún la capa que **todos los hosts** comparten.

**Riesgo a evitar:** un “core gordo”. Criterio:

| Pregunta                           | Destino                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| ¿Solo `kernel` / dominio specd?    | **`@specd/core`** (ver [core-refactor-on-main.md](./core-refactor-on-main.md)) |
| ¿Solo `CodeGraphProvider` / grafo? | **`@specd/code-graph`**                                                        |
| ¿`kernel` + `code-graph`?          | **`@specd/sdk`**                                                               |
| ¿DTO / HTTP / IPC / text output?   | Adaptador (`cli`, `api`, `ipc`)                                                |

**Relación con paquetes existentes:**

```
@specd/core          → dominio specd (use cases)
@specd/code-graph    → dominio grafo
@specd/sdk          → re-export core + code-graph + orchestration (graph, project, …)
@specd/cli           → adaptador: commander + output
@specd/api           → adaptador: Fastify + OpenAPI + presenters → @specd/client DTOs
studio-desktop main  → adaptador: IPC + Electron
@specd/mcp           → adaptador: tools (mismo @specd/sdk)
@specd/client        → wire SDK hacia UI (sin core)
@specd/ui            → React
```

### Principio de capas

| Capa                                | Responsabilidad                                                                                  | No debe hacer                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `@specd/core` / `@specd/code-graph` | Dominio y use cases de un bounded context                                                        | Commander, Fastify, DTOs UI                                |
| **`@specd/sdk`** (nuevo)            | Application services compartidos; lifecycle provider (open/close/lock); composición kernel+graph | Formato text/json, HTTP routes, IPC envelopes              |
| `@specd/cli`                        | Parse argv, formato salida, stderr, exit codes                                                   | `listWorkspaces`+`index` inline si ya está en `@specd/sdk` |
| `@specd/api` / IPC                  | Transporte + **presenters** → DTO (`@specd/client`)                                              | Staleness/index inline                                     |
| `@specd/client`                     | Contrato wire hacia UI                                                                           | `core` / `code-graph`                                      |

### Arquitectura objetivo

```
                    @specd/cli
                    @specd/api ─────┐
                    studio-desktop ───┼──►  @specd/sdk   ← composición compartida
                    @specd/mcp ───────┘         │
                                                ├── @specd/core
                                                └── @specd/code-graph[-electron]

@specd/ui  →  @specd/client  →  api / ipc   (solo Studio UI; CLI no usa client)
```

### Reglas de dependencia (post-migración)

**Regla dura — hosts de entrega:** `cli`, `api`, `studio-desktop` (main + preload donde aplique), `mcp` importan **solo** `@specd/sdk`. Ni `@specd/core` ni `@specd/code-graph` en `package.json` ni en código de esos paquetes.

```ts
// ✅ hosts
import { createKernel, fetchGraphStatus, TransitionChange } from '@specd/sdk'

// ❌ hosts (tras migración)
import { createKernel } from '@specd/core'
import { isGraphStale } from '@specd/code-graph'
```

**Quién sí puede importar `@specd/core` directamente:**

| Paquete                      | Motivo                                                |
| ---------------------------- | ----------------------------------------------------- |
| `@specd/sdk`                 | Facade — re-exporta y orquesta                        |
| `@specd/code-graph`          | Dominio hermano; peer de `core`, no host              |
| `@specd/code-graph-electron` | Adaptador runtime sqlite (mismo nivel que code-graph) |
| `@specd/core`                | Interno                                               |

**Extensiones del kernel** (`skills`, `plugin-manager`, `plugin-agent-*`): hoy dependen de `core` para contratos y use cases sin grafo. Opciones:

1. **Mantener `core` directo** — válido si no orquestan graph (menos acoplamiento que arrastrar todo el SDK).
2. **Subpath `@specd/sdk/core`** — mismo contrato, una sola dependencia declarada en hosts; extensiones pueden alinearse después.

**Nunca:** `@specd/ui`, `@specd/client` → `core`, `code-graph` ni `sdk`.

**Grafo de deps objetivo:**

```
core ◄── code-graph ◄── sdk ◄── cli | api | mcp | studio-desktop
  ▲         ▲
  └── code-graph-electron
  └── skills / plugin-*  (core directo o sdk/core — ver arriba)

ui → client → api/ipc   (sin sdk)
```

**Migración:** sustituir `"@specd/core"` / `"@specd/code-graph"` por `"@specd/sdk"` en `package.json` de hosts; reemplazar imports; ESLint `no-restricted-imports` en `api`, `studio-desktop` (main/preload) y `mcp` (✅).

Cada adaptador se queda con **lo suyo**:

- **CLI:** `commander`, `output()`, `warnGraphStale` → `stderr` (o llamar servicio que devuelve `warnings[]` y el CLI los imprime).
- **API/IPC:** routing + mapeo a DTO.
- **SDK:** `runGraphIndex`, `fetchGraphStatus`, `runGraphSearch`, `runGraphImpact`, `buildProjectStatusSnapshot`, …

### Ubicación propuesta

**Paquete nuevo:** `packages/sdk` (`@specd/sdk`)

- Dependencias: `@specd/core`, `@specd/code-graph`.
- Consumidores: `@specd/cli`, `@specd/api`, `specd-studio-desktop`, `@specd/mcp`.
- **No** consumido por `@specd/ui` ni `@specd/client`.

Estructura sugerida:

```
packages/sdk/src/
  re-exports/
    core.ts
    code-graph.ts
  context/
    with-graph-provider.ts
    app-context.ts              # { kernel, config, createGraphProvider }
  graph/
    fetch-graph-status.ts
    run-graph-index.ts
    run-graph-search.ts
    run-graph-impact.ts
    run-graph-hotspots.ts
    fetch-spec-coverage.ts
    fetch-change-spec-coverage.ts
  project/
    build-project-status-snapshot.ts
  changes/
    get-change-status.ts        # delega GetStatus (opcional; puede ser pass-through)
    get-change-context.ts
    create-change.ts
    read-only-change.ts         # draft / discarded / archived variants
    preview-change.ts           # si hay ensamblado compartido
  # listChangeArtifacts → NO en SDK: repo.get + GetStatus + presenter (api/IPC)
```

**Migración CLI (misma ola que Studio):** sustituir cuerpos de `graph index`, `graph stats`, `warn-graph-staleness`, etc. por llamadas a `@specd/sdk`; conservar en CLI solo formato y side effects de terminal.

**Anti-patrones:**

- `@specd/sdk` solo para hosts → el CLI seguiría duplicando si se llamara `studio-*`.
- Lógica en `@specd/client` → rompe frontera UI/core.
- `api/src/application` importado por desktop → acopla HTTP a Electron.

### API del paquete (borrador)

```ts
// packages/sdk/src/graph/graph-status.ts — igual para CLI, API, IPC

// packages/sdk/src/graph/graph-index.ts (esbozo)

import { isGraphStale, type CodeGraphProvider } from '@specd/code-graph'
import { type SpecdConfig, createVcsAdapter } from '@specd/core'

export async function resolveGraphStale(
  config: SpecdConfig,
  stats: Awaited<ReturnType<CodeGraphProvider['getStatistics']>>,
): Promise<boolean | null> {
  const currentRef = await createVcsAdapter(config.projectRoot)
    .then((v) => v.ref())
    .catch(() => null)
  return isGraphStale(stats.lastIndexedRef, currentRef)
}

// packages/sdk/src/graph/graph-index.ts (esbozo)
import { acquireGraphIndexLock, buildProjectGraphConfig } from '@specd/code-graph'
import { type Kernel, type SpecdConfig } from '@specd/core'

export async function runGraphIndex(
  ctx: { kernel: Kernel; config: SpecdConfig; provider: CodeGraphProvider },
  options: { force?: boolean; codeGraphVersion?: string },
): Promise<IndexResult> {
  const release = acquireGraphIndexLock(ctx.config)
  try {
    if (options.force) await ctx.provider.recreate()
    const workspaces = await ctx.kernel.project.listWorkspaces.execute()
    const graphConfig = buildProjectGraphConfig(ctx.config)
    return await ctx.provider.index({
      /* … */
    })
  } finally {
    release()
  }
}
```

Los **presenters** (`toGraphStatusDto`, etc.) pueden quedarse en `api` e `ipc-handlers`, o moverse a un módulo `sdk/presenters` si se quiere un solo mapeo — pero los DTOs siguen definidos en `@specd/client`.

### Qué migra de cada handler

| Operación hoy                                         | Módulo `@specd/sdk`                                                   | Adaptador (presenter / CLI output / IPC)                     |
| ----------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| `getGraphStatus`                                      | `fetchGraphStatus`                                                    | API/IPC: `toGraphStatusDto`; CLI: texto + stderr warnings    |
| `getProjectStatus` (parte graph)                      | `fetchGraphStatus`                                                    | `toProjectStatusDto`; counts vía `GetProjectSummary` en core |
| `indexGraph`                                          | `runGraphIndex`                                                       | `toGraphIndexResultDto`                                      |
| `searchGraph`                                         | `searchGraph(provider, query)`                                        | `toGraphSearchResultDto`                                     |
| `getImpact`                                           | `provider.analyzeImpact` / `analyzeFilesImpact` + `SpecNotFoundError` | `toGraphImpactDto`                                           |
| `getHotspots`                                         | `provider.getHotspots`                                                | presenter hotspots                                           |
| `getSpecGraphView` / `getChangeGraphView` (port wire) | `fetchSpecCoverage` / `fetchChangeSpecCoverage`                       | presenters → DTO                                             |

### Handlers después del refactor (forma objetivo)

```ts
// CLI — graph stats (esbozo): solo formato
import { fetchGraphStatus } from '@specd/sdk/graph'
await withGraphProvider(config, fmt, async (provider) => {
  const result = await fetchGraphStatus({ config, provider })
  for (const w of result.warnings) process.stderr.write(`warning: ${w}\n`)
  output(formatStats(result.stats), fmt)
})

// HTTP — handler-graph.ts (esbozo): solo DTO
import { fetchGraphStatus } from '@specd/sdk/graph'
apiHandler(async (ctx) => {
  const result = await ctx.withGraphProvider((provider) =>
    fetchGraphStatus({ config: ctx.config, provider }),
  )
  return toGraphStatusDto(result.stats, result.stale ?? false)
})
```

### Catálogo SDK ↔ Studio (implementar en `main`)

Referencia: `packages/client/src/specd-data-port.ts` y handlers en feature. Lo que baja a **core** (P0–P2) se consume vía re-export; lo que **compone** kernel+graph o ensambla varios use cases va en **orchestration**.

| Área           | Operación / port                            | Módulo `@specd/sdk`                                    | Notas                                                  |
| -------------- | ------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| **Context**    | `withGraphProvider`, open/close/lock        | `context/with-graph-provider.ts`                       | CLI, API, IPC, MCP                                     |
| **Graph**      | `getGraphStatus`                            | `graph/fetch-graph-status.ts`                          | stale + warnings[]                                     |
| **Graph**      | `indexGraph`                                | `graph/run-graph-index.ts`                             | lock + `listWorkspaces`                                |
| **Graph**      | `searchGraph`                               | `graph/run-graph-search.ts`                            |                                                        |
| **Graph**      | `getImpact`                                 | `graph/run-graph-impact.ts`                            | multi-file / symbol                                    |
| **Graph**      | `getHotspots`                               | `graph/run-graph-hotspots.ts`                          |                                                        |
| **Graph**      | `getSpecGraphView` (port)                   | `graph/fetch-spec-coverage.ts`                         | `fetchSpecCoverage`                                    |
| **Graph**      | `getChangeGraphView` (port)                 | `graph/fetch-change-spec-coverage.ts`                  | `fetchChangeSpecCoverage`                              |
| **Project**    | `getProjectStatus`                          | `project/build-project-status-snapshot.ts`             | `GetProjectSummary` + graph slice                      |
| **Project**    | `getProject`                                | — (core)                                               | pass-through kernel                                    |
| **Changes**    | `getChangeStatus` (+ `ifModifiedSince`)     | `changes/get-change-status.ts` o re-export `GetStatus` | refresh default `true` **si activo** (paridad CLI)     |
| **Changes**    | `listChangeArtifacts`                       | **— (no SDK)**                                         | `repo.get*` + `GetStatus` → merge en presenter api/IPC |
| **Changes**    | `getChangeContext`                          | `changes/get-change-context.ts`                        | refresh + compile flags                                |
| **Changes**    | `createChange`                              | `changes/create-change.ts`                             | schema activo opcional                                 |
| **Changes**    | draft/discarded read variants               | `changes/read-only-change.ts`                          | mismo use case, distinto repo                          |
| **Changes**    | `previewChange`, `outlineChangeArtifact`, … | `changes/*` según duplicación medida                   | prioridad media                                        |
| **Workspaces** | `listWorkspaces`, specs collection          | — o `workspaces/*` si hay ensamblado                   | mayoría core                                           |
| **Archived**   | list paginado archive                       | — (core)                                               | feature ya alineado                                    |

Tests en `packages/sdk/test/` deben cubrir graph, project status, change status/context (staleness, lock, refresh default).

### Adaptación en feature (post-merge) — quitar / simplificar

Tras heredar core + sdk de `main`, en **`feat/user-interface`**:

#### Orquestación inline → SDK o core

| Hoy en feature                                                          | Acción                                                                      |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `refreshImplementationTracking` manual antes de `status` / `transition` | Borrar; `GetStatus` / `TransitionChange` (refresh default `true` si activo) |
| `getActiveSchema` antes de `create`                                     | Borrar; `CreateChange` resuelve schema                                      |
| `refresh` + `compile` manual en context                                 | Borrar; `CompileContext`                                                    |
| Staleness / index / impact inline en graph handlers                     | `@specd/sdk/graph/*`                                                        |
| `getProjectStatus` counts en paralelo                                   | `GetProjectSummary` + `buildProjectStatusSnapshot`                          |

#### `readArtifactTaskMapsForChange` — eliminar

Solo existe en feature (`handler-changes-read.ts`, `ipc-handlers.ts`). **No** está en `main`. No requiere cambio en core: `GetStatus.artifactStatuses` ya expone `hasTasks` y `taskCompletion`.

**`listChangeArtifacts`** (activo / draft / discarded):

```ts
const [view, status] = await Promise.all([
  kernel.changes.repo.get(name), // o getDraft / getDiscarded
  kernel.changes.status.execute({ name }),
])
return toArtifactListDtoFromView(view, {
  hasTasksByType: new Map(status.artifactStatuses.map((a) => [a.type, a.hasTasks])),
  taskSummaryByType: new Map(
    status.artifactStatuses
      .filter((a) => a.taskCompletion !== undefined)
      .map((a) => [
        a.type,
        { totalTasks: a.taskCompletion!.total, completedTasks: a.taskCompletion!.complete },
      ]),
  ),
})
```

- Eliminar `readArtifactTaskMapsForChange` y `readArtifactTaskMaps`.
- No módulo SDK para list-artifacts; merge en **presenter** api/IPC.

#### `getChangeStatus`

Ya usa `GetStatus`; tras merge: quitar refresh manual si existe; `refreshImplementation` en wire puede default `true` (opt-out `false`).

#### Referencias de handlers feature

| Patrón duplicado   | Archivos                                                                    |
| ------------------ | --------------------------------------------------------------------------- |
| refresh + status   | `handler-changes-read.ts`; `ipc-handlers.ts`                                |
| create + schema    | `handler-changes-collection.ts`; `ipc-handlers.ts`                          |
| compile context    | `handler-changes-read.ts`; `ipc-handlers.ts`                                |
| artifact task maps | `handler-changes-read.ts` `readArtifactTaskMaps*`; `ipc-handlers.ts` ~L1086 |
| graph stale inline | `handler-graph.ts`, `handler-project.ts`, `ipc-handlers.ts`                 |

### Fases de implementación (orden recomendado)

**Track A — en `main`:** ✅ **completado** (`87401d64`). Ver [core-refactor-on-main.md](./core-refactor-on-main.md).

**Track B — tras merge `main` → `feat/user-interface`:** ✅ **completado**

1. `git merge main` — heredado `packages/sdk` + core/code-graph refactorizados.
2. Conflictos resueltos: `kernel.ts`, `get-status.ts` (`ifModifiedSince`), code-graph, lockfile.
3. Cableado `api`, `ipc-handlers`, `studio-desktop` → `@specd/sdk`; presenters → DTO.
4. Post-archive: CJS main bundle, `ELECTRON_RUN_AS_NODE`, IPC session teardown, `exports.require` en sdk/client/code-graph-electron.

### Decisiones abiertas (post Track A)

| Tema                                    | Estado en `main`                                | Studio (Track B)                                                |
| --------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| Barrel vs namespaces                    | Barrel plano `.` con `core-reexports.ts` curado | ✅ Imports api/IPC migrados                                     |
| Warnings staleness                      | `GetGraphHealthResult.warnings[]`; CLI stderr   | ⏳ Opcional: exponer en `GraphStatusDto`                        |
| Presenters                              | En CLI (`output()`); no en SDK                  | ✅ Siguen en api/ipc                                            |
| `ifModifiedSince`                       | **No en main**                                  | ✅ Fusionado en `get-status.ts`; polling UI conservado          |
| `createSdkContext` con kernel existente | Solo desde `config`                             | ✅ Desktop: `createSdkContext` + `resetDesktopKernel` en switch |

### Criterio de hecho

**Track A (`main`) — cumplido:**

- [x] CLI/MCP sin import directo de `@specd/core` / `@specd/code-graph` (solo `@specd/sdk`)
- [x] `@specd/sdk` con `openSpecdHost`, orquestación graph/project, tests en `packages/sdk/test/`
- [x] Public barrels en core y code-graph (`public.ts`)
- [x] Use cases host en core (P0–P3) y code-graph (G1)

**Track B (feature, post-merge) — cumplido:**

- [x] Cero comparaciones `lastIndexedRef !== currentRef` inline en handlers api/IPC
- [x] `indexGraph` bajo lock (`runIndexProjectGraph` + `beforeOpen`)
- [x] `api`, `ipc-handlers`, `studio-desktop` sin import directo de `@specd/core` / `@specd/code-graph`
- [x] `@specd/client` sin dependencia de `core` / `code-graph`
- [x] `ifModifiedSince` preservado tras merge de `get-status.ts`

## División `core` vs `@specd/sdk` (resumen)

```
@specd/core     → flujos y read models solo specd (change, project, specs)
@specd/code-graph → dominio grafo
@specd/sdk      → kernel + code-graph (y presenters-agnóstico)
cli / api / ipc → transporte + DTOs + formato
```

| Vive en **core** (en `main`)                           | Vive en **code-graph** (G1)                          | Vive en **`@specd/sdk`**                                     |
| ------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------ |
| `GetStatus` + refresh si activo (default `true`)       | `GetGraphHealth` (`createGetGraphHealth`)            | `openSpecdHost`, `createSdkContext`, `withOpenGraphProvider` |
| `TransitionChange` + refresh previo                    | `IndexProjectGraph`                                  | `buildProjectStatusSnapshot`                                 |
| `CompileContext` defaults bakeados                     | `GetSpecCoverage`, `GetChangeSpecCoverage`           | `runIndexProjectGraph`                                       |
| `CreateChange` schema activo interno                   | `provider.search`, `getHotspots`, `analyzeImpact`, … | Re-exports curados de core + code-graph                      |
| `GetProjectSummary`                                    | `isGraphStale`, locks, `buildProjectGraphConfig`     |                                                              |
| `kernel.changes.approveSpec` / `approveSignoff` (P3)   |                                                      |                                                              |
| `ifModifiedSince` — **solo feature** (añadir en merge) |                                                      |                                                              |
| Proyección artifact list                               |                                                      | Presenter api/IPC + `GetStatus.artifactStatuses`             |

**No confundir:** `@specd/client` sigue sin `core`; Studio UI no importa use cases.

---

## Mapa de capas Studio y dependencias

```
@specd/cli ────────────────┐
@specd/api ────────────────┼──►  @specd/sdk  ──►  core + code-graph
studio-desktop (ipc) ──────┘

@specd/ui  →  @specd/client  →  api / ipc
```

**Archivos IPC/API clave a revisar tras merge:**

| Archivo                                                                | Métodos / responsabilidad                     |
| ---------------------------------------------------------------------- | --------------------------------------------- |
| `apps/specd-studio-desktop/src/main/ipc-handlers.ts`                   | ~50 métodos `SpecdDataPort` + graph + session |
| `apps/specd-studio-desktop/src/preload/bridge.ts`                      | Canal IPC                                     |
| `apps/specd-studio-desktop/src/renderer/desktop-local-data-adapter.ts` | Mapeo port → IPC                              |
| `packages/api/src/delivery/http/handlers/handler-graph.ts`             | Graph HTTP: status, index, search, impact     |
| `packages/api/src/delivery/http/handlers/handler-project.ts`           | `getProjectStatus` + graph stale              |
| `packages/api/src/delivery/http/presenters/presenter-change.ts`        | DTOs change/status                            |
| `packages/api/src/delivery/http/openapi-schemas.ts`                    | Contrato OpenAPI                              |
| `packages/client/src/specd-data-port.ts`                               | Interface agregada                            |
| `packages/client/src/dto/*`                                            | Tipos compartidos UI/API/IPC                  |

---

## Conflictos previstos (muestra representativa)

Archivos de **máximo riesgo** para API/IPC (cambiados en ambas ramas):

```
packages/core/src/composition/kernel.ts
packages/core/src/application/use-cases/get-status.ts
packages/core/src/application/use-cases/refresh-implementation-tracking.ts
packages/core/src/application/use-cases/update-implementation-tracking.ts
packages/core/src/application/use-cases/get-project-context.ts
packages/core/src/application/use-cases/compile-context.ts
packages/core/src/infrastructure/fs/archive-repository.ts
packages/core/src/domain/entities/change.ts
packages/code-graph/src/composition/code-graph-provider.ts
packages/code-graph/src/infrastructure/sqlite/sqlite-graph-store.ts
packages/code-graph/src/application/use-cases/index-code-graph.ts
packages/code-graph/src/application/services/build-project-graph-config.ts   # nuevo en main (movido desde CLI)
packages/code-graph/src/infrastructure/index-lock.ts                        # nuevo en main
packages/cli/src/commands/graph/impact.ts
packages/cli/src/commands/graph/index-graph.ts
packages/cli/src/commands/graph/stats.ts
packages/cli/src/commands/graph/search.ts
packages/cli/src/commands/change/status.ts
packages/cli/src/commands/change/deps.ts
pnpm-lock.yaml
```

**Conflictos adicionales por `4de31d39`:** los archivos CLI `graph-index-lock.ts`, `bootstrap-graph-config.ts`, `build-project-graph-config.ts` existen en feature pero **main los borra** — al resolver, eliminar copias CLI y usar exports de `@specd/code-graph`.

**~207 archivos** en total con modificaciones en ambos lados (incluye specs, metadata `.specd`, tests).

---

## Trabajo ya hecho en feature que main no tiene (conservar)

Commits representativos desde `1865ee76`:

- Stack Studio completo (`9cd04791`, `31355417`, sidebar/titlebar `bdeb5a59`, etc.)
- `packages/api` + OpenAPI + validación de inputs
- `apps/specd-studio-desktop` + flujo open local project
- `packages/code-graph-electron` + sqlite vendored local build (`2d5e95ea`)
- Read-only artifacts / draft-discarded studio (`58c80d6a`, `4ba62267`, `9dfe1629`)
- UI: shadcn, graph main view, global search, command palette, hubs
- Polling `ifModifiedSince` en status
- Output buffering localizado (`7bb46283`)

Ninguno de estos existe en `main`; el merge **no debe eliminarlos**.

---

## Checklist de adaptación post-merge (orden sugerido)

### Fase 0 — `main` (rama `main`) — ✅ completado

- [x] [core-refactor-on-main.md](./core-refactor-on-main.md) (P0–P3, G1, A2, A3)
- [x] `packages/sdk` con orquestación graph/project
- [x] Tests `packages/sdk` (composition, orchestration, barrel boundary)
- [x] CLI + MCP migrados a `@specd/sdk`

### Fase 1 — Merge + core (feature, post-merge) — ✅

- [x] Resolver `kernel.ts` (main + extensiones Studio)
- [x] Resolver `get-status.ts` (merge `ifModifiedSince` + schema-walking)
- [x] Adoptar implementation tracking endurecido de main
- [x] Resolver `sqlite-graph-store.ts` + añadir `in-memory-index-session.ts`
- [x] Resolver extracción graph `4de31d39`: `code-graph-provider.ts`, `index-lock.ts`, eliminar duplicados CLI
- [x] `pnpm install` / lockfile

### Fase 2 — Verificar contratos — ✅

- [x] `pnpm --filter @specd/core test`
- [x] `pnpm --filter @specd/code-graph test` (incl. `is-graph-stale`, `index-lock`, `traversal`)
- [x] `pnpm --filter @specd/code-graph-electron test`

### Fase 3 — API + IPC (feature, post-merge) — ✅

- [x] Sustituir orquestación inline por `@specd/sdk` / use cases core (ver § Adaptación en feature)
- [x] **Eliminar** `readArtifactTaskMapsForChange` / `readArtifactTaskMaps`; list-artifacts usa `GetStatus` + presenter
- [x] Quitar refresh manual en handlers (refresh bakeado en use cases de main)
- [x] Eliminar imports directos de `core`/`code-graph` en `api`, `ipc-handlers`, `studio-desktop`
- [x] Presenters/DTO; tests api/desktop verdes en sesión de verificación
- [x] Tests: `desktop-local-data-adapter.spec.ts`, `desktop-graph-runtime.spec.ts`

### Fase 4 — UI — ✅ (con notas)

- [x] `pnpm --filter @specd/ui test`
- [x] E2E: `apps/specd-studio-web/tests/e2e/studio.ui.spec.ts` — status poll, archive sidebar, graph search snippets (+ skips sin changes activos)
- [x] Probar manualmente: opcional; cubierto por Playwright Fase 4

### Fase 5 — Regresión CLI (paridad con Studio) — ✅

- [x] `change status`, `change deps`, `graph search --snippet`, `archive list`
- [x] `plugins install` / `uninstall` / `update` con bucket UI (`fix-plugins-*-ui`)

### Fase 6 — Specs y proyecto specd — ✅

- [x] Registrar workspaces Studio en `specd.yaml` (`api`, `studio-desktop`, `studio-web`, `client`, `code-graph-electron`)
- [x] Change `align-studio-specs-post-merge`: 113 spec deltas → `@specd/sdk` / IPC / runtime fixes
- [x] Implementation links (134) desde `spec-lock` + overrides — 112/112 specs Studio desktop (spec `bottom-panel-terminal` eliminado; terminal vía otro enfoque)
- [x] Desktop smoke: `pnpm build && pnpm start` OK (`ELECTRON_RUN_AS_NODE=` + CJS main)
- [x] `change transition align-studio-specs-post-merge ready` → implement/verify → archive
- [x] Archive: `specd-sdd/archive/2026/06/20260630-171934-align-studio-specs-post-merge`

**Pendiente opcional (no bloquea):** warnings staleness en `GraphStatusDto` (ver notificaciones UI); push/merge `9bbfb3e2` → `main`.

---

## Estrategia de merge recomendada

1. **Merge commit** (no rebase):
   ```bash
   git fetch origin main   # o merge local: git merge main
   git merge main
   ```
2. Resolver en este orden: `kernel.ts` → implementation tracking → `get-status.ts` → `code-graph-provider` + locks/staleness → `sqlite-graph-store` → lockfile → resto.
3. Para archivos **solo en main** que feature ya reimplementó (archive, listWorkspaces): preferir main si el diff es pequeño; si feature tiene fixes Studio encima, fusionar campo a campo.
4. Ejecutar tests de Studio antes de tocar UI visual; muchos fallos vendrán de kernel/graph, no de componentes.
5. No archivar ni modificar changes specd durante el merge salvo que el workflow lo requiera.

---

## Riesgos principales

| Riesgo                                                      | Severidad | Mitigación                                                          |
| ----------------------------------------------------------- | --------- | ------------------------------------------------------------------- |
| `kernel.ts` mal fusionado → IPC runtime roto                | Crítica   | Tests desktop + api; revisar lista de use cases Studio              |
| `sqlite-graph-store` + electron vendored incompatibles      | Alta      | Rebuild `code-graph-electron` tras merge                            |
| Duplicados CLI graph (lock/config) reintroducidos por error | Alta      | Borrar `cli/.../graph-index-lock.ts` etc.; usar `@specd/code-graph` |
| `indexGraph` concurrente sin lock tras merge                | Media     | `acquireGraphIndexLock` en IPC/HTTP                                 |
| Staleness inconsistente CLI vs Studio                       | Media     | Unificar con `isGraphStale`                                         |
| Polling `ifModifiedSince` incompatible con nuevo status     | Media     | Tests `use-changes-read`, `use-project-poll`, handler HTTP          |
| Snippets graph con contenido no sanitizado                  | Media     | Adoptar sanitización de `eb8303fa`                                  |
| Lockfile corrupto                                           | Media     | `pnpm install` limpio tras resolver conflictos                      |

---

## Referencias

- Merge main → feature: `git show f2a3de90`
- Merge feature → main: `fed3b7e4` (fast-forward)
- Track A detalle: [core-refactor-on-main.md](./core-refactor-on-main.md)
- Track B commit: `0cc90abb` — api + desktop → `@specd/sdk`
- Plugin CLI: `38cff059`, `fed3b7e4`
