import pg from 'pg';
const { Pool } = pg;
import { promises as fs } from 'fs';
import path from 'path';

function getDatabaseConfig() {
    const connectionString = process.env.DATABASE_URL;
    if (connectionString) {
        const masked = connectionString.replace(/:[^:@]*@/, ':****@');
        console.log(`🔌 Using DATABASE_URL: ${masked}`);
        return {
            connectionString,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
        };
    }

    console.log('🔌 Using individual database environment variables.');
    return {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'pos',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    };
}

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
    const client = await pool.connect();
    console.log('✅ Successfully connected to PostgreSQL database.');
    client.release();

    // Run migrations after successful connection
    await runMigrations();
    
    return pool;
  } catch (err) {
    console.error('Error connecting to or migrating PostgreSQL database:', err);
    throw err;
  }
}
