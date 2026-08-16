export const SCHEMA_VERSION = 13

export const SCHEMA_DDL = `
CREATE NODE TABLE IF NOT EXISTS File(
  path STRING,
  configRelativePath STRING,
  language STRING,
  contentHash STRING,
  workspace STRING,
  content STRING,
  PRIMARY KEY (path)
);
CREATE NODE TABLE IF NOT EXISTS Symbol(
  id STRING,
  name STRING,
  searchName STRING,
  kind STRING,
  filePath STRING,
  parentId STRING,
  line INT64,
  col INT64,
  endLine INT64,
  endCol INT64,
  selectionStartLine INT64,
  selectionStartCol INT64,
  selectionEndLine INT64,
  selectionEndCol INT64,
  comment STRING,
  PRIMARY KEY (id)
);
CREATE NODE TABLE IF NOT EXISTS Spec(
  specId STRING,
  path STRING,
  title STRING,
  description STRING,
  contentHash STRING,
  content STRING,
  workspace STRING,
  PRIMARY KEY (specId)
);
CREATE NODE TABLE IF NOT EXISTS Document(
  path STRING,
  configRelativePath STRING,
  contentHash STRING,
  content STRING,
  workspace STRING,
  PRIMARY KEY (path)
);
CREATE NODE TABLE IF NOT EXISTS Meta(
  key STRING,
  value STRING,
  PRIMARY KEY (key)
);
CREATE NODE TABLE IF NOT EXISTS LogicalSymbol(
  id STRING,
  workspace STRING,
  surface STRING,
  name STRING,
  space STRING,
  ownerId STRING,
  memberForm STRING,
  PRIMARY KEY (id)
);
CREATE NODE TABLE IF NOT EXISTS LogicalDeclaration(
  id STRING,
  logicalSymbolId STRING,
  symbolId STRING,
  filePath STRING,
  line INT64,
  columnNumber INT64,
  endLine INT64,
  endColumn INT64,
  kind STRING,
  PRIMARY KEY (id)
);
CREATE NODE TABLE IF NOT EXISTS PublicBinding(
  id STRING,
  surface STRING,
  exportedName STRING,
  space STRING,
  targetId STRING,
  PRIMARY KEY (id)
);
CREATE NODE TABLE IF NOT EXISTS LocalBinding(
  id STRING,
  filePath STRING,
  scopeId STRING,
  localName STRING,
  space STRING,
  targetId STRING,
  PRIMARY KEY (id)
);
CREATE NODE TABLE IF NOT EXISTS ResolutionStep(
  id STRING,
  fromId STRING,
  toId STRING,
  kind STRING,
  PRIMARY KEY (id)
);
CREATE NODE TABLE IF NOT EXISTS IndexCoverage(
  filePath STRING,
  contentHash STRING,
  status STRING,
  reason STRING,
  capabilitiesJson STRING,
  PRIMARY KEY (filePath)
);
CREATE NODE TABLE IF NOT EXISTS IndexedInputObservation(
  id STRING,
  workspace STRING,
  resourceKind STRING,
  resourceId STRING,
  inputKind STRING,
  inputLocator STRING,
  indexedContentHash STRING,
  lastObservedMtime DOUBLE,
  lastObservedSize INT64,
  lastObservedRevision STRING,
  generation STRING,
  stale BOOLEAN,
  PRIMARY KEY (id)
);
CREATE NODE TABLE IF NOT EXISTS FreshnessLatch(
  workspace STRING,
  knownStale BOOLEAN,
  PRIMARY KEY (workspace)
);
CREATE REL TABLE IF NOT EXISTS IMPORTS(FROM File TO File, metadata_json STRING);
CREATE REL TABLE IF NOT EXISTS DEFINES(FROM File TO Symbol, metadata_json STRING);
CREATE REL TABLE IF NOT EXISTS CALLS(FROM Symbol TO Symbol, metadata_json STRING);
CREATE REL TABLE IF NOT EXISTS CONSTRUCTS(FROM Symbol TO Symbol, metadata_json STRING);
CREATE REL TABLE IF NOT EXISTS USES_TYPE(FROM Symbol TO Symbol, metadata_json STRING);
CREATE REL TABLE IF NOT EXISTS EXPORTS(FROM File TO Symbol, metadata_json STRING);
CREATE REL TABLE IF NOT EXISTS DEPENDS_ON(FROM Spec TO Spec, metadata_json STRING);
CREATE REL TABLE IF NOT EXISTS COVERS_FILE(FROM Spec TO File, metadata_json STRING);
CREATE REL TABLE IF NOT EXISTS COVERS_SYMBOL(FROM Spec TO Symbol, metadata_json STRING);
CREATE REL TABLE IF NOT EXISTS EXTENDS(FROM Symbol TO Symbol, metadata_json STRING);
CREATE REL TABLE IF NOT EXISTS IMPLEMENTS(FROM Symbol TO Symbol, metadata_json STRING);
CREATE REL TABLE IF NOT EXISTS OVERRIDES(FROM Symbol TO Symbol, metadata_json STRING);
`
