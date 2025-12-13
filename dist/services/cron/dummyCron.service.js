import cron from 'node-cron';
import logger from '../../utils/logger.js';
import http from '../../pkg/http/client.js';
import { config } from '../../config.js';
class DummyCronService {
    constructor() {
        this.isRunning = false;
    }
    start() {
        // Cron schedule: every 10 minutes
        const schedule = '*/10 * * * *';
        cron.schedule(schedule, async () => {
            if (this.isRunning) {
                logger.warn('[Dummy Cron] Already running; skipping this tick');
                return;
            }
            await this.runOnce();
        }, { timezone: 'UTC' });
        logger.info(`[Dummy Cron] Scheduled with '${schedule}' (every 10 minutes)`);
    }
    async runOnce() {
        this.isRunning = true;
        const timestamp = new Date().toISOString();
        try {
            logger.info('[Dummy Cron] Starting execution', { timestamp });
            // Get the server URL - use environment variable or default to localhost
            const serverUrl = process.env.SERVER_BASE_URL || `http://localhost:${config.PORT || 3000}`;
            const endpoint = `${serverUrl}/api/v1/dummy/test-endpoint`;
            logger.info('[Dummy Cron] Calling dummy endpoint', { endpoint, timestamp });
            // Call the dummy endpoint
            const httpClient = new http(serverUrl, 10000);
            await httpClient.get('/api/v1/dummy/test-endpoint');
            logger.info('[Dummy Cron] Successfully called dummy endpoint', { timestamp });
            console.log(`[Dummy Cron] Successfully executed and called dummy endpoint at ${timestamp}`);
        }
        catch (error) {
            logger.error('[Dummy Cron] Failed to call dummy endpoint', {
                error: error?.message || String(error),
                timestamp,
            });
            console.error(`[Dummy Cron] Error: ${error?.message || String(error)} at ${timestamp}`);
        }
        finally {
            this.isRunning = false;
        }
    }
    isRunningCheck() {
        return this.isRunning;
    }
}
export default new DummyCronService();
