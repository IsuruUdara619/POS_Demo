
import { Router } from 'express';
import { pool } from '../db';
import { authenticateToken } from '../middleware/auth';
import type { AuthRequest } from '../middleware/auth';

const router = Router();

interface SyncItem {
    id: string;
    table_name: string;
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    row_id: string;
    payload: any;
    source_node_id: string;
    created_at: string;
}

// Endpoint for a client node to PUSH its changes to the server
router.post('/push', authenticateToken, async (req: AuthRequest, res) => {
    const items: SyncItem[] = req.body.items;
    const sourceNodeId = req.headers['x-node-id'] as string;

    if (!items || !Array.isArray(items) || !sourceNodeId) {
        return res.status(400).json({ message: 'Invalid sync payload. "items" array and "X-Node-Id" header are required.' });
    }

    if (items.length === 0) {
        return res.status(200).json({ message: 'No items to sync.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log(`[Sync Server] Receiving ${items.length} items from node ${sourceNodeId}`);

        for (const item of items) {
            // Insert the incoming item into this server's sync_queue
            // It will be processed and applied locally by this server's own sync worker later
            const insertQuery = `
                INSERT INTO sync_queue (id, table_name, operation, row_id, payload, source_node_id, created_at, synced)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (id) DO NOTHING;
            `;
            // Note: We set `synced` to false. This server's worker will apply the change.
            await client.query(insertQuery, [
                item.id,
                item.table_name,
                item.operation,
                item.row_id,
                JSON.stringify(item.payload),
                item.source_node_id, // IMPORTANT: We preserve the original source node
                item.created_at,
                false 
            ]);
        }

        await client.query('COMMIT');
        res.status(200).json({ message: `Successfully queued ${items.length} items.` });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[Sync Server] Error processing pushed items:', error);
        res.status(500).json({ message: 'Error processing sync data.' });
    } finally {
        client.release();
    }
});

// Endpoint for a client node to PULL changes from the server
router.get('/pull', authenticateToken, async (req: AuthRequest, res) => {
    const lastPullTimestamp = req.query.last_pull_timestamp as string || '1970-01-01T00:00:00Z';
    const sourceNodeId = req.headers['x-node-id'] as string;

    if (!sourceNodeId) {
        return res.status(400).json({ message: '"X-Node-Id" header is required.' });
    }
    
    const client = await pool.connect();
    try {
        // We get the server's current time BEFORE the query to ensure consistency
        const serverTimestampResult = await client.query('SELECT NOW() as now');
        const newTimestamp = serverTimestampResult.rows[0].now;

        // Query for items that are newer than the client's last pull AND did not originate from the client itself
        const getChangesQuery = `
            SELECT id, table_name, operation, row_id, payload, source_node_id, created_at FROM sync_queue
            WHERE created_at > $1 AND source_node_id != $2
            ORDER BY created_at ASC;
        `;
        const result = await client.query(getChangesQuery, [lastPullTimestamp, sourceNodeId]);
        
        console.log(`[Sync Server] Node ${sourceNodeId} pulling changes since ${lastPullTimestamp}. Found ${result.rows.length} items.`);

        res.json({
            items: result.rows,
            new_timestamp: newTimestamp
        });
    } catch (error) {
        console.error('[Sync Server] Error pulling items:', error);
        res.status(500).json({ message: 'Error fetching sync data.' });
    } finally {
        client.release();
    }
});

export default router;
