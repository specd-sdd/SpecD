import { describe, expect, it } from 'vitest'
import { isWindowsDeviceName } from '../../../src/domain/services/windows-device-name.js'

describe('isWindowsDeviceName', () => {
  it('accepts reserved device names regardless of case', () => {
    expect(isWindowsDeviceName('con')).toBe(true)
    expect(isWindowsDeviceName('prn')).toBe(true)
    expect(isWindowsDeviceName('AUX')).toBe(true)
    expect(isWindowsDeviceName('NUL')).toBe(true)
    expect(isWindowsDeviceName('com1')).toBe(true)
    expect(isWindowsDeviceName('lpt9')).toBe(true)
  })

  it('rejects a longer slug that only contains the device name', () => {
    expect(isWindowsDeviceName('con-foo')).toBe(false)
  })
})
