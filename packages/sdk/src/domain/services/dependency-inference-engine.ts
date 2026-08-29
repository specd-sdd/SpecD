/**
 * Pure domain service for inferring inter-spec dependencies from SQLite call-graph relations.
 */
export class DependencyInferenceEngine {
  /**
   * Translates cross-file caller relations into spec-level raw dependencies.
   *
   * @param fileToSpecMap - Mapping from workspace-relative file path to candidate spec ID.
   * @param outgoingCallsByFile - Map of source file to the set of files containing symbols it invokes.
   * @param testFilesSet - Set of test files to ignore from dependency inference.
   * @returns Raw dependency graph Map<specId, Set<targetSpecId>>.
   */
  static inferRawDependencies(
    fileToSpecMap: ReadonlyMap<string, string>,
    outgoingCallsByFile: ReadonlyMap<string, ReadonlySet<string>>,
    testFilesSet: ReadonlySet<string> = new Set(),
  ): Map<string, Set<string>> {
    const rawDeps = new Map<string, Set<string>>()

    for (const [sourceFile, specId] of fileToSpecMap.entries()) {
      if (testFilesSet.has(sourceFile)) {
        continue
      }

      const calledFiles = outgoingCallsByFile.get(sourceFile)
      if (!calledFiles || calledFiles.size === 0) {
        continue
      }

      for (const targetFile of calledFiles) {
        if (testFilesSet.has(targetFile)) {
          continue
        }

        const targetSpecId = fileToSpecMap.get(targetFile)
        if (targetSpecId && targetSpecId !== specId) {
          let specDeps = rawDeps.get(specId)
          if (!specDeps) {
            specDeps = new Set<string>()
            rawDeps.set(specId, specDeps)
          }
          specDeps.add(targetSpecId)
        }
      }
    }

    return rawDeps
  }
}
