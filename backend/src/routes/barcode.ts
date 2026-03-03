import { Router } from 'express';
import { pool } from '../db';
import jwt from 'jsonwebtoken';

const router = Router();

router.get('/search', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).send('Server misconfigured');
  if (!token) return res.status(401).send('Unauthorized');
  try { jwt.verify(token, secret); } catch { return res.status(401).send('Unauthorized'); }

  const { product_id, purchase_date } = req.query as { product_id?: string; purchase_date?: string };
  
  try {
    let query = `
      SELECT b.barcode_id, b.product_id, b.invoice_no, b.brand, b.purchase_date, b.barcode, b.created_at,
             p.product_name, p.sku
      FROM barcode b
      LEFT JOIN products p ON p.product_id = b.product_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramCount = 0;

    if (product_id) {
      paramCount++;
      query += ` AND b.product_id = $${paramCount}`;
      params.push(Number(product_id));
    }

    if (purchase_date) {
      paramCount++;
      query += ` AND b.purchase_date = $${paramCount}`;
      params.push(purchase_date);
    }

    query += ` ORDER BY b.created_at DESC`;

    const result = await pool.query(query, params);
    
    res.json({ barcodes: result.rows });
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

  const { product_id, invoice_no, date, brand, barcode } = req.body as { product_id?: number; invoice_no?: string; date?: string; brand?: string; barcode?: string };
  if (!product_id) return res.status(400).send('Missing product_id');
  try {
    let dbInvoice: string | null = null;
    let code = (barcode || '').trim();
    if (!code) {
      const cleanInv = (invoice_no || dbInvoice || '').toString().replace(/\s+/g, '').toUpperCase();
      const datePart = date ? (()=>{ const d = new Date(date); if (isNaN(d.getTime())) return ''; return d.toISOString().slice(0,10).replace(/-/g,''); })() : '';
      const brandPart = (brand || '').toString().replace(/\s+/g,'');
      code = `BC-${product_id}${brandPart ? '-' + brandPart : ''}${cleanInv ? '-' + cleanInv : ''}${datePart ? '-' + datePart : ''}`;
    }
    const r = await pool.query(
      `INSERT INTO barcode (product_id, invoice_no, brand, purchase_date, barcode) VALUES ($1, $2, $3, $4, $5)
       RETURNING barcode_id, product_id, invoice_no, brand, purchase_date, barcode, created_at`,
      [product_id, (invoice_no || dbInvoice || null), (brand || null), (date ? new Date(date) : null), code]
    );
    res.json({ barcode: r.rows[0] });
  } catch (e: any) {
    if (e?.code === '23503') {
      return res.status(400).send('Invalid product_id');
    }
    if (e?.code === '23505') {
      return res.status(409).send('Barcode already exists for this product and purchase date combination. Please use a different barcode or change the date.');
    }
    res.status(500).send(e?.message || 'Server error');
  }
});

router.delete('/:barcode_id', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).send('Server misconfigured');
  if (!token) return res.status(401).send('Unauthorized');
  try { jwt.verify(token, secret); } catch { return res.status(401).send('Unauthorized'); }

  const barcodeId = req.params.barcode_id;
  if (!barcodeId) return res.status(400).send('Missing barcode_id');

  try {
    const result = await pool.query(
      'DELETE FROM barcode WHERE barcode_id = $1 RETURNING barcode_id',
      [Number(barcodeId)]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Barcode not found');
    }

    res.json({ message: 'Barcode deleted successfully', barcode_id: result.rows[0].barcode_id });
  } catch (e: any) {
    res.status(500).send(e?.message || 'Server error');
  }
});

router.get('/:barcode/pricing', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).send('Server misconfigured');
  if (!token) return res.status(401).send('Unauthorized');
  try { jwt.verify(token, secret); } catch { return res.status(401).send('Unauthorized'); }

  const code = (req.params.barcode || '').trim();
  if (!code) return res.status(400).send('Missing barcode');
  try {
    // Get barcode entries, ordered by most recent purchase date first (FIFO - sell oldest first)
    // If you want LIFO (sell newest first), change ORDER BY to DESC
    const br = await pool.query(
      `SELECT product_id, invoice_no, brand, purchase_date 
       FROM barcode 
       WHERE barcode = $1 
       ORDER BY purchase_date ASC NULLS LAST, created_at ASC
       LIMIT 1`,
      [code]
    );
    let productId: number | null = null;
    let invoiceNo: string | null = null;
    let brandFromCode: string | null = null;
    let dateFromCode: string | null = null;
    if (br.rows[0]) {
      productId = br.rows[0].product_id;
      invoiceNo = br.rows[0].invoice_no || null;
      brandFromCode = br.rows[0].brand || null;
      dateFromCode = br.rows[0].purchase_date ? String(br.rows[0].purchase_date).slice(0,10) : null;
    }

    if (!productId) return res.status(404).send('Barcode not found');

    let pr = null as any;
    if (invoiceNo) {
      const r2 = await pool.query(`SELECT purchase_id, vendor_id, invoice_no, purchase_date FROM purchases WHERE invoice_no = $1 ORDER BY purchase_id DESC LIMIT 1`, [invoiceNo]);
      pr = r2.rows[0] || null;
    }
    if (!pr && dateFromCode) {
      const r3 = await pool.query(`
        SELECT p.purchase_id, p.vendor_id, p.purchase_date
        FROM purchases p
        JOIN purchase_items pi ON pi.purchase_id = p.purchase_id
        WHERE p.purchase_date = $1 AND pi.product_id = $2
        ORDER BY p.purchase_id DESC
        LIMIT 1
      `, [dateFromCode, productId]);
      pr = r3.rows[0] || null;
    }
    if (!pr) return res.status(404).send('Purchase not found');
    const vendorId = pr.vendor_id;
    const pi = await pool.query(`
      SELECT unit_price, brand, selling_price
      FROM purchase_items
      WHERE purchase_id = $1 AND product_id = $2
      ORDER BY purchase_item_id DESC
      LIMIT 1
    `, [pr.purchase_id, productId]);
    let unit = pi.rows[0]?.unit_price ? Number(pi.rows[0].unit_price) : null;
    let sellingFromBatch = pi.rows[0]?.selling_price != null ? Number(pi.rows[0].selling_price) : null;
    let brand = brandFromCode ?? (pi.rows[0]?.brand || null);
    if (unit === null) {
      const last = await pool.query(`
        SELECT pi.unit_price, pi.brand
        FROM purchase_items pi
        JOIN purchases p ON p.purchase_id = pi.purchase_id
        WHERE pi.product_id = $1 AND p.vendor_id = $2 AND (pi.brand IS NOT DISTINCT FROM $3)
        ORDER BY pi.purchase_item_id DESC
        LIMIT 1
      `, [productId, vendorId, brand]);
      unit = last.rows[0]?.unit_price ? Number(last.rows[0].unit_price) : null;
      brand = brand ?? last.rows[0]?.brand ?? null;
    }
    const inv = await pool.query(`
      SELECT i.inventory_id, i.brand, p.product_name, p.sku, v.name as vendor_name
      FROM inventory_items i
      LEFT JOIN products p ON p.product_id = i.product_id
      LEFT JOIN vendors v ON v.vendor_id = i.vendor_id
      WHERE i.product_id = $1 AND i.vendor_id = $2 AND (i.brand IS NOT DISTINCT FROM $3)
      LIMIT 1
    `, [productId, vendorId, brand]);
    let productName: string | null = null;
    let vendorName: string | null = null;
    let sku: string | null = null;
    let inventoryId: number | null = null;
    if (inv.rows[0]) {
      const row = inv.rows[0];
      productName = row.product_name || null;
      vendorName = row.vendor_name || null;
      sku = row.sku || null;
      inventoryId = row.inventory_id;
    } else {
      const p1 = await pool.query(`SELECT product_name, sku FROM products WHERE product_id = $1`, [productId]);
      productName = p1.rows[0]?.product_name || null;
      sku = p1.rows[0]?.sku || null;
      const v1 = await pool.query(`SELECT name FROM vendors WHERE vendor_id = $1`, [vendorId]);
      vendorName = v1.rows[0]?.name || null;
    }
    const selling = sellingFromBatch != null
      ? sellingFromBatch
      : (unit !== null ? (sku === 'Grams' ? Number((unit * 1.3).toFixed(2)) : Math.ceil((unit * 1.3) / 5) * 5) : null);
    const availRow = await pool.query(
      `SELECT COALESCE(SUM(pi.remaining_qty),0) AS qty
       FROM purchase_items pi
       JOIN purchases p ON p.purchase_id = pi.purchase_id
       WHERE pi.product_id = $1 AND p.vendor_id = $2 AND (pi.brand IS NOT DISTINCT FROM $3)`,
      [productId, vendorId, brand]
    );
    const availableQty = availRow.rows[0]?.qty != null ? Number(availRow.rows[0].qty) : 0;
    res.json({
      inventory_id: inventoryId,
      product_name: productName,
      vendor_name: vendorName,
      brand: brand,
      sku,
      unit_price: unit,
      selling_price: selling,
      available_qty: availableQty,
      purchase_date: pr.purchase_date ? String(pr.purchase_date).slice(0,10) : (dateFromCode || null)
    });
  } catch (e: any) {
    res.status(500).send(e?.message || 'Server error');
  }
});

export default router;
