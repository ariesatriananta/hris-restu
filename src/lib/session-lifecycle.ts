// Shared without importing the auth store into the HTTP client (avoids a cycle).
let expired = false
let generation = 0
const listeners = new Set<() => void>()

export const isSessionExpired = () => expired
export const sessionGeneration = () => generation
export function expireSession() {
  if (expired) return
  expired = true
  generation += 1
  listeners.forEach((listener) => listener())
}
export function startSession() {
  expired = false
  generation += 1
}
export function onSessionExpired(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
