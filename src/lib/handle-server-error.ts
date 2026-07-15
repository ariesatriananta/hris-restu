import { AxiosError } from 'axios'
import { toast } from 'sonner'

export function handleServerError(error: unknown) {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log(error)
  }

  let errMsg = 'Terjadi kesalahan. Silakan coba lagi.'

  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    Number(error.status) === 204
  ) {
    errMsg = 'No content.'
  }

  if (error instanceof AxiosError) {
    const message = error.response?.data?.message
    const title = error.response?.data?.title
    if (typeof message === 'string' && message.length > 0) {
      errMsg = message
    } else if (typeof title === 'string' && title.length > 0) {
      errMsg = title
    }
  }

  toast.error(errMsg)
}
