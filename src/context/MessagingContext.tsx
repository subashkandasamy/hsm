'use client'

import { createContext, useContext } from 'react'

const MessagingContext = createContext(false)

export function MessagingProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  return <MessagingContext.Provider value={enabled}>{children}</MessagingContext.Provider>
}

/** Whether WhatsApp/SMS features are enabled platform-wide. */
export function useMessagingEnabled(): boolean {
  return useContext(MessagingContext)
}
