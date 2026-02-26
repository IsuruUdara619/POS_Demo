import { Router } from 'express';
import { pool } from '../db.ts';
import jwt from 'jsonwebtoken';

const router = Router();

router.post('/', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).send('Server misconfigured');
  if (!token) return res.status(401).send('Unauthorized');
  try {
    jwt.verify(token, secret);
  } catch {
    return res.status(401).send('Unauthorized');
  }

  const { invoice_no, vendor_id, date, bill_price, qty, brand, product_id, selling_price, unit_price } = req.body as {
    invoice_no?: string;
    vendor_id: number;
    date?: string;
    bill_price: number;
    qty: number;
    brand?: string;
    product_id: number;
    selling_price?: number;
    unit_price?: number;
  };

  if (!vendor_id || !product_id) return res.status(400).send('Missing vendor_id or product_id');
  if (!qty || qty <= 0) return res.status(400).send('Invalid qty');
  if (bill_price === undefined || bill_price === null) return res.status(400).send('Missing bill_price');

  const total = Number(bill_price);
  const unit = unit_price != null ? Number(Number(unit_price).toFixed(2)) : Number((total / qty).toFixed(2));
  const selling = selling_price != null ? Number(Number(selling_price).toFixed(2)) : Number((unit * 1.3).toFixed(2));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const nodeId = process.env.NODE_ID;
    const dateOnly = date ? String(date).slice(0, 10) : new Date().toISOString().slice(0, 10);

    // 1. Create Purchase
    const purchaseResult = await client.query(
      `INSERT INTO purchases (invoice_no, vendor_id, date, purchase_date, bill_price, unit_price, selling_price, created_by_node, updated_by_node) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       RETURNING *`,
      [invoice_no || null, vendor_id, (date ? new Date(date) : new Date()), dateOnly, total, unit, selling, nodeId]
    );
    const newPurchase = purchaseResult.rows[0];

    await client.query(
        `INSERT INTO sync_queue (table_name, operation, row_id, payload, source_node_id)
         VALUES ('purchases', 'INSERT', $1, $2::jsonb, $3)`,
        [newPurchase.id, JSON.stringify(newPurchase), nodeId]
    );

    // 2. Create Purchase Item
    const purchaseItemResult = await client.query(
      `INSERT INTO purchase_items (purchase_id, product_id, qty, total_price, unit_price, brand, selling_price, remaining_qty, created_by_node, updated_by_node)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       RETURNING *`,
      [newPurchase.purchase_id, product_id, qty, total, unit, brand || null, selling, qty, nodeId]
    );
    const newPurchaseItem = purchaseItemResult.rows[0];

    await client.query(
        `INSERT INTO sync_queue (table_name, operation, row_id, payload, source_node_id)
         VALUES ('purchase_items', 'INSERT', $1, $2::jsonb, $3)`,
        [newPurchaseItem.id, JSON.stringify(newPurchaseItem), nodeId]
    );

    // 3. Update Inventory (Idempotent)
    const invExist = await client.query(
      `SELECT inventory_id, id, qty FROM inventory_items WHERE product_id = $1 AND vendor_id = $2 AND (brand IS NOT DISTINCT FROM $3) FOR UPDATE`,
      [product_id, vendor_id, brand || null]
    );

    let inventoryItem;
    if (invExist.rows[0]) {
      const existingInventoryItem = invExist.rows[0];
      const updateResult = await client.query(
        `UPDATE inventory_items SET qty = qty + $1, updated_by_node = $2 WHERE inventory_id = $3 RETURNING *`,
        [qty, nodeId, existingInventoryItem.inventory_id]
      );
      inventoryItem = updateResult.rows[0];
      
      const updatePayload = { qty: inventoryItem.qty, updated_by_node: nodeId };
      await client.query(
        `INSERT INTO sync_queue (table_name, operation, row_id, payload, source_node_id) VALUES ('inventory_items', 'UPDATE', $1, $2::jsonb, $3)`,
        [existingInventoryItem.id, JSON.stringify(updatePayload), nodeId]
      );
    } else {
      const insertResult = await client.query(
        `INSERT INTO inventory_items (product_id, vendor_id, brand, qty, created_by_node, updated_by_node)
         VALUES ($1, $2, $3, $4, $5, $5)
         RETURNING *`,
        [product_id, vendor_id, brand || null, qty, nodeId]
      );
      inventoryItem = insertResult.rows[0];

      await client.query(
        `INSERT INTO sync_queue (table_name, operation, row_id, payload, source_node_id) VALUES ('inventory_items', 'INSERT', $1, $2::jsonb, $3)`,
        [inventoryItem.id, JSON.stringify(inventoryItem), nodeId]
      );
    }

    await client.query('COMMIT');
    res.json({ purchase: newPurchase, item: newPurchaseItem, inventory: inventoryItem });
  } catch (e: any) {
    await client.query('ROLLBACK');
    if (e?.code === '23503') { return res.status(400).send('Invalid vendor_id or product_id'); }
    console.error(e);
    res.status(500).send(e?.message || 'Server error');
  } finally {
    client.release();
  }
});

router.get('/', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).send('Server misconfigured');
  if (!token) return res.status(401).send('Unauthorized');
  try {
    jwt.verify(token, secret);
  } catch {
    return res.status(401).send('Unauthorized');
  }

  try {
    const pr = await pool.query(
      `SELECT p.purchase_id, p.id, p.invoice_no, p.vendor_id, p.date, p.purchase_date, p.bill_price, p.unit_price, p.selling_price, v.name as vendor_name
       FROM purchases p
       LEFT JOIN vendors v ON v.vendor_id = p.vendor_id
       WHERE p.deleted_at IS NULL
       ORDER BY p.purchase_id DESC`
    );
    const ids = pr.rows.map(r => r.purchase_id);
    let items: any[] = [];
    if (ids.length > 0) {
      const ir = await pool.query(
        `SELECT purchase_item_id, id, purchase_id, product_id, qty, total_price, unit_price, brand, selling_price
         FROM purchase_items
         WHERE purchase_id = ANY($1::int[])`
        , [ids]
      );
      items = ir.rows;
    }
    const map: Record<number, any[]> = {};
    for (const it of items) {
      (map[it.purchase_id] ||= []).push(it);
    }
    const purchases = pr.rows.map(p => ({ ...p, items: map[p.purchase_id] || [] }));
    res.json({ purchases });
  } catch (e: any) {
    res.status(500).send(e?.message || 'Server error');
  }
});

export default router;