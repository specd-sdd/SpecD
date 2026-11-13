# Cross-Platform Conventions

## Purpose

specd runs on Windows, Linux, and macOS, but code written and tested on one host silently breaks on another: hardcoded separators, case-sensitive comparisons, POSIX-only shell constructs, and permission bits all behave differently. This spec defines what production code MUST take into account to stay portable and the accepted technique for each concern. Tests are covered by `_global/testing` and enforcement by `_global/continuous-integration`.

## Requirements

### Requirement: Portability is a baseline requirement

All production code in every package MUST behave equivalently on macOS, Linux, and Windows. Code MUST NOT assume a POSIX host, a specific shell, or a specific filesystem layout. When behaviour must differ by platform, the difference MUST be isolated in one place (a helper or adapter) and MUST NOT leak into callers.

### Requirement: Filesystem paths

Code that builds, splits, or compares filesystem paths MUST use `node:path` (`join`, `resolve`, `relative`, `dirname`, `basename`, `sep`, or equivalent). It MUST NOT concatenate segments with a hardcoded `/` or `\`, and MUST NOT split paths on a hardcoded separator.

Paths that are persisted, compared, or exposed as logical identifiers (for example keys in an index, entries in a manifest, or lock-file contents) MUST be normalized to forward slashes before storage or comparison and converted back to host paths only when touching the filesystem.

`path.win32` and `path.posix` MUST be used only when a rule is deliberately platform-specific, never as a replacement for the host `path`. File URLs MUST be built and read with `pathToFileURL` and `fileURLToPath`, not by string concatenation.

### Requirement: Case sensitivity

Code MUST NOT rely on the filesystem being case-sensitive or case-insensitive. Two paths that differ only in case MUST NOT be treated as distinct files by logic that must run on Windows and macOS, and code MUST NOT depend on a path matching the on-disk casing.

### Requirement: Names valid on every platform

Any name that can become a file or directory name (user-supplied identifiers, entity or project names, generated file names) MUST be valid on Windows as well as POSIX. Such names MUST NOT contain `< > : " | ? *`, control characters, a trailing dot or space, or be a Windows reserved device name (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`), with or without an extension. Validation MUST happen at the boundary where the name is accepted.

### Requirement: Line endings and encoding

Text read from disk MUST be parsed so that CRLF, lone CR, and LF are equivalent. Content hashes, change detection, and marker files that record installed state MUST compute on content normalized to LF. Text written by specd MUST be UTF-8 without BOM, and readers MUST tolerate a leading BOM. Code MUST NOT use `os.EOL` to decide the format of persisted files.

### Requirement: Processes and shell

Code that runs external programs MUST prefer `spawn` or `execFile` with an argument array and no shell. A shell MUST be used only when the command is explicitly a shell command (for example a command string supplied by the user and expected to be interpreted by a shell) or when the target requires it on Windows (`*.cmd` and `*.bat` entry points).

Commands built by specd MUST NOT depend on POSIX-only builtins or syntax (`printf`, `sleep`, `&&`-chains assuming `sh`, `$VAR` expansion) unless the execution layer translates them per platform. Processes spawned without an interactive window MUST set `windowsHide`. Quoting MUST account for the difference between cmd and POSIX shells.

### Requirement: Permissions and symlinks

Code MUST NOT rely on POSIX permission bits (`chmod`, executable bit, `0o000`) to enforce behaviour that must hold on Windows. Features that need symlinks MUST treat them as optional and MUST fall back to a copy or an equivalent behaviour when symlink creation is not permitted.

### Requirement: File locking, replacement, and path length

Code MUST NOT assume an open file can be deleted, renamed, or replaced while another handle exists, because Windows rejects it. Writes that must not be observed half-complete MUST use a temporary file in the same directory followed by an atomic rename, and operations that can fail with `EBUSY`, `EPERM`, or `EACCES` on Windows MUST retry briefly before failing. Code SHOULD keep generated paths short and MUST NOT depend on paths longer than the Windows default limit.

### Requirement: Directories and environment

Code MUST obtain the home directory, temp directory, and working locations from `os.homedir()`, `os.tmpdir()`, and `process.cwd()` or configuration, and MUST NOT hardcode `/tmp`, `/home/...`, `~`, or `C:\`. Environment variable lookups MUST NOT depend on name casing, because Windows treats names as case-insensitive. Platform detection MUST use `process.platform` in one isolated helper rather than scattered checks.

### Requirement: Enforcement

Tests MUST verify these rules as described in `_global/testing`, and the three-operating-system job described in `_global/continuous-integration` MUST be the gate that enforces them. A change that makes code behave differently across platforms without a documented, isolated platform-specific adapter MUST be rejected in review.

## Constraints

- Applies to production code in every package; test-specific rules stay in `_global/testing`
- No hardcoded path separators or absolute POSIX paths in production code
- No shell, no POSIX-only builtins by default when running external programs
- Names that reach disk are valid on Windows, including reserved device names
- Persisted text is UTF-8 without BOM, with LF-normalized comparison
- Platform-specific behaviour is isolated in a single helper or adapter

## Spec Dependencies

_none — this is a global constraint spec_
