import { isAxiosError } from 'axios'

// Only an explicit device rejection can discard an activation. Login and
// permission errors must leave the browser's device token intact.
export function isDeviceSessionInvalid(error: unknown) {
  return (
    isAxiosError<{ code?: string }>(error) &&
    error.response?.status === 401 &&
    error.response.data?.code === 'DEVICE_SESSION_INVALID'
  )
}
