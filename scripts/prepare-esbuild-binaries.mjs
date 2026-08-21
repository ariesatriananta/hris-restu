import { chmod, readdir } from 'node:fs/promises'
import path from 'node:path'

const pnpmStore = path.resolve('node_modules', '.pnpm')
const executableNames = new Set(['esbuild', 'esbuild.exe'])
const repaired = []

async function repairExecutables(directory, depth = 0) {
  if (depth > 6) return

  const entries = await readdir(directory, { withFileTypes: true })

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      await repairExecutables(entryPath, depth + 1)
      continue
    }

    if (!entry.isFile() || !executableNames.has(entry.name)) continue

    await chmod(entryPath, 0o755)
    repaired.push(path.relative(process.cwd(), entryPath))
  }
}

let packages

try {
  packages = await readdir(pnpmStore, { withFileTypes: true })
} catch (error) {
  throw new Error(`Folder dependency pnpm tidak ditemukan: ${pnpmStore}`, {
    cause: error,
  })
}

const esbuildPackages = packages.filter(
  (entry) =>
    entry.isDirectory() &&
    (entry.name.startsWith('esbuild@') || entry.name.startsWith('@esbuild+'))
)

for (const entry of esbuildPackages) {
  await repairExecutables(path.join(pnpmStore, entry.name))
}

if (repaired.length === 0) {
  throw new Error(
    'Binary esbuild tidak ditemukan. Pastikan pnpm install selesai sebelum build.'
  )
}

console.log(`[prepare-esbuild] ${repaired.length} binary siap dieksekusi.`)
