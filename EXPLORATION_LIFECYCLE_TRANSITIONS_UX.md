# Exploración: Lifecycle Transitions, Hooks y Skill Routing

Documento de análisis para revisitar y refinar. Captura una propuesta recibida sobre el lifecycle de changes, contrastada con el comportamiento **actual** de specd (Jul 2026).

**Fuentes revisadas:** `VALID_TRANSITIONS`, `LifecycleEngine`, `TransitionChange`, `GetStatus`, schema-std `workflow[]`, skills (`specd`, `specd-implement`, `specd-verify`), `shared.md`.

> **⚠️ No olvidar: approval gates.** Routing en `LifecycleEngine`; invariantes estructurales también como **platform gates** (§11.9). Transiciones, `nextAction`, dry-run y preflight **no pueden asumir** el camino sin gates. Ver secciones 9, 10.6 y 11.9.

---

## 1. Propuesta original (texto recibido)

Puntos planteados:

1. **Skip implementing:** Poder ir de `ready` → `verifying` / `done` cuando no hay implementación que hacer.
2. **Retroceso universal:** Poder pasar de cualquier estado a uno previo.
3. **Post-hooks en retroceso:** Al transicionar a un estado anterior (ej. `implementing` → `designing`), no deberían ejecutarse los post-hooks del estado de origen — técnicamente no se ha "terminado" esa fase. Igual para todos los retrocesos.
4. **Repair guide / nextAction:** Si falla una transición por `requiresTaskCompletion`, el lifecycle debería ofrecer el skill de la fase bloqueada (ej. intentar `verifying` con tasks incompletas → `/specd-implement`), no el "estado anterior exacto" del grafo.
5. **Status — transiciones:** Mostrar todas las transiciones posibles; ordenar forward-first (si estás en `implementing` y puedes ir a `verifying` y `designing`, `verifying` primero).
6. **Skill hints múltiples:** En los hints del siguiente skill, mostrar los skills permitidos que vienen "después" según schema (ej. en `ready`, si schema lo permite: `/specd-implement` y `/specd-verify`). No hardcodear — per schema.
7. **Templates de skills:** Revisar y alinear con todo lo anterior.
8. **`--dry-run` en transiciones:** Comprobar si se puede transicionar sin mutar ni ejecutar hooks, con el resto de checks activos. Responder "¿puedo transicionar?" sin adivinar desde `LifecycleEngine` solo.
9. **Unificar / reutilizar checks:** ¿Mover checks a `LifecycleEngine`? ¿Registro compartido entre engine y `TransitionChange`/`ArchiveChange`?
10. **Dependencias al pasar a `ready`:** Validar `specDependsOn` / consistencia de deps al ir a `ready`, como se hace en preflight de archive — detectar mismatches antes, no solo al archivar.

---

## 2. Resumen ejecutivo

La propuesta apunta a **problemas reales de UX** del lifecycle, pero mezcla:

- Cosas que **ya existen parcialmente**
- Cosas que **requieren diseño nuevo**
- Una petición (**cualquier estado → cualquier previo**) demasiado amplia para el modelo actual

**Veredicto:** No es over-engineering si se trocea. **Sí es demasiado ambiciosa como monolito.**

Prioridad sugerida:

1. **Fase 1** — `StepTransitionEvaluation` + guidance fix (schema + task gates; `platformBlockers: []` stub)
2. **Fase 2** — `EvaluateTransition` + registry platform (vacío → se va llenando)
3. **Fase 3** — dry-run + status enriquecido + hooks direction-aware
4. **Fase 4** — `specDependsOnConsistent` en `ready` + refactor archive
5. **Fase 5** — optional implementing + multi-skill hints

Detalle de fases en **§12**. Modelo de gates en **§11**.

En **todos** los puntos anteriores: validar comportamiento con gates **on** y **off** (sección 9).

---

## 3. Análisis punto por punto

### 3.1. Saltar `implementing` (`ready` → `verifying` / `done` sin código)

**Estado actual:** No es posible.

`VALID_TRANSITIONS['ready']` = `['implementing', 'pending-spec-approval', 'designing']`.

No hay atajo a `verifying` ni `done`.

El schema-std declara `implementing` y `verifying` como steps separados con los mismos `requires` pero distinto `requiresTaskCompletion` (solo en `verifying` y `archiving`).

**Pros**

- Casos legítimos: cambios solo-spec, docs-only, no-op deltas, tareas vacías o ya marcadas.
- Menos fricción para cambios que no tocan código.
- Encaja con espíritu schema-driven ("per schema", no hardcode).

**Contras / riesgos**

- Pierdes la fase donde se crean **implementation links** (`changes implementation add`) → code graph, compliance, archive.
- `implementing` no es solo "escribir código"; es "cerrar checklist de entrega".
- Atajo libre → agente puede saltarse trazabilidad sin querer.

**¿Se queda corto?** Sí. Falta criterio schema-driven explícito:

- ¿Step `implementing` con `optional: true`?
- ¿Transición condicionada a tasks satisfechas + cero links esperados?
- ¿Flag en tasks/design de "no code changes"?

**Recomendación:** Feature explícita del schema, no romper el grafo de estados ad hoc.

---

### 3.2. "Cualquier estado → cualquier estado previo"

**Estado actual:** Solo retrocesos **semánticos**, no grafo bidireccional completo.

| Retroceso                  | ¿Existe?                  |
| -------------------------- | ------------------------- |
| `* → designing` (redesign) | Sí, casi desde todos      |
| `verifying → implementing` | Sí (retry implementación) |
| `ready → designing`        | Sí                        |
| `implementing → ready`     | **No**                    |
| `verifying → ready`        | **No**                    |
| `done → verifying`         | **No**                    |

Intencional: `designing` concentra "volver atrás con invalidación"; `implementing` concentra "reintentar sin rediseñar".

**Pros:** Más libertad manual; menos sensación de atrapado.

**Contras:** Explosión combinatoria (invalidaciones, gates, hooks); conflicto con approval gates; ambigüedad semántica.

**Veredicto:** **Demasiado amplio tal cual.** Mantener retrocesos con semántica nombrada (redesign / retry / rollback), no "ir al anterior" genérico.

---

### 3.3. No ejecutar post-hooks al retroceder

**Estado actual:** `TransitionChange` ejecuta `source.post` al salir de un estado, **incluso hacia atrás**.

Spec (`core:transition-change`): post-hooks del source representan "after finishing this step".

Los **skills evitan** esto con `--skip-hooks all` y gestionan hooks manualmente (`shared.md`). Ej.: `specd-verify` retrocede a `designing` sin hooks implícitos.

Uso directo del CLI **sin** `--skip-hooks all` sí dispara post-hooks en retroceso.

**Pros de la propuesta**

- Semántica correcta: retroceder ≠ completar fase.
- Protege CLI directo.
- Alineado con modelo mental abort/rollback vs complete.

**Contras**

- Clasificar transiciones: `forward`, `backward`, `redesign`, `retry`.
- Algunos post-hooks podrían querer ejecutarse en ciertas salidas "forward" que no son lineales en el grafo.

**Veredicto:** **Punto más sólido.** Mejor ratio coste/beneficio. Falta matriz dirección × hooks.

---

### 3.4. Repair guide / nextAction cuando falla `requiresTaskCompletion`

**Estado actual (mixto):**

- Repair Guide usa `nextAction` de un `GetStatus` fresco tras fallo.
- En `implementing`, `_nextAction` **siempre** recomienda `/specd-implement`, aunque tasks estén 100% hechas.
- **`availableTransitions` no considera `requiresTaskCompletion`**, solo `requires` de artefactos → puede mostrar `verifying` como disponible cuando la transición fallaría por tasks.

**Ejemplo observado** (`get-specs-health-use-case`, 7/7 tasks, state `implementing`):

```
transitions:  verifying, designing
next action:  /specd-implement   ← debería ser /specd-verify
```

**Pros de la propuesta**

- Repair guide apunta al skill de la fase bloqueada.
- Si fallas `→ verifying` por tasks → `/specd-implement` es correcto; el gap es nunca recomendar `/specd-verify` cuando ya puedes avanzar.

**Acciones concretas**

1. Incluir task completion en evaluación de `availableTransitions`.
2. En `_nextAction`: tasks completas → `/specd-verify`; incompletas → `/specd-implement`.

---

### 3.5. Status: transiciones forward-first

**Estado actual:**

- Status muestra solo `availableTransitions`, no `validTransitions`.
- Orden viene del array en `VALID_TRANSITIONS` (ej. `implementing: ['verifying', 'designing']` → forward primero en la práctica).

**Pros:** Mostrar todas (`valid`) + cuáles bloqueadas y por qué → más útil para agentes. Orden forward-first explícito por `workflow[]` del schema.

**Contras:** Más ruido si no se diferencia available vs blocked.

**Formato propuesto para iterar:**

```
transitions:
  → verifying        (available)
  → designing        (available)
  · ready            (blocked: INVALID_TRANSITION)
```

---

### 3.6. Skill hints múltiples

**Estado actual:**

- Un solo `nextAction` con un solo `command`.
- `/specd` confía en routing dinámico del CLI → un skill.
- `specd-implement` solo acepta `ready | implementing | spec-approved`.
- `specd-verify` solo acepta `implementing | verifying | done`.
- No hay camino skill-driven `ready → verify`.

**Pros:** Refleja que el schema puede tener varios steps "ready" simultáneamente.

**Contras:** Choca con regla "un nextAction, stop, esperar usuario". Requiere `nextActions[]` o `skillOptions[]`. Depende de transiciones reales (3.1).

**Veredicto:** Visión correcta, pero **bloqueada** hasta tener skip-implementing schema-driven.

---

### 3.7. Templates de skills

Gaps concretos a revisar:

| Área                     | Skill actual                                | Propuesta                                    |
| ------------------------ | ------------------------------------------- | -------------------------------------------- |
| Entrada desde `ready`    | Solo `/specd-implement`                     | También `/specd-verify` si schema lo permite |
| Post-hooks al retroceder | `shared.md` asume finish phase = post-hooks | Distinguir forward vs backward               |
| Múltiples opciones       | Un skill, stop                              | Listar opciones permitidas                   |
| `specd-implement` step 1 | Rechaza estados fuera de whitelist          | Ampliar o delegar                            |
| Hooks en transition      | `--skip-hooks all` everywhere               | Simplificable si motor distingue dirección   |

Archivos a tocar en una implementación futura:

- `.agents/skills/specd/SKILL.md`
- `.agents/skills/specd-implement/SKILL.md`
- `.agents/skills/specd-verify/SKILL.md`
- `.agents/skills/specd-design/SKILL.md`
- `.specd/config/skills/shared/shared.md` (sección hooks)

---

## 4. Referencias de código / specs

### VALID_TRANSITIONS (fragmento)

```typescript
ready: ['implementing', 'pending-spec-approval', 'designing'],
implementing: ['verifying', 'designing'],
verifying: ['implementing', 'done', 'designing'],
```

Archivo: `packages/core/src/domain/value-objects/change-state.ts`

### Orden de hooks en transición

`source.post` → `target.pre` → state change. Post-hooks del source corren al salir, incluso en retroceso.

Spec: `specs/core/transition-change/spec.md`

### `_nextAction` en implementing (siempre implement)

Archivo: `packages/core/src/domain/services/lifecycle-engine.ts` (~L723)

### `availableTransitions` ignora task completion

Archivo: `packages/core/src/domain/services/lifecycle-engine.ts` (~L159) — filtra por `requires` de artefactos, no `requiresTaskCompletion`.

### Schema workflow (schema-std)

- `implementing`: `requires: [proposal, specs, verify, design, tasks]`, sin `requiresTaskCompletion`
- `verifying`: mismos `requires` + `requiresTaskCompletion: [tasks]`

Archivo: `packages/schema-std/schema.yaml`

---

## 5. Descomposición propuesta (4 changes)

| #   | Change                             | Scope                                                          | ROI   | Riesgo                                      |
| --- | ---------------------------------- | -------------------------------------------------------------- | ----- | ------------------------------------------- |
| 1   | Direction-aware hooks              | `TransitionChange`, spec hooks                                 | Alto  | Medio — incl. salida desde pending states   |
| 2   | Lifecycle guidance fix             | `LifecycleEngine`, `GetStatus`                                 | Alto  | Bajo — **validar con gates on/off**         |
| 3   | Status diagnostics                 | CLI `changes status`, specs                                    | Medio | Bajo — mostrar bloqueos `APPROVAL_REQUIRED` |
| 4   | Optional implementing (schema)     | schema format, `VALID_TRANSITIONS`, skills                     | Medio | Alto — **spec gate puede prohibir atajos**  |
| 5   | Transition preflight / `--dry-run` | `EvaluateTransition` o flag en `TransitionChange`, CLI, status | Alto  | Medio — unificar checks dispersos           |
| 6   | Dependency check at `ready`        | `TransitionChange` / shared preflight, `designing→ready`       | Medio | Medio — alinear con archive preflight       |

> Ver **§11** para el modelo de platform gates y cómo evitar rework en Fase 1.

---

## 6. Lo que sobra vs lo que falta

### Sobra en la formulación original

- "Cualquier estado → cualquier previo" (demasiado genérico).
- "Mostrar todos los skills siguientes" sin transiciones y `nextActions` schema-driven previos.

### Falta definir

- Impacto en **implementation tracking** y archive al saltar `implementing`.
- Reglas de invalidación/aprobaciones en retrocesos que no sean `designing`.
- **Approval gates:** routing, hints y transiciones cuando `spec`/`signoff` están activos (sección 9).
- Formato concreto del status (available vs blocked vs valid).
- Criterio schema para "no hay implementación" (más allá de "tasks ya hechas").
- Matriz transición × hooks × invalidación × **gates** × skill entry points.
- **Preflight unificado:** dry-run, blockers por target, archive guards visibles antes de archivar.
- **Dependency consistency** en `ready` (shared con archive preflight).

---

## 7. Preguntas abiertas para la siguiente iteración

1. ¿Un change "spec-only" debe poder archivarse sin ningún implementation link, o eso es warning/blocker?
2. ¿`ready → verifying` requiere pasar por `implementing` state aunque sea instantáneo (transición automática), o salto directo?
3. ¿Los post-hooks de `designing` deben correr al ir a `ready`? (forward en workflow, pero ¿"completar designing"?)
4. ¿`nextActions[]` en status o ampliar `nextAction` con campo `alternatives`?
5. ¿El orden forward-first debe venir de `workflow[]` del schema o de un orden canónico fijo de lifecycle states?
6. ¿Cómo se representa en schema un step opcional (`implementing` skippable)?
7. Con `approvals.spec: true`, ¿`ready → verifying` directo debe pasar por `pending-spec-approval` / `spec-approved` igual que `ready → implementing`?
8. Con `approvals.signoff: true`, ¿los hints en `done` deben priorizar `pending-signoff` sobre `archivable` y ocultar atajos que lo salten?
9. Al retroceder a `designing` desde `pending-spec-approval` o `pending-signoff`, ¿qué pasa con aprobaciones parciales y hashes capturados?

---

## 8. Próximo paso sugerido

Empezar por **Fase 1 (§12)**: introducir `StepTransitionEvaluation` con stub de platform gates + arreglar `_nextAction` / `availableTransitions` (task completion). No implementar deps en `ready` todavía — solo el contrato.

Después **Fase 2**: `EvaluateTransition` refactor de `TransitionChange`.

**Checklist antes de cerrar cualquier change de esta exploración:** probar escenarios con `approvals.spec` on/off y `approvals.signoff` on/off (sección 9).

---

## 9. Recordatorio: approval gates (no olvidar)

Los approval gates son **transversales** a toda esta exploración. Hoy están baked en kernel/`TransitionChange` y enrutan vía `LifecycleEngine._resolveTarget`:

| Gate          | Config                    | Routing actual                                            | Estados intermedios                                                 |
| ------------- | ------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| Spec approval | `approvals.spec: true`    | `ready` + target `implementing` → `pending-spec-approval` | `pending-spec-approval` → `spec-approved` (humano) → `implementing` |
| Signoff       | `approvals.signoff: true` | `done` + target `archivable` → `pending-signoff`          | `pending-signoff` → `signed-off` (humano) → `archivable`            |

Referencias: `specs/core/transition-change/spec.md`, `specs/core/lifecycle-engine/spec.md`, `packages/core/src/domain/value-objects/change-state.ts`.

### Implicaciones por área de la propuesta

**Skip implementing / atajos `ready → verifying`**

- Con spec gate **on**, un atajo no puede saltarse la aprobación humana de specs.
- Definir si el gate aplica solo a `implementing` o a **cualquier** entrada a fases post-`ready` (implementing, verifying, done).
- Skill hints en `ready` con gate on: probablemente solo `/specd-design` o "pedir approve-spec", no `/specd-implement` ni `/specd-verify` hasta aprobación.

**Retrocesos**

- Desde `pending-spec-approval` / `pending-signoff` solo `designing` es válido para progresión automática; el resto falla con `approval-required`.
- `→ designing` invalida spec approval y signoff (regla actual de `TransitionChange`).
- Post-hooks direction-aware: ¿ejecutar algo al salir de un pending state hacia `designing`?

**`nextAction` / repair guide / skill hints**

- No recomendar `/specd-implement` si el change está en `pending-spec-approval` — debe indicar `specd changes approve spec`.
- No recomendar archive/archivable si está en `pending-signoff` — debe indicar approve signoff.
- `_isStepPermitted` ya oculta estados de gate cuando el gate está off; los hints deben reflejar lo mismo.
- Con gate on, `--next` desde `ready` resuelve `implementing` pero enruta a `pending-spec-approval` — el hint al usuario debe ser explícito.

**Status / transiciones mostradas**

- Diferenciar `validTransitions` (grafo estático) vs `availableTransitions` (requires + gates).
- Mostrar estados de gate en lifecycle (`approvals: spec=on signoff=off` ya aparece en status) y marcar transiciones bloqueadas por `APPROVAL_REQUIRED`.
- Forward-first: los estados pending no son "siguiente paso feliz" — son gates, no workflow steps agent-driven.

**Hooks**

- Los pending states pueden tener hooks en schema; no confundir "salir de pending hacia designing" con "completar aprobación".
- Aprobación humana (`approve spec` / `approve signoff`) es acción separada de `change transition` — skills no deben auto-aprobar (`shared.md`).

### Matriz mínima de pruebas (gates)

| Escenario                    | spec gate | signoff gate | Qué verificar                                       |
| ---------------------------- | --------- | ------------ | --------------------------------------------------- |
| Happy path implement         | off       | off          | nextAction, transitions, hints sin pending          |
| Spec gate antes de implement | on        | off          | ready → pending-spec-approval; hints no saltan gate |
| Signoff antes de archive     | off       | on           | done → pending-signoff; archive hint bloqueado      |
| Ambos gates                  | on        | on           | Flujo completo ready → … → done → … → archivable    |
| Redesign desde pending       | on        | \*           | → designing invalida aprobación; status coherente   |

### Specs relacionados a revisar al implementar

- `core:approve-spec`, `core:approve-signoff`
- `core:transition-change` (approval-gate routing, pending-state failures)
- `cli:change-transition` (`--next`, repair guide con gates)
- Skills: mensajes cuando `review: required` vs pending approval (distintos — no mezclar)

---

## 10. Transition preflight, `--dry-run` y checks dispersos

Propuesta relacionada: poder preguntar **"¿puedo transicionar a X?"** sin mutar, sin hooks, pero con checks reales — y unificar dónde viven esos checks. Incluye validar dependencias al pasar a `ready` como en archive.

### 10.1. Mapa actual: ¿dónde se hacen los checks?

Hoy los checks **no están en un solo sitio**. Capas:

| Check                                      | LifecycleEngine                                       | TransitionChange                                    | ArchiveChange                                    | Visible en `changes status`                           |
| ------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------- |
| Grafo `VALID_TRANSITIONS`                  | ✅ (`requestedTarget`)                                | ✅ (vía engine + entity)                            | — (solo `assertArchivable`)                      | Parcial (`validTransitions` / `availableTransitions`) |
| Approval gate routing                      | ✅ `_resolveTarget`                                   | ✅ pending-state throws                             | —                                                | Parcial (`approvals:` line)                           |
| Workflow `requires` (artefactos)           | ✅ `availableTransitions`, `_requestedTargetBlockers` | ✅ loop explícito + progress                        | — (lifecycle ya pasó)                            | Parcial — no distingue target                         |
| `requiresTaskCompletion`                   | ❌                                                    | ✅ `_checkTaskCompletionForArtifact` (lee ficheros) | ✅ (step `archiving`)                            | ❌ — gap conocido                                     |
| Review / drift / overlap (review)          | ✅ `_deriveReview`                                    | —                                                   | overlap guard propio                             | ✅ `blockers:` (review)                               |
| Pending approval hard stops                | Parcial (`APPROVAL_REQUIRED`)                         | ✅ throws `approval-required`                       | —                                                | ❌                                                    |
| Redesign invalidation                      | —                                                     | ✅ en `mutate`                                      | —                                                | ❌                                                    |
| Implementation tracking refresh            | —                                                     | ✅ pre-transition                                   | —                                                | ✅ (side effect en status)                            |
| Open tracked impl files                    | ❌                                                    | ❌                                                  | ✅ `_assertTrackedImplementationFilesResolved`   | ❌                                                    |
| Out-of-scope impl links                    | ❌                                                    | ❌                                                  | ✅ `_assertOutOfScopeImplementationAllowed`      | ❌                                                    |
| ReadOnly workspace                         | ❌                                                    | ❌                                                  | ✅ guard                                         | ❌                                                    |
| Spec overlap (archive-time)                | ❌                                                    | ❌                                                  | ✅ `detectSpecOverlap`                           | ❌ (solo review overlap distinto)                     |
| Dependency mismatch (extract vs persisted) | ❌                                                    | ❌                                                  | ✅ `ArchiveDependencyMismatchError` en preflight | ❌                                                    |
| Schema name mismatch                       | ❌                                                    | ❌                                                  | ✅ guard                                         | ❌                                                    |
| Delta merge / publication preflight        | ❌                                                    | ❌                                                  | ✅ full-batch preflight                          | ❌                                                    |

**Conclusión:** `LifecycleEngine` es autoridad para **artefactos + grafo + gates de routing**, pero **no** es preflight completo de transición ni de archive. `GetStatus` sin `requestedTarget` no responde "¿puedo ir a verifying?" con task completion ni checks de archive.

`TransitionChange` ya llama `lifecycle.evaluate({ requestedTarget })` al inicio — pero luego repite requires enforcement y añade task completion + hooks + mutate. Hay duplicación parcial.

### 10.2. Propuesta `--dry-run`

**Idea:** `specd changes transition <name> <step> --dry-run` (o comando dedicado) que:

- Ejecuta **todos** los checks de la transición real
- **No** persiste estado
- **No** ejecuta hooks (`run:`)
- **Sí** puede hacer I/O de lectura (contenido tasks, refresh implementation tracking — debatable)

**Pros**

- Respuesta directa a "¿puedo?" para agentes y UI
- Repair guide proactivo sin intentar transición
- Base para mostrar blockers **por target** en status (`transition → verifying: blocked by INCOMPLETE_TASKS`)
- Complementa la exploración de multi-hints y transiciones forward-first

**Contras**

- Definir qué entra en dry-run vs qué es solo archive (¿simular archive preflight desde `done`?)
- Refresh de implementation tracking en dry-run puede ser sorprendente (efecto lateral de lectura/persistencia)
- Riesgo de drift entre dry-run y execute si no comparten código

**Recomendación de diseño:** No duplicar lógica — extraer **`EvaluateTransition`** (nombre tentativo) usado por:

1. `TransitionChange.execute` (modo normal)
2. `TransitionChange.evaluate` / `--dry-run` (modo preflight)
3. Opcionalmente `GetStatus` con `--target <step>` o ampliación de `LifecycleEngine.evaluate`

Alternativa más pequeña: flag `dryRun: true` en `TransitionChangeInput` que salta hooks + mutate pero corre el resto. Menos surface area que un use case nuevo, pero el use case crece.

### 10.3. ¿Mover checks al LifecycleEngine?

**No mover todo.** El engine debe seguir siendo **puro/dominio** (sin I/O de contenido de artefactos, sin hooks, sin archive guards).

**Sí centralizar en un registro compartido** (composition layer o domain service):

```
TransitionCheckRegistry
  - protocolValid(from, to)
  - approvalRouting(from, to, gates)
  - workflowRequires(step, change, schema)      // effective status
  - taskCompletion(step, change, repo)          // I/O
  - implementationTrackingResolved(change)      // archivable/archive path
  - specDependsOnConsistent(change, specs)        // ready + archive
  - readOnlyWorkspace(change, workspaces)
  - overlapAtArchive(...)                       // solo archivable/archive
```

`LifecycleEngine` consumiría checks **sin I/O**; `EvaluateTransition` orchestraría la cadena completa según `(from, to)` y flags.

Ventajas:

- Un solo lugar para "qué aplica a verifying vs archivable vs ready"
- Status puede listar blockers por transición sin ejecutar
- Dry-run y execute comparten registro

Riesgo: over-abstraction si el registro es prematuro — empezar extrayendo de `TransitionChange` + tests, luego conectar status.

### 10.4. Gap visible: archivable sin links / impl abierta

Hoy puedes estar en `archivable` (lifecycle OK) y **fallar al archivar** por:

- Tracked implementation files `open` (`ArchiveImplementationStateError`)
- Out-of-scope implementation sidecars
- Dependency mismatch en preflight
- ReadOnly workspace
- Overlap

**Ninguno** aparece en `changes status` antes de `specd changes archive`. El usuario/agente no sabe hasta intentar.

**Relación con dry-run:**

- `--dry-run` hacia `archivable` / comando `changes can-archive` podría ejecutar guards de archive **sin** publicar
- O `GetStatus` en state `archivable`/`done` debería proyectar "archive blockers" separados de lifecycle blockers

Esto conecta con la exploración de multi-hints: en `done`, hint de archive debería incluir blockers de preflight.

### 10.5. Dependency check al pasar a `ready`

**Estado actual:**

- `designing → ready`: solo workflow `requires` del step `ready` (artefactos completos). **No** valida consistencia de `specDependsOn` vs deltas/metadata.
- `ArchiveChange` preflight: `_resolvePersistedDependsOn` + `ArchiveDependencyMismatchError` si extract de merged content ≠ deps persistidas (cuando sidecar activo).

**Propuesta:** Misma lógica (o subset) al transicionar a `ready` — detectar deps faltantes, ciclos, mismatch extract vs manifest **antes** de implementar.

**Pros**

- Fallar barato en diseño, no en archive
- Alineado con post-hook de designing que ya pide verificar deps registradas
- Reduce sorpresas en compliance/metadata

**Contras**

- `ready` preflight necesita merged preview / extract — I/O similar a validate
- ¿Mismo strictness que archive o warning skippable?
- Spec-only changes con deps en manifest pero no en delta aún — definir policy

**Recomendación:** Implementar como check compartido en el registro (`specDependsOnConsistent`), invocado en:

1. `designing → ready` (nuevo)
2. Archive preflight (existente, refactor a shared)
3. Opcionalmente `--dry-run` hacia `ready`

### 10.6. Relación con approval gates (sección 9)

Dry-run y preflight **deben** simular approval routing:

- `ready --dry-run implementing` con spec gate on → effective target `pending-spec-approval`, no error
- Dry-run no puede "aprobar" — solo reportar `APPROVAL_REQUIRED` + comando humano
- `--dry-run archivable` con signoff on → effective `pending-signoff`

Incluir escenarios gate on/off en matriz de pruebas del preflight.

### 10.7. Opciones comparadas

| Enfoque                                         | Esfuerzo   | Coherencia          | Riesgo                               |
| ----------------------------------------------- | ---------- | ------------------- | ------------------------------------ |
| A. `--dry-run` flag en `TransitionChange`       | Bajo       | Medio — crece el UC | Drift si archive checks quedan fuera |
| B. Nuevo `EvaluateTransition` UC                | Medio      | Alto                | Bien acotado                         |
| C. Mover todo a `LifecycleEngine`               | Alto       | Bajo — mezcla I/O   | Rompe pureza del engine              |
| D. Registro de checks compartido                | Medio-Alto | **Alto**            | Mejor a largo plazo                  |
| E. Solo mejorar `GetStatus` + `requestedTarget` | Bajo       | Medio               | No cubre archive guards              |

**Preferencia documentada:** **B + D incremental** — `EvaluateTransition` orchestrator + checks extraídos progresivamente desde `TransitionChange` y `ArchiveChange`.

### 10.8. Preguntas abiertas (preflight)

11. ¿Dry-run debe ejecutar `RefreshImplementationTracking` o ser opt-in?
12. ¿`changes status --target verifying` sustituye parte de dry-run para agentes?
13. ¿Archive guards van en dry-run de `archivable` o en comando separado `changes archive --dry-run`?
14. ¿Dependency check en `ready` es blocker hard o warning con bypass?
15. ¿Los blockers por transición reemplazan `transitionBlockers` actuales (solo `requires`) o se añade capa `preflightBlockers[]`?

---

## 11. Platform gates — modelo paralelo a `requiresTaskCompletion`

Decisiones de diseño (Jul 2026): los checks internos (deps, impl tracking, readOnly, overlap…) **no van en schema YAML**. Siguen el _patrón_ de `requiresTaskCompletion` (qué se comprueba al entrar en un step), pero el **binding** lo define el core.

### 11.1. Tres capas de gates

| Capa                         | Quién define               | Qué comprueba                             | Configurable por schema                     |
| ---------------------------- | -------------------------- | ----------------------------------------- | ------------------------------------------- |
| **`requires`**               | Schema `workflow[]`        | Artefacto `complete` / `skipped`          | Sí                                          |
| **`requiresTaskCompletion`** | Schema `workflow[]`        | Contenido (tasks) en subset de `requires` | Sí — lista artefactos                       |
| **Platform gates**           | Core (`PlatformStepGates`) | Invariantes de producto con I/O           | **No** (specd-std); opt-out/plugin a futuro |

**No** añadir `requiresDepsValidation` al YAML del workflow. El equivalente es el platform gate `specDependsOnConsistent`, registrado en código para el step `ready` y reutilizado en archive.

### 11.2. Registry interno (pseudotipo)

```typescript
type PlatformGateId =
  | 'specDependsOnConsistent'
  | 'implementationTrackingResolved'
  | 'implementationLinksInScope'
  | 'readOnlyWorkspace'
  | 'specOverlapAtArchive'
  | 'schemaNameMatch'
  // Approval — invariantes estructurales (defensa en profundidad; ver §11.9)
  | 'specApprovalSatisfied'
  | 'signoffApprovalSatisfied'
  | 'approvalGateConfigValid'
// requiresTaskCompletion NO va aquí

/** Gates al entrar en un state vía TransitionChange */
const PLATFORM_TRANSITION_GATES: Partial<Record<ChangeState, readonly PlatformGateId[]>> = {
  ready: ['specDependsOnConsistent'],
  implementing: ['specApprovalSatisfied'], // solo si gate on — runner no-op si off
  archivable: ['signoffApprovalSatisfied'], // idem
  'pending-spec-approval': ['approvalGateConfigValid'],
  'pending-signoff': ['approvalGateConfigValid'],
  // verifying: [] — task completion lo cubre requiresTaskCompletion en schema
}

/** Gates de la operación archive (≠ transition → archivable) */
const PLATFORM_ARCHIVE_GATES: readonly PlatformGateId[] = [
  'schemaNameMatch',
  'specDependsOnConsistent',
  'implementationTrackingResolved',
  'implementationLinksInScope',
  'readOnlyWorkspace',
  'specOverlapAtArchive',
  // preflight de publicación (merge, metadata) — subconjunto aparte
]

type PlatformGateRunner = (ctx: PlatformGateContext) => Promise<PlatformGateResult>
// Registry: Map<PlatformGateId, PlatformGateRunner>
```

Specs candidatos: `core:platform-step-gates` (nuevo) o ampliar `core:workflow-model`.

### 11.3. Un evaluador, varios consumidores

```
EvaluateStepGates / EvaluateTransition
├── schema.requires              ← LifecycleEngine (sin I/O de contenido)
├── schema.requiresTaskCompletion ← I/O artefactos (como hoy TransitionChange)
└── platform.*                   ← registry + runners (I/O)
```

| Consumidor                 | Modo      | Gates evaluados                                    |
| -------------------------- | --------- | -------------------------------------------------- |
| `TransitionChange.execute` | mutate    | transition gates del **effective target**          |
| `--dry-run` / `evaluate()` | read-only | mismos                                             |
| `GetStatus --target X`     | read-only | proyección por target                              |
| `ArchiveChange.execute`    | mutate    | `PLATFORM_ARCHIVE_GATES` (+ preflight publicación) |

`LifecycleEngine` **no** absorbe platform gates — sigue puro (artefactos, grafo, review). El evaluador orquesta I/O.

### 11.4. Contrato `StepTransitionEvaluation` (introducir en Fase 1)

Contrato único para `_nextAction`, `availableTransitions`, dry-run y repair guide:

```typescript
interface StepTransitionEvaluation {
  from: ChangeState
  requested: ChangeState
  effective: ChangeState

  schemaBlockers: Blocker[] // requires + review (engine)
  taskBlockers: Blocker[] // requiresTaskCompletion
  platformBlockers: Blocker[] // stub [] en Fase 1; por target; approval + deps + …

  allowed: boolean
  /** Desglose opcional: mismo target, distintas severidades (routing vs hard invariant) */
  routing?: { requested: ChangeState; effective: ChangeState }
  recommendedSkill?: string | null
  alternatives?: string[] // Fase 5 multi-hints
}

/** Proyección multi-target para status (Fase 3a) */
interface TransitionTargetMatrix {
  from: ChangeState
  targets: Array<StepTransitionEvaluation & { target: ChangeState }>
}
```

**Regla:** `_nextAction` y `availableTransitions` **siempre** derivan de este objeto, no de lógica suelta en `_nextAction()`.

Fase 1 entrega evaluación con `platformBlockers: []` — sin deps en `ready` aún, pero sin rework posterior.

### 11.5. Misma implementación, distinto binding — deps

`specDependsOnConsistent(change, mergedSpecs)` — función compartida:

- **Binding A:** transition `designing → ready` (platform gate)
- **Binding B:** `ArchiveChange` preflight batch (platform gate archive)

Archive añade gates que `ready` no necesita (overlap, readOnly, impl files open). `ready` solo valida consistencia manifest / extract / persisted deps.

### 11.6. Qué NO hacer en Fase 1

- No implementar deps en `ready` — solo stub `platformBlockers: []`
- No duplicar task completion en engine **y** TransitionChange — una implementación en el evaluador
- No meter platform gates dentro de `LifecycleEngine` puro
- No añadir `requiresDepsValidation` a `schema.yaml` (salvo opt-out futuro muy justificado)

### 11.7. Extensibilidad futura

Si algún schema custom necesitara desactivar un gate: opt-out en schema (`platformGates.skip`) o registro de plugins en runtime — **no** duplicar la lista de checks en YAML por step.

### 11.8. Migración incremental — sacar checks existentes a platform gates

Tras Fase 1–2 (evaluador + registry stub), **ir extrayendo** checks que hoy viven repartidos en `TransitionChange`, `ArchiveChange` y proyecciones de status hacia runners del registry. No es big-bang.

#### Qué migrar y qué no

| Check actual                            | Dónde vive hoy              | ¿Platform gate?                | Destino                                                        |
| --------------------------------------- | --------------------------- | ------------------------------ | -------------------------------------------------------------- |
| `requires`                              | Schema + `LifecycleEngine`  | **No**                         | Capa schema (`schemaBlockers`)                                 |
| `requiresTaskCompletion`                | Schema + `TransitionChange` | **No**                         | Capa schema (`taskBlockers`)                                   |
| Review / drift / overlap (review)       | `LifecycleEngine`           | **No**                         | `schemaBlockers` / review                                      |
| Pending approval hard stops             | `TransitionChange`          | Parcial → **Sí** (invariantes) | Ver §11.9 — routing en engine; gates estructurales en platform |
| Deps mismatch (extract vs persisted)    | `ArchiveChange` preflight   | **Sí**                         | `specDependsOnConsistent` → `ready` + archive                  |
| Open tracked impl files                 | `ArchiveChange`             | **Sí**                         | `implementationTrackingResolved`                               |
| Out-of-scope impl links                 | `ArchiveChange`             | **Sí**                         | `implementationLinksInScope`                                   |
| ReadOnly workspace                      | `ArchiveChange`             | **Sí**                         | `readOnlyWorkspace`                                            |
| Overlap at archive                      | `ArchiveChange`             | **Sí**                         | `specOverlapAtArchive` (bypass `--allow-overlap`)              |
| Schema name mismatch                    | `ArchiveChange`             | **Sí**                         | `schemaNameMatch`                                              |
| Refresh impl tracking                   | `TransitionChange` pre      | **No**                         | Pre-step side effect; opt-in en dry-run                        |
| Redesign invalidation                   | `TransitionChange` mutate   | **No**                         | Efecto de transición, no gate de entrada                       |
| Publication preflight (merge, metadata) | `ArchiveChange`             | **Sí** (subconjunto)           | Gates de operación archive, no transition                      |

#### Orden de extracción (después de Fase 2)

1. **`specDependsOnConsistent`** — binding `ready` + archive (Fase 4); shared impl
2. **Archive guards visibles en status** — Fase 3a `archiveBlockers` para `done` / `archivable` / `signed-off`:
   - `implementationTrackingResolved`
   - `readOnlyWorkspace`
   - `specOverlapAtArchive`
     2b. **Approval invariantes** — Fase 2–3 (junto con evaluador):
   - `specApprovalSatisfied`, `signoffApprovalSatisfied`, `approvalGateConfigValid`
   - Mantener throws legacy hasta converger evaluate ↔ execute
3. **Resto `PLATFORM_ARCHIVE_GATES`** — refactor `ArchiveChange` para llamar runners; preflight publicación como sub-registry opcional (`publicationPreflight`)
4. **Transiciones ad hoc** — solo si producto lo pide (ej. exigir N implementation links antes de `verifying`; **hoy no existe**)

#### Dónde NO hace falta rellenar `PLATFORM_TRANSITION_GATES`

Casi todos los platform checks **relevantes hoy están en archive**, no repartidos por `implementing` / `verifying` / etc. Esos estados usan solo schema + task gates.

Es normal que `PLATFORM_TRANSITION_GATES` tenga pocas entradas (p. ej. solo `ready: ['specDependsOnConsistent']`). No rellenar estados por completitud.

#### Resultado objetivo

```
GetStatus / dry-run / TransitionChange.evaluate
  → StepTransitionEvaluation
      schemaBlockers
      taskBlockers
      platformBlockers     ← registry por transition target

ArchiveChange / archive --dry-run
  → ArchiveOperationEvaluation (o evaluate con context: 'archive')
      platformBlockers     ← PLATFORM_ARCHIVE_GATES (+ publication)
```

Mismo **runner** por `PlatformGateId`; distinto **binding** (transition target vs operación archive).

### 11.9. Approval gates como platform gates (invariantes estructurales)

**Sí, encajan** — pero con un rol distinto al routing actual. No reemplazan `_resolveTarget`; lo **refuerzan** por si hay un fallo de código, un caller que salta el engine, o drift entre `execute` y dry-run.

#### Dos responsabilidades (no mezclar)

| Responsabilidad            | Dónde                            | Comportamiento                                                                                                                |
| -------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Routing**                | `LifecycleEngine._resolveTarget` | `ready` + target `implementing` + gate on → **effective** `pending-spec-approval`. No es error; es camino esperado.           |
| **Invariante estructural** | Platform gate                    | “No debe persistirse `implementing` si gate on y no hay spec approval registrada.” Si algo lo intenta mal → **blocker hard**. |

El usuario ve routing en status/dry-run (`APPROVAL_REQUIRED`, effective ≠ requested). El platform gate es **red de seguridad** para mutaciones y para alinear evaluate ↔ execute.

#### Gates de approval propuestos

| Gate                       | Cuándo corre                                                                     | Qué valida                                                                    | Si gate off               |
| -------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------- |
| `specApprovalSatisfied`    | Target efectivo `implementing` o entrada post-`spec-approved`                    | Gate on → change tiene spec approval vigente (hashes, no invalidada)          | No-op                     |
| `signoffApprovalSatisfied` | Target efectivo `archivable` o post-`signed-off`                                 | Gate on → signoff registrado                                                  | No-op                     |
| `approvalGateConfigValid`  | Target `pending-spec-approval`, `spec-approved`, `pending-signoff`, `signed-off` | Gate **off** → no se puede entrar a estados de gate (hoy `gate-not-required`) | No-op en estados normales |

Opcional más adelante:

- `pendingExitAllowed` — desde pending solo `designing` (hoy throw en `TransitionChange`; podría moverse al registry)

#### Por qué ayuda

- **Defensa en profundidad** — bug que persiste `implementing` sin approve queda bloqueado en evaluate y execute
- **Dry-run / status** — mismos invariantes que la mutación real
- **Un solo lugar** para listar “qué debe ser cierto en `implementing` además de schema requires”
- **Tests** — gate runners unitarios sin simular todo `TransitionChange`
- **Visibilidad de bloqueo** — ver §11.9.1: respuesta unificada a “¿esto bloquea la transición?”

#### 11.9.1. Saber si approval (u otro gate) bloquea una transición

Hoy el bloqueo por approval está **rep partido**:

- Routing (`effective ≠ requested`) → a veces informa, a veces parece “casi disponible”
- Throws en `TransitionChange` → solo al intentar
- `pending-*` → bloqueo duro sin proyección clara en status por target
- `nextAction` → heurística aparte

Con approval en `platformBlockers` dentro de `StepTransitionEvaluation`:

```typescript
// Ejemplo: dry-run o status --target implementing (spec gate on, sin approve)
{
  requested: 'implementing',
  effective: 'pending-spec-approval',
  allowed: false,                    // o true si routing es válido pero requiere humano — ver nota
  platformBlockers: [{
    code: 'APPROVAL_REQUIRED',
    message: 'Spec approval required before implementing',
    gate: 'spec',
    resolvedBy: 'specd changes approve spec <name> --reason "..."'
  }],
  routing: { requested, effective }  // explícito, no mezclado con blockers de schema
}
```

**Regla de proyección** (definir en spec):

| Situación                                            | `allowed`                                                                                                    | Blocker                                                    | UX                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------- |
| Routing esperado (`ready` → `pending-spec-approval`) | `false` para target **requested** `implementing`; `true` para transición explícita a `pending-spec-approval` | `APPROVAL_REQUIRED` informativo en `--target implementing` | “No puedes ir a implementing directo; primero approve o ve a pending” |
| Bug / bypass (`implementing` sin approve)            | `false`                                                                                                      | `APPROVAL_REQUIRED` **hard**                               | Mismo código, distinto `severity` o `reason`                          |
| Ya en `pending-spec-approval`                        | `false` para casi todo excepto `designing`                                                                   | `APPROVAL_PENDING`                                         | nextAction → comando approve                                          |
| Gate off                                             | no-op                                                                                                        | —                                                          | `allowed` sigue schema/task/platform                                  |

Campos útiles en el evaluador (status + dry-run + repair guide):

- `transitionTargets[]` — por cada `validTransition`, evaluación completa con `allowed` + blockers desglosados
- `platformBlockers` / `schemaBlockers` / `taskBlockers` — **por target**, no solo globales
- `blockingReason` prioritizado para repair guide (approval > task > requires > platform)

Así **`changes status --target implementing`** o **`transition --dry-run implementing`** responden sin ambigüedad:

```
can transition:  no
effective:       pending-spec-approval
blockers:
  ! APPROVAL_REQUIRED: Spec approval required (gate=spec)
resolve:         specd changes approve spec <name> --reason "..."
```

Lo mismo aplica a signoff → `archivable`, y en Fase 3a a archive guards en `--target archivable` o `archiveBlockers` en status.

**Fase 1:** aunque approval platform gates lleguen en Fase 2–3, el contrato `StepTransitionEvaluation` debe reservar `platformBlockers[]` **por target** para no rehacer status/dry-run después.

#### Qué NO mover al registry

- **Routing transparente** (`ready → pending-spec-approval`) — sigue en engine para `effectiveTarget` y UX
- **`approve spec` / `approve signoff`** — acciones humanas separadas; los gates **leen** el resultado, no lo sustituyen
- **Mensaje “siguiente paso: approve”** — sigue en `nextAction`, no en el runner

#### Orden de migración (approval)

Después de Fase 2 (evaluador wired):

1. Implementar runners `specApprovalSatisfied` / `signoffApprovalSatisfied` / `approvalGateConfigValid`
2. Registrar en `PLATFORM_TRANSITION_GATES` para targets indicados
3. Mantener throws actuales en `TransitionChange` **temporalmente** (doble capa) → eliminar cuando evaluate sea única entrada
4. Tests: gate on + mutate directo simulado debe fallar en evaluate aunque routing “funcione”

#### Matriz gates on/off (ampliar §9)

| Escenario                                   | Routing (engine)                  | Platform gate                   |
| ------------------------------------------- | --------------------------------- | ------------------------------- |
| ready → implementing, spec off              | effective = implementing          | `specApprovalSatisfied` no-op   |
| ready → implementing, spec on               | effective = pending-spec-approval | no aplica a implementing aún    |
| spec-approved → implementing, spec on       | effective = implementing          | `specApprovalSatisfied` pasa    |
| ready → implementing directo (bug), spec on | —                                 | **gate falla**                  |
| done → archivable, signoff on               | effective = pending-signoff       | —                               |
| signed-off → archivable                     | effective = archivable            | `signoffApprovalSatisfied` pasa |

---

## 12. Roadmap de implementación (orden propuesto)

### Fase 0 — Decisiones (sin código)

| Tema                                 | Default                                                  |
| ------------------------------------ | -------------------------------------------------------- |
| Gate spec aplica a skip implementing | Sí — cualquier salida post-`ready`                       |
| Deps en `ready`                      | Hard blocker (`specDependsOnConsistent`)                 |
| Dry-run + refresh impl tracking      | Opt-in, off por defecto                                  |
| Archive preflight                    | `archive --dry-run` + subset en status `archiveBlockers` |
| Multi-hints                          | `nextAction` + `alternatives[]` opcional                 |

### Fase 1 — Change: `lifecycle-guidance-fix`

- Introducir `StepTransitionEvaluation` + evaluador (schema + task; `platformBlockers: []`)
- `availableTransitions` incluye task completion
- `_nextAction` desde evaluación (implementing 7/7 → `/specd-verify`)
- Pending gates → comando humano approve, no skill
- Tests gates on/off

**Specs:** `core:lifecycle-engine`, `core:get-status`, posible `core:evaluate-step-gates`

### Fase 2 — Change: `transition-preflight-foundation`

- `EvaluateTransition` (o `TransitionChange.evaluate`)
- Refactor `execute` → evaluate → mutate
- Registry platform vacío (interfaces + wiring)
- Eliminar duplicación requires-check

**Specs:** `core:transition-change`, `core:platform-step-gates`

### Fase 3 — Paralelo o secuencial

**3a `transition-dry-run-and-status`**

- `changes transition --dry-run`, opcional `status --target`
- **`transitionTargets[]` / matriz por target** — cada transición con `allowed` + blockers (schema/task/platform), incl. approval
- Transitions forward-first; valid / available / blocked con razón explícita
- `archiveBlockers` en status (subset `PLATFORM_ARCHIVE_GATES`)

**3b `direction-aware-hooks`**

- Clasificar: forward | retry | redesign | gate-exit
- `source.post` solo en forward-complete
- Actualizar `shared.md` / skills

### Fase 4 — Change: `ready-dependency-preflight`

- Implementar `specDependsOnConsistent` runner
- Registrar en `PLATFORM_TRANSITION_GATES.ready`
- Refactor archive → misma función
- Blocker: `DEPENDENCY_MISMATCH` (o reutilizar error archive)

### Fase 5 — Change: `optional-implementing-and-skill-routing`

- Schema: step `implementing` optional
- `VALID_TRANSITIONS` + gates spec
- `alternatives[]` en status
- Skills alineados

### Explícitamente fuera de scope

- Retroceso universal (cualquier → previo)
- Mover todo a LifecycleEngine
- Multi-hints `/specd-verify` desde `ready` antes de Fase 5

### Timeline

```
Fase 0  decisiones
   ↓
Fase 1  StepTransitionEvaluation + guidance     ← valor inmediato, sin rework
   ↓
Fase 2  EvaluateTransition + registry stub
   ↓
Fase 3a dry-run/status     ║  3b direction-aware hooks
   ↓
Fase 4  specDependsOnConsistent (ready + archive)
   ↓
Fase 5  optional implementing + skills
```

### Checklist transversal (cada fase)

- [ ] Matriz gates spec/signoff on/off
- [ ] implementing: 0 / parcial / 100% tasks
- [ ] dry-run / repair guide / nextAction coherentes
- [ ] Evaluación usa `StepTransitionEvaluation` (no lógica ad hoc)

---

_Generado: 2026-07-23. Actualizado: 2026-07-23 (approval gates, preflight/dry-run, platform gates §11, roadmap §12). Revisar contra specs `core:lifecycle-engine`, `core:transition-change`, `core:workflow-model`, `core:archive-change`, `core:approve-spec`, `core:approve-signoff`, `cli:change-transition`, `cli:change-status`, `skills:workflow-automation`._
