---
    "@specd/cli": patch
    "@specd/skills": patch
---

20260619 - sanitize-graph-search-snippets: Sanitize graph-search snippet rendering so ANSI escape sequences and non-printable control characters never corrupt terminal output. Make snippets opt-in with --snippet across text, json, and toon output, while preserving compact location-only defaults and updating CLI docs plus skill templates to document the new behavior.

Specs affected:

- `cli:graph-search`
- `skills:skill-templates-source`
