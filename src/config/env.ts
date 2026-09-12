import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(7300),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.string().default('info'),

  // Seguridad ASBANC y OAuth2 / JWT
  ASBANC_AUTH_ENABLED: z.string().transform((v) => v === 'true').default('true'),
  ASBANC_AUTH_SECRET: z.string().default('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3NDgxMjEyMDMsImlzcyI6Imlz'),
  ASBANC_DEFAULT_COMPANY_CODE: z.string().default('998'),
  JWT_SECRET: z.string().default('politecnica_asbanc_jwt_secret_key_2026_ftr'),
  JWT_EXPIRATION_SECONDS: z.coerce.number().default(86400), // 24 horas por defecto (Pág. 8)
  ASBANC_CLIENT_ID: z.string().default('asbanc_ftr'),
  ASBANC_CLIENT_SECRET: z.string().default('asbanc_ftr_secret_2026'),

  // Base de Datos MSSQL
  DB_SERVER: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().default(1433),
  DB_USER: z.string().default('sa'),
  DB_PASSWORD: z.string().default('Politecnica2026!Asbanc#'),
  DB_NAME: z.string().default('politecnica_asbanc'),
  DB_ENCRYPT: z.string().transform((v) => v === 'true').default('false'),
  DB_TRUST_SERVER_CERTIFICATE: z.string().transform((v) => v === 'true').default('true'),
  DB_CONNECTION_TIMEOUT: z.coerce.number().default(3000),
  DB_REQUEST_TIMEOUT: z.coerce.number().default(3000),
  DB_POOL_MIN: z.coerce.number().default(5),
  DB_POOL_MAX: z.coerce.number().default(30),

  // Métricas y Límites
  METRICS_ENABLED: z.string().transform((v) => v === 'true').default('true'),
  METRICS_ROUTE: z.string().default('/metrics'),
  SLA_WARNING_THRESHOLD_MS: z.coerce.number().default(2500),

  // Rate Limiting (Prevención de DDoS y Fuerza Bruta)
  RATE_LIMIT_ENABLED: z.string().transform((v) => v === 'true').default('true'),
  RATE_LIMIT_MAX: z.coerce.number().default(10000), // Límite por minuto
}).superRefine((data, ctx) => {
  if (data.NODE_ENV === 'production') {
    if (data.DB_PASSWORD === 'Politecnica2026!Asbanc#' || data.DB_PASSWORD === '1Ltseosb.') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CRÍTICO: En producción, DB_PASSWORD no puede ser la clave de desarrollo por defecto.',
        path: ['DB_PASSWORD'],
      });
    }
    if (data.JWT_SECRET === 'politecnica_asbanc_jwt_secret_key_2026_ftr') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CRÍTICO: En producción, JWT_SECRET debe definirse con una clave criptográfica segura.',
        path: ['JWT_SECRET'],
      });
    }
    if (data.ASBANC_CLIENT_SECRET === 'asbanc_ftr_secret_2026') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CRÍTICO: En producción, ASBANC_CLIENT_SECRET debe ser configurado formalmente.',
        path: ['ASBANC_CLIENT_SECRET'],
      });
    }
  }
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
