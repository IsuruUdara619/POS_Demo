import { Router } from 'express';
import { pool } from '../db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const router = Router();

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    // Verify database connectivity with a simple query
    await pool.query('SELECT 1');
    res.status(200).json({
      status: 'ok',
      service: 'auth',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error: any) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'error',
      service: 'auth',
      timestamp: new Date().toISOString(),
      message: error?.message || 'Service unavailable'
    });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body as { username: string; password: string };
  if (!username || !password) {
    return res.status(400).send('Missing credentials');
  }
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return res.status(500).send('Server misconfigured');
  }

  try {
    const r = await pool.query(
      'SELECT user_id, username, password, role FROM users WHERE username=$1 LIMIT 1',
      [username]
    );
    if (r.rowCount === 0) {
      return res.status(401).send('Invalid credentials');
    }
    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).send('Invalid credentials');
    }
    const token = jwt.sign(
      { sub: String(user.user_id), username: user.username, role: user.role },
      secret,
      { expiresIn: '1h' }
    );
    res.json({ token, user: { id: user.user_id, username: user.username, role: user.role } });
  } catch (e: any) {
    console.error('Login error', e);
    res.status(500).send(e?.message || 'Server error');
  }
});

export default router;
