---
'@specd/code-graph': patch
---

20260508 - improve-graph-search-discovery: This improvement optimizes the discovery of symbols and specifications in the code graph by changing the Full-Text search logic from strict intersection (AND) to ranked union (OR). By joining search terms with the OR operator and relying on existing BM25 ranking, the system now enables finding related concepts spread across different files or symbols, while maintaining precision by prioritizing results that match more terms.

Specs affected:

- `code-graph:sqlite-graph-store`
- `code-graph:ladybug-graph-store`
