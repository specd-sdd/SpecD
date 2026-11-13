# Partial compliance: skills + plugin-agent-\* (plugin-architecture, last round)

Test runs: skills 161 pass; claude 75, copilot 74, codex 111, opencode 76, standard 73, all pass, 0 fail.

## Items

1. resolveSharedFolder: OK. packages/skills/src/domain/shared-folder.ts:28-53. Rejects empty, `.`, `./`, `\` (normalised to ''), root, escapes; `..foo` accepted; absolute inside root -> relative POSIX (l.48-50). Tests: packages/skills/test/domain/shared-folder.spec.ts:10-37 (would fail if wrong; includes root, `${root}/`, `/`).
2. Symlink marker: OK. shared-folder-owners.ts:127-144 (lstat -> symlink kind, unlink then write regular file, target untouched), :155-163 (non-valid -> hadMarker:false, no follow). Tests: shared-folder-owners.spec.ts:219-246 assert regular file, target content unchanged, link preserved on release.
3. ENOTDIR swallowed: OK. shared-folder-owners.ts:186-195, 304-311. Tests: shared-folder-owners-eacces.spec.ts:27 (mocked ENOTDIR) and spec.ts:248 (real symlink-to-file). EACCES propagation covered in the eacces spec.
4. selectManagedNames: OK. select-managed-names.ts:361-377. Non-string -> 'invalid name' without throwing; `__proto__`/`constructor`/`toString` -> 'not a specd-managed item' (array includes, no prototype lookup). Tests select-managed-names.spec.ts:21-58 (incl. non-string mix with null/undefined/42/{}/[]).
5. Spec text: OK. Merged spec states the empty/`.`/`./`/root rejection, `..foo`, symlink marker, ENOTDIR exactly as implemented.

## Filtered-uninstall wording (plugin-agent-claude:plugin-agent, l.111)

Implemented through selectManagedNames in all five uninstall-skills.ts (l.56-60). Each plugin's test/uninstall-safety.spec.ts:200-218 (opencode :202-220) runs real UninstallSkills with skills ['..'] and agents ['../x'], asserts nothing deleted (file outside the agents dir survives) and both reported invalid. Passes in all 5 plugins. OK.

## Discrepancies / gaps

- minor (test/verify gap): verify.md for skills:shared-folder-owners has no scenarios for the new behaviours (symlink marker, ENOTDIR, shared-folder rejection of ''/'.'/root, `..foo`). Unit tests exist and are strong, but spec scenarios are missing, so the new spec text has no verify traceability. Verify scenario list: only "Missing folder is accepted" and "Other errors propagate" cover removeSharedFolderIfEmpty.
- minor: readMarkerFile (shared-folder-owners.ts:252-259) returns undefined on any lstat error (e.g. EACCES) and then addSharedOwner writes a fresh marker. Consistent with "unreadable = no marker"; not a violation.
- minor: no test that addSharedOwner's symlink case replaces a dangling symlink (unlink path is the same, low risk).

Counts: items OK 5 / PARTIAL 0 / MISSING 0; critical 0, major 0, minor 3 (one test/verify gap, two notes).
