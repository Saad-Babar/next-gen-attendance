import React, { useState } from 'react';
import './App.css';
import { db } from './firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

function Login() {
  const [form, setForm] = useState({ emailOrPhone: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError(''); // Clear error when user types
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Check if input is email or phone
      const isEmail = form.emailOrPhone.includes('@');
      
      let q;
      if (isEmail) {
        q = query(collection(db, 'users'), where('email', '==', form.emailOrPhone));
      } else {
        q = query(collection(db, 'users'), where('phone', '==', form.emailOrPhone));
      }

      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        setError('User not found!');
        setLoading(false);
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();

      if (userData.password !== form.password) {
        setError('Invalid password!');
        setLoading(false);
        return;
      }

      // Store user data in localStorage for session
      localStorage.setItem('currentUser', JSON.stringify({
        id: userDoc.id,
        ...userData
      }));

      // Redirect to dashboard
      window.location.href = `${import.meta.env.BASE_URL}dashboard`;
      
    } catch (err) {
      setError('Login failed. Please try again.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing-container">
      <div className="landing-header">
        <h1>Login</h1>
        <p className="landing-description">Sign in to your account to mark attendance.</p>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        <input
          type="text"
          name="emailOrPhone"
          placeholder="Email or Phone Number"
          value={form.emailOrPhone}
          onChange={handleChange}
          required
        />
        <input
          type="password"
          name="password"
          placeholder="Password"
          value={form.password}
          onChange={handleChange}
          required
        />
        <button className="landing-btn" type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
        {error && (
          <div style={{ color: '#ff6b6b', marginTop: 8, textAlign: 'center' }}>
            {error}
          </div>
        )}
      </form>
      <button className="landing-btn" onClick={() => window.location.href = `${import.meta.env.BASE_URL}`} style={{marginTop: '1rem'}}>Back to Home</button>
    </div>
  );
}

export default Login;
