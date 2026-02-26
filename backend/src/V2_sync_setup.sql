-- V2_sync_setup.sql
-- This script prepares the database for two-way synchronization.

-- Enable UUID extension if not already enabled.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Task 1: Create the sync_queue table
-- This table will act as a journal for all data changes (INSERT, UPDATE, DELETE)
-- that need to be synced with the other node.
CREATE TABLE IF NOT EXISTS sync_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(255) NOT NULL,
    operation VARCHAR(10) NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    row_id UUID NOT NULL, -- The UUID of the affected row in its source table
    payload JSONB, -- For INSERT, the full row data. For UPDATE, only changed fields. For DELETE, this is NULL.
    source_node_id UUID NOT NULL, -- The UUID of the node where the change originated
    created_at TIMESTAMPTZ DEFAULT NOW(),
    synced BOOLEAN DEFAULT FALSE, -- Flag to indicate if this change has been sent to the other node
    synced_at TIMESTAMPTZ -- Timestamp of when it was synced
);

-- An index to efficiently query for unsynced records.
CREATE INDEX IF NOT EXISTS idx_sync_queue_synced ON sync_queue (synced, created_at);
COMMENT ON TABLE sync_queue IS 'Journal of all data changes to be synchronized between nodes.';

-- Task 2 & 3: Add sync-related columns to existing tables
-- We will iterate through all relevant tables and add the necessary columns
-- for tracking, conflict-free updates, and soft deletes.
DO $$
DECLARE
    t_name TEXT;
    -- List of tables to be modified for synchronization.
    -- We exclude 'users' for security and simplicity, and 'sync_queue' itself.
    tables_to_sync TEXT[] := ARRAY['products', 'vendors', 'purchases', 'purchase_items', 'customers', 'inventory_items', 'sales', 'sales_items', 'expenses', 'barcode'];
BEGIN
    FOREACH t_name IN ARRAY tables_to_sync
    LOOP
        -- Add a globally unique UUID column. This is crucial for identifying rows across different databases.
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS id UUID UNIQUE DEFAULT uuid_generate_v4()', t_name);

        -- Add columns to track which node created or last updated a row. This is key for our conflict avoidance strategy.
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS created_by_node UUID', t_name);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_by_node UUID', t_name);
        
        -- Add columns for soft deletes. Instead of permanently deleting rows, we just mark them as deleted.
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ', t_name);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS deleted_by_node UUID', t_name);

        -- Backfill the new UUID for any existing rows.
        EXECUTE format('UPDATE public.%I SET id = uuid_generate_v4() WHERE id IS NULL', t_name);

        -- After backfilling, ensure the UUID column is never null.
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id SET NOT NULL', t_name);
    END LOOP;
END;
$$;

-- Task 4: Create a table to store sync metadata for each node
-- We drop the old table to ensure the new schema is applied.
DROP TABLE IF EXISTS sync_metadata;
CREATE TABLE IF NOT EXISTS sync_metadata (
    node_id UUID PRIMARY KEY,
    last_pull_timestamp TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01T00:00:00Z'
);

COMMENT ON TABLE sync_metadata IS 'Stores the last successful pull timestamp for each client node.';

COMMENT ON COLUMN products.id IS 'Globally unique identifier for synchronization.';
COMMENT ON COLUMN products.created_by_node IS 'The node that created this record.';
COMMENT ON COLUMN products.updated_by_node IS 'The last node that updated this record.';
COMMENT ON COLUMN products.deleted_at IS 'Timestamp for soft deletes.';

-- Note: The 'users' table is intentionally excluded from this synchronization process.
-- User accounts should be managed independently on each PC to avoid security risks
-- and complexities associated with syncing sensitive credential data.
