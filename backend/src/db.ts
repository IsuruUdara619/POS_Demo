import pg from 'pg';
const { Pool } = pg;
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse DATABASE_URL or use explicit parameters
const getDatabaseConfig = () => {
  const dbUrl = process.env.DATABASE_URL;
  
  if (dbUrl) {
    // Parse connection string manually to avoid pg parsing issues
    const url = new URL(dbUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 5432,
      database: url.pathname.slice(1), // Remove leading '/'
      user: url.username,
      password: url.password,
    };
  }
  
  // Fallback to individual env variables if needed
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  };
};

// Create a new pool instance using explicit parameters
export const pool = new Pool(getDatabaseConfig());

// Function to ensure the pool is connected/ready (mostly for compatibility with previous logic)
export async function runMigrations() {
    const client = await pool.connect();
    try {
        const migrationSqlPath = path.join(__dirname, 'V2_sync_setup.sql');
        console.log(`Checking for migration file at: ${migrationSqlPath}`);
        const migrationSql = await fs.readFile(migrationSqlPath, 'utf8');
        await client.query(migrationSql);
        console.log('Database migrations completed successfully.');
    } catch (err) {
        console.error('Error running database migrations:', err);
        throw err;
    } finally {
        client.release();
    }
}

export async function ensurePool() {
  try {
    // Test connection
    const client = await pool.connect();
    console.log('Successfully connected to PostgreSQL database.');
    client.release();

    // Run migrations after successful connection
    await runMigrations();
    
    return pool;
  } catch (err) {
    console.error('Error connecting to or migrating PostgreSQL database:', err);
    throw err;
  }
}
