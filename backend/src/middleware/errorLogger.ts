import express from 'express';
const { Request, Response, NextFunction } = express;
import fs from 'fs';
import path from 'path';

interface ErrorLog {
  timestamp: string;
  method: string;
  url: string;
  statusCode: number;
  error: string;
  stack?: string;
  body?: any;
  query?: any;
  params?: any;
  headers?: any;
  user?: any;
}

class ErrorLogger {
  private logDir: string;
  private errorLogFile: string;
  private accessLogFile: string;

  constructor() {
    this.logDir = path.join(process.cwd(), 'logs');
    this.errorLogFile = path.join(this.logDir, 'error.log');
    this.accessLogFile = path.join(this.logDir, 'access.log');
    
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private writeLog(file: string, data: any) {
    const logEntry = JSON.stringify(data) + '\n';
    fs.appendFileSync(file, logEntry);
  }

  logError(error: Error, req: Request, additionalInfo?: any) {
    const errorLog: ErrorLog = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      statusCode: (error as any).statusCode || 500,
      error: error.message,
      stack: error.stack,
      body: req.body,
      query: req.query,
      params: req.params,
      headers: {
        'user-agent': req.get('user-agent'),
        'referer': req.get('referer'),
        'content-type': req.get('content-type')
      },
      user: (req as any).user ? { 
        id: (req as any).user.id, 
        username: (req as any).user.username 
      } : undefined,
      ...additionalInfo
    };

    // Write to error log file
    this.writeLog(this.errorLogFile, errorLog);

    // Also log to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('🔴 ERROR LOGGED:', new Date().toISOString());
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.error('Method:', errorLog.method);
      console.error('URL:', errorLog.url);
      console.error('Status:', errorLog.statusCode);
      console.error('Error:', errorLog.error);
      if (errorLog.stack) {
        console.error('Stack:', errorLog.stack);
      }
      console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }
  }

  logAccess(req: Request, res: Response, duration: number) {
    const accessLog = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      user: (req as any).user ? { 
        id: (req as any).user.id, 
        username: (req as any).user.username 
      } : undefined
    };

    this.writeLog(this.accessLogFile, accessLog);
  }

  // Middleware to log all requests
  requestLogger() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();

      // Log when response finishes
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        this.logAccess(req, res, duration);
      });

      next();
    };
  }

  // Error handling middleware
  errorHandler() {
    return (err: Error, req: Request, res: Response, next: NextFunction) => {
      // Log the error
      this.logError(err, req);

      // Determine status code
      const statusCode = (err as any).statusCode || 500;

      // Send error response
      res.status(statusCode).json({
        error: err.message || 'Internal Server Error',
        statusCode,
        timestamp: new Date().toISOString(),
        path: req.url,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
      });
    };
  }

  // Get recent error logs
  getRecentErrors(count: number = 50): ErrorLog[] {
    try {
      if (!fs.existsSync(this.errorLogFile)) {
        return [];
      }

      const content = fs.readFileSync(this.errorLogFile, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line);
      const errors = lines.slice(-count).map(line => JSON.parse(line));
      return errors.reverse(); // Most recent first
    } catch (error) {
      console.error('Failed to read error logs:', error);
      return [];
    }
  }

  // Clear old logs
  clearOldLogs(daysToKeep: number = 7) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    [this.errorLogFile, this.accessLogFile].forEach(file => {
      try {
        if (!fs.existsSync(file)) return;

        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.trim().split('\n').filter(line => line);
        
        const filteredLines = lines.filter(line => {
          try {
            const log = JSON.parse(line);
            return new Date(log.timestamp) > cutoffDate;
          } catch {
            return false;
          }
        });

        fs.writeFileSync(file, filteredLines.join('\n') + '\n');
      } catch (error) {
        console.error(`Failed to clean log file ${file}:`, error);
      }
    });
  }
}

// Create singleton instance
const errorLogger = new ErrorLogger();

// Schedule daily cleanup of old logs
setInterval(() => {
  errorLogger.clearOldLogs();
}, 24 * 60 * 60 * 1000); // Run once per day

export default errorLogger;
