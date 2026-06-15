---
    "@specd/code-graph-electron": patch
---
20260615 - code-graph-electron: Add an internal @specd/code-graph-electron workspace that keeps studio-desktop on the shared code-graph behavior while isolating Electron’s native SQLite runtime path from the standard CLI/API Node path. The change vendors and rebuilds better-sqlite3 specifically for Electron, rewires desktop local graph composition to consume the new package, and ensures desktop builds prepare the Electron-targeted sqlite runtime automatically.

Specs affected:
- `code-graph-electron:composition`

