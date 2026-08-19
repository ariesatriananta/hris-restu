import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Express } from 'express'
import express from 'express'

const defaultDistPath = fileURLToPath(
  new URL('../../../../dist/', import.meta.url)
)

export function registerProductionFrontend(
  app: Express,
  distPath = defaultDistPath
) {
  const indexPath = join(distPath, 'index.html')

  if (!existsSync(indexPath)) {
    throw new Error(
      `Build frontend tidak ditemukan di ${indexPath}. Jalankan npm run build sebelum npm start.`
    )
  }

  app.use(express.static(distPath, { index: false }))
  app.get(/^(?!\/api(?:\/|$)).*/, (req, res, next) => {
    if (!req.accepts('html')) return next()
    res.sendFile(indexPath, (error) => {
      if (error) next(error)
    })
  })
}
