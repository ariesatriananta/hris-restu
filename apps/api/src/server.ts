import { app } from './app.js'
import { env } from './config.js'
app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`HRIS API berjalan di port ${env.PORT}`)
})
