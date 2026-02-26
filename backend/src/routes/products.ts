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
    const r = await pool.query('SELECT product_id, id, product_name, sku, category, low_stock_threshold FROM products WHERE deleted_at IS NULL ORDER BY product_id DESC');
    res.json({ products: r.rows });
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

  const { product_name, sku, category, low_stock_threshold } = req.body as {
    product_name: string; sku?: string; category?: string; low_stock_threshold?: number;
  };
  if (!product_name) return res.status(400).send('Missing product_name');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const nodeId = process.env.NODE_ID;

    const r = await client.query(
      `INSERT INTO products (product_name, sku, category, low_stock_threshold, created_by_node, updated_by_node)
       VALUES ($1, $2, $3, $4, $5, $5)
       RETURNING *`,
      [product_name, sku || null, category || null, low_stock_threshold || 0, nodeId]
    );
    const newProduct = r.rows[0];

    await client.query(
        `INSERT INTO sync_queue (table_name, operation, row_id, payload, source_node_id)
         VALUES ('products', 'INSERT', $1, $2::jsonb, $3)`,
        [newProduct.id, JSON.stringify(newProduct), nodeId]
    );

    await client.query('COMMIT');
    res.json({ product: newProduct });
  } catch (e: any) {
    await client.query('ROLLBACK');
    if (e?.code === '23505') {
      return res.status(409).send('Conflict: A product with the same unique identifier already exists.');
    }
    console.error(e);
    res.status(500).send(e?.message || 'Server error');
  } finally {
    client.release();
  }
});

router.put('/:productId', async (req, res) => {
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

  const productId = Number(req.params.productId);
  if (!productId) return res.status(400).send('Invalid product ID');

  const { product_name, sku, category, low_stock_threshold } = req.body as {
    product_name: string; sku?: string; category?: string; low_stock_threshold?: number;
  };
  
  if (!product_name) return res.status(400).send('Missing product_name');
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const nodeId = process.env.NODE_ID;

    // 1. Get the product's UUID and owner node
    const productResult = await client.query('SELECT id, created_by_node FROM products WHERE product_id = $1 AND deleted_at IS NULL', [productId]);
    if (productResult.rowCount === 0) {
      return res.status(404).send('Product not found');
    }
    const product = productResult.rows[0];
    const productUuid = product.id;

    // 2. Enforce ownership rule
    if (product.created_by_node !== nodeId) {
      return res.status(403).send('Forbidden: This product can only be modified by its creator node.');
    }

    // 3. Update the product
    const updatePayload = {
        product_name,
        sku: sku || null,
        category: category || null,
        low_stock_threshold: low_stock_threshold || 0,
        updated_by_node: nodeId
    };

    const r = await client.query(
      `UPDATE products 
       SET product_name = $1, sku = $2, category = $3, low_stock_threshold = $4, updated_by_node = $5
       WHERE product_id = $6
       RETURNING *`,
      [updatePayload.product_name, updatePayload.sku, updatePayload.category, updatePayload.low_stock_threshold, nodeId, productId]
    );
    const updatedProduct = r.rows[0];

    // 4. Log the change to the sync queue
    await client.query(
        `INSERT INTO sync_queue (table_name, operation, row_id, payload, source_node_id)
         VALUES ('products', 'UPDATE', $1, $2::jsonb, $3)`,
        [productUuid, JSON.stringify(updatePayload), nodeId]
    );
    
    await client.query('COMMIT');
    res.json({ product: updatedProduct });
  } catch (e: any) {
    await client.query('ROLLBACK');
    if (e?.code === '23505') {
      return res.status(409).send('Conflict: A product with this identifier already exists.');
    }
    console.error(e);
    res.status(500).send(e?.message || 'Server error');
  } finally {
    client.release();
  }
});

router.delete('/:productId', async (req, res) => {
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

  const productId = Number(req.params.productId);
  if (!productId) return res.status(400).send('Invalid product ID');
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const nodeId = process.env.NODE_ID;

    // 1. Get the product's UUID and owner node
    const productResult = await client.query('SELECT id, created_by_node FROM products WHERE product_id = $1 AND deleted_at IS NULL', [productId]);
    if (productResult.rowCount === 0) {
      return res.status(404).send('Product not found');
    }
    const product = productResult.rows[0];
    const productUuid = product.id;

    // 2. Enforce ownership rule
    if (product.created_by_node !== nodeId) {
      return res.status(403).send('Forbidden: This product can only be deleted by its creator node.');
    }

    // 3. Soft-delete the product
    const r = await client.query(
      `UPDATE products 
       SET deleted_at = NOW(), deleted_by_node = $1
       WHERE product_id = $2
       RETURNING id, product_id`,
      [nodeId, productId]
    );

    // 4. Log the change to the sync queue
    await client.query(
        `INSERT INTO sync_queue (table_name, operation, row_id, source_node_id)
         VALUES ('products', 'DELETE', $1, $2)`,
        [productUuid, nodeId]
    );
    
    await client.query('COMMIT');
    res.json({ message: 'Product deleted successfully', product_id: r.rows[0].product_id });
  } catch (e: any) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).send(e?.message || 'Server error');
  } finally {
    client.release();
  }
});

export default router;
