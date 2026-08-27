# Auditoría parcial — `@specd/skills`

## Requirements Summary

Alcance auditado para el cambio `package-fasttrack-skill`:

1. `skills:skill-templates-source` — registra el template estándar `specd-fasttrack`, sus metadatos, la referencia compartida relativa y el journal incremental y reanudable.
2. `skills:skill-repository` — exige descubrimiento genérico como skill estándar, sin fuente `.agents`, registro hard-codeado ni ruta de distribución específica.
3. `skills:resolve-bundle` — exige resolución genérica con variables incorporadas relativas al proyecto, capacidades del runtime, frontmatter estructurado y enrutamiento de shared files.

Dependencias directas revisadas: `skills:skill`, `skills:skill-bundle`, `skills:skill-repository-port`, `skills:workflow-automation`, `cli:spec-optimizations` y `core:config` cuando resultó pertinente. El grafo estaba actual (`stale: false`) antes de la inspección. Se usaron `changes spec-preview` para los tres specs del cambio y `graph impact` sobre `skill-repository.ts` y `ResolveBundle`.

## Implementation Status por requisito/escenario

### `skills:skill-templates-source` — Cumple

- `packages/skills/templates/skills/specd-fasttrack/SKILL.md.tpl` existe bajo la ubicación canónica, no contiene frontmatter estático y usa `@{{sharedFolder}}/shared.md`.
- `skill.meta.json` declara `kind: "skill"`, `requiredSharedTemplates: ["shared.md"]` y las tres capacidades que referencia el template: `mcp`, `agents` y `frontmatter`.
- El template contiene `{{{frontmatter}}}` como punto de inserción del renderer, no YAML estático.
- La regla **Mandatory live journal rule** obliga a añadir una entrada antes de la siguiente acción significativa tras cada decisión, hallazgo de alcance/contrato, edición de código, actualización de enlace de implementación, prueba/depuración y auditoría. Exige acción/hallazgo, motivo, archivos o símbolos y resultado/observación para pruebas; prohíbe que la consolidación final sustituya esas entradas. Esto satisface también el escenario de reanudación de trabajo interrumpido.
- Los comandos de impacto usan `--file`/`--symbol` y `--direction dependents`, coherentes con la terminología global de `skill-templates-source` y `skills:workflow-automation`.

### `skills:skill-repository` — Cumple

- `FsSkillRepository.list()` explora `templates/skills/*`; `get('specd-fasttrack')` utiliza el mismo camino genérico que cualquier skill estándar.
- `getBundle()` lee los metadatos, filtra las capacidades por `supportedCapabilities`, normaliza `SKILL.md.tpl` a `SKILL.md`, valida y añade los shared files declarados. No existe una rama, registro ni ruta de distribución específica de fast-track.
- La referencia a `.agents/skills` no forma parte de esta ruta. La fuente local anterior ya no existe, y la implementación obtiene todo desde `packages/skills/templates`.

### `skills:resolve-bundle` — Cumple en implementación

- `ResolveBundle.execute()` conserva el camino genérico `repository.getBundle(input.name, mergedContext)`; no añade lógica específica para fast-track.
- Cuando recibe configuración, calcula `configPath` y `sharedFolder` mediante `toRelativeProjectPath` y `resolveSharedFolder`, manteniendo rutas relativas al proyecto conforme a `core:config` y al contrato del bundle.
- Propaga el conjunto de capacidades suministrado. El renderer expone el mapa de capacidades y sólo inyecta frontmatter cuando está presente `frontmatter`; los archivos shared se renderizan con `includeFrontmatter: false`.
- Las ramas MCP y agents del template están condicionadas y, para `frontmatter` solamente, quedan ausentes tal como exige el contrato.

## Discrepancies

No se encontraron discrepancias de implementación frente a los tres specs auditados.

No se encontraron contradicciones entre los deltas del cambio y las dependencias directas/globales revisadas. En particular, la metadata declarativa, el renderizado de una sola pasada de Handlebars, el filtrado de capacidades, el frontmatter estructurado y la ruta relativa de shared files coinciden con los contratos existentes de `skills:skill`, `skills:skill-bundle`, `skills:skill-repository-port` y `skills:workflow-automation`.

## Test Coverage

- `packages/skills/test/template-workflow.spec.ts`
  - Comprueba que el template no inicia con frontmatter estático, contiene la referencia `@{{sharedFolder}}/shared.md`, la regla de journal incremental y el contrato exacto de metadatos.
- `packages/skills/test/infrastructure/skill-repository.spec.ts`
  - Comprueba descubrimiento por `get`, resolución de `SKILL.md` y `shared.md`, metadata, referencia shared renderizada y omisión de ramas MCP/agentes con capacidades `frontmatter` únicamente.
- `packages/skills/test/resolve-bundle.spec.ts`
  - Cubre la semántica genérica de `ResolveBundle`: variables incorporadas relativas al proyecto y propagación del contexto, de la que depende fast-track.
- Ejecución realizada: `pnpm --filter @specd/skills test -- template-workflow.spec.ts infrastructure/skill-repository.spec.ts resolve-bundle.spec.ts`.
  - Resultado: 8 archivos de test y 48 tests aprobados.

## Missing Tests

1. No hay una prueba que invoque específicamente `ResolveBundle` con `name: 'specd-fasttrack'`, una configuración realista y un conjunto de capacidades, para verificar juntos el `sharedFolder` relativo, las ramas condicionales y el shared file sin frontmatter. La implementación genérica lo soporta y sus unidades lo cubren por separado, pero falta el escenario de integración exacto del nuevo skill.
2. En este paquete no hay una prueba específica que ejecute `bundle.install()` para `specd-fasttrack` en destinos separados y lea `SKILL.md`/`shared.md` desde disco. El contrato de bundle está cubierto en memoria; la comprobación de instalación física debe quedar cubierta por las pruebas de integración de plugins de este cambio.

Estos son huecos de cobertura, no fallos de conformidad observados.

## Spec Dependency Chain

```text
skills:skill-templates-source
├─ skills:skill
├─ cli:spec-optimizations
└─ skills:workflow-automation

skills:skill-repository
├─ skills:skill
├─ skills:skill-bundle
└─ skills:skill-templates-source

skills:resolve-bundle
├─ core:config
├─ skills:skill-bundle
└─ skills:skill-repository-port
```

La implementación respeta la cadena: la metadata/template se descubre por el repositorio, el repositorio construye un `SkillBundle` genérico y `ResolveBundle` sólo añade variables seguras relativas al proyecto y delega la resolución.

## Summary counts

| Categoría                            | Cantidad |
| ------------------------------------ | -------: |
| Specs auditados                      |        3 |
| Requisitos nuevos auditados          |        3 |
| Requisitos conformes                 |        3 |
| Discrepancias spec/código            |        0 |
| Conflictos con dependencias/globales |        0 |
| Tests ejecutados                     |       48 |
| Huecos de cobertura no bloqueantes   |        2 |
