export function isMarkdownArtifactFilename(filename: string | undefined): boolean {
  return typeof filename === 'string' && filename.endsWith('.md')
}
