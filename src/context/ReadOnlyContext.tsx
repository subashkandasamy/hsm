'use client'

import { createContext, useContext } from 'react'

const ReadOnlyContext = createContext(false)

export function ReadOnlyProvider({ isReadOnly, children }: { isReadOnly: boolean; children: React.ReactNode }) {
  return <ReadOnlyContext.Provider value={isReadOnly}>{children}</ReadOnlyContext.Provider>
}

export function useIsReadOnly(): boolean {
  return useContext(ReadOnlyContext)
}
