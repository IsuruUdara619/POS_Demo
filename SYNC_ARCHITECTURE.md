
# Data Synchronization Architecture Explained

This document explains the technical architecture of the offline-first, two-way data synchronization system. It details the key database concepts and the flow of data between the two PCs.

## 1. Core Database Concepts

The entire system is built upon a few key modifications to the database schema. These changes are designed to make synchronization possible without conflicts.

### Key Table Columns

Every synchronized table (like `products`, `customers`, `sales`, etc.) includes the following special columns:

-   `id UUID PRIMARY KEY`: Instead of a regular auto-incrementing number, each record gets a **Universally Unique Identifier (UUID)**. This ensures that a product created on PC1 will never have the same ID as a product created on PC2, preventing collisions.
-   `created_by_node VARCHAR(255)`: Stores the `NODE_ID` of the PC that originally created the record. This establishes **ownership**.
-   `updated_by_node VARCHAR(255)`: Stores the `NODE_ID` of the PC that last modified the record.
-   `deleted_at TIMESTAMPTZ`: Enables **"soft deletes"**. Instead of permanently deleting a row, we simply set a timestamp in this column. The application code then knows to treat it as deleted. This preserves data history and makes sync simpler.

### The `sync_queue` Table

This is the heart of the synchronization system. Every single data change (INSERT, UPDATE, or DELETE) is recorded as an event in this table **within the same database transaction**. If the data change fails, the sync event is also rolled back, guaranteeing consistency.

A `sync_queue` record looks like this:

-   `id`: A unique UUID for the sync event itself.
-   `table_name`: The table that was changed (e.g., 'products').
-   `operation`: The action performed ('INSERT', 'UPDATE', 'DELETE').
-   `row_id`: The UUID of the record that was changed.
-   `payload`: A JSON object containing the new data.
-   `source_node_id`: The `NODE_ID` of the PC where the change happened.
-   `created_at`: The timestamp of the event.
-   `synced`: A boolean flag, initially `false`, set to `true` after the event has been successfully sent to the other PC.

### The `sync_metadata` Table

This small table has one primary purpose: to track the timestamp of the last successful "pull" of data from the server. This prevents the client from re-fetching the same data over and over again.

---

## 2. The Data Flow: A Step-by-Step Example

Let's walk through what happens when **a new customer is created on PC2**.

-   **PC1**: The designated server PC.
-   **PC2**: The client PC.

![Data Flow Diagram](https://i.imgur.com/gS4z8Hr.png)

**Step 1: Local Write (on PC2)**

1.  You fill out the "New Customer" form on PC2 and click Save.
2.  The backend API on PC2 starts a database transaction.
3.  It runs an `INSERT` command to add the new customer to its local `customers` table. The `id` is a new UUID, and `created_by_node` is set to PC2's `NODE_ID`.
4.  In the same transaction, it runs another `INSERT` command to add an event to its local `sync_queue` table. This event contains all the customer data in the `payload`.
5.  The transaction is committed. The customer is now saved and ready to be synced.

**Step 2: Push Cycle (from PC2 to PC1)**

1.  The `sync_worker` on PC2 runs periodically (e.g., every 30 seconds).
2.  It queries its local `sync_queue` for any records where `synced = false`.
3.  It finds the new customer event.
4.  It makes an HTTP POST request to PC1's public IP address, at the `/api/sync/push` endpoint, sending the event data.

**Step 3: Server Receives (on PC1)**

1.  PC1's backend receives the request at the `/api/sync/push` endpoint.
2.  It takes the customer event from PC2 and inserts it into **its own** `sync_queue` table.
3.  PC1 sends a "Success" response back to PC2.
4.  Upon receiving success, PC2's `sync_worker` marks the original event in its local queue as `synced = true`.

**Step 4: Apply Cycle (on PC1)**

1.  Now the event from PC2 is sitting in PC1's `sync_queue`.
2.  The `sync_worker` on PC1 does its *own* local processing. It finds the new customer event from PC2.
3.  It calls the `applySyncItem` function, which sees the operation is 'INSERT'.
4.  It runs an `INSERT` command on its local `customers` table. Because the `id` is a UUID, there is no conflict. The customer record from PC2 is now perfectly replicated on PC1.

**The data is now synchronized.** The flow works in reverse when data is created on PC1.

---

## 3. Conflict Prevention

This architecture is designed to be "conflict-free" by following simple rules.

-   **Creation Conflicts**: Impossible. Because all new records use UUIDs for their primary keys, a record created on PC1 can never collide with one created on PC2.

-   **Modification Conflicts**: Prevented by the **"owner-can-modify"** rule. When processing an 'UPDATE' or 'DELETE' event, the `applySyncItem` function first checks the `created_by_node` column of the record being changed. If the `NODE_ID` in the sync event does not match the `created_by_node` of the record, the operation is rejected. This enforces a simple business rule: only the node that created a piece of data is allowed to modify it.
