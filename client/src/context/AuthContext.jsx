import React, { createContext, useState, useEffect } from 'react';
import { getMe, login, register } from '../services/api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const res = await getMe();
          setUser(res.data);
        } catch (err) {
          // An expired or tampered token: clear it and fall through to signed-out.
          console.warn('Stored session was rejected:', err?.response?.status || err.message);
          localStorage.removeItem('token');
        }
      }
      setLoading(false);
    };
    fetchUser();
  }, []);

  const handleLogin = async (data) => {
    const res = await login(data);
    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
  };

  const handleRegister = async (data) => {
    const res = await register(data);
    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login: handleLogin, register: handleRegister, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
