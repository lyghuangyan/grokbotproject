type MediaListener = (event: { matches: boolean }) => void

export type MatchMediaHandle = {
  matches: boolean
  emit: (matches: boolean) => void
}

export function installMatchMedia(matches: boolean): MatchMediaHandle {
  const listeners = new Set<MediaListener>()
  const handle: MatchMediaHandle = {
    matches,
    emit(next: boolean) {
      handle.matches = next
      for (const listener of listeners) listener({ matches: next })
    },
  }

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      get matches() {
        return handle.matches
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: MediaListener) => {
        listeners.add(listener)
      },
      removeEventListener: (_type: string, listener: MediaListener) => {
        listeners.delete(listener)
      },
      addListener: (listener: MediaListener) => {
        listeners.add(listener)
      },
      removeListener: (listener: MediaListener) => {
        listeners.delete(listener)
      },
      dispatchEvent: () => false,
    }),
  })

  return handle
}
