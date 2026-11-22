import { drizzle } from 'drizzle-orm/mysql2'
import mysql from 'mysql2'
import { env } from './config.js'
// Technical DATETIME values use UTC. Never let the process/Hostinger timezone
// decide how mysql2 reads/writes JS Dates, nor how SQL defaults record time.
const databaseUrl = new URL(env.DATABASE_URL)
databaseUrl.searchParams.set('timezone', 'Z')
const connectionPool = mysql.createPool(databaseUrl.toString())
connectionPool.on('connection', (connection) => {
  // mysql2 queues this command before handing the connection to a caller.
  connection.query("SET SESSION time_zone = '+00:00'", (error) => {
    if (error) connection.destroy()
  })
})
export const pool = connectionPool.promise()
export const db = drizzle({ client: pool })
