'use client';

import { useState, useEffect } from 'react';
import { Lock, ChevronRight } from 'lucide-react';

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const auth = sessionStorage.getItem('sustain_auth');
    if (auth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'admin123' || password === 'admin') {
      sessionStorage.setItem('sustain_auth', 'true');
      setIsAuthenticated(true);
      setError(false);
    } else {
      setError(true);
      setPassword('');
      setTimeout(() => setError(false), 2000);
    }
  };

  if (!isMounted) return null;

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center" style={{ background: 'var(--bg-secondary)', position: 'fixed', top: 0, left: 0, zIndex: 9999 }}>
      <div className="card animate-scale-up p-10 flex flex-col items-center" style={{ maxWidth: 400, width: '100%', borderTop: '4px solid var(--accent-blue)', background: 'var(--bg-card)' }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6" style={{ background: 'var(--accent-blue-glow)', color: 'var(--accent-blue)' }}>
          <Lock size={28} />
        </div>
        
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Admin Access</h1>
        <p className="text-center mb-8" style={{ color: 'var(--text-secondary)' }}>
          Please enter the admin password to access the Sustainability Analytics Dashboard.
        </p>

        <form onSubmit={handleLogin} className="w-full flex flex-col gap-4">
          <div>
            <input
              type="password"
              placeholder="Admin Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`input w-full ${error ? 'border-red-500' : ''}`}
              style={{ padding: '14px 16px', fontSize: '16px' }}
              autoFocus
            />
            {error && <p className="text-red-500 text-sm mt-2 font-medium">Incorrect password.</p>}
          </div>
          
          <button type="submit" className="btn btn-primary w-full flex justify-center py-3 mt-2 text-base" style={{ height: '50px' }}>
            Login to Dashboard <ChevronRight size={18} />
          </button>
        </form>
        
        <p className="text-xs text-center mt-8" style={{ color: 'var(--text-muted)' }}>
          For demo purposes, use: <strong>admin123</strong>
        </p>
      </div>
    </div>
  );
}
