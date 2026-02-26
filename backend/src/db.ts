import pg from 'pg';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

export async function runMigrations() {
    const client = await pool.connect();
    try {
        // We are in the 'src' directory, so we go one level up to the 'backend' root
        const migrationSqlPath = path.join(__dirname, '..', 'V2_sync_setup.sql');
        console.log(`🚀 Running migration from: ${migrationSqlPath}`);
        const migrationSql = await fs.readFile(migrationSqlPath, 'utf8');
        await client.query(migrationSql);
        console.log('✅ Database migration V2_sync_setup.sql completed successfully.');
    } catch (err) {
        console.error('❌ Error running database migrations:', err);
        throw err; // Re-throw the error to be caught by the caller
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
    console.error('❌ Error connecting to or migrating PostgreSQL database:', err);
    throw err;
  }
}
