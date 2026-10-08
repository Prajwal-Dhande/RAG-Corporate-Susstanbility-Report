'use client';

import { useState, useEffect } from 'react';
import { ChevronRight, Activity, Key, Loader2, BarChart3, Globe2, Shield, Leaf, TrendingUp, Zap } from 'lucide-react';

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

    setTimeout(() => {
      if (password === 'admin123' || password === 'admin') {
        sessionStorage.setItem('sustain_auth', 'true');
        setIsAuthenticated(true);
      } else {
        setError(true);
        setPassword('');
        setIsAuthenticating(false);
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
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          50% { transform: translateX(8px); }
          75% { transform: translateX(-8px); }
        }
        .shake-animation {
          animation: shake 0.4s cubic-bezier(.36,.07,.19,.97) both;
        }
        @keyframes float-1 {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(3deg); }
        }
        @keyframes float-2 {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-15px) rotate(-2deg); }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.9); opacity: 1; }
          80%, 100% { transform: scale(1.8); opacity: 0; }
        }
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .login-root {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 9999;
          display: flex;
        }

        /* LEFT PANEL — Branded hero */
        .login-hero {
          flex: 1.1;
          background: linear-gradient(145deg, #0a1628 0%, #0e2340 35%, #0d3b66 60%, #0a5c4f 100%);
          background-size: 200% 200%;
          animation: gradient-shift 12s ease infinite;
          display: flex; flex-direction: column; justify-content: center; align-items: center;
          padding: 60px; position: relative; overflow: hidden;
          color: #fff;
        }
        .login-hero::before {
          content: ''; position: absolute; inset: 0;
          background:
            radial-gradient(circle at 20% 30%, rgba(16, 185, 129, 0.12) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(59, 130, 246, 0.1) 0%, transparent 50%);
          pointer-events: none;
        }
        /* Subtle grid pattern */
        .login-hero::after {
          content: ''; position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
          background-size: 60px 60px;
          pointer-events: none;
        }
        .hero-content {
          position: relative; z-index: 2; max-width: 520px;
          animation: slide-up 0.8s ease-out;
        }
        .hero-logo {
          display: flex; align-items: center; gap: 14px; margin-bottom: 48px;
        }
        .hero-logo-icon {
          width: 52px; height: 52px; border-radius: 14px;
          background: linear-gradient(135deg, #10b981, #3b82f6);
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 8px 32px rgba(16, 185, 129, 0.3);
        }
        .hero-logo-text {
          font-size: 22px; font-weight: 800; letter-spacing: -0.03em;
          color: #fff;
        }
        .hero-logo-sub {
          font-size: 11px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase;
          color: rgba(255,255,255,0.5); margin-top: 2px;
        }
        .hero-title {
          font-size: 40px; font-weight: 800; line-height: 1.15; letter-spacing: -0.03em;
          margin-bottom: 20px;
        }
        .hero-title span {
          background: linear-gradient(135deg, #10b981, #34d399, #3b82f6);
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .hero-desc {
          font-size: 16px; line-height: 1.7; color: rgba(255,255,255,0.55);
          font-weight: 400; margin-bottom: 48px;
        }

        /* Feature pills */
        .hero-features {
          display: flex; flex-direction: column; gap: 16px;
        }
        .hero-feature {
          display: flex; align-items: center; gap: 16px;
          padding: 14px 20px; border-radius: 12px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.06);
          transition: all 0.3s ease;
          animation: fade-in 0.6s ease-out backwards;
        }
        .hero-feature:nth-child(1) { animation-delay: 0.3s; }
        .hero-feature:nth-child(2) { animation-delay: 0.45s; }
        .hero-feature:nth-child(3) { animation-delay: 0.6s; }
        .hero-feature:hover {
          background: rgba(255,255,255,0.07);
          border-color: rgba(255,255,255,0.1);
          transform: translateX(6px);
        }
        .hero-feature-icon {
          width: 40px; height: 40px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .hero-feature-text h4 {
          font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.9); margin: 0 0 3px 0;
        }
        .hero-feature-text p {
          font-size: 12.5px; color: rgba(255,255,255,0.4); margin: 0; line-height: 1.4;
        }

        /* Floating orbs */
        .orb {
          position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none;
        }
        .orb-1 {
          width: 300px; height: 300px; top: -80px; right: -60px;
          background: rgba(16, 185, 129, 0.12);
          animation: float-1 8s ease-in-out infinite;
        }
        .orb-2 {
          width: 250px; height: 250px; bottom: -60px; left: -40px;
          background: rgba(59, 130, 246, 0.1);
          animation: float-2 10s ease-in-out infinite;
        }

        /* RIGHT PANEL — Login form */
        .login-form-panel {
          flex: 0.9; display: flex; flex-direction: column; justify-content: center; align-items: center;
          background: #ffffff;
          padding: 60px;
          position: relative;
        }
        .login-form-wrapper {
          max-width: 380px; width: 100%;
          animation: slide-up 0.7s ease-out 0.2s backwards;
        }
        .form-header {
          margin-bottom: 40px;
        }
        .form-header h2 {
          font-size: 26px; font-weight: 700; color: #0f172a; letter-spacing: -0.02em;
          margin: 0 0 8px 0;
        }
        .form-header p {
          font-size: 14.5px; color: #64748b; margin: 0; line-height: 1.5;
        }

        .login-input-group {
          margin-bottom: 20px;
        }
        .login-input-label {
          display: block; font-size: 13px; font-weight: 600; color: #334155;
          margin-bottom: 8px; letter-spacing: 0.01em;
        }
        .login-input-wrap {
          position: relative;
        }
        .login-input-wrap svg {
          position: absolute; left: 16px; top: 50%; transform: translateY(-50%);
          color: #94a3b8; pointer-events: none; transition: color 0.2s;
        }
        .login-input {
          width: 100%; padding: 14px 16px 14px 48px;
          border: 1.5px solid #e2e8f0; border-radius: 10px;
          font-size: 15px; color: #0f172a; background: #f8fafc;
          outline: none; transition: all 0.25s ease;
          font-family: inherit;
        }
        .login-input::placeholder { color: #94a3b8; }
        .login-input:focus {
          border-color: #3b82f6; background: #fff;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        .login-input.input-error {
          border-color: #ef4444; background: #fef2f2;
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1);
        }

        .login-btn {
          width: 100%; padding: 15px 24px;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          color: #fff; border: none; border-radius: 10px;
          font-size: 15px; font-weight: 600; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: all 0.3s ease;
          font-family: inherit;
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.25);
        }
        .login-btn:hover:not(:disabled) {
          background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
          box-shadow: 0 6px 20px rgba(15, 23, 42, 0.35);
          transform: translateY(-1px);
        }
        .login-btn:active:not(:disabled) { transform: translateY(0); }
        .login-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .login-error-msg {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 14px; border-radius: 8px;
          background: #fef2f2; border: 1px solid #fecaca;
          color: #dc2626; font-size: 13px; font-weight: 500;
          margin-bottom: 20px;
          animation: slide-up 0.3s ease-out;
        }

        .login-footer {
          margin-top: 32px; text-align: center;
        }
        .login-footer-divider {
          display: flex; align-items: center; gap: 12px; margin-bottom: 16px;
        }
        .login-footer-divider hr {
          flex: 1; border: none; border-top: 1px solid #e2e8f0;
        }
        .login-footer-divider span {
          font-size: 12px; color: #94a3b8; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .demo-hint {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 20px; border-radius: 8px;
          background: #f0fdf4; border: 1px solid #bbf7d0;
          font-size: 13px; color: #15803d;
        }
        .demo-hint code {
          font-weight: 700; font-size: 13px; color: #166534;
          background: rgba(21, 128, 61, 0.1); padding: 2px 8px; border-radius: 4px;
          font-family: 'SF Mono', 'Fira Code', monospace;
        }

        .panel-footer {
          position: absolute; bottom: 28px; left: 0; right: 0;
          text-align: center; font-size: 12px; color: #94a3b8;
        }

        /* Responsive: stack on small screens */
        @media (max-width: 900px) {
          .login-root { flex-direction: column; }
          .login-hero { flex: none; padding: 40px 30px; min-height: 280px; }
          .hero-title { font-size: 28px; }
          .hero-features { display: none; }
          .login-form-panel { flex: 1; padding: 40px 30px; }
        }
      `}</style>
      
      <div className="login-root">
        {/* LEFT — Hero/Brand Panel */}
        <div className="login-hero">
          <div className="orb orb-1" />
          <div className="orb orb-2" />
          
          <div className="hero-content">
            <div className="hero-logo">
              <div className="hero-logo-icon">
                <Activity size={28} color="#fff" />
              </div>
              <div>
                <div className="hero-logo-text">SustainGraph</div>
                <div className="hero-logo-sub">MMKG-RAG Analytics</div>
              </div>
            </div>

            <h1 className="hero-title">
              Turning ESG Data into <span>Meaningful Progress</span>
            </h1>
            <p className="hero-desc">
              Multi-Modal Knowledge Graph powered analytics platform for corporate sustainability reporting, compliance tracking, and cross-company benchmarking.
            </p>

            <div className="hero-features">
              <div className="hero-feature">
                <div className="hero-feature-icon" style={{ background: 'rgba(16, 185, 129, 0.15)' }}>
                  <Leaf size={20} color="#10b981" />
                </div>
                <div className="hero-feature-text">
                  <h4>Knowledge Graph Extraction</h4>
                  <p>Automated ESG entity & relationship mapping from PDF reports</p>
                </div>
              </div>
              <div className="hero-feature">
                <div className="hero-feature-icon" style={{ background: 'rgba(59, 130, 246, 0.15)' }}>
                  <BarChart3 size={20} color="#3b82f6" />
                </div>
                <div className="hero-feature-text">
                  <h4>Cross-Company Benchmarking</h4>
                  <p>Side-by-side ESG performance comparison with dynamic KPI analysis</p>
                </div>
              </div>
              <div className="hero-feature">
                <div className="hero-feature-icon" style={{ background: 'rgba(245, 158, 11, 0.15)' }}>
                  <Shield size={20} color="#f59e0b" />
                </div>
                <div className="hero-feature-text">
                  <h4>Evidence-Based Verification</h4>
                  <p>Traceable claims backed by source-level document references</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — Login Form */}
        <div className="login-form-panel">
          <div className={`login-form-wrapper ${error ? 'shake-animation' : ''}`}>
            <div className="form-header">
              <h2>Welcome back</h2>
              <p>Enter your credentials to access the analytics dashboard.</p>
            </div>

            {error && (
              <div className="login-error-msg">
                <Shield size={16} />
                Invalid password. Please try again.
              </div>
            )}

            <form onSubmit={handleLogin}>
              <div className="login-input-group">
                <label className="login-input-label">Password</label>
                <div className="login-input-wrap">
                  <Key size={18} />
                  <input
                    type="password"
                    placeholder="Enter admin password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isAuthenticating}
                    className={`login-input ${error ? 'input-error' : ''}`}
                    autoFocus
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isAuthenticating || !password}
                className="login-btn"
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

            <div className="login-footer">
              <div className="login-footer-divider">
                <hr /><span>Demo access</span><hr />
              </div>
              <div className="demo-hint">
                <Zap size={14} />
                Use password: <code>admin123</code>
              </div>
            </div>
          </div>

          <div className="panel-footer">
            © 2024 SustainGraph · Research Prototype
          </div>
        </div>
      </div>
    </>
  );
}
