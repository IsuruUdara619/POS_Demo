import { Router } from 'express';
import { pool } from '../db.ts';
import jwt from 'jsonwebtoken';

const router = Router();

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
    const r = await pool.query('SELECT vendor_id, id, name, contact_no1, contact_no2, email, address FROM vendors WHERE deleted_at IS NULL ORDER BY vendor_id DESC');
    res.json({ vendors: r.rows });
  } catch (e: any) {
    res.status(500).send(e?.message || 'Server error');
  }
});

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

  const { name, contact_no1, contact_no2, email, address } = req.body as {
    name: string; contact_no1?: string; contact_no2?: string; email?: string; address?: string;
  };
  if (!name) return res.status(400).send('Missing name');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const nodeId = process.env.NODE_ID;

    const r = await client.query(
      `INSERT INTO vendors (name, contact_no1, contact_no2, email, address, created_by_node, updated_by_node) 
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING *`,
      [name, contact_no1 || null, contact_no2 || null, email || null, address || null, nodeId]
    );
    const newVendor = r.rows[0];

    await client.query(
        `INSERT INTO sync_queue (table_name, operation, row_id, payload, source_node_id)
         VALUES ('vendors', 'INSERT', $1, $2::jsonb, $3)`,
        [newVendor.id, JSON.stringify(newVendor), nodeId]
    );

    await client.query('COMMIT');
    res.json({ vendor: newVendor });
  } catch (e: any) {
    await client.query('ROLLBACK');
    if (e?.code === '23505') {
      return res.status(409).send('Conflict: A vendor with this identifier already exists.');
    }
    console.error(e);
    res.status(500).send(e?.message || 'Server error');
  } finally {
    client.release();
  }
});

router.put('/:vendorId', async (req, res) => {
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

  const vendorId = Number(req.params.vendorId);
  if (!vendorId) return res.status(400).send('Invalid vendor ID');

  const { name, contact_no1, contact_no2, email, address } = req.body as {
    name: string; contact_no1?: string; contact_no2?: string; email?: string; address?: string;
  };
  if (!name) return res.status(400).send('Missing name');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const nodeId = process.env.NODE_ID;

    const vendorResult = await client.query('SELECT id, created_by_node FROM vendors WHERE vendor_id = $1 AND deleted_at IS NULL', [vendorId]);
    if (vendorResult.rowCount === 0) {
      return res.status(404).send('Vendor not found');
    }
    const vendor = vendorResult.rows[0];
    const vendorUuid = vendor.id;

    if (vendor.created_by_node !== nodeId) {
      return res.status(403).send('Forbidden: This vendor can only be modified by its creator node.');
    }

    const updatePayload = {
        name,
        contact_no1: contact_no1 || null,
        contact_no2: contact_no2 || null,
        email: email || null,
        address: address || null,
        updated_by_node: nodeId
    };

    const r = await client.query(
      `UPDATE vendors SET name=$1, contact_no1=$2, contact_no2=$3, email=$4, address=$5, updated_by_node=$6 WHERE vendor_id=$7
       RETURNING *`,
      [updatePayload.name, updatePayload.contact_no1, updatePayload.contact_no2, updatePayload.email, updatePayload.address, nodeId, vendorId]
    );
    const updatedVendor = r.rows[0];

    await client.query(
        `INSERT INTO sync_queue (table_name, operation, row_id, payload, source_node_id)
         VALUES ('vendors', 'UPDATE', $1, $2::jsonb, $3)`,
        [vendorUuid, JSON.stringify(updatePayload), nodeId]
    );

    await client.query('COMMIT');
    res.json({ vendor: updatedVendor });
  } catch (e: any) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).send(e?.message || 'Server error');
  } finally {
    client.release();
  }
});

router.delete('/:vendorId', async (req, res) => {
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

  const vendorId = Number(req.params.vendorId);
  if (!vendorId) return res.status(400).send('Invalid vendor ID');
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const nodeId = process.env.NODE_ID;

    const vendorResult = await client.query('SELECT id, created_by_node FROM vendors WHERE vendor_id = $1 AND deleted_at IS NULL', [vendorId]);
    if (vendorResult.rowCount === 0) {
      return res.status(404).send('Vendor not found');
    }
    const vendor = vendorResult.rows[0];
    const vendorUuid = vendor.id;

    if (vendor.created_by_node !== nodeId) {
      return res.status(403).send('Forbidden: This vendor can only be deleted by its creator node.');
    }

    await client.query(
      `UPDATE vendors 
       SET deleted_at = NOW(), deleted_by_node = $1
       WHERE vendor_id = $2`,
      [nodeId, vendorId]
    );

    await client.query(
        `INSERT INTO sync_queue (table_name, operation, row_id, source_node_id)
         VALUES ('vendors', 'DELETE', $1, $2)`,
        [vendorUuid, nodeId]
    );
    
    await client.query('COMMIT');
    res.json({ message: 'Vendor deleted successfully', vendor_id: vendorId });
  } catch (e: any) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).send(e?.message || 'Server error');
  } finally {
    client.release();
  }
});

export default router;