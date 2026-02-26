import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../services/api';
import companyLogo from '/wh_logo.png';

export default function Login() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const roseGold = '#31a354';
  const gold = '#31a354';
  const goldHover = '#e6b400';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      console.log('Sending login request...');
      const res = await post('/auth/login', { username, password });
      console.log('Login response:', res);
      
      if (!res.token) {
        throw new Error('No token received from server');
      }

      localStorage.setItem('token', res.token);
      localStorage.setItem('userRole', res.user?.role || 'cashier');
      
      console.log('Token set, navigating to dashboard...');
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{
        display: 'flex', gap: 12, alignItems: 'center', padding: 12,
        position: 'sticky', top: 0,
        background: '#31a354',
        color: '#fff', borderBottom: `1px solid ${roseGold}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        {/* <img src={companyLogo} alt="Logo" style={{ height: 40, width: 40, objectFit: 'contain', borderRadius: 4, background: '#fff', padding: 2 }} /> */}
        <div style={{ fontWeight: 700, fontSize: 24 }}>Demo POS System</div>
      </div>
      <div style={{ maxWidth: 360, margin: '60px auto', padding: 24, border: '1px solid #555', borderRadius: 12, background: '#31a354', boxShadow: '0 6px 18px rgba(0,0,0,0.08)' }}>
      <h2 style={{ color: '#fff' }}>Login</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label style={{color:'#fff', display:'block', marginBottom:6}}>Username</label>
          <input value={username} onChange={e=>setUsername(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #555', background: '#444', color: '#fff', boxSizing: 'border-box' }} required />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{color:'#fff', display:'block', marginBottom:6}}>Password</label>
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 8, border: '1px solid #555', background: '#444', color: '#fff', boxSizing: 'border-box' }} required />
        </div>
        {error && <div style={{ color: '#fff', marginBottom: 12 }}>{error}</div>}
        <button
          type="submit"
          disabled={loading}
          style={{ width: '100%', padding: 10, background: gold, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 1 }}
          onMouseEnter={e => (e.currentTarget.style.background = goldHover)}
          onMouseLeave={e => (e.currentTarget.style.background = gold)}
        >
          {loading ? 'AUTHENTICATING...' : 'LOGIN'}
        </button>
      </form>
      </div>
    </div>
  );
}
