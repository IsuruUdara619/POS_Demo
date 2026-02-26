
import { Router } from 'express';
import { pool } from '../db.ts';
import jwt from 'jsonwebtoken';

const router = Router();

router.get('/sync-queue', async (req, res) => {
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
    const result = await pool.query('SELECT * FROM sync_queue ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (e: any) {
    res.status(500).send(e.message);
  }
});

export default router;
