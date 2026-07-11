export function safeRedirect(value?: string) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : '/'
}
