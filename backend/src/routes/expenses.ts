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
      `SELECT expense_id, name, amount, note, created_at FROM expenses ORDER BY expense_id DESC`
    );
    res.json({ expenses: r.rows });
  } catch (e: any) {
    res.status(500).send(e?.message || 'Server error');
  }
});

router.post('/', async (req, res) => {
  if (!requireAuth(req, res)) return;
  const { name, amount, note } = req.body as { name?: string; amount?: number; note?: string };
  if (!name) return res.status(400).send('Missing name');
  if (amount === undefined || amount === null) return res.status(400).send('Missing amount');
  const amt = Number(amount);
  if (isNaN(amt) || amt < 0) return res.status(400).send('Invalid amount');
  try {
    const r = await pool.query(
      `INSERT INTO expenses (name, amount, note) VALUES ($1, $2, $3)
       RETURNING expense_id, name, amount, note`,
      [name, amt, note || null]
    );
    res.json({ expense: r.rows[0] });
  } catch (e: any) {
    res.status(500).send(e?.message || 'Server error');
  }
});

export default router;