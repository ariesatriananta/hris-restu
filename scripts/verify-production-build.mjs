import { access } from 'node:fs/promises'
import { resolve } from 'node:path'

const requiredArtifacts = ['dist/index.html', 'dist/api/server.js']

for (const artifact of requiredArtifacts) {
  const absolutePath = resolve(process.cwd(), artifact)
  try {
    await access(absolutePath)
  } catch {
    throw new Error(`Artefak build production tidak ditemukan: ${absolutePath}`)
  }
}

console.log(
  `Build production siap: ${requiredArtifacts.join(', ')}`
)
