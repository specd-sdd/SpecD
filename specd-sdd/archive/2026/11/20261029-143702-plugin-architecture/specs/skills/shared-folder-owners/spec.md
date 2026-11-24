# Shared Folder Owners

## Purpose

Several agent plugins write the same shared files (`shared.md`, `<agent>.agent.md`) into one shared folder. Without ownership tracking, uninstalling one agent plugin deletes files the others still need, and an empty shared folder is never cleaned up. This spec defines an owners marker and the helpers that let each agent plugin register itself on install and release itself on uninstall, so the shared files are removed only when the last owner leaves.

## Requirements

### Requirement: Owners marker file

The shared folder MUST resolve to a directory strictly inside the project root: an empty path, `.`, `./` or a path that resolves to the project root itself MUST be rejected (`InvalidSharedFolderError`), and a name such as `..foo` is a valid folder name, not an escape. A marker file that is a symbolic link MUST be treated as an invalid marker and replaced by a regular file; the write MUST NOT follow the link. The shared folder SHALL contain a marker file named `.owners.json` whose content is a JSON object `{ "owners": string[] }`. Each entry is an agent id (for example `claude`, `copilot`). The list MUST contain no duplicates (a marker read with duplicates is accepted and rewritten without them on the next write) and MUST be written sorted ascending so the file is stable under version control.

A missing file, unreadable file, invalid JSON, or a value that does not match the shape MUST be treated as "no marker" (a legacy or unknown state); it MUST NOT be repaired silently by a read operation.

### Requirement: Registering an owner

The package `@specd/skills` SHALL export `addSharedOwner(sharedDir, agentId)`. It MUST create the shared folder when absent, create the marker when absent, and add `agentId` to `owners` when not yet present. Registering the same id twice MUST leave a normalised marker (sorted, without duplicates) byte-identical; a marker that is unsorted or holds duplicates is rewritten normalised even when the id is already present. When the existing marker is invalid, `addSharedOwner` MUST replace it with a marker that contains only the given `agentId`.

Agent plugins MUST call `addSharedOwner` before writing the first file into the shared folder, for filtered and unfiltered installs alike. Registering first guarantees that a later failure during install, after some shared files were written, still leaves the folder with a valid marker, so a subsequent uninstall can release the owner and clean up. An install that fails before writing any shared file MAY leave the owner registered; uninstall MUST tolerate an owner whose shared files were never written.

### Requirement: Releasing an owner

The package SHALL export `removeSharedOwner(sharedDir, agentId)` returning `Promise<{ remaining: string[]; hadMarker: boolean }>`.

- When the marker is valid, it MUST remove `agentId` from `owners`, write the marker back when owners remain, delete the marker when none remain, and return `hadMarker: true` with the remaining ids.
- When there is no valid marker, it MUST NOT create or modify any file and MUST return `{ remaining: [], hadMarker: false }`.
- Releasing an id that is not an owner MUST leave the marker unchanged.

### Requirement: Removing the folder only when empty

The package SHALL export `removeSharedFolderIfEmpty(sharedDir)`. It MUST call a non-recursive directory removal (`rmdir` semantics). It MUST swallow only `ENOTEMPTY`, `ENOENT` and `ENOTDIR` (a shared folder that is not a directory is left alone); any other error MUST propagate. It MUST NOT delete any file.

### Requirement: Uninstall protocol for agent plugins

A full uninstall (no `skills` and no `agents` filter) of an agent plugin MUST:

1. remove the plugin's own files (skills, agents in its own directories, its prompt reference);
2. call `removeSharedOwner(sharedDir, agentId)`;
3. when `hadMarker` is `false`, leave every shared file untouched;
4. when `remaining` is not empty, leave every shared file untouched;
5. when `hadMarker` is `true` and `remaining` is empty, delete `shared.md`, every managed `<agent>.agent.md` and any legacy `<agent>.agent.md` files it knows, then call `removeSharedFolderIfEmpty`.

A filtered uninstall MUST NOT call `removeSharedOwner` and MUST NOT delete shared files, except the explicitly selected agent file for plugins that write agents into the shared folder.

Files in the shared folder that the plugin does not manage MUST never be deleted.

## Constraints

- All operations are sequential per project; concurrent installers are not supported.
- The marker records agent ids only, never paths or versions.
- The helpers use only `node:fs/promises` and `node:path` and perform no logging.

## Spec Dependencies

- [`skills:skill-bundle`](../skill-bundle/spec.md) — defines which bundle files are shared
- [`skills:skill-repository`](../skill-repository/spec.md) — source of the managed agent names
