import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 *
 * @param {...any} inputs
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
