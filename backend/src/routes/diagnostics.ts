import { Router } from 'express';
import { pool } from '../db';
import whatsappService from '../services/whatsapp';
import os from 'os';
import fs from 'fs';
import path from 'path';

const router = Router();

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: process.memoryUsage().heapUsed,
        total: process.memoryUsage().heapTotal,
        rss: process.memoryUsage().rss,
        external: process.memoryUsage().external
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        cpus: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem()
      }
    };

    res.json(health);
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      error: error?.message || 'Health check failed'
    });
  }
});

// Database health check
router.get('/database', async (req, res) => {
  try {
    const startTime = Date.now();
    const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    const responseTime = Date.now() - startTime;

    res.json({
      status: 'connected',
      responseTime: `${responseTime}ms`,
      serverTime: result.rows[0].current_time,
      version: result.rows[0].pg_version,
      poolSize: pool.totalCount,
      idleConnections: pool.idleCount,
      waitingClients: pool.waitingCount
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'disconnected',
      error: error?.message || 'Database connection failed'
    });
  }
});

// WhatsApp health check
router.get('/whatsapp', async (req, res) => {
  try {
    const status = whatsappService.getStatus();
    
    // Check if Chromium is available
    let chromiumStatus = 'unknown';
    try {
      const puppeteerPath = require.resolve('puppeteer');
      chromiumStatus = fs.existsSync(puppeteerPath) ? 'available' : 'not_found';
    } catch (e) {
      chromiumStatus = 'not_installed';
    }

    res.json({
      status: status.isConnected ? 'connected' : 'disconnected',
      isInitializing: status.isInitializing,
      isAuthenticated: status.isAuthenticated,
      isLoading: status.isLoading,
      hasQRCode: status.hasQRCode,
      lastConnected: status.lastConnectedAt,
      chromium: chromiumStatus,
      authPath: path.join(os.homedir(), '.config', 'bloomswiftpos', '.wwebjs_auth')
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      error: error?.message || 'WhatsApp status check failed'
    });
  }
});

// System diagnostics (comprehensive)
router.get('/system', async (req, res) => {
  try {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      server: {
        nodeVersion: process.version,
        platform: os.platform(),
        arch: os.arch(),
        uptime: process.uptime(),
        pid: process.pid
      },
      system: {
        hostname: os.hostname(),
        cpus: os.cpus().map(cpu => ({
          model: cpu.model,
          speed: cpu.speed
        })),
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        loadAverage: os.loadavg()
      },
      process: {
        memory: process.memoryUsage(),
        cwd: process.cwd(),
        execPath: process.execPath,
        env: {
          NODE_ENV: process.env.NODE_ENV,
          PORT: process.env.PORT
        }
      },
      database: {
        status: 'checking...'
      },
      whatsapp: {
        status: 'checking...'
      }
    };

    // Check database
    try {
      await pool.query('SELECT 1');
      diagnostics.database = {
        status: 'connected',
        poolSize: pool.totalCount,
        idleConnections: pool.idleCount
      } as any;
    } catch (e: any) {
      diagnostics.database = {
        status: 'error',
        error: e?.message
      } as any;
    }

    // Check WhatsApp
    try {
      const waStatus = whatsappService.getStatus();
      diagnostics.whatsapp = {
        status: waStatus.isConnected ? 'connected' : 'disconnected',
        isInitializing: waStatus.isInitializing,
        lastConnected: waStatus.lastConnectedAt
      } as any;
    } catch (e: any) {
      diagnostics.whatsapp = {
        status: 'error',
        error: e?.message
      } as any;
    }

    res.json(diagnostics);
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      error: error?.message || 'System diagnostics failed'
    });
  }
});

// Get logs directory info
router.get('/logs', async (req, res) => {
  try {
    const logsDir = path.join(os.homedir(), '.config', 'bloomswiftpos', 'logs');
    
    if (!fs.existsSync(logsDir)) {
      return res.json({
        status: 'not_found',
        path: logsDir,
        files: []
      });
    }

    const files = fs.readdirSync(logsDir)
      .filter(f => f.endsWith('.log'))
      .map(f => {
        const filePath = path.join(logsDir, f);
        const stats = fs.statSync(filePath);
        return {
          name: f,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        };
      })
      .sort((a, b) => b.modified.getTime() - a.modified.getTime());

    res.json({
      status: 'ok',
      path: logsDir,
      files,
      totalFiles: files.length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0)
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      error: error?.message || 'Failed to read logs directory'
    });
  }
});

export default router;
