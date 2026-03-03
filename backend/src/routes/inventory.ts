import { Router } from 'express';
import { pool } from '../db';
import jwt from 'jsonwebtoken';

const router = Router();

function requireAuth(req: any, res: any) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const secret = process.env.JWT_SECRET;
  if (!secret) { res.status(500).send('Server misconfigured'); return false; }
  if (!token) { res.status(401).send('Unauthorized'); return false; }
  try { jwt.verify(token, secret); return true; } catch { res.status(401).send('Unauthorized'); return false; }
}

router.get('/', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const r = await pool.query(
      `SELECT
         i.inventory_id,
         i.product_id,
         p.product_name,
         p.sku,
         i.vendor_id,
         v.name AS vendor_name,
         i.brand,
         i.qty,
         MAX(pr.purchase_date::date) AS purchase_date
       FROM inventory_items i
       LEFT JOIN products p ON p.product_id = i.product_id
       LEFT JOIN vendors v ON v.vendor_id = i.vendor_id
       LEFT JOIN purchase_items pi ON pi.product_id = i.product_id AND (pi.brand IS NOT DISTINCT FROM i.brand)
       LEFT JOIN purchases pr ON pr.purchase_id = pi.purchase_id AND pr.vendor_id = i.vendor_id
       WHERE COALESCE(i.qty, 0) > 0
       GROUP BY i.inventory_id, i.product_id, p.product_name, p.sku, i.vendor_id, v.name, i.brand, i.qty
       ORDER BY i.inventory_id DESC`
    );
    res.json({ inventory: r.rows });
  } catch (e: any) {
    res.status(500).send(e?.message || 'Server error');
  }
});

router.post('/rebuild', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const agg = await client.query(
      `SELECT i.product_id, p.vendor_id, i.brand, COALESCE(SUM(i.remaining_qty), 0)::NUMERIC(12,2) AS qty
       FROM purchase_items i
       JOIN purchases p ON p.purchase_id = i.purchase_id
       GROUP BY i.product_id, p.vendor_id, i.brand`
    );
    for (const row of agg.rows) {
      const ex = await client.query(
        `SELECT inventory_id FROM inventory_items WHERE product_id = $1 AND vendor_id = $2 AND (brand IS NOT DISTINCT FROM $3) LIMIT 1`,
        [row.product_id, row.vendor_id, row.brand]
      );
      if (ex.rows[0]) {
        await client.query(`UPDATE inventory_items SET qty = $1 WHERE inventory_id = $2`, [row.qty, ex.rows[0].inventory_id]);
      } else {
        await client.query(
          `INSERT INTO inventory_items (product_id, vendor_id, brand, qty)
           VALUES ($1, $2, $3, $4)`,
          [row.product_id, row.vendor_id, row.brand, row.qty]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ ok: true, updated: agg.rowCount });
  } catch (e: any) {
    await client.query('ROLLBACK');
    res.status(500).send(e?.message || 'Server error');
  } finally {
    client.release();
  }
});

router.get('/:id/unit-price', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const id = Number(req.params.id);
  const dateFilter = typeof req.query.date === 'string' ? String(req.query.date) : null;
  const brandOverride = typeof req.query.brand === 'string' ? String(req.query.brand) : null;
  try {
    console.log(`🔍 [GET /:id/unit-price] inventory_id=${id}, date=${dateFilter}, brandOverride=${brandOverride}`);
    
    const inv = await pool.query(`SELECT inventory_id, product_id, vendor_id, brand FROM inventory_items WHERE inventory_id = $1`, [id]);
    if (!inv.rows[0]) { 
      console.log(`❌ [GET /:id/unit-price] Inventory item ${id} not found`);
      res.status(404).send('Not found'); 
      return; 
    }
    const ip = inv.rows[0];
    console.log(`📋 [GET /:id/unit-price] Inventory item:`, ip);
    
    const overrideTrim = (brandOverride || '').trim();
    const brandToUse = overrideTrim.length > 0 ? overrideTrim : ip.brand;
    console.log(`🏷️  [GET /:id/unit-price] Using brand: ${brandToUse}`);
    
    const query1 = `SELECT pi.unit_price, pi.selling_price
       FROM purchase_items pi
       JOIN purchases p ON p.purchase_id = pi.purchase_id
       WHERE pi.product_id = $1 AND p.vendor_id = $2 AND (pi.brand IS NOT DISTINCT FROM $3)
       ORDER BY pi.purchase_item_id DESC
       LIMIT 1`;
    const params1 = [ip.product_id, ip.vendor_id, brandToUse];
    console.log(`🔍 [GET /:id/unit-price] Query 1:`, query1);
    console.log(`📊 [GET /:id/unit-price] Params 1:`, params1);
    
    let r = await pool.query(query1, params1);
    console.log(`📦 [GET /:id/unit-price] Query 1 results:`, r.rows);
    
    if (!r.rows[0]) {
      console.log(`⚠️  [GET /:id/unit-price] No results from query 1, trying query 2 without brand filter`);
      
      const query2 = `SELECT pi.unit_price, pi.selling_price
         FROM purchase_items pi
         JOIN purchases p ON p.purchase_id = pi.purchase_id
         WHERE pi.product_id = $1 AND p.vendor_id = $2
         ORDER BY pi.purchase_item_id DESC
         LIMIT 1`;
      const params2 = [ip.product_id, ip.vendor_id];
      console.log(`🔍 [GET /:id/unit-price] Query 2:`, query2);
      console.log(`📊 [GET /:id/unit-price] Params 2:`, params2);
      
      r = await pool.query(query2, params2);
      console.log(`📦 [GET /:id/unit-price] Query 2 results:`, r.rows);
    }
    
    const unit = r.rows[0]?.unit_price ? Number(r.rows[0].unit_price) : null;
    const selling = r.rows[0]?.selling_price != null ? Number(r.rows[0].selling_price) : null;
    console.log(`💰 [GET /:id/unit-price] Final values - unit_price: ${unit}, selling_price: ${selling}`);
    
    res.json({ unit_price: unit, selling_price: selling });
  } catch (e: any) {
    console.error(`❌ [GET /:id/unit-price] Error:`, e);
    res.status(500).send(e?.message || 'Server error');
  }
});

router.get('/unit-price-by-barcode/:barcode', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const code = (req.params.barcode || '').trim();
  if (!code) { res.status(400).send('Missing barcode'); return; }
  try {
    const br = await pool.query(`SELECT product_id, purchase_id FROM barcode WHERE barcode = $1`, [code]);
    if (!br.rows[0]) { res.status(404).send('Barcode not found'); return; }
    const b = br.rows[0];
    const pr = await pool.query(`SELECT vendor_id FROM purchases WHERE purchase_id = $1`, [b.purchase_id]);
    if (!pr.rows[0]) { res.status(404).send('Purchase not found'); return; }
    const vendorId = pr.rows[0].vendor_id;
    const pi = await pool.query(`
      SELECT unit_price, brand
      FROM purchase_items
      WHERE purchase_id = $1 AND product_id = $2
      ORDER BY purchase_item_id DESC
      LIMIT 1
    `, [b.purchase_id, b.product_id]);
    const unit = pi.rows[0]?.unit_price ? Number(pi.rows[0].unit_price) : null;
    const brand = pi.rows[0]?.brand || null;
    const inv = await pool.query(`
      SELECT i.inventory_id, i.brand, p.product_name, p.sku, v.name as vendor_name
      FROM inventory_items i
      LEFT JOIN products p ON p.product_id = i.product_id
      LEFT JOIN vendors v ON v.vendor_id = i.vendor_id
      WHERE i.product_id = $1 AND i.vendor_id = $2 AND (i.brand IS NOT DISTINCT FROM $3)
      LIMIT 1
    `, [b.product_id, vendorId, brand]);
    if (!inv.rows[0]) { res.status(404).send('Inventory not found'); return; }
    const row = inv.rows[0];
    const sku = row.sku || null;
    const selling = unit !== null ? (sku === 'Grams' ? Number((unit * 1.3).toFixed(2)) : Math.ceil((unit * 1.3) / 5) * 5) : null;
    res.json({
      inventory_id: row.inventory_id,
      product_name: row.product_name || null,
      vendor_name: row.vendor_name || null,
      brand: brand,
      sku,
      unit_price: unit,
      selling_price: selling
    });
  } catch (e: any) {
    res.status(500).send(e?.message || 'Server error');
  }
});

router.get('/low-stock', async (req, res) => {
  if (!requireAuth(req, res)) return;
  try {
    const r = await pool.query(
      `SELECT
         p.product_id,
         p.product_name,
         p.sku,
         p.category,
         p.low_stock_threshold,
         COALESCE(SUM(i.qty), 0) as current_stock
       FROM products p
       LEFT JOIN inventory_items i ON p.product_id = i.product_id
       WHERE p.low_stock_threshold > 0
       GROUP BY p.product_id, p.product_name, p.sku, p.category, p.low_stock_threshold
       HAVING COALESCE(SUM(i.qty), 0) <= p.low_stock_threshold
       ORDER BY p.product_name`
    );
    res.json({ alerts: r.rows });
  } catch (e: any) {
    res.status(500).send(e?.message || 'Server error');
  }
});

export default router;
