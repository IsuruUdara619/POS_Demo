import { Router } from 'express'
import { pool } from '../db.ts';
import jwt from 'jsonwebtoken'

const router = Router()

router.get('/', async (req, res) => {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  const secret = process.env.JWT_SECRET
  if (!secret) return res.status(500).send('Server misconfigured')
  if (!token) return res.status(401).send('Unauthorized')
  try {
    jwt.verify(token, secret)
  } catch {
    return res.status(401).send('Unauthorized')
  }

  try {
    const r = await pool.query('SELECT customer_id, id, name, contact_no, nic, address, joined_date, created_at FROM customers WHERE deleted_at IS NULL ORDER BY customer_id DESC')
    res.json({ customers: r.rows })
  } catch (e: any) {
    res.status(500).send(e?.message || 'Server error')
  }
})

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

  const { name, mobile_no, nic, address, joined_date } = req.body as { name: string; mobile_no?: string; nic?: string; address?: string; joined_date?: string };
  if (!name) return res.status(400).send('Missing name');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const nodeId = process.env.NODE_ID;

    const r = await client.query(
      `INSERT INTO customers (name, contact_no, nic, address, joined_date, created_by_node, updated_by_node) 
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       RETURNING *`,
      [name, mobile_no || null, nic || null, address || null, joined_date ? new Date(joined_date) : null, nodeId]
    );
    const newCustomer = r.rows[0];

    await client.query(
        `INSERT INTO sync_queue (table_name, operation, row_id, payload, source_node_id)
         VALUES ('customers', 'INSERT', $1, $2::jsonb, $3)`,
        [newCustomer.id, JSON.stringify(newCustomer), nodeId]
    );

    await client.query('COMMIT');
    res.json({ customer: newCustomer });
  } catch (e: any) {
    await client.query('ROLLBACK');
    if (e?.code === '23505') {
      return res.status(409).send('Conflict: A customer with this identifier already exists.');
    }
    console.error(e);
    res.status(500).send(e?.message || 'Server error');
  } finally {
    client.release();
  }
})

router.put('/:customerId', async (req, res) => {
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

  const customerId = Number(req.params.customerId);
  if (!customerId) return res.status(400).send('Invalid customer ID');

  const { name, mobile_no, nic, address, joined_date } = req.body as { name: string; mobile_no?: string; nic?: string; address?: string; joined_date?: string };
  if (!name) return res.status(400).send('Missing name');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const nodeId = process.env.NODE_ID;

    const customerResult = await client.query('SELECT id, created_by_node FROM customers WHERE customer_id = $1 AND deleted_at IS NULL', [customerId]);
    if (customerResult.rowCount === 0) {
      return res.status(404).send('Customer not found');
    }
    const customer = customerResult.rows[0];
    const customerUuid = customer.id;

    if (customer.created_by_node !== nodeId) {
      return res.status(403).send('Forbidden: This customer can only be modified by its creator node.');
    }

    const updatePayload = {
        name,
        contact_no: mobile_no || null,
        nic: nic || null,
        address: address || null,
        joined_date: joined_date ? new Date(joined_date) : null,
        updated_by_node: nodeId
    };

    const r = await client.query(
      `UPDATE customers SET name=$1, contact_no=$2, nic=$3, address=$4, joined_date=$5, updated_by_node=$6 WHERE customer_id=$7
       RETURNING *`,
      [updatePayload.name, updatePayload.contact_no, updatePayload.nic, updatePayload.address, updatePayload.joined_date, nodeId, customerId]
    );
    const updatedCustomer = r.rows[0];

    await client.query(
        `INSERT INTO sync_queue (table_name, operation, row_id, payload, source_node_id)
         VALUES ('customers', 'UPDATE', $1, $2::jsonb, $3)`,
        [customerUuid, JSON.stringify(updatePayload), nodeId]
    );

    await client.query('COMMIT');
    res.json({ customer: updatedCustomer });
  } catch (e: any) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).send(e?.message || 'Server error');
  } finally {
    client.release();
  }
})

router.delete('/:customerId', async (req, res) => {
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

  const customerId = Number(req.params.customerId);
  if (!customerId) return res.status(400).send('Invalid customer ID');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const nodeId = process.env.NODE_ID;

    const customerResult = await client.query('SELECT id, created_by_node FROM customers WHERE customer_id = $1 AND deleted_at IS NULL', [customerId]);
    if (customerResult.rowCount === 0) {
      return res.status(404).send('Customer not found');
    }
    const customer = customerResult.rows[0];
    const customerUuid = customer.id;

    if (customer.created_by_node !== nodeId) {
      return res.status(403).send('Forbidden: This customer can only be deleted by its creator node.');
    }

    await client.query(
      `UPDATE customers
       SET deleted_at = NOW(), deleted_by_node = $1
       WHERE customer_id = $2`,
      [nodeId, customerId]
    );

    await client.query(
        `INSERT INTO sync_queue (table_name, operation, row_id, source_node_id)
         VALUES ('customers', 'DELETE', $1, $2)`,
        [customerUuid, nodeId]
    );

    await client.query('COMMIT');
    res.json({ message: 'Customer deleted successfully', customer_id: customerId });
  } catch (e: any) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).send(e?.message || 'Server error');
  } finally {
    client.release();
  }
})

export default router