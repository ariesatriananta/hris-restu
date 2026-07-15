import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:5173'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_MINUTES: z.coerce.number().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().positive().default(7),
  CONTRACT_LIFECYCLE_CRON_SECRET: z.string().min(32),
  R2_ACCOUNT_ID: z.string().min(1), R2_ACCESS_KEY_ID: z.string().min(1), R2_SECRET_ACCESS_KEY: z.string().min(1), R2_BUCKET_NAME: z.string().min(1), R2_PUBLIC_BASE_URL: z.string().url(), R2_KEY_PREFIX: z.string().default('hris-rsia/'),
})
export type Env = z.infer<typeof schema>
export const env = schema.parse(process.env)
