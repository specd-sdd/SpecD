# Verification: Document Model

## Requirements

### Requirement: DocumentNode properties

#### Scenario: DocumentNode has required graph properties

- **WHEN** a `DocumentNode` is created
- **THEN** it includes `path`, `configRelativePath`, `contentHash`, `content`, and `workspace`

### Requirement: Reserved root namespace

#### Scenario: Global file identity uses root: prefix

- **GIVEN** a file `package.json` discovered via project-global `graph.includePaths`
- **WHEN** its node identity is computed
- **THEN** it is `root:package.json`
- **AND** its `workspace` is `root`

### Requirement: Textual classification fallback

#### Scenario: Text file with no adapter becomes a DocumentNode

- **GIVEN** a `.md` file with no language adapter registered
- **WHEN** it is indexed
- **THEN** it produces a `DocumentNode` in the graph
- **AND** it does not produce any symbol nodes

#### Scenario: Binary file is skipped

- **GIVEN** a `.png` file
- **WHEN** it is indexed
- **THEN** no node is created in the graph

#### Scenario: Filesystem-backed spec file is not indexed as a document

- **GIVEN** a filesystem-backed repository exposes a `specsPath`
- **AND** a `spec.md` file exists under that root
- **WHEN** file/document discovery runs
- **THEN** no `DocumentNode` is created for that spec artifact

#### Scenario: Workspace-owned file is not duplicated as root document

- **GIVEN** a file under a configured workspace `codeRoot`
- **AND** it also matches a project-global `graph.includePaths` pattern
- **WHEN** indexing runs
- **THEN** it is indexed only under the workspace-owned identity
- **AND** no duplicate `root:` document is created

### Requirement: Search category

#### Scenario: Documents are searchable separately

- **WHEN** the graph is queried with a document filter
- **THEN** only `DocumentNode` results are returned
