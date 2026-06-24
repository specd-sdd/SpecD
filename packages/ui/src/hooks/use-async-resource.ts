import * as React from 'react'

/**
 *
 */
type AsyncState<T> = {
  data: T | undefined
  error: Error | undefined
  isLoading: boolean
}

const inflight = new Map<string, Promise<unknown>>()

/**
 * One in-flight request per resource `key`; overlapping polls share the same promise.
 */
function dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined
  if (existing) {
    return existing
  }
  const promise = run().finally(() => {
    inflight.delete(key)
  })
  inflight.set(key, promise)
  return promise
}

/**
 *
 * @param key
 * @param fetcher
 * @param options
 * @param options.enabled
 * @param options.refreshKey - Bumps global poll; refetches without clearing visible data.
 */
export function useAsyncResource<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: {
    enabled?: boolean
    refreshKey?: number
    keepPreviousWhileLoading?: boolean
    /** When true, global poll ticks do not refetch after a failed load for the same `key`. */
    pauseRefreshOnError?: boolean
  } = {},
): AsyncState<T> & { refetch: () => void } {
  const enabled = options.enabled ?? true
  const [state, setState] = React.useState<AsyncState<T>>({
    data: undefined,
    error: undefined,
    isLoading: enabled,
  })
  const [tick, setTick] = React.useState(0)
  const generationRef = React.useRef(0)
  const failedKeyRef = React.useRef<string | null>(null)
  const prevKeyRef = React.useRef(key)
  const prevRefreshKeyRef = React.useRef(options.refreshKey)

  const refetch = React.useCallback(() => {
    failedKeyRef.current = null
    setTick((n) => n + 1)
  }, [])

  React.useEffect(() => {
    if (!enabled) {
      failedKeyRef.current = null
      setState((prev) => ({
        data: prev.data,
        error: prev.error,
        isLoading: false,
      }))
      return
    }

    const keyChanged = prevKeyRef.current !== key
    if (keyChanged) {
      failedKeyRef.current = null
      prevKeyRef.current = key
    }

    const refreshKeyChanged = prevRefreshKeyRef.current !== options.refreshKey
    prevRefreshKeyRef.current = options.refreshKey

    if (
      options.pauseRefreshOnError === true &&
      !keyChanged &&
      refreshKeyChanged &&
      failedKeyRef.current === key
    ) {
      return undefined
    }

    const myGeneration = ++generationRef.current

    setState((prev) => {
      if (keyChanged) {
        return { data: undefined, isLoading: true, error: undefined }
      }
      if (prev.data !== undefined) {
        return { data: prev.data, isLoading: false, error: undefined }
      }
      return { data: undefined, isLoading: true, error: undefined }
    })

    void dedupe(key, fetcher)
      .then((data) => {
        if (generationRef.current !== myGeneration) {
          return
        }
        failedKeyRef.current = null
        setState({ data, error: undefined, isLoading: false })
      })
      .catch((error: unknown) => {
        if (generationRef.current !== myGeneration) {
          return
        }
        failedKeyRef.current = key
        setState({
          data: undefined,
          error: error instanceof Error ? error : new Error(String(error)),
          isLoading: false,
        })
      })

    return undefined
  }, [key, fetcher, enabled, tick, options.refreshKey])

  return { ...state, refetch }
}
