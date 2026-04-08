## Spec metadata

specd extracts structured metadata from your spec files and stores it in `.specd/metadata/`. Each spec gets a `metadata.json` file that captures:

- Title and description
- Rules and constraints (extracted from the spec content)
- Verification scenarios (extracted from the verify content)
- `dependsOn` relationships to other specs

This metadata is used during context compilation. Rather than reading every spec file in full, specd can serve the metadata summary — which is typically smaller and more focused — when building the agent's context window.

Metadata is **generated automatically at archive time**. Between archiving runs it can become stale if you edit a spec manually. specd tracks freshness: a stale metadata file is flagged, and the raw spec content is used as a fallback until metadata is regenerated.
