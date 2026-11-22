// Accept file links only. Never fetch arbitrary external URLs on the server.
export function googleDriveDocument(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'drive.google.com' || url.port || url.username || url.password) return undefined
    const pathId = /^\/file\/d\/([A-Za-z0-9_-]+)(?:\/(?:view|preview|edit))?\/?$/.exec(url.pathname)?.[1]
    const id = pathId ?? (['/open', '/uc'].includes(url.pathname) ? url.searchParams.get('id') : null)
    if (!id || !/^[A-Za-z0-9_-]{10,200}$/.test(id)) return undefined
    const resourceKey = url.searchParams.get('resourcekey')
    if (resourceKey && !/^[A-Za-z0-9_-]{1,200}$/.test(resourceKey)) return undefined
    const suffix = resourceKey ? `?resourcekey=${resourceKey}` : ''
    return { url: `https://drive.google.com/file/d/${id}/view${suffix}`, previewUrl: `https://drive.google.com/file/d/${id}/preview${suffix}` }
  } catch { return undefined }
}
