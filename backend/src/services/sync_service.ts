import { pool } from '../db.ts';
import pg from 'pg';
const { PoolClient } = pg;

export interface SyncItem {
    id: string; // sync_queue id
    table_name: string;
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    row_id: string; // UUID of the row
    payload: any;
    source_node_id: string;
}

/**
 * Applies a single sync item to the database. This is intended to be called by a worker
 * that manages its own transactions.
 * @param client - The database client, with an active transaction.
 * @param item - The sync item to apply.
 * @returns A promise that resolves to true if the operation was successful, false otherwise.
 */
export async function applySyncItem(client: PoolClient, item: SyncItem): Promise<boolean> {
    console.log(`Applying item: ${item.id}, operation: ${item.operation}, table: ${item.table_name}`);

    switch (item.operation) {
        case 'INSERT':
            return await applyInsert(client, item);
        case 'UPDATE':
            return await applyUpdate(client, item);
        case 'DELETE':
            return await applyDelete(client, item);
        default:
            console.warn(`Unknown sync operation: ${item.operation}`);
            return false;
    }
}

/**
 * Applies an INSERT operation from a sync item.
 * This function is idempotent; if the row already exists, it skips the insertion.
 * @param client - The database client.
 * @param item - The sync item containing the INSERT operation data.
 * @returns A promise that resolves to true if the operation was successful or skipped, false otherwise.
 */
async function applyInsert(client: PoolClient, item: SyncItem): Promise<boolean> {
    const { table_name, row_id, payload, source_node_id } = item;

    const { rows } = await client.query(`SELECT id FROM public.${table_name} WHERE id = $1`, [row_id]);
    if (rows.length > 0) {
        console.log(`Skipping INSERT for existing row ${row_id} in ${table_name}`);
        return true; // Idempotency: Row already exists.
    }

    // Add metadata from the source node
    payload.created_by_node = source_node_id;
    payload.updated_by_node = source_node_id;
    
    const columns = Object.keys(payload).join(', ');
    const values = Object.values(payload);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

    await client.query(`INSERT INTO public.${table_name} (${columns}) VALUES (${placeholders})`, values);
    console.log(`Applied INSERT for row ${row_id} in ${table_name}`);
    return true;
}

/**
 * Applies an UPDATE operation from a sync item.
 * It enforces the rule that only the creating node can update a record.
 * @param client - The database client.
 * @param item - The sync item containing the UPDATE operation data.
 * @returns A promise that resolves to true if the operation was successful, false if a conflict occurred.
 */
async function applyUpdate(client: PoolClient, item: SyncItem): Promise<boolean> {
    const { table_name, row_id, payload, source_node_id } = item;

    const { rows } = await client.query(`SELECT created_by_node FROM public.${table_name} WHERE id = $1`, [row_id]);
    if (rows.length === 0) {
        console.warn(`Skipping UPDATE for non-existent row ${row_id} in ${table_name}`);
        return true; // Idempotency: Row doesn't exist, can't update.
    }

    if (rows[0].created_by_node !== source_node_id) {
        console.warn(`Conflict: Node ${process.env.NODE_ID} cannot update row ${row_id} in ${table_name} owned by ${rows[0].created_by_node}.`);
        return false; // Conflict: Not the owner.
    }

    payload.updated_by_node = source_node_id;
    
    const setClauses = Object.keys(payload).map((key, i) => `${key} = $${i + 1}`).join(', ');
    const values = [...Object.values(payload), row_id];

    await client.query(`UPDATE public.${table_name} SET ${setClauses} WHERE id = $${values.length}`, values);
    console.log(`Applied UPDATE for row ${row_id} in ${table_name}`);
    return true;
}

/**
 * Applies a DELETE (soft delete) operation from a sync item.
 * It enforces the rule that only the creating node can delete a record.
 * @param client - The database client.
 * @param item - The sync item containing the DELETE operation data.
 * @returns A promise that resolves to true if the operation was successful, false if a conflict occurred.
 */
async function applyDelete(client: PoolClient, item: SyncItem): Promise<boolean> {
    const { table_name, row_id, source_node_id } = item;

    const { rows } = await client.query(`SELECT id, created_by_node FROM public.${table_name} WHERE id = $1 AND deleted_at IS NULL`, [row_id]);
    if (rows.length === 0) {
        return true; // Idempotency: Row already deleted or never existed.
    }

    if (rows[0].created_by_node !== source_node_id) {
        console.warn(`Conflict: Node ${process.env.NODE_ID} cannot delete row ${row_id} in ${table_name} owned by ${rows[0].created_by_node}.`);
        return false; // Conflict: Not the owner.
    }

    await client.query(
        `UPDATE public.${table_name} SET deleted_at = NOW(), deleted_by_node = $1 WHERE id = $2`,
        [source_node_id, row_id]
    );
    console.log(`Applied DELETE for row ${row_id} in ${table_name}`);
    return true;
}