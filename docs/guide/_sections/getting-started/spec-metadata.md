## Spec metadata

specd extracts structured metadata from your spec files and stores it in `.specd/metadata/`. Each spec gets a `metadata.json` file that captures:

- Title and description
- Rules and constraints (extracted from the spec content)
- Verification scenarios (extracted from the verify content)
- `dependsOn` relationships to other specs

This metadata is used during context compilation. Rather than reading every spec file in full, specd can serve the metadata summary — which is typically smaller and more focused — when building the agent's context window.

Metadata is **generated automatically at archive time**. Between archiving runs it can become stale if you edit a spec manually. specd tracks freshness: a stale metadata file is flagged, and the raw spec content is used as a fallback until metadata is regenerated.

For persisted specs, `dependsOn` is now anchored by a canonical `spec-lock.json` sidecar stored next to the spec artifacts. `metadata.json.dependsOn` remains the consumer-facing field used by context compilation, but archive keeps it aligned with `spec-lock.json` rather than treating extracted `dependsOn` as an independent durable source of truth.

Older specs may not have a sidecar yet. In that case specd can backfill `spec-lock.json` opportunistically during archive, alongside archive-time metadata regeneration, but only when the canonical spec is structurally compatible with the current schema. Sidecar creation is owned by the archive flow rather than by standalone metadata generation. Until then, existing metadata continues to serve legacy reads.
