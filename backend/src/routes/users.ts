import { Router } from 'express';
import { pool } from '../db.ts';
import bcrypt from 'bcryptjs';
import { authenticateToken, checkRole } from '../middleware/auth.ts';
import type { AuthRequest } from '../middleware/auth.ts';

const router = Router();

// Get all users (admin only)
router.get('/', authenticateToken, checkRole(['admin']), async (req: AuthRequest, res) => {
  try {
    const result = await pool.query(
      'SELECT user_id, username, role FROM users ORDER BY user_id'
    );
    res.json({ users: result.rows });
  } catch (e: any) {
    console.error('Get users error', e);
    res.status(500).send(e?.message || 'Server error');
  }
});

// Create new user (admin only)
router.post('/', authenticateToken, checkRole(['admin']), async (req: AuthRequest, res) => {
  const { username, password, role } = req.body as { username: string; password: string; role: string };
  
  if (!username || !password || !role) {
    return res.status(400).send('Username, password, and role are required');
  }

  if (!['admin', 'manager', 'cashier'].includes(role)) {
    return res.status(400).send('Invalid role');
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING user_id, username, role',
      [username, hash, role]
    );
    res.json({ user: result.rows[0] });
  } catch (e: any) {
    if (e?.code === '23505') {
      return res.status(409).send('Username already exists');
    }
    console.error('Create user error', e);
    res.status(500).send(e?.message || 'Server error');
  }
});

// Update user role (admin only)
router.put('/:id', authenticateToken, checkRole(['admin']), async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { role } = req.body as { role: string };

  if (!role) {
    return res.status(400).send('Role is required');
  }

  if (!['admin', 'manager', 'cashier'].includes(role)) {
    return res.status(400).send('Invalid role');
  }

  try {
    const result = await pool.query(
      'UPDATE users SET role = $1 WHERE user_id = $2 RETURNING user_id, username, role',
      [role, id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).send('User not found');
    }
    
    res.json({ user: result.rows[0] });
  } catch (e: any) {
    console.error('Update user error', e);
    res.status(500).send(e?.message || 'Server error');
  }
});

// Delete user (admin only)
router.delete('/:id', authenticateToken, checkRole(['admin']), async (req: AuthRequest, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM users WHERE user_id = $1 RETURNING user_id', [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).send('User not found');
    }
    
    res.json({ ok: true });
  } catch (e: any) {
    console.error('Delete user error', e);
    res.status(500).send(e?.message || 'Server error');
  }
});

export default router;
