# Verification: Graph Path Identity

## Requirements

### Requirement: Portable separator normalization

#### Scenario: Backslashes become forward slashes without collapsing parents

- **WHEN** `toPortableGraphPath` receives `src\..\secret`
- **THEN** the result is `src/../secret`

### Requirement: Absolute and UNC detection

#### Scenario: Drive letters are not workspace identities

- **WHEN** `isDriveLetterPath` and `splitWorkspaceIdentity` receive `C:/repo/a.ts` or `c:\repo\a.ts`
- **THEN** the path is a drive-letter path and `splitWorkspaceIdentity` returns null

#### Scenario: UNC is absolute filesystem, not workspace

- **WHEN** `isUncPath` and `isAbsoluteGraphFilesystemPath` receive `//server/share/a.php` or `\\server\share\a.php`
- **THEN** both report true

### Requirement: resolveGraphPath

#### Scenario: Workspace-prefixed relatives stay posix-portable

- **WHEN** `resolveGraphPath` resolves `php-app:app/controllers/a.php` against `../models/Post.php` or `backend:src\controllers\a.php` against `..\models\Post.php`
- **THEN** the results are `php-app:app/models/Post.php` and `backend:src/models/Post.php`

#### Scenario: Windows drive and UNC absolute importers resolve portably on any host

- **WHEN** `resolveGraphPath` resolves a relative target from `C:\repo\app\controllers\a.php` or `\\server\share\app\controllers\a.php`
- **THEN** the results are `C:/repo/app/...` and `//server/share/app/...` portable paths
- **AND** posix resolve alone MUST NOT collapse the UNC share to `/server/...`

#### Scenario: Empty target is the importer directory

- **WHEN** `resolveGraphPath` receives an empty target for a workspace or absolute importer
- **THEN** the result is the portable directory of that importer
