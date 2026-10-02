'use client';

import { useState, useEffect } from 'react';
import { ChevronRight, Activity, Key, Loader2 } from 'lucide-react';

export default function AuthWrapper({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const auth = sessionStorage.getItem('sustain_auth');
    if (auth === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    
    setIsAuthenticating(true);
    setError(false);

    // Fake authentication delay for realistic UX
    setTimeout(() => {
      if (password === 'admin123' || password === 'admin') {
        sessionStorage.setItem('sustain_auth', 'true');
        setIsAuthenticated(true);
      } else {
        setError(true);
        setPassword('');
        setIsAuthenticating(false);
        // Reset error state after 2 seconds to remove shake class
        setTimeout(() => setError(false), 2000);
      }
    }, 800);
  };

  if (!isMounted) return null;

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <>
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          50% { transform: translateX(8px); }
          75% { transform: translateX(-8px); }
        }
        .shake-animation {
          animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both;
        }
        .login-bg {
          background-image: 
            radial-gradient(at 0% 0%, rgba(59, 130, 246, 0.15) 0px, transparent 50%),
            radial-gradient(at 100% 0%, rgba(139, 92, 246, 0.15) 0px, transparent 50%),
            radial-gradient(at 100% 100%, rgba(16, 185, 129, 0.15) 0px, transparent 50%);
          background-color: #0f172a; /* Dark sleek background */
        }
        .login-card {
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
        }
      `}</style>
      
      <div className="min-h-screen w-full flex items-center justify-center login-bg" style={{ position: 'fixed', top: 0, left: 0, zIndex: 9999 }}>
        <div className={`login-card animate-scale-up p-10 flex flex-col items-center rounded-2xl ${error ? 'shake-animation' : ''}`} style={{ maxWidth: 420, width: '90%' }}>
          
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6" style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(16, 185, 129, 0.2))', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--accent-emerald)' }}>
            <Activity size={32} />
          </div>
          
          <h1 className="text-2xl font-bold mb-2 text-white" style={{ letterSpacing: '-0.02em' }}>
            SustainGraph Admin
          </h1>
          <p className="text-center mb-8" style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px' }}>
            Enter your credentials to access the MMKG-RAG Analytics dashboard.
          </p>

          <form onSubmit={handleLogin} className="w-full flex flex-col gap-5">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                <Key size={18} />
              </div>
              <input
                type="password"
                placeholder="Admin Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isAuthenticating}
                className={`w-full bg-slate-900/50 text-white placeholder-gray-500 rounded-xl outline-none transition-all duration-300 ${error ? 'border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'border-slate-700 focus:border-blue-500 focus:shadow-[0_0_20px_rgba(59,130,246,0.3)]'}`}
                style={{ padding: '16px 16px 16px 44px', fontSize: '15px', border: '1px solid', borderColor: error ? '#ef4444' : 'rgba(255,255,255,0.1)' }}
                autoFocus
              />
            </div>
            
            <button 
              type="submit" 
              disabled={isAuthenticating || !password}
              className="btn btn-primary w-full flex justify-center items-center gap-2 mt-2" 
              style={{ height: '52px', fontSize: '15px', borderRadius: '12px', opacity: (!password || isAuthenticating) ? 0.7 : 1 }}
            >
              {isAuthenticating ? (
                <>
                  <Loader2 size={18} className="spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  Access Dashboard <ChevronRight size={18} />
                </>
              )}
            </button>
          </form>
          
          <p className="text-xs text-center mt-8" style={{ color: 'rgba(255, 255, 255, 0.4)' }}>
            Demo Mode Password: <strong className="text-white">admin123</strong>
          </p>
        </div>
      </div>
    </>
  );
}
