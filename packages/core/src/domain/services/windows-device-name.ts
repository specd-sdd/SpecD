const WINDOWS_DEVICE_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/**
 * Reports whether a single slug or path segment is a Windows device name.
 *
 * @param segment - One slug or path segment, not a full path
 * @returns True when the whole segment is `con`, `prn`, `aux`, `nul`, `com1`–`com9`, or `lpt1`–`lpt9`
 */
export function isWindowsDeviceName(segment: string): boolean {
  return WINDOWS_DEVICE_NAME.test(segment)
}
