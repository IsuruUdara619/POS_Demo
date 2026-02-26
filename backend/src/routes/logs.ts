import express from 'express';
const { Request, Response } = express;
import { pool } from '../db.ts';
import { authenticateToken } from '../middleware/auth.ts';

const router = express.Router();

// Receive frontend error logs
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const logEntry = req.body;
    
    // Log frontend error to backend
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔵 FRONTEND ERROR RECEIVED:', new Date().toISOString());
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Level:', logEntry.level);
    console.log('Message:', logEntry.message);
    console.log('URL:', logEntry.url);
    console.log('User:', (req as any).user?.username || 'Unknown');
    if (logEntry.context) {
      console.log('Context:', JSON.stringify(logEntry.context, null, 2));
    }
    if (logEntry.stack) {
      console.log('Stack:', logEntry.stack);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    res.status(200).json({ success: true, message: 'Log received' });
  } catch (error) {
    console.error('Error receiving frontend log:', error);
    res.status(500).json({ error: 'Failed to log error' });
  }
});

// Get recent error logs (admin only)
router.get('/errors', authenticateToken, async (req: Request, res: Response) => {
  try {
    // Check if user is admin
    const user = (req as any).user;
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin only.' });
    }

    const count = parseInt(req.query.count as string) || 50;
    const errors = errorLogger.getRecentErrors(count);
    
    res.json({ errors, count: errors.length });
  } catch (error) {
    console.error('Error fetching error logs:', error);
    res.status(500).json({ error: 'Failed to fetch error logs' });
  }
});

// Health check endpoint for monitoring
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  });
});

export default router;
