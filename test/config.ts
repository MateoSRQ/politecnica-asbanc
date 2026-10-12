import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const testConfig = {
  targetUrl: process.env.TEST_TARGET_URL || `http://localhost:${process.env.PORT || 7300}`,

  appPort: process.env.TEST_APP_PORT ? Number(process.env.TEST_APP_PORT) : 7400,

  clientId: process.env.ASBANC_CLIENT_ID || 'asbanc_ftr',
  clientSecret: process.env.ASBANC_CLIENT_SECRET || 'asbanc_ftr_secret_2026',
  companyCode: process.env.ASBANC_DEFAULT_COMPANY_CODE || '998',
  authSecret: process.env.ASBANC_AUTH_SECRET || '',
};
