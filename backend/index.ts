import 'dotenv/config';
import express from 'express';
import path from 'path';
import cors from 'cors';
import { pool, ensurePool } from './src/db.ts';
import pg from 'pg';
import { fileURLToPath } from 'url';
const { Pool } = pg;
import authRouter from './src/routes/auth.ts';
import usersRouter from './src/routes/users.ts';
import productsRouter from './src/routes/products.ts';
import barcodeRouter from './src/routes/barcode.ts';
import vendorsRouter from './src/routes/vendors.ts';
import purchasesRouter from './src/routes/purchases.ts';
import inventoryRouter from './src/routes/inventory.ts';
import debugRouter from './src/routes/debug.ts';
import salesRouter from './src/routes/sales.ts';
import expensesRouter from './src/routes/expenses.ts';
import customersRouter from './src/routes/customers.ts';
import loyaltyRouter from './src/routes/loyalty.ts';
import printRouter from './src/routes/print.ts';
import logsRouter from './src/routes/logs.ts';
import printerSettingsRouter from './src/routes/printerSettings.ts';
import syncRouter from './src/routes/sync.ts';
import diagnosticsRouter from './src/routes/diagnostics.ts';
import whatsappRouter from './src/routes/whatsapp.ts';
import { startSyncWorker } from './src/sync_worker.ts';
import errorLogger from './src/middleware/errorLogger.ts';
import bcrypt from 'bcryptjs';

const app = express();
const PORT = process.env.PORT || 5000;

async function setupAdminUser() {
  console.log('👤 Setting up admin user...');
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (username && password) {
    try {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        `INSERT INTO users (username, password, role) VALUES ($1, $2, $3)
         ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password, role = EXCLUDED.role`,
        [username, hash, 'admin']
      );
      console.log(`✅ Admin user '${username}' configured`);
    } catch (error) {
      const err = error as Error;
      console.error('❌ Failed to setup admin user:', err.message);
      throw new Error(`Admin user setup failed: ${err.message}`);
    }
  } else {
    console.warn('⚠️  Admin credentials not configured');
  }
}

async function main() {
  try {
    console.log('🔧 Initializing backend server...');
    
    console.log('📊 Environment:', {
      DATABASE_URL: process.env.DATABASE_URL ? '***configured***' : 'NOT SET',
      JWT_SECRET: process.env.JWT_SECRET ? '***configured***' : 'NOT SET',
      PORT: PORT,
      NODE_ID: process.env.NODE_ID || 'NOT SET',
      CENTRAL_API_URL: process.env.CENTRAL_API_URL || 'NOT SET'
    });

    // DB setup
    await ensurePool();
    console.log('✅ Database pool initialized and migrations run');

    // Create users table and admin user
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role VARCHAR(20) DEFAULT 'cashier' CHECK (role IN ('admin', 'manager', 'cashier'))
      )
    `);
    await setupAdminUser();

    // Middlewares
    app.use(cors());
    app.use(express.json());
    app.use(errorLogger.requestLogger());

    // API Routes
    app.use('/api/auth', authRouter);
    app.use('/api/users', usersRouter);
    app.use('/api/products', productsRouter);
    app.use('/api/barcode', barcodeRouter);
    app.use('/api/vendors', vendorsRouter);
    app.use('/api/purchases', purchasesRouter);
    app.use('/api/inventory', inventoryRouter);
    app.use('/api/sales', salesRouter);
    app.use('/api/expenses', expensesRouter);
    app.use('/api/debug', debugRouter);
    app.use('/api/customers', customersRouter);
    app.use('/api/loyalty', loyaltyRouter);
    app.use('/api/print', printRouter);
    app.use('/api/logs', logsRouter);
    app.use('/api/printer-settings', printerSettingsRouter);
    app.use('/api/sync', syncRouter);
                app.use('/api/diagnostics', diagnosticsRouter);
    app.use('/api/whatsapp', whatsappRouter);

    // Serve static files from frontend build
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const frontendPath = path.join(__dirname, '../frontend/dist');
    app.use(express.static(frontendPath));

    // Handle React routing, return all requests to React app
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      res.sendFile(path.join(frontendPath, 'index.html'));
    });

    // Add error handling middleware (must be last)
    app.use(errorLogger.errorHandler());

    app.listen(PORT, () => {
      console.log(`✅ Server listening on port ${PORT}`);
      console.log('🚀 Backend server ready');
      // Start the sync worker only after the server is listening and DB is ready
      startSyncWorker();
    });

    console.log('✅ Backend initialization complete');

  } catch (err) {
    console.error('❌ Failed to initialize backend:', err);
    process.exit(1);
  }
}

main();
