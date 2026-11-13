# Verification: Cross-Platform Conventions

## Requirements

### Requirement: Portability is a baseline requirement

#### Scenario: Platform difference leaks into callers

- **WHEN** business logic branches on `process.platform` to build a command or path
- **THEN** the branch must move into a single helper or adapter that callers use without platform checks

### Requirement: Filesystem paths

#### Scenario: Hardcoded separator in a path

- **WHEN** production code builds a path with `` `${dir}/${name}` `` or splits one with `split('/')`
- **THEN** it must use `node:path` (`join`, `basename`, `dirname`, or equivalent)

#### Scenario: Logical identifier keeps forward slashes

- **GIVEN** the code runs on Windows and a file lives at `src\domain\change.ts`
- **WHEN** the path is stored as an index key, manifest entry, or lock-file entry
- **THEN** it is stored as `src/domain/change.ts`
- **AND** it is converted back to a host path only when the filesystem is accessed

#### Scenario: File URL built by string concatenation

- **WHEN** code builds a dynamic import URL as `'file://' + absolutePath`
- **THEN** it must use `pathToFileURL`

### Requirement: Case sensitivity

#### Scenario: Paths differing only in case

- **GIVEN** logic that must run on Windows and macOS
- **WHEN** it receives `Src/Foo.ts` and `src/foo.ts`
- **THEN** it does not treat them as two distinct files by relying on string inequality alone

### Requirement: Names valid on every platform

#### Scenario: Reserved device name

- **WHEN** a user-supplied name that can become a file or directory name is `nul`, `CON`, or `com1.txt`
- **THEN** it is rejected at the boundary where the name is accepted

#### Scenario: Invalid character or trailing dot

- **WHEN** a name contains `:` or `?`, or ends with `.` or a space
- **THEN** it is rejected even when the current host would accept it

### Requirement: Line endings and encoding

#### Scenario: CRLF checkout does not change identity

- **GIVEN** two copies of a file with identical text, one using CRLF and one using LF
- **WHEN** their content hashes or change detection are computed
- **THEN** the hashes are equal and no change is reported

#### Scenario: BOM on read

- **WHEN** a file written by another tool starts with a UTF-8 BOM
- **THEN** it is parsed without the BOM leaking into the first token

#### Scenario: Written files carry no BOM

- **WHEN** specd persists a text file
- **THEN** it is UTF-8 without BOM

### Requirement: Processes and shell

#### Scenario: Plain program execution

- **WHEN** code runs an external program with arguments it controls
- **THEN** it uses `spawn` or `execFile` with an argument array and no shell

#### Scenario: Windows cmd entry point

- **GIVEN** the target is `pnpm.cmd` on Windows
- **WHEN** it is spawned
- **THEN** a shell is used because the target requires it

#### Scenario: Non-interactive process on Windows

- **WHEN** a background process is spawned
- **THEN** `windowsHide` is set so no console window appears

#### Scenario: POSIX-only construct in a built command

- **WHEN** specd constructs a command using `printf`, `sleep`, or `$VAR` expansion without per-platform translation
- **THEN** it must be rewritten or routed through the execution layer that translates it

### Requirement: Permissions and symlinks

#### Scenario: Behaviour gated by chmod

- **WHEN** a feature relies on the executable bit or a `0o000` file to enforce a rule
- **THEN** it must not claim that behaviour on Windows

#### Scenario: Symlink creation not permitted

- **GIVEN** the process lacks the privilege to create symlinks
- **WHEN** a feature requests one
- **THEN** it falls back to a copy or equivalent behaviour instead of failing

### Requirement: File locking, replacement, and path length

#### Scenario: Atomic write

- **WHEN** a file that must not be observed half-written is saved
- **THEN** specd writes a temporary file in the same directory and renames it into place

#### Scenario: Transient lock on Windows

- **GIVEN** a rename fails with `EBUSY` or `EPERM` because another handle is open
- **WHEN** the operation is retried briefly
- **THEN** it succeeds once the handle is released
- **OR** it fails with the original error after the retries are exhausted

### Requirement: Directories and environment

#### Scenario: Hardcoded temp or home location

- **WHEN** production code writes to `/tmp`, `~/.cache`, or `C:\Temp`
- **THEN** it must use `os.tmpdir()` or `os.homedir()`

#### Scenario: Environment variable casing

- **GIVEN** the code runs on Windows with the variable defined as `Path`
- **WHEN** it looks up `PATH`
- **THEN** the lookup does not fail because of casing

#### Scenario: Scattered platform checks

- **WHEN** several modules test `process.platform` directly
- **THEN** the checks must move into one isolated helper

### Requirement: Enforcement

#### Scenario: Windows-only failure

- **GIVEN** the macOS and Ubuntu jobs pass and the Windows job fails
- **WHEN** the pull request is reviewed
- **THEN** the code is fixed under these rules and the runner is not excluded

#### Scenario: Undocumented platform divergence

- **WHEN** a change makes behaviour differ across platforms outside an isolated adapter
- **THEN** it is rejected in review
