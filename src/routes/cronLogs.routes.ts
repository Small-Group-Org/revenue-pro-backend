import { Router, Request, Response } from 'express';
import { MongoCronLogger } from '../utils/mongoCronLogger.js';
import logger from '../utils/logger.js';

const router = Router();

/**
 * GET /api/v1/cron-logs/stats
 * Get cron job statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;
    const jobName = req.query.jobName as string || 'weeklyLeadProcessor';
    
    const stats = await MongoCronLogger.getCronJobStats(jobName, days);
    
    res.json({
      success: true,
      data: {
        jobName,
        period: `${days} days`,
        ...stats
      }
    });
  } catch (error: any) {
    logger.error('Failed to get cron job stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cron job statistics',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/cron-logs/recent
 * Get recent cron job logs
 */
router.get('/recent', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const jobName = req.query.jobName as string || 'weeklyLeadProcessor';
    
    const logs = await MongoCronLogger.getRecentLogs(jobName, limit);
    
    res.json({
      success: true,
      data: {
        jobName,
        logs,
        count: logs.length
      }
    });
  } catch (error: any) {
    logger.error('Failed to get recent cron logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get recent cron logs',
      message: error.message
    });
  }
});

/**
 * GET /api/v1/cron-logs/execution/:executionId
 * Get logs for a specific execution ID
 */
router.get('/execution/:executionId', async (req: Request, res: Response) => {
  try {
    const { executionId } = req.params;
    
    const logs = await MongoCronLogger.getLogsByExecutionId(executionId);
    
    res.json({
      success: true,
      data: {
        executionId,
        logs,
        count: logs.length
      }
    });
  } catch (error: any) {
    logger.error('Failed to get logs by execution ID:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get logs by execution ID',
      message: error.message
    });
  }
});

/**
 * POST /api/v1/cron-logs/cleanup
 * Cleanup old cron job logs
 */
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    const { jobName = 'weeklyLeadProcessor', keepCount = 100 } = req.body;
    
    const deletedCount = await MongoCronLogger.cleanupOldLogs(jobName, keepCount);
    
    res.json({
      success: true,
      data: {
        jobName,
        deletedCount,
        keepCount,
        message: `Cleaned up ${deletedCount} old log entries`
      }
    });
  } catch (error: any) {
    logger.error('Failed to cleanup cron logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup cron logs',
      message: error.message
    });
  }
});

export default router;
