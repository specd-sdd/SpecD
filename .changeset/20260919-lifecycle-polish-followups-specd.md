---
'@specd/specd': patch
---

20260919 - lifecycle-polish-followups: Corrige follow-ups de lifecycle para que los estados históricos de aprobación devuelvan errores tipados y accionables, estabiliza las proyecciones de estado y la composición de snapshots de archive, y completa la UX/documentación de hooks, schema plugins y fast-track. Añade regresiones para las rutas CLI y de composición, sin cambios incompatibles ni migraciones.

Modified packages:

- @specd/core
- @specd/cli
- @specd/skills

Specs affected:

- `core:transition-change`
- `core:lifecycle-engine`
- `core:transition-checks`
- `core:archive-change`
- `cli:change-status`
- `skills:skill-templates-source`
- `core:hook-execution-model`
- `core:schema-format`
- `core:change`
- `core:get-status`
- `cli:change-archive`
- `core:config-writer-port`
- `cli:change-artifact-instruction`
