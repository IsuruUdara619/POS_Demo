
import dns from 'dns';
import { pool } from './db.ts';
import { applySyncItem } from './services/sync_service.ts';

const SYNC_INTERVAL_MS = 30000; // 30 seconds

async function isOnline(): Promise<boolean> {
  return new Promise((resolve) => {
    dns.lookup('google.com', (err) => {
      resolve(err === null);
    });
  });
}

async function syncWorker() {
  console.log('Sync worker: Checking for items to sync...');

  const online = await isOnline();
  if (!online) {
    console.log('Sync worker: Offline, skipping sync cycle.');
    return;
  }

  const apiUrl = process.env.CENTRAL_API_URL;
  const nodeId = process.env.NODE_ID;

  if (!apiUrl || !nodeId) {
    console.error('CENTRAL_API_URL or NODE_ID is not set in .env. Sync worker cannot run.');
    return;
  }

  const client = await pool.connect();
  try {
    const token = process.env.INTERNAL_SYNC_TOKEN;
    if (!token) {
      console.error('Sync worker: INTERNAL_SYNC_TOKEN is not set in .env. Skipping sync cycle.');
      return;
    }

    // === PUSH PHASE ===
    const itemsToPush = await client.query(
      'SELECT * FROM sync_queue WHERE synced = false ORDER BY created_at ASC'
    );

    if (itemsToPush.rows.length > 0) {
      console.log(`Sync worker: Found ${itemsToPush.rows.length} item(s) to push.`);
      try {
        const response = await fetch(`${apiUrl}/sync/push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Node-Id': nodeId,
          },
          body: JSON.stringify({ items: itemsToPush.rows }),
        });

        if (response.ok) {
          console.log('Sync worker: Push successful.');
          const syncedIds = itemsToPush.rows.map(item => item.id);
          await client.query('UPDATE sync_queue SET synced = true WHERE id = ANY($1::uuid[])', [syncedIds]);
        } else {
          console.error(`Sync worker: Push failed with status ${response.status}`);
        }
      } catch (error) {
        console.error('Sync worker: Error during push:', error);
      }
    }

    // === PULL PHASE ===
    // 1. Get the last pull timestamp for this specific node.
    const lastPullTimestampResult = await client.query(
        'SELECT last_pull_timestamp FROM sync_metadata WHERE node_id = $1',
        [nodeId]
    );

    // If this node has never pulled, the record might not exist. The DB has a default, but we can be safe.
    const lastPullTimestamp = lastPullTimestampResult.rows[0]?.last_pull_timestamp || '1970-01-01T00:00:00Z';

    // 2. Convert the timestamp (which is a Date object from the DB) to a clean ISO 8601 string.
    const lastPullTimestampISO = new Date(lastPullTimestamp).toISOString();

    console.log(`Sync worker: Pulling changes since ${lastPullTimestampISO}`);
    try {
      // 3. Use the ISO string in the URL. It's standard and safe.
      const response = await fetch(`${apiUrl}/sync/pull?last_pull_timestamp=${encodeURIComponent(lastPullTimestampISO)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Node-Id': nodeId
        },
      });

      if (response.ok) {
        const { items: itemsToPull, new_timestamp: newTimestamp } = await response.json();
        console.log(`Sync worker: Pulled ${itemsToPull.length} item(s).`);

        if (itemsToPull.length > 0) {
          for (const item of itemsToPull) {
            await applySyncItem(client, item);
          }
          console.log('Sync worker: Finished applying pulled items.');
        }

        // Update last_pull_timestamp for this node.
        if (newTimestamp) {
            await client.query('UPDATE sync_metadata SET last_pull_timestamp = $1 WHERE node_id = $2', [newTimestamp, nodeId]);
        }
      } else {
        console.error(`Sync worker: Pull failed with status ${response.status}`);
      }
    } catch (error) {
      console.error('Sync worker: Error during pull:', error);
    }

  } catch (error) {
    console.error('Sync worker: An unexpected error occurred:', error);
  } finally {
    client.release();
  }
}

export function startSyncWorker() {
  const apiUrl = process.env.CENTRAL_API_URL;
  const nodeId = process.env.NODE_ID;

  if (apiUrl && nodeId) {
    console.log(`Sync worker started. Sync interval: ${SYNC_INTERVAL_MS / 1000} seconds.`);
    setInterval(syncWorker, SYNC_INTERVAL_MS);
    syncWorker(); // Run once immediately on start
  } else {
    console.log('CENTRAL_API_URL or NODE_ID is not set in .env. Sync worker will not start.');
  }
}
