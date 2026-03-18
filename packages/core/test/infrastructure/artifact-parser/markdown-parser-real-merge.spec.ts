import { describe, expect, it } from 'vitest'
import { MarkdownParser } from '../../../src/infrastructure/artifact-parser/markdown-parser.js'
import { YamlParser } from '../../../src/infrastructure/artifact-parser/yaml-parser.js'

describe('MarkdownParser real merge fixtures', () => {
  it('given archive-change excerpt fixture, when merging with delta excerpt, then keeps expected numbering', () => {
    const base = `### Requirement: Context before

Run \`specd change validate <name>\` before archive.
Reference: [Spec dependencies](../delta-format/spec.md).

### Requirement: Delta merge and spec sync

After all pre-archive hooks succeed, \`ArchiveChange\` must merge each delta artifact into the project spec and sync the result to \`SpecRepository\`.

For each spec ID in \`change.specIds\`:

1. Resolve the active schema for that spec's workspace.
2. For each artifact in the schema that declares \`delta: true\`:
   a. Look up the \`ArtifactParser\` for the artifact's \`format\` from \`ArtifactParserRegistry\`. If no adapter is registered for that format, throw — this is a configuration error.
   b. Retrieve the file for this spec ID from the artifact via \`artifact.getFile(specId)\`. If the file is absent or its status is \`skipped\`, skip — nothing to sync.
   c. Load the delta file content from \`ChangeRepository\` using the file's \`filename\`. Parse the delta file as YAML to obtain the array of delta entries.
   d. Load the base artifact content from \`SpecRepository\`. If the base does not exist, treat it as an empty document (parse an empty string via \`ArtifactParser.parse('')\`).
   e. Parse the base content via \`ArtifactParser.parse(baseContent)\` to obtain a base AST.
   f. Call \`ArtifactParser.apply(baseAST, deltaEntries)\` to produce the merged AST.
   g. Serialize the merged AST via \`ArtifactParser.serialize(mergedAST)\` and save the result to \`SpecRepository\`.

3. For each artifact in the schema that declares \`delta: false\` (new file artifacts created in-change):
   a. Retrieve the file for this spec ID from the artifact via \`artifact.getFile(specId)\`.

### Requirement: Context after

This requirement appears after the merge target and must remain unchanged.`
    const deltaRaw = `- op: modified
  selector:
    type: section
    matches: '^Requirement: Delta merge and spec sync$'
  content: |
    After all pre-archive hooks succeed, \`ArchiveChange\` must merge each delta artifact into the project spec and sync the result to \`SpecRepository\`.
    See [selector model](../selector-model/spec.md) before applying deltas.

    For each spec ID in \`change.specIds\`:

    1. Resolve the active schema for that spec's workspace.
    2. For each artifact in the schema that declares \`delta: true\`:
       a. Look up the \`ArtifactParser\` for the artifact's \`format\` from \`ArtifactParserRegistry\`. If no adapter is registered for that format, throw — this is a configuration error.
       b. Retrieve the file for this spec ID from the artifact via \`artifact.getFile(specId)\`. If the file is absent or its status is \`skipped\`, skip — nothing to sync.
       c. Load the delta file content from \`ChangeRepository\` using the file's \`filename\`. Parse the delta file as YAML to obtain the array of delta entries.
       d. Load the base artifact content from \`SpecRepository\`. If the base does not exist, treat it as an empty document (parse an empty string via \`ArtifactParser.parse('')\`).
       e. Parse the base content via \`ArtifactParser.parse(baseContent)\` to obtain a base AST.

    3. For each artifact in the schema that declares \`delta: false\` (new file artifacts created in-change):
       a. Retrieve the file for this spec ID from the artifact via \`artifact.getFile(specId)\`.`
    const deltaWithAddRemove = `${deltaRaw}

- op: removed
  selector:
    type: section
    matches: '^Requirement: Context after$'

- op: added
  position:
    after:
      type: section
      matches: '^Requirement: Context before$'
  content: |
    ### Requirement: Added by delta

    Added section with \`inline\` marker and [delta link](../archive-change/spec.md).`

    const md = new MarkdownParser()
    const yaml = new YamlParser()
    const delta = yaml.parseDelta(deltaWithAddRemove)
    const merged = md.serialize(md.apply(md.parse(base), delta))

    // Regression: ordered list numbering must not reset from 3 -> 1.
    expect(merged).toContain('3. For each artifact in the schema that declares `delta: false`')
    expect(merged).not.toContain('1. For each artifact in the schema that declares `delta: false`')
    expect(merged).toContain('### Requirement: Context before')
    expect(merged).not.toContain('### Requirement: Context after')
    expect(merged).toContain('### Requirement: Added by delta')
    expect(merged).toContain('`inline`')
    expect(merged).toContain('[delta link](../archive-change/spec.md)')
    expect(merged).toContain('`specd change validate <name>`')
    expect(merged).toContain('[Spec dependencies](../delta-format/spec.md)')
    expect(merged).toContain('[selector model](../selector-model/spec.md)')
    expect(merged).not.toContain('\\[')
    expect(merged).not.toContain('\\]')
    expect(merged).not.toContain('\\(')
    expect(merged).not.toContain('\\)')
    expect(merged).not.toContain('\\`')
    expect(merged).not.toContain('\\<')
    expect(merged).not.toContain('\\>')
  })
})
