import 'dotenv/config';
import app from './app.js';
import logger from './configs/logger.js';
import { startCleanupRefreshTokensJob } from './jobs/cleanupRefreshTokens.job.js';

const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET', 'REFRESH_SECRET'];

const missing = REQUIRED_ENV.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`Missing required env: ${missing.join(', ')}`);
  process.exit(1);
}

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  logger.info(`Server running on port ${PORT}`);

  startCleanupRefreshTokensJob();
});
