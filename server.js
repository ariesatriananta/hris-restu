// Entry runtime Hostinger harus berupa file yang sudah ada sebelum build.
// Register tsx secara programatis supaya source API workspace yang ikut paket
// deployment dapat dijalankan tanpa bergantung pada folder build tambahan.
import { register } from 'tsx/esm/api'

register()
await import('./apps/api/src/server.ts')
