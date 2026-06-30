# Refactorización en `main` — **implementado**

Trabajo completado en rama **`main`** (`87401d64`): use cases host en `core` y `code-graph`, paquete `@specd/sdk`, CLI/MCP adelgazados, public barrels.

**Adaptación de la rama feature** (api, IPC, presenters): [merge-main-analysis-2026-06-25.md](./merge-main-analysis-2026-06-25.md) — Track B **completado** (`0cc90abb`, merge en `main` `fed3b7e4`). Pendiente: alinear specs (`align-studio-specs-post-merge`).

**Paquetes tocados:** `packages/core`, `packages/code-graph`, `packages/sdk` (nuevo), `packages/cli`, `packages/mcp`.

---

## Estado de implementación

| Fase                                   | Estado | Commit     |
| -------------------------------------- | ------ | ---------- |
| P0c `GetConfig`                        | ✅     | `d478f732` |
| P0a `GetStatus` refresh bakeado        | ✅     | `42a7e7cd` |
| P0b `TransitionChange` refresh bakeado | ✅     | `42a7e7cd` |
| P1a context defaults bakeados          | ✅     | `3ec7bb33` |
| P1b `CreateChange` schema interno      | ✅     | `83bb8b99` |
| P1c `ListPlugins` fuera del kernel     | ✅     | `d65d60b2` |
| P1e edición yaml fuera del kernel      | ✅     | `ab061b4f` |
| P1d auditoría kernel inputs            | ✅     | `54f37f36` |
| P2 `GetProjectSummary`                 | ✅     | `0c59ac6f` |
| P3 approvals bakeados                  | ✅     | `4741b743` |
| G1 code-graph host use cases           | ✅     | `51b87583` |
| A2a SDK facade                         | ✅     | `b1a842df` |
| A2b CLI/MCP → `@specd/sdk`             | ✅     | `bbeee9f5` |
| A3 public barrels                      | ✅     | `87401d64` |

### Deltas vs este documento (plan original)

| Plan                                                 | Implementado                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| `createAddPlugin` / `createRemovePlugin` factories   | `createConfigWriter` en borde; CLI `plugins install` escribe yaml sin kernel  |
| `listPluginDeclarations` en core                     | `getDeclaredPlugins(config, type)` en CLI (`plugins/get-declared-plugins.ts`) |
| `kernel.specs.approveSpec`                           | `kernel.changes.approveSpec` / `approveSignoff`                               |
| `createSdkContext({ kernel, createGraphProvider? })` | `createSdkContext(config, kernelOptions?)` — crea kernel desde config         |
| `SdkHostContext` sin `config` duplicada              | `openSpecdHost` devuelve también `config` + `configFilePath`                  |
| SDK subpaths `./core`, `./graph`, `./project`        | Solo `.`, `./ports`, `./extensions`                                           |
| `getGraphHealth()` función                           | clase `GetGraphHealth` + `createGetGraphHealth()` factory                     |
| `orchestration/changes/*` en SDK                     | No implementado — hosts usan `kernel.changes.*`                               |
| `export *` desde barrels públicos vía SDK            | `core-reexports.ts` curado + exports selectivos de code-graph en `index.ts`   |

---

## Objetivo

En `main`, el CLI repite secuencias como:

```ts
await kernel.changes.refreshImplementationTracking.execute({ name })
const status = await kernel.changes.status.execute({ name })
```

Consolidar eso en **use cases de dominio** con comportamiento por defecto explícito. Tras cada cambio, actualizar el comando CLI correspondiente.

**Criterio de reparto:**

| Pregunta                                         | Destino                              |
| ------------------------------------------------ | ------------------------------------ |
| ¿Solo dominio specd (changes, specs, project)?   | **`@specd/core`**                    |
| ¿Solo grafo / provider, sin kernel?              | **`@specd/code-graph`**              |
| ¿Una llamada al provider sin lógica extra?       | **Provider directo** (re-export SDK) |
| ¿Mezcla kernel + graph o dos paquetes distintos? | **`@specd/sdk`**                     |

`@specd/core` **no** depende de `@specd/code-graph` (dependencia **unidireccional**). `@specd/code-graph` **sí** depende de `@specd/core` hoy (tipos `SpecdConfig`, `ProjectWorkspace`, `Spec`, ports como `SpecRepository`, `ChangeRepository`, `SpecdError`) — ver `specs/code-graph/composition/spec.md`. Los use cases de grafo reciben **ports/datos** del host cuando hace falta (`workspaces[]`, `specId`, `ChangeRepository`); no instancian adapters de core ni cargan yaml.

---

## Alcance y límites

| En este documento (`main`)                           | Fuera — ver merge doc                           |
| ---------------------------------------------------- | ----------------------------------------------- |
| Use cases en `core` y `code-graph`                   | Presenters, DTOs, OpenAPI (feature)             |
| SDK mínimo (re-exports + orquestación cross-package) | Qué borrar en `feat/user-interface` (merge doc) |
| Adelgazamiento de `packages/cli` y `packages/mcp`    | Merge de `kernel.ts`, conflictos feature        |

---

## Duplicación actual en CLI (`main`)

| Comando                                | Secuencia manual hoy                                     | Destino tras refactor                                                         |
| -------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `change status`                        | si activo → `refresh` → `status`                         | **core** `GetStatus`                                                          |
| `change transition`                    | si activo → `refresh` → … + pasa `config.approvals`      | **core** `TransitionChange` (P0b + **P3** sin re-pasar approvals)             |
| `change context`                       | `refresh` → construir `CompileContextConfig` → `compile` | **core** `CompileContext` (P1a)                                               |
| `project context`                      | construir `CompileContextConfig` → `getProjectContext`   | **core** `GetProjectContext` (P1a)                                            |
| `plugins list`                         | `loadConfig` → `config.plugins` / `getDeclaredPlugins`   | **CLI** helper + runtime check vía `plugin-manager`                           |
| `plugins install` / `uninstall`        | `createConfigWriter` en borde                            | **composition** `createConfigWriter`; sin kernel para escritura               |
| `change create`                        | `getActiveSchema` → `create`                             | **core** `CreateChange`                                                       |
| `project status`                       | parallel `list*` + specs count + graph                   | **core** `GetProjectSummary` + **SDK** `buildProjectStatusSnapshot`           |
| `graph stats`                          | stats + stale + fingerprint                              | **code-graph** `createGetGraphHealth().execute()` vía `withOpenGraphProvider` |
| `graph index`                          | lock + index                                             | **SDK** `runIndexProjectGraph` (`beforeOpen` para lock CLI)                   |
| `graph search` / `hotspots` / `impact` | provider directo                                         | **code-graph** provider                                                       |

---

# `@specd/core`

Dominio specd: changes, specs, project. Los hosts llaman use cases vía **factories** (`createX`) o, si necesitan muchos a la vez, vía **kernel** (`createKernel`).

## Principio: use cases standalone — kernel es conveniencia

Cada use case debe poder usarse **sin kernel**. El kernel agrupa use cases ya cableados para hosts que operan el proyecto entero; **no es el único entry point** (ya lo dice `specs/_global/architecture/spec.md`).

```ts
// Standalone — un solo use case
const status = createGetStatus(config) // o createGetStatus(context, options)
await status.execute({ name: 'my-feature' })

// Kernel — muchos use cases a la vez (conveniencia)
const kernel = await createKernel(config)
await kernel.changes.status.execute({ name: 'my-feature' })
```

**Reglas:**

| Regla                     | Detalle                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| Factory por use case      | `createX(config: SpecdConfig)` y/o `createX(context, options)` en `composition/`                 |
| Kernel opcional           | `createKernel` llama factories internamente; hosts no están obligados a usarlo                   |
| Comando acotado           | CLI/API usa la factory que necesita (`createAddPlugin`, `createGetStatus`, …) sin `createKernel` |
| Tests                     | Cableado explícito `createX(context, options)` sin kernel completo                               |
| Sin lógica solo en kernel | Si algo solo existe en `kernel.*`, falta la factory o el use case exportable                     |

**Encaje con config vs dominio:**

- **Solo config** → `loadConfig` + leer campos / factories de edición (`createAddPlugin`) — sin kernel.
- **Dominio** → factory del use case o kernel si el comando usa varios (`change transition` puede usar solo `kernel.changes.transition` o `createTransitionChange(config)`).
- **Varios dominios** → `createKernel` evita repetir `loadConfig` + N factories en el host.

## Principio: kernel anclado a su config

El kernel se crea con un `SpecdConfig`. **Todo lo que cuelga del kernel debe depender de esa config** — no pedir al host en cada `execute()` valores que ya están fijados en el yaml del proyecto.

### Regla general (cualquier use case)

Al definir o revisar un `*Input`, aplicar:

1. ¿El campo es **derivable del `SpecdConfig`** con el que se creó el kernel y **no cambia entre invocaciones**? → **Bakear** en `createKernel` / constructor del use case.
2. ¿Es **específico de esta operación** (`name`, `specId`, `step`, contenido de artifact)? → **`execute`**.
3. ¿Es un **override intencional** del host sobre el default del yaml (flag CLI/API)? → **`execute`**, con merge sobre defaults bakeados.
4. ¿Hay **razón documentada** para un valor distinto al del kernel? → excepción explícita; si no hay razón, bakear.

**Corolario:** un host que solo recibe `kernel` no debería tener que pasar `configPath`, `projectRoot`, subsets del yaml (`CompileContextConfig`), ni ningún otro campo que sea el mismo en todas las llamadas sobre ese proyecto.

### Qué bakear vs qué pedir en `execute`

| Bakear en construcción                                         | Pedir en `execute`                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `configPath`, `projectRoot`, paths de storage                  | Identificadores de operación (`name`, `specId`, `step`)                   |
| Defaults del yaml (`context:`, `contextMode`, plugins path, …) | Overrides runtime (`followDeps`, `mode`, `depth`, `sections`)             |
| `schemaRef`, workspace routes, repos cableados                 | Señales de operación (`fingerprint`, `ifModifiedSince`, `force`)          |
| Slice mínimo que el use case necesita internamente             | Payload de dominio (contenido, transiciones, actor cuando es por-request) |

Cada use case guarda el **slice mínimo** (no necesariamente el `SpecdConfig` entero). `ListWorkspaces` guarda `_config` y **enriquece** con repos cableados; `CompileContext` guardará `_defaultConfig: CompileContextConfig`.

**`ListPlugins` no encaja en el kernel:** solo proyecta `config.plugins` con un filtro opcional — no añade dominio ni wiring. Es redundante con `getConfig().plugins` o `loadConfig` + helper puro. No confundir con `ListWorkspaces`, que sí combina config + `specRepo` por workspace.

### Config: uso (kernel) vs edición (borde) vs lectura directa (CLI)

Dos responsabilidades que hoy están mezcladas en `kernel.project`:

|                       | **Solo config (CLI / borde)**                                                                             | **Uso con kernel**                              | **Edición de config**                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| **Qué es**            | Leer o escribir `specd.yaml` sin operar el proyecto                                                       | Use cases que consumen la config cableada       | Mutar `specd.yaml` en disco                                                     |
| **¿Kernel?**          | **No**                                                                                                    | **Sí** (`createKernel`)                         | **No** (solo factories + `ConfigWriter`)                                        |
| **Fuente**            | `loadConfig` → `SpecdConfig`                                                                              | Snapshot bakeado en kernel                      | `ConfigWriter` → disco                                                          |
| **Ejemplos CLI**      | `config show`, `plugins list` (solo declaraciones)                                                        | `change status`, `spec list`, `project context` | `plugins install`, `project init`                                               |
| **Qué usa el kernel** | **`SpecdConfig` es la respuesta** — es el input de `createKernel`; leerlo = saber qué cablearía el kernel | `kernel.*` / `getConfig()`                      | Tras editar: `loadConfig` de nuevo; kernel solo si el comando sigue con dominio |

**Corolario CLI:** un comando que **solo** añade o lee cosas de la config **no crea kernel** — no lo necesita. Si quieres saber qué usaría el kernel (plugins declarados, workspaces, `context:`, graph paths…), **`loadConfig` → `SpecdConfig`**; es el mismo objeto que recibiría `createKernel`.

El kernel **no debería conocer cómo se persiste** la config — solo el modelo ya cargado. La edición usa `ConfigWriter` en el **borde** (composition), como `project init` con `createInitProject()` **sin** kernel previo. **Listar plugins declarados no es use case del kernel** — lectura de config.

```
  Comando solo config (sin kernel)
  ───────────────────────────────
  loadConfig(path) → SpecdConfig  ──► leer campos (plugins, workspaces, …)
                    │
                    └──► createAddPlugin().execute(…) → disco   (edición)

  Comando de dominio (con kernel)
  ───────────────────────────────
  loadConfig → createKernel(config) → kernel.changes.* / kernel.specs.* / getConfig()
```

**Regla:**

- Solo **lee/escribe yaml**, sin changes/specs/compile → **`loadConfig` + `SpecdConfig` o factories de edición**; sin `createKernel`.
- **Opera el proyecto** (changes, specs, lifecycle) → `createKernel(config)`.
- Si ya tienes kernel y necesitas un campo del yaml → `kernel.project.getConfig()` (mismo snapshot que al crear).

### Excepciones legítimas

| Caso                             | Por qué sí puede ir en `execute`                                              |
| -------------------------------- | ----------------------------------------------------------------------------- |
| Override runtime                 | El host elige un valor distinto al yaml **para esta llamada** (`--mode full`) |
| Sin kernel                       | `init` proyecto, tests con `createX(context, options)` explícito              |
| Otro proyecto que el del kernel  | No soportado en hosts actuales — recrear kernel                               |
| Lectura ad hoc del yaml completo | `kernel.project.getConfig()` (P0c), no reinyectar en cada use case            |

### Auditoría actual (`packages/core` — violaciones conocidas)

Revisión de `*Input` que hoy piden datos ya en la config del kernel:

| Use case                     | Problema hoy                                             | Fase                                                                  |
| ---------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| `CompileContext`             | `config` en `execute`                                    | **P1a** — bakear defaults                                             |
| `GetProjectContext`          | `config` en `execute`                                    | **P1a** — mismo helper                                                |
| `ListPlugins`                | en `kernel.project`; relee disco                         | **P1c** — **quitar del kernel**; `loadConfig` / `getConfig().plugins` |
| `AddPlugin` / `RemovePlugin` | en `kernel.project` + `configPath`                       | **P1e** — solo factories de edición                                   |
| `InitProject`                | expuesto en kernel pero CLI ya usa `createInitProject()` | **P1e** — alinear: solo factory, no `kernel.project.init`             |
| `TransitionChange`           | `approvalsSpec` / `approvalsSignoff` en cada `execute`   | **P3** — bakear `config.approvals` (como `GetStatus`)                 |
| `ApproveSpec`                | `approvalsSpec` en `execute`                             | **P3**                                                                |
| `ApproveSignoff`             | `approvalsSignoff` en `execute`                          | **P3**                                                                |
| `GetStatus`                  | —                                                        | **Ya conforme** — `config.approvals` en constructor                   |
| _(resto del kernel)_         | —                                                        | Solo dominio en `execute`                                             |

Tras P1a/P1c/P1e/**P3**, **re-auditar** (P1d): ningún use case del kernel pide parámetros de config ni relee disco para datos ya en el snapshot.

**Otros casos fuera del kernel:** hosts que mantienen `config` en paralelo al kernel (`CliContext`, `ApiContext`) → migrar a `kernel.project.getConfig` (P0c); no duplicar en `SdkHostContext` ni en nuevos `*Input`.

### Dos niveles de acceso a la config

| Nivel             | Quién                                 | Qué guarda / expone                                                                               |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Use case interno  | `CompileContext`, `ListWorkspaces`, … | Solo el **slice** que necesita (`CompileContextConfig`, paths, ports…)                            |
| Host / integrador | `kernel.project.getConfig()`          | El **`SpecdConfig` completo** (snapshot de cuando se creó el kernel) para necesidades imprevistas |

Cada use case sigue guardando el mínimo internamente. **`getConfig` es la válvula de escape** para quien solo recibe `kernel` y necesita leer cualquier campo del yaml (`projectRoot`, `context`, plugins, graph config, etc.) sin que core tenga que anticipar cada caso.

```ts
// kernel.project — nuevo (P0c)
export class GetConfig {
  execute(): Readonly<SpecdConfig>
}

// Host: solo kernel
const config = kernel.project.getConfig.execute()
const ctx = createSdkContext({ kernel }) // o host.ctx tras openSpecdHost
```

`getConfig` devuelve la config con la que se construyó el kernel (no re-lee disco). Si el yaml cambia en disco, hace falta recrear el kernel — igual que hoy.

**Contrato readonly:** el host **no debe mutar** el objeto devuelto. Es una vista de lectura del snapshot en memoria. **Edición** del yaml (`addPlugin`, `removePlugin`, `init`) va por factories de composition + `ConfigWriter`; después, recrear el kernel.

## Use cases a implementar

### P0c — `GetConfig` — lectura del `SpecdConfig` desde el kernel

**Prioridad:** P0 (antes o junto a P0a; desbloquea hosts que solo pasan `kernel`).

`createKernel` ya recibe `SpecdConfig`; retener una referencia readonly y exponerla vía `kernel.project.getConfig`:

```ts
export class GetConfig {
  constructor(private readonly _config: SpecdConfig) {}

  /** Snapshot de la config activa al crear el kernel. */
  execute(): Readonly<SpecdConfig> {
    return this._config
  }
}
```

```ts
export interface Kernel {
  // ...
  project: {
    // ...
    getConfig: GetConfig
  }
}
```

**Impacto hosts:**

- `CliContext` puede simplificarse a `{ kernel }`; lectura del yaml → `kernel.project.getConfig.execute()`.
- `createSdkContext({ kernel })` — **sin** campo `config` en el contexto SDK; el kernel ya está montado con su snapshot.
- Comandos que hoy usan `config.projectRoot` / `config.configPath` del contexto paralelo → `kernel.project.getConfig.execute()`.

**Archivos:** `get-config.ts`, `kernel.ts`, tests, `specs/core/get-config/`.

**Tests:** verificar que `execute()` devuelve `Readonly<SpecdConfig>` y que mutar el objeto retornado no afecta el estado interno del kernel (defensive copy o freeze en implementación si hace falta).

**No sustituye P1a:** los use cases de dominio siguen bakeando su subset; `getConfig` es para el host, no para que `CompileContext.execute` vuelva a pedir config.

---

### P0a — `GetStatus` — refresh si activo (default `true`) + `ifModifiedSince`

**Paridad CLI hoy** (`change/status.ts`):

```ts
const active = await kernel.changes.repo.get(name)
if (active !== null) {
  await kernel.changes.refreshImplementationTracking.execute({ name })
}
const statusResult = await kernel.changes.status.execute({ name })
```

Ampliar `GetStatusInput`:

```ts
export interface GetStatusInput {
  readonly name: string
  readonly ifModifiedSince?: string
  /**
   * When true (default), refresh implementation tracking before status
   * **only if the change is active** (exists in active change storage).
   * Draft / discarded / archived read paths: never refresh.
   * Pass false to skip refresh even for active changes (fast read).
   */
  readonly refreshImplementationTracking?: boolean
}
```

**Comportamiento:**

- Flag omitido o `undefined` → tratar como `true`.
- Con default `true`: refresh **solo si el change está activo** (mismo criterio que `repo.get(name) !== null` en CLI).
- `refreshImplementationTracking === false` → sin refresh (activo o no).
- Draft/discarded: nunca refresh (aunque el flag sea `true`).
- `ifModifiedSince`: evaluar después del refresh cuando este se ejecute.

**CLI (`change/status.ts`):** eliminar el bloque `repo.get` + `refresh`; el use case lo absorbe. (El flag CLI `--implementation` es solo **visualización** de tracking, no controla el refresh.)

**Archivos:** `get-status.ts`, `kernel.ts`, tests, `specs/core/get-status/`.

---

### P0b — `TransitionChange` — refresh previo si activo (default `true`)

**Paridad CLI** (`change/transition.ts`): mismo patrón — `repo.get` → si activo, refresh → luego transición.

```ts
/**
 * Default: true. Refresh before transition only when the change is active.
 * Pass false to skip.
 */
readonly refreshImplementationTrackingBefore?: boolean
```

**CLI (`change/transition.ts`):** eliminar `repo.get` + refresh previo.

**Archivos:** `transition-change.ts`, tests, specs.

---

### P1a — Contexto (`CompileContext` + `GetProjectContext`) — config bakeada en kernel

Misma política para **change context** y **project context**: defaults del yaml al crear el kernel; `execute` solo recibe overrides de runtime.

`CompileContext` además: refresh por defecto **solo en change activo** (misma política que P0a/P0b).

**Helper compartido** (interno, no exportado a hosts):

```ts
// core/composition/ — interno
function buildCompileContextConfig(config: SpecdConfig): CompileContextConfig

const contextDefaults = buildCompileContextConfig(config)
const compile = new CompileContext(..., contextDefaults)
const getProjectContext = new GetProjectContext(..., contextDefaults)
```

Ambos use cases guardan `_defaultConfig: CompileContextConfig`. En `execute`, merge interno: defaults del yaml + overrides de runtime.

#### `CompileContext`

**`CompileContextInput` tras P1a** — sin `config`:

```ts
export interface CompileContextInput {
  readonly name: string
  readonly step?: string
  readonly refreshImplementationTracking?: boolean
  readonly includeChangeSpecs?: boolean
  readonly followDeps?: boolean
  readonly depth?: number
  readonly sections?: readonly SpecSection[]
  readonly mode?: 'list' | 'summary' | 'full' | 'hybrid'
  readonly fingerprint?: string
}
```

**CLI (`change/context.ts`):** eliminar `refresh` manual y construcción inline de `CompileContextConfig`.

#### `GetProjectContext`

Mismo `_defaultConfig` que `CompileContext`. Sin `config` en el input:

```ts
export interface GetProjectContextInput {
  readonly followDeps?: boolean
  readonly depth?: number
  readonly sections?: readonly SpecSection[]
  readonly mode?: 'list' | 'summary' | 'full' | 'hybrid'
}
```

**CLI (`project/context.ts`):** eliminar construcción inline de `CompileContextConfig` (~líneas 74–92 hoy).

**API:** eliminar `buildCompileContextConfig` público de `packages/api`; handlers pasan solo query params.

**Archivos:** `compile-context.ts`, `get-project-context.ts`, `composition/use-cases/*`, `kernel.ts`, tests, specs. Helper `buildCompileContextConfig` en `composition/` (o `_shared/`), **no** en el barrel público de `@specd/core`.

---

### P1b — `CreateChange` — schema activo interno

`CreateChangeInput` con `schemaName?` / `schemaVersion?` opcionales; si faltan, el use case llama `GetActiveSchema` internamente.

Opcional: `includeOverlapCheck` → `overlapReport` en resultado (CLI → stderr).

```ts
export interface CreateChangeInput {
  readonly name: string
  readonly specIds: readonly string[]
  readonly description?: string
  readonly invalidationPolicy?: InvalidationPolicy
  readonly schemaName?: string
  readonly schemaVersion?: number
  readonly includeOverlapCheck?: boolean
}

export interface CreateChangeResult {
  readonly change: Change
  readonly changePath: string
  readonly overlapReport?: DetectOverlapResult
}
```

**CLI (`change/create.ts`):** omitir `getActiveSchema` previo.

**Archivos:** `create-change.ts`, `kernel.ts`, specs.

---

### `ConfigWriter` — inventario en el kernel (hoy)

En todo `@specd/core`, el port `ConfigWriter` **solo** lo usan estos use cases — los cuatro están en `kernel.project` y comparten la misma instancia `FsConfigWriter` de `kernel-internals`:

| Use case       | `kernel.project.*` | Operación en el port                                               |
| -------------- | ------------------ | ------------------------------------------------------------------ |
| `InitProject`  | `init`             | `initProject()` — crea `specd.yaml` + dirs                         |
| `AddPlugin`    | `addPlugin`        | `addPlugin()` — escribe `plugins.<type>`                           |
| `RemovePlugin` | `removePlugin`     | `removePlugin()`                                                   |
| `ListPlugins`  | `listPlugins`      | `listPlugins()` — **relee disco** (debería ser `SpecdConfig`, P1c) |

**Ningún otro use case del kernel** (`changes.*`, `specs.*`, `listWorkspaces`, `getProjectContext`, …) usa `ConfigWriter`. La lectura de config entra por `SpecdConfig` al crear el kernel; la lectura de disco antes de kernel por `ConfigLoader`.

**Tras P1c + P1e:** `kernel.project` queda **sin** ningún use case ligado a `ConfigWriter`. El port sigue en core para factories de composition (`createInitProject`, `createAddPlugin`, `createRemovePlugin`); `kernel-internals` puede dejar de instanciar `configWriter` si ya no cablea nada en el kernel.

---

### P1c — Quitar `ListPlugins` del kernel ✅

- `ListPlugins` eliminado de `Kernel.project`
- CLI `plugins list`: `resolveCliContext` + `getDeclaredPlugins(config, type)` + comparación con plugins runtime (`@specd/plugin-manager`)
- Host con kernel: `kernel.project.getConfig.execute().plugins`

---

### P1e — Edición de config — fuera de `kernel.project` ✅

Implementado con `createConfigWriter` (composition) en lugar de use cases `AddPlugin`/`RemovePlugin` en kernel:

- `kernel.project` **sin** `addPlugin`, `removePlugin`, `init`, `listPlugins`
- CLI `plugins install` importa `createConfigWriter` desde `@specd/sdk` y escribe yaml sin kernel
- `InitProject` sigue como factory standalone (`createInitProject`), no en kernel

**Archivos:** `composition/config-writer.ts`, CLI `plugins/install.ts`, `plugins/uninstall.ts`, tests `config-mutation-exports.spec.ts`.

---

### P2 — `GetProjectSummary` — agregado de proyecto sin grafo

Nuevo use case:

```ts
export interface GetProjectSummaryResult {
  readonly activeCount: number
  readonly draftCount: number
  readonly discardedCount: number
  readonly archivedCount: number
  readonly specsByWorkspace: Record<string, number>
  readonly workspaceCount: number
}
```

Sin graph stats — `@specd/sdk` compone con slice graph en `project status`.

**CLI (`project/status.ts`):** counts desde `getProjectSummary`; graph vía SDK tras P2 + G1.

**Archivos:** `get-project-summary.ts` (nuevo), `kernel`, specs.

---

### P3 — Approvals desde `config.approvals` bakeados en mutaciones

**Prioridad:** P3 (posponer hasta P0–P2 + P1a/P1e; independiente de P1c).

En `specd.yaml`, `approvals.spec` y `approvals.signoff` activan los gates de ciclo de vida (`ready` → `pending-spec-approval`, `done` → `pending-signoff`, etc.). Hoy el host **re-pasa** esos booleanos en cada mutación aunque el kernel ya se creó con esa config.

**Precedente — `GetStatus` ya lo hace bien:** en `createKernel`, `config.approvals` se inyecta en el constructor:

```ts
status: new GetStatus(i.changes, schemaProvider, {
  spec: config.approvals.spec,
  signoff: config.approvals.signoff,
}, lifecycle),
```

`GetStatusInput` no incluye approvals. **P3 alinea el resto.**

#### Use cases afectados

| Use case           | Campo redundante en `*Input` hoy    | Comportamiento que usa el flag                                                                                                                                                      |
| ------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TransitionChange` | `approvalsSpec`, `approvalsSignoff` | Smart routing: `ready`+`implementing` → `pending-spec-approval` si `spec`; `done`+`archivable` → `pending-signoff` si `signoff`; validación de transiciones a estados de aprobación |
| `ApproveSpec`      | `approvalsSpec`                     | `ApprovalGateDisabledError` si gate apagado; si no, `recordSpecApproval` + `spec-approved`                                                                                          |
| `ApproveSignoff`   | `approvalsSignoff`                  | Igual para signoff → `signed-off`                                                                                                                                                   |

**No afectados:** `GetStatus` (ya bakeado), `ArchiveChange`, `DiscardChange`, etc.

#### Tras P3 — bake en construcción

Slice mínimo (mismo shape que `GetStatus`):

```ts
type ApprovalGates = { readonly spec: boolean; readonly signoff: boolean }

// createKernel / createTransitionChange(config)
const transition = new TransitionChange(changes, actor, schemaProvider, runStepHooks, lifecycle, {
  spec: config.approvals.spec,
  signoff: config.approvals.signoff,
})

// ApproveSpec — solo necesita spec
const approveSpec = new ApproveSpec(changes, actor, schemaProvider, hasher, config.approvals.spec)

// ApproveSignoff — solo signoff
const approveSignoff = new ApproveSignoff(
  changes,
  actor,
  schemaProvider,
  hasher,
  config.approvals.signoff,
)
```

**`TransitionChangeInput` tras P3:**

```ts
export interface TransitionChangeInput {
  readonly name: string
  readonly to: ChangeState
  readonly refreshImplementationTrackingBefore?: boolean // P0b
  readonly skipHookPhases?: ReadonlySet<HookPhaseSelector>
  // sin approvalsSpec / approvalsSignoff
}
```

**`ApproveSpecInput` / `ApproveSignoffInput`:** solo `name` y `reason`.

#### Impacto hosts (P3 — implementado)

| Host                       | Cambio                                                                   |
| -------------------------- | ------------------------------------------------------------------------ |
| CLI `change/transition.ts` | Sin `approvalsSpec` / `approvalsSignoff` en `execute`                    |
| CLI `change/approve.ts`    | `kernel.changes.approveSpec` / `approveSignoff` (antes `kernel.specs.*`) |
| API (Track B)              | Misma ruta: `kernel.changes.approve*`                                    |

El host solo necesita `kernel` (o factory standalone); si el yaml cambió, recrear kernel — no reinyectar flags.

**Comportamiento sin cambio:** mismos errores (`ApprovalGateDisabledError`, routing a `pending-*`), mismos tests de dominio con gates en el constructor/factory.

**Archivos:** `transition-change.ts`, `approve-spec.ts`, `approve-signoff.ts`, `composition/use-cases/*`, `kernel.ts`, CLI, API mutate handler, tests, `specs/core/` (transition, approve-spec, approve-signoff).

**Factories standalone:** `createTransitionChange(config)`, `createApproveSpec(config)`, `createApproveSignoff(config)` pasan `config.approvals` — hosts sin kernel igual que tras P3.

---

## Qué **no** va en el kernel (uso vs edición)

| Caso                                                     | Dónde                                                                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `addPlugin`, `removePlugin`, `init` (mutar `specd.yaml`) | **Composition** — `createAddPlugin`, `createRemovePlugin`, `createInitProject`; host recrea kernel después |
| Releer disco / `ListPlugins` en kernel                   | **`getConfig().plugins`** o `loadConfig` (P1c)                                                             |

## Qué **no** va en core (paquete)

| Caso                                            | Dónde                         |
| ----------------------------------------------- | ----------------------------- |
| Graph stats, index, search, coverage            | **`@specd/code-graph`**       |
| Composición core + graph                        | **`@specd/sdk`**              |
| Presenters → DTO                                | `packages/api`, IPC (feature) |
| `formatCompiledContextMarkdown`, text/json/toon | CLI                           |

## Tests core

`packages/core/test/` + `verify.md` pareado por use case en `specs/core/`.

## Superficie pública (A3 — tras P0–P2 / G1 / A2)

Hoy `@specd/core` hace `export *` de `domain`, `application` y `composition` — incluye ports, adapters (`GitVcsAdapter`, `FsConfigWriter`, …) y tipos internos. Eso **contradice** `specs/_global/architecture/spec.md` (“concrete adapters never exported from `index.ts`”) y sobra cuando hosts pasan a `@specd/sdk` + factories standalone.

Tras el reparto de responsabilidades, la API pública puede **reducirse** a lo que consumen hosts:

### `@specd/core` — exportar

| Categoría           | Qué                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Entry**           | `createKernel`, `Kernel`, `KernelOptions`, `createKernelBuilder` (extensiones plugin)                           |
| **Config**          | `createConfigLoader`, `SpecdConfig` y tipos de config relacionados                                              |
| **Factories**       | Todo `createX` / `createX(config)` expuesto a hosts (use cases standalone)                                      |
| **Contratos**       | `*Input`, `*Result`, enums/VOs que aparecen en esos contratos (`ChangeState`, …)                                |
| **Errores**         | Jerarquía `SpecdError` que hosts capturan o mapean                                                              |
| **Repos expuestos** | Tipos que el kernel expone en su superficie (`ChangeRepository`, entidades de lectura si hace falta `repo.get`) |
| **Versión**         | `CORE_VERSION`                                                                                                  |

### `@specd/core` — no exportar (internal)

| Categoría            | Qué                                                                     |
| -------------------- | ----------------------------------------------------------------------- |
| **Ports**            | `application/ports/*` (salvo lo que sea contrato público deliberado)    |
| **Infrastructure**   | Adapters fs/git, `FsConfigWriter`, parsers internos, …                  |
| **Domain crudo**     | Entidades/servicios que solo usan use cases por dentro                  |
| **Composition**      | `kernel-internals`, helpers `buildCompileContextConfig`, wiring privado |
| **Use case classes** | Opcional: solo factories; hosts no instancian `new GetStatus(...)`      |

Implementación: barrel curado `packages/core/src/public.ts` (o `exports` en `package.json`: `"."` → public, `"./internal"` → actual barrel para monorepo/tests).

### `@specd/code-graph` — exportar

| Categoría              | Qué                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Provider**           | `createCodeGraphProvider`, `CodeGraphProvider`, `buildProjectGraphConfig`                                                      |
| **Use cases G1**       | `getGraphHealth`, `indexProjectGraph`, `getSpecCoverage`, `getChangeSpecCoverage` + `*Input`/`*Result`                         |
| **Tipos de operación** | `SearchOptions`, `IndexResult`, `GraphStatistics`, `HotspotOptions`, `ImpactResult`, … (lo que devuelven métodos del provider) |
| **Errores**            | `SpecdCodeGraphError` y subclases                                                                                              |
| **Nodos/relations**    | Solo si presenters o SDK los necesitan en DTOs (`Relation`, `SymbolNode`, …)                                                   |

### `@specd/code-graph` — no exportar

Domain services internos (`computeGraphFingerprint` salvo que G1 lo exponga), adapters de store, indexer internals, tipos solo usados dentro del paquete.

### `@specd/sdk`

Dejar de `export *` de core/code-graph; re-exportar **solo** el barrel público de cada paquete + módulos `orchestration/`. Un solo `package.json` dependency en CLI/MCP/API con superficie acotada.

**Cuándo:** **A3** después de A2b (cuando hosts ya no importan símbolos internos directamente). Migración: buscar imports de adapters/ports en `apps/` y `packages/cli` y sustituir por SDK o factories públicas.

---

# `@specd/code-graph`

Dominio grafo. Use cases reciben `CodeGraphProvider` (ya abierto) y datos del host (`config`, `workspaces`, `specId`). **No** importan `@specd/core`.

## Use cases a implementar (fase G1)

### `GetGraphHealth`

Sustituye `fetchGraphStatus` del SDK. Stats + VCS stale + fingerprint mismatch + `warnings[]`.

```ts
export interface GetGraphHealthInput {
  readonly config: SpecdConfig
  readonly provider: CodeGraphProvider
  readonly workspaces?: readonly WorkspaceDescriptor[] // para fingerprint; opcional
}

export interface GetGraphHealthResult {
  readonly stats: GraphStatistics
  readonly stale: boolean | null
  readonly currentRef: string | null
  readonly fingerprintMismatch: boolean | null
  readonly warnings: readonly string[]
}

export async function getGraphHealth(input: GetGraphHealthInput): Promise<GetGraphHealthResult>
```

**CLI (`graph stats`):** `listWorkspaces` (core) → `withOpenGraphProvider` → `getGraphHealth`.

---

### `IndexProjectGraph`

Sustituye `runGraphIndex`. Lock + index; el host obtiene `workspaces` con `kernel.project.listWorkspaces`.

```ts
export interface IndexProjectGraphInput {
  readonly provider: CodeGraphProvider
  readonly projectRoot: string
  readonly workspaces: readonly WorkspaceDescriptor[]
  readonly graphConfig: ProjectGraphConfig
  readonly codeGraphVersion: string
  readonly vcsRef?: string
  readonly force?: boolean
  readonly onProgress?: (percent: number, phase: string) => void
}

export async function indexProjectGraph(input: IndexProjectGraphInput): Promise<IndexResult>
```

**CLI (`graph index`):** adaptador adquiere lock (subprocess si aplica) → **`runIndexProjectGraph`** (SDK). El worker subprocess del CLI sigue en el adaptador; code-graph ejecuta la indexación en el proceso que ya tiene el lock.

**API / IPC (`indexGraph`):** `runIndexProjectGraph(ctx, { force, codeGraphVersion })` → presenter — sin lock de archivo salvo que el host lo añada.

---

### `GetSpecCoverage`

Sustituye `fetchSpecCoverage`. Solo grafo; validación de spec en el host si hace falta (`kernel.specs.get` antes de llamar).

```ts
export interface SpecCoverageEntry {
  readonly specId: string
  readonly coveredFiles: readonly Relation[]
  readonly coveredSymbols: readonly {
    readonly relation: Relation
    readonly symbol: SymbolNode | undefined
  }[]
}

export async function getSpecCoverage(
  provider: CodeGraphProvider,
  specId: string,
): Promise<SpecCoverageEntry>
```

**Studio `getSpecGraphView`:** host valida spec → `getSpecCoverage` → presenter `toGraphSpecCoverageDto`.

### `GetChangeSpecCoverage` (G1)

Sustituye `fetchChangeSpecCoverage`. Resuelve el change vía port `ChangeRepository` (`@specd/core`) y N × `getSpecCoverage` — **vive en code-graph** (mismo paquete que ya usa `Spec` / `SpecRepository` en indexación).

```ts
import type { ChangeRepository } from '@specd/core'

export interface ChangeSpecCoverageResult {
  readonly changeName: string
  readonly specIds: readonly string[]
  readonly specs: readonly SpecCoverageEntry[]
}

export async function getChangeSpecCoverage(
  provider: CodeGraphProvider,
  changes: ChangeRepository,
  input: { readonly changeName: string },
): Promise<ChangeSpecCoverageResult>
```

Si `changes.get(changeName)` es `null` → `ChangeNotFoundError` (de core, re-exportado por code-graph o import directo del error).

**Studio `getChangeGraphView`:** `withOpenGraphProvider` → `getChangeSpecCoverage(provider, kernel.changes.repo, { changeName })` → presenter.

**Variante batch sin change:** `getSpecsCoverage(provider, specIds)` — solo grafo, sin `ChangeRepository`; útil si el host ya tiene los ids.

---

## Operaciones directas del provider (sin use case)

No merecen wrapper en SDK ni use case en code-graph — el host llama al provider (re-exportado por SDK):

| Operación CLI                | Provider                                              |
| ---------------------------- | ----------------------------------------------------- |
| `graph search`               | `provider.search(query, options)`                     |
| `graph hotspots`             | `provider.getHotspots(options)`                       |
| `graph impact` (symbol/file) | `provider.analyzeImpact` / `analyzeFilesImpact`       |
| `graph impact` (spec)        | `provider.*` + `kernel.specs.get` (core) para validar |

---

## Qué **no** va en code-graph (además de lo anterior)

| Caso                                           | Dónde                                                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `listWorkspaces`                               | **core** — host pasa `workspaces[]` a use cases graph                                                    |
| Validar spec antes de coverage unitario        | **core** (`kernel.specs.get`) o host                                                                     |
| `ChangeRepository`                             | **port de core** — host inyecta `kernel.changes.repo`; `getChangeSpecCoverage` llama `.get` internamente |
| `withOpenGraphProvider` (open/close lifecycle) | **SDK**                                                                                                  |
| `buildProjectStatusSnapshot`                   | **SDK** (core + graph)                                                                                   |
| Presenters → DTO                               | api/IPC (feature)                                                                                        |

## Tests code-graph

`packages/code-graph/test/` — `GetGraphHealth`, `IndexProjectGraph`, `GetSpecCoverage`, `GetChangeSpecCoverage`, staleness, lock.

---

# `@specd/sdk` — implementado

Capa fina: **re-exports curados** (`core-reexports.ts`) + **orquestación cross-package** + utilidades de lifecycle host.

## Rol (sin cambios de diseño)

| Capa                  | Responsabilidad                                                         |
| --------------------- | ----------------------------------------------------------------------- |
| `@specd/core`         | Dominio specd (use cases § core)                                        |
| `@specd/code-graph`   | Dominio grafo (use cases § code-graph)                                  |
| **`@specd/sdk`**      | Re-export + bootstrap host + lifecycle grafo + orquestaciones repetidas |
| CLI / MCP / api / IPC | Transporte, argv, formato, auth/actor, presenters → DTO                 |

## Dependencias y exports (real)

```json
{
  "name": "@specd/sdk",
  "dependencies": {
    "@specd/core": "workspace:*",
    "@specd/code-graph": "workspace:*"
  },
  "exports": {
    ".": "./dist/index.js",
    "./ports": "./dist/ports.js",
    "./extensions": "./dist/extensions.js"
  }
}
```

**CLI y MCP:** solo `"@specd/sdk"` en `package.json` — verificado.

## Estructura implementada

```
packages/sdk/src/
  composition/
    host-context.ts              # openSpecdHost, createSdkContext, SdkHostContext
    with-open-graph-provider.ts
  orchestration/
    build-project-status-snapshot.ts
    run-index-project-graph.ts
  core-reexports.ts              # barrel curado de @specd/core/public
  index.ts                       # + exports selectivos code-graph
  ports.ts, extensions.ts
  shared/code-graph-version.ts
  test/
```

Specs: `specs/sdk/{composition,host-context,build-project-status-snapshot,run-index-project-graph,with-open-graph-provider}/`.

## `openSpecdHost` y `createSdkContext` — API implementada

```ts
// createSdkContext — crea kernel desde config (no acepta kernel preexistente)
export async function createSdkContext(
  config: SpecdConfig,
  options?: KernelOptions,
): Promise<SdkHostContext>

// openSpecdHost — load + createSdkContext
export interface OpenSpecdHostResult extends SdkHostContext {
  readonly config: SpecdConfig
  readonly configFilePath: string | null
}

export async function openSpecdHost(input?: OpenSpecdHostInput): Promise<OpenSpecdHostResult>
```

**CLI:** `resolveCliContext` delega en `openSpecdHost` vía `helpers/sdk-host.ts` + `buildCliKernelOptions`.

**Nota para desktop (Track B):** si el kernel ya existe (lazy singleton), hoy no hay `createSdkContext({ kernel })` — evaluar wrapper local con `createGraphProvider` override o extender SDK.

## `withOpenGraphProvider`

Util de lifecycle host: abre provider, ejecuta callback, cierra en `finally`. Equivalente genérico de `cli/commands/graph/with-provider.ts`.

```ts
export async function withOpenGraphProvider<T>(
  ctx: Pick<SdkHostContext, 'kernel' | 'createGraphProvider'>,
  fn: (provider: CodeGraphProvider) => Promise<T>,
  options?: {
    readonly beforeOpen?: (provider: CodeGraphProvider) => Promise<void>
  },
): Promise<T>
```

**Por qué `ctx` va antes del callback:** el helper usa `ctx.createGraphProvider()` para instanciar, `await provider.open()`, luego llama `fn(provider)`, y en `finally` `provider.close()`. El callback solo recibe `provider`; `ctx.kernel` (y su `getConfig`) siguen disponibles por closure.

```ts
await withOpenGraphProvider(ctx, async (provider) => {
  const config = ctx.kernel.project.getConfig.execute()
  const workspaces = await ctx.kernel.project.listWorkspaces.execute()
  return getGraphHealth({ config, provider, workspaces })
})
```

## `buildProjectStatusSnapshot` — implementado

```ts
export interface BuildProjectStatusSnapshotResult {
  readonly summary: GetProjectSummaryResult
  readonly graphHealth: GetGraphHealthResult | null
  readonly approvals: { readonly specEnabled: boolean; readonly signoffEnabled: boolean }
  readonly llmOptimizedContext: boolean
  readonly hotspots?: HotspotResult | null
}
```

Incluye más campos que el plan original (approvals, llm flag, hotspots opcionales). Presenters Studio deben mapear `graphHealth` (no `graph`).

## `runIndexProjectGraph` — implementado

```ts
export interface RunIndexProjectGraphInput {
  readonly force?: boolean
  readonly workspaces?: readonly string[]
  readonly onProgress?: IndexProgressCallback
  /** Hook antes de open — CLI usa esto para lock (`acquireGraphIndexLock`) */
  readonly beforeOpen?: (provider: CodeGraphProvider) => Promise<void>
  readonly excludePaths?: readonly string[]
}
```

CLI `graph index`: adquiere lock en adaptador → pasa `beforeOpen` → `runIndexProjectGraph`.

## Convención de nombres

Vocabulario de **dominio / operación**, no de UI ni wire:

| Evitar                                     | Preferir                                                                  | Motivo                    |
| ------------------------------------------ | ------------------------------------------------------------------------- | ------------------------- |
| `*View`, `*Dto`                            | `*Coverage`, `*Snapshot`, `*Result`                                       | “View” es capa presenter  |
| `fetch*`, `run*` en SDK para dominio grafo | nombres de use case en code-graph (`getGraphHealth`, `indexProjectGraph`) | Dominio en su paquete     |
| Nombres Studio (`SpecdDataPort`)           | mismos conceptos, nombre de dominio                                       | El port adapta; el SDK no |

**Mapeo port Studio → capa real** (adaptador traduce a DTO):

| Método `@specd/client` (wire) | Capa       | Función                                                                 |
| ----------------------------- | ---------- | ----------------------------------------------------------------------- |
| `getSpecGraphView`            | code-graph | `getSpecCoverage` → presenter                                           |
| `getChangeGraphView`          | code-graph | `getChangeSpecCoverage` (+ `kernel.changes.repo` como port) → presenter |
| `getGraphStatus`              | code-graph | `getGraphHealth` → presenter                                            |
| `indexGraph`                  | SDK        | `runIndexProjectGraph` → presenter                                      |
| `getProjectStatus`            | SDK        | `buildProjectStatusSnapshot` → presenter                                |

## Qué **no** va en el SDK

| Caso                                                              | Dónde                                                                         |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `GetStatus`, `TransitionChange`, `CompileContext`, `CreateChange` | **core** — re-export solo                                                     |
| `GetGraphHealth`, `GetSpecCoverage`, `GetChangeSpecCoverage`      | **code-graph** — re-export solo                                               |
| `IndexProjectGraph`                                               | **code-graph** — dominio; hosts con kernel → **`runIndexProjectGraph`** (SDK) |
| `provider.search`, `getHotspots`, `analyzeImpact`, …              | **code-graph** provider directo                                               |
| `getChangeContext`, `createChange` como wrappers                  | **No** — hosts llaman `kernel.changes.*` tras P0–P1                           |
| `runGraphSearch`, `runGraphHotspots`, `runGraphImpact`            | **No** — provider directo                                                     |
| Presenters → DTO                                                  | api/IPC (feature)                                                             |
| Pass-through puro (`getChange`, `listChanges`, …)                 | Re-export core                                                                |

## Tests SDK

`packages/sdk/test/`:

- `buildProjectStatusSnapshot`: composición core + code-graph
- `runIndexProjectGraph`: listWorkspaces + VCS + indexProjectGraph
- `withOpenGraphProvider`: open/close garantizado
- `createSdkContext`: defaults de factory

---

# Ejemplos de uso por host

Escenario: mismo proyecto abierto, tres capas. **Bootstrap compartido** vía `openSpecdHost` (SDK); cada adaptador solo añade transporte y opciones de kernel.

## Bootstrap (adaptador)

```ts
// CLI
const { ctx, configFilePath } = await openSpecdHost({
  configPath: opts.config,
  kernelOptions: buildCliKernelOptions(process.argv),
})

// API — una vez por proceso en createApiServer
const host = await openSpecdHost({ startDir: options.projectRoot, kernelOptions: { logRing } })
```

## Crear contexto SDK (una vez por comando / request)

```ts
import {
  openSpecdHost,
  buildProjectStatusSnapshot,
  runIndexProjectGraph,
  withOpenGraphProvider,
  getGraphHealth,
  getSpecCoverage,
  getChangeSpecCoverage,
  ChangeNotFoundError,
} from '@specd/sdk'

// CLI: ctx ya viene de openSpecdHost (§ Bootstrap)
// API request: ctx = host.ctx del proceso
```

## Operaciones — qué capa usa cada una

### `change status` → **core**

```ts
const status = await ctx.kernel.changes.status.execute({
  name: 'my-feature',
  ifModifiedSince: opts.ifModifiedSince,
  // refreshImplementationTracking: default true si activo
})
// CLI: formatear · API: toChangeStatusDto(status)
```

No requiere `withOpenGraphProvider`. `createSdkContext` es opcional si ya tienes `kernel`.

### `change context` → **core** (solo `kernel`, sin re-pasar yaml)

Tras P1a los defaults del yaml ya están en el use case. El host solo pasa overrides de runtime:

```ts
const compiled = await kernel.changes.compile.execute({
  name: 'my-feature',
  step: query.step,
  includeChangeSpecs: query.includeChangeSpecs,
  followDeps: query.followDeps,
  depth: query.depth,
  mode: query.mode,
  fingerprint: query.fingerprint,
})
```

No requiere `SdkHostContext` — basta con el `kernel` creado desde ese yaml.

### `project context` → **core** (solo `kernel`, mismo P1a)

```ts
const result = await kernel.project.getProjectContext.execute({
  followDeps: opts.followDeps,
  depth: opts.depth,
  mode: opts.mode,
  sections: sectionFlags.length > 0 ? sectionFlags : undefined,
})
```

### `plugins list` → **solo config** (sin kernel)

```ts
const { kernel } = await resolveCliContext(opts)
const config = kernel.project.getConfig.execute()
const declared = getDeclaredPlugins(config, opts.type)
```

### `plugins install` → **solo edición** (sin kernel)

```ts
import { createConfigWriter } from '@specd/sdk'
const writer = createConfigWriter()
await writer.addPlugin({ configPath, type, name, config })
```

### `change create` → **core**

```ts
const result = await ctx.kernel.changes.create.execute({
  name,
  specIds,
  includeOverlapCheck: true,
})
```

### `project status --graph` → **SDK** (core + code-graph)

```ts
const snapshot = await buildProjectStatusSnapshot(ctx, { includeGraph: true })
// snapshot.summary → GetProjectSummary
// snapshot.graph    → GetGraphHealth | null
```

### `graph stats` → **code-graph** (+ lifecycle SDK)

```ts
const health = await withOpenGraphProvider(ctx, async (provider) => {
  const config = ctx.kernel.project.getConfig.execute()
  const workspaces = await ctx.kernel.project.listWorkspaces.execute()
  return getGraphHealth({ config, provider, workspaces })
})
```

### `graph index` → **SDK** (`runIndexProjectGraph`)

```ts
// CLI: el adaptador adquiere lock / subprocess antes de llamar
const result = await runIndexProjectGraph(ctx, {
  force: opts.force,
  codeGraphVersion,
  onProgress: opts.json
    ? undefined
    : (pct, phase) => {
        /* stderr progress */
      },
})
// API/IPC: toGraphIndexResultDto(result)
```

### `graph search` / `hotspots` / `impact` → **code-graph** provider

```ts
await withOpenGraphProvider(ctx, async (provider) => {
  return provider.search(query, searchOptions)
})
```

### Studio `getChangeGraphView` → **code-graph** (G1)

```ts
const coverage = await withOpenGraphProvider(ctx, async (provider) =>
  getChangeSpecCoverage(provider, ctx.kernel.changes.repo, { changeName: name }),
)
// API/IPC: toChangeGraphViewDto(coverage)
```

## Mapa rápido

| Operación             | `createSdkContext` | `ctx.kernel`                  | `withOpenGraphProvider` | SDK compose              | code-graph                | core                    |
| --------------------- | ------------------ | ----------------------------- | ----------------------- | ------------------------ | ------------------------- | ----------------------- |
| change status         | opcional           | ✓ `status.execute`            | —                       | —                        | —                         | ✓                       |
| change context        | no (solo `kernel`) | ✓ `compile.execute`           | —                       | —                        | —                         | ✓                       |
| project context       | no (solo `kernel`) | ✓ `getProjectContext.execute` | —                       | —                        | —                         | ✓                       |
| plugins list          | no                 | — (solo `loadConfig`)         | —                       | —                        | —                         | `SpecdConfig`           |
| plugins install       | no                 | — (edición sin kernel)        | —                       | —                        | —                         | composition             |
| change create         | opcional           | ✓ `create.execute`            | —                       | —                        | —                         | ✓                       |
| project status        | ✓                  | (vía snapshot)                | (interno si graph)      | ✓                        | ✓                         | ✓                       |
| graph stats           | ✓                  | listWorkspaces                | ✓                       | —                        | ✓                         | listWorkspaces          |
| graph index           | ✓                  | (vía SDK)                     | —                       | ✓ `runIndexProjectGraph` | G1 interno                | listWorkspaces interno  |
| graph search / impact | ✓                  | (si spec)                     | ✓                       | —                        | ✓ provider                | (validar spec)          |
| change graph coverage | ✓                  | inyecta `repo`                | ✓                       | —                        | ✓ `getChangeSpecCoverage` | port `ChangeRepository` |

**Imports del host tras migración:** un solo `"@specd/sdk"` en `package.json`.

---

# Reparto final

| **core**                                                                             | **code-graph**                                       | **SDK**                                              |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------- | ---------------------------------------------------- |
| `GetConfig` (P0c)                                                                    | `GetGraphHealth` (G1)                                | Re-exports core + code-graph                         |
| `GetStatus` (P0a)                                                                    | `IndexProjectGraph` (G1)                             | `openSpecdHost` + `createSdkContext`                 |
| `TransitionChange` (P0b)                                                             | `GetSpecCoverage`, `GetChangeSpecCoverage` (G1)      | `withOpenGraphProvider`                              |
| `CompileContext` + `GetProjectContext` — defaults bakeados (P1a)                     | `provider.search`, `getHotspots`, `analyzeImpact`, … | `buildProjectStatusSnapshot`, `runIndexProjectGraph` |
| `CreateChange` (P1b)                                                                 |                                                      |                                                      |
| `listPluginDeclarations` / `getConfig().plugins` — sin `ListPlugins` en kernel (P1c) |                                                      |                                                      |
| Edición config: `createConfigWriter` — **fuera del kernel** (P1e)                    |                                                      |                                                      |
| `GetProjectSummary` (P2)                                                             |                                                      |                                                      |
| `TransitionChange` / `ApproveSpec` / `ApproveSignoff` — bake `config.approvals` (P3) |                                                      |                                                      |

| Comando CLI                            | Llama a                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| `change status` / `transition`         | `kernel.changes.status` / `transition` (sin `config.approvals` en input tras P3) |
| `change approve` (spec / signoff)      | `kernel.changes.approveSpec` / `approveSignoff` (sin flags en input)             |
| `change context`                       | `kernel.changes.compile` (solo overrides en `execute`)                           |
| `project context`                      | `kernel.project.getProjectContext` (solo overrides)                              |
| `plugins list`                         | `loadConfig` → `config.plugins` (sin kernel)                                     |
| `plugins install` / `uninstall`        | `createConfigWriter` (sin kernel)                                                |
| `change create`                        | `kernel.changes.create`                                                          |
| `graph stats`                          | `getGraphHealth` (code-graph)                                                    |
| `graph index`                          | `runIndexProjectGraph` (SDK)                                                     |
| `graph search` / `hotspots` / `impact` | `provider.*`                                                                     |
| `project status`                       | `buildProjectStatusSnapshot` (SDK)                                               |

---

# Orden de implementación — **completado en `main`**

Todas las fases P0–P3, G1, A2, A3 archivadas. Siguiente: merge a `feat/user-interface` (Track B).

---

# Checklist — **completado en `main`**

## Core (P0–P3)

- [x] P0c: `get-config.ts` + `kernel.project.getConfig` + tests
- [x] P0a: `get-status.ts` + CLI `change/status.ts`
- [x] P0b: `transition-change.ts` + CLI `change/transition.ts`
- [x] P1a: `compile-context.ts` + `get-project-context.ts` + CLI context commands
- [x] P1b: `create-change.ts` + CLI `change/create.ts`
- [x] P1c: `ListPlugins` fuera de kernel; CLI `getDeclaredPlugins`
- [x] P1e: edición yaml vía `createConfigWriter`; sin `addPlugin`/`removePlugin` en kernel
- [x] P1d: auditoría kernel inputs (`54f37f36`)
- [x] P2: `get-project-summary.ts` + CLI `project/status.ts`
- [x] P3: approvals bakeados; approve en `kernel.changes`

## Code-graph (G1)

- [x] `GetGraphHealth`, `IndexProjectGraph`, `GetSpecCoverage`, `GetChangeSpecCoverage` + tests
- [x] CLI `graph stats` usa `createGetGraphHealth`

## SDK (A2)

- [x] `core-reexports.ts` + exports code-graph en `index.ts`
- [x] `openSpecdHost` + `createSdkContext` + `withOpenGraphProvider`
- [x] `buildProjectStatusSnapshot` + `runIndexProjectGraph`
- [x] `packages/sdk/test/`
- [x] CLI: `resolveCliContext` → thin wrapper sobre `openSpecdHost`

## Hosts (A2b)

- [x] `packages/cli` y `packages/mcp`: solo `@specd/sdk`
- [x] Comandos delegan según tabla § reparto

## API pública (A3)

- [x] `packages/core/src/public.ts`
- [x] `packages/code-graph/src/public.ts`
- [x] SDK re-export curado (no `export *` indiscriminado de internals)
- [x] CLI/MCP sin imports de adapters/ports desde hosts

---

# Criterios de aceptación — **cumplidos en `main`**

- [x] CLI no hace `refreshImplementationTracking` antes de `status` / `transition` / `compile`
- [x] `change context` / `project context`: hosts no construyen `CompileContextConfig`
- [x] `change transition` / `change approve`: sin `approvalsSpec` / `approvalsSignoff` en input
- [x] Kernel use cases sin parámetros de config redundantes en `execute` (P1d)
- [x] Comandos solo config sin `createKernel`
- [x] Factories `createX` usables sin kernel
- [x] CLI boot vía `openSpecdHost`
- [x] Lectura config en orquestación: `kernel.project.getConfig.execute()`
- [x] `packages/core` sin dependencia de `code-graph`
- [x] Tests + specs pareados por use case
- [x] `packages/sdk` con tests
- [x] Public barrels (A3)

**Pendiente en Track B (feature):** migrar `api`, IPC, desktop a `@specd/sdk`; preservar `ifModifiedSince` (no está en main).

---

# Workflow specd

Track A archivado en `main` (changes P0–A3). **No** editar `specs/` a mano.

**Siguiente:** merge `main` → `feat/user-interface` — adaptación feature: [merge doc](./merge-main-analysis-2026-06-25.md) Track B.
