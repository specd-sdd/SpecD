/**
 * Converts a user-supplied project-relative file path to its logical, forward-slash form.
 * On a Windows host `\` is a separator and becomes `/`; on every other host `\` is a valid
 * file name character and the name is returned unchanged.
 *
 * @param file - Project-relative file path as supplied by the caller
 * @param platform - Host platform used to decide whether `\` is a separator (default: `process.platform`)
 * @returns The logical path with forward slashes on Windows; otherwise `file` unchanged
 */
export function toLogicalFilePath(
  file: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return platform === 'win32' ? file.replaceAll('\\', '/') : file
}
