import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../db';

const router = Router();

// Middleware to verify JWT token
function verifyToken(req: any, res: any, next: any) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const secret = process.env.JWT_SECRET;
  
  if (!secret) return res.status(500).send('Server misconfigured');
  if (!token) return res.status(401).send('Unauthorized');
  
  try {
    jwt.verify(token, secret);
    next();
  } catch {
    return res.status(401).send('Unauthorized');
  }
}

// GET current printer settings
router.get('/', verifyToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM printer_settings ORDER BY setting_id DESC LIMIT 1');
    
    if (result.rows.length === 0) {
      // Return default settings if none exist
      return res.json({
        printer_name: 'Printer_POS-80',
        font_header: 13,
        font_items: 6,
        font_subtotal: 6,
        font_total: 8,
        font_payment: 7,
        margin_top: 10,
        margin_bottom: 10,
        footer_spacing: 20,
        paper_height: 842,
        line_spacing: 12,
        align_header: 'center',
        align_items: 'left',
        align_totals: 'right',
        align_payment: 'left',
        align_footer: 'center'
      });
    }
    
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('Error fetching printer settings:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch printer settings' });
  }
});

// PUT update printer settings
router.put('/', verifyToken, async (req, res) => {
  try {
    const {
      printer_name,
      font_header,
      font_items,
      font_subtotal,
      font_total,
      font_payment,
      margin_top,
      margin_bottom,
      footer_spacing,
      paper_height,
      line_spacing,
      align_header,
      align_items,
      align_totals,
      align_payment,
      align_footer
    } = req.body;

    // Check if settings exist
    const checkResult = await pool.query('SELECT setting_id FROM printer_settings LIMIT 1');
    
    if (checkResult.rows.length === 0) {
      // Insert new settings
      const insertResult = await pool.query(
        `INSERT INTO printer_settings (
          printer_name, font_header, font_items, font_subtotal, font_total, font_payment,
          margin_top, margin_bottom, footer_spacing, paper_height, line_spacing,
          align_header, align_items, align_totals, align_payment, align_footer, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP)
        RETURNING *`,
        [
          printer_name, font_header, font_items, font_subtotal, font_total, font_payment,
          margin_top, margin_bottom, footer_spacing, paper_height, line_spacing,
          align_header, align_items, align_totals, align_payment, align_footer
        ]
      );
      return res.json({ success: true, settings: insertResult.rows[0] });
    } else {
      // Update existing settings
      const updateResult = await pool.query(
        `UPDATE printer_settings SET
          printer_name = $1,
          font_header = $2,
          font_items = $3,
          font_subtotal = $4,
          font_total = $5,
          font_payment = $6,
          margin_top = $7,
          margin_bottom = $8,
          footer_spacing = $9,
          paper_height = $10,
          line_spacing = $11,
          align_header = $12,
          align_items = $13,
          align_totals = $14,
          align_payment = $15,
          align_footer = $16,
          updated_at = CURRENT_TIMESTAMP
        WHERE setting_id = $17
        RETURNING *`,
        [
          printer_name, font_header, font_items, font_subtotal, font_total, font_payment,
          margin_top, margin_bottom, footer_spacing, paper_height, line_spacing,
          align_header, align_items, align_totals, align_payment, align_footer,
          checkResult.rows[0].setting_id
        ]
      );
      return res.json({ success: true, settings: updateResult.rows[0] });
    }
  } catch (error: any) {
    console.error('Error updating printer settings:', error);
    res.status(500).json({ error: error.message || 'Failed to update printer settings' });
  }
});

// POST reset to default settings
router.post('/reset', verifyToken, async (req, res) => {
  try {
    const defaults = {
      printer_name: 'Printer_POS-80',
      font_header: 13,
      font_items: 6,
      font_subtotal: 6,
      font_total: 8,
      font_payment: 7,
      margin_top: 10,
      margin_bottom: 10,
      footer_spacing: 20,
      paper_height: 842,
      line_spacing: 12,
      align_header: 'center',
      align_items: 'left',
      align_totals: 'right',
      align_payment: 'left',
      align_footer: 'center'
    };

    // Check if settings exist
    const checkResult = await pool.query('SELECT setting_id FROM printer_settings LIMIT 1');
    
    if (checkResult.rows.length === 0) {
      // Insert defaults
      const insertResult = await pool.query(
        `INSERT INTO printer_settings (
          printer_name, font_header, font_items, font_subtotal, font_total, font_payment,
          margin_top, margin_bottom, footer_spacing, paper_height, line_spacing,
          align_header, align_items, align_totals, align_payment, align_footer
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *`,
        [
          defaults.printer_name, defaults.font_header, defaults.font_items, defaults.font_subtotal,
          defaults.font_total, defaults.font_payment, defaults.margin_top, defaults.margin_bottom,
          defaults.footer_spacing, defaults.paper_height, defaults.line_spacing, defaults.align_header,
          defaults.align_items, defaults.align_totals, defaults.align_payment, defaults.align_footer
        ]
      );
      return res.json({ success: true, settings: insertResult.rows[0] });
    } else {
      // Update to defaults
      const updateResult = await pool.query(
        `UPDATE printer_settings SET
          printer_name = $1, font_header = $2, font_items = $3, font_subtotal = $4,
          font_total = $5, font_payment = $6, margin_top = $7, margin_bottom = $8,
          footer_spacing = $9, paper_height = $10, line_spacing = $11, align_header = $12,
          align_items = $13, align_totals = $14, align_payment = $15, align_footer = $16,
          updated_at = CURRENT_TIMESTAMP
        WHERE setting_id = $17
        RETURNING *`,
        [
          defaults.printer_name, defaults.font_header, defaults.font_items, defaults.font_subtotal,
          defaults.font_total, defaults.font_payment, defaults.margin_top, defaults.margin_bottom,
          defaults.footer_spacing, defaults.paper_height, defaults.line_spacing, defaults.align_header,
          defaults.align_items, defaults.align_totals, defaults.align_payment, defaults.align_footer,
          checkResult.rows[0].setting_id
        ]
      );
      return res.json({ success: true, settings: updateResult.rows[0] });
    }
  } catch (error: any) {
    console.error('Error resetting printer settings:', error);
    res.status(500).json({ error: error.message || 'Failed to reset printer settings' });
  }
});

export default router;
