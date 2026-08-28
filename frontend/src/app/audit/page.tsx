'use client';

import { useEffect, useState } from 'react';
import { getReports, analyzeConsistency, Report } from '@/lib/api';
import { ShieldCheck, AlertCircle, RefreshCw, AlertTriangle, CheckCircle, Info } from 'lucide-react';

export default function AuditPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<string>('');
  const [auditData, setAuditData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    try {
      setLoading(true);
      const data = await getReports();
      const processed = data.filter(r => r.status === 'completed');
      setReports(processed);
      if (processed.length > 0) {
        setSelectedReport(processed[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedReport) {
      runAudit();
    }
  }, [selectedReport]);

  async function runAudit() {
    try {
      setAnalyzing(true);
      const data = await analyzeConsistency(selectedReport);
      if (data && data.results) {
        setAuditData(data.results);
      } else {
        setAuditData([]);
      }
    } catch (err: any) {
      console.error(err);
      setError('Failed to run consistency audit.');
    } finally {
      setAnalyzing(false);
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'CONSISTENT': return <CheckCircle size={18} style={{ color: 'var(--accent-emerald)' }} />;
      case 'MINOR_VARIANCE': return <Info size={18} style={{ color: 'var(--accent-blue)' }} />;
      case 'CONFLICTING': return <AlertTriangle size={18} style={{ color: 'var(--accent-red)' }} />;
      default: return <AlertCircle size={18} style={{ color: 'var(--text-muted)' }} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CONSISTENT': return 'var(--accent-emerald)';
      case 'MINOR_VARIANCE': return 'var(--accent-blue)';
      case 'CONFLICTING': return 'var(--accent-red)';
      default: return 'var(--text-muted)';
    }
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1 className="page-title">
            <ShieldCheck size={24} style={{ color: 'var(--accent-purple)' }} />
            Consistency Audit
          </h1>
          <p className="page-subtitle">Automatically detect greenwashing and cross-modal data discrepancies.</p>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px' }}>
        
        {/* Sidebar: Report Selection */}
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card-header">
            <h2 className="card-title">Select Report</h2>
          </div>
          <div className="card-content" style={{ padding: '0 20px 20px' }}>
            {loading ? (
              <p style={{ color: 'var(--text-muted)' }}>Loading reports...</p>
            ) : reports.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No processed reports available.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {reports.map(report => (
                  <button
                    key={report.id}
                    onClick={() => setSelectedReport(report.id)}
                    style={{ 
                      display: 'flex', 
                      flexDirection: 'column',
                      alignItems: 'flex-start', 
                      padding: '12px 16px',
                      backgroundColor: selectedReport === report.id ? 'var(--bg-card)' : 'transparent',
                      border: selectedReport === report.id ? '1px solid var(--accent-purple)' : '1px solid var(--border-color)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <span style={{ fontWeight: selectedReport === report.id ? 600 : 400 }}>
                      {report.company_name || report.title}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      FY {report.fiscal_year || 'N/A'} • {report.file_name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Content: Audit Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {analyzing ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
              Running cross-modal consistency checks...
            </div>
          ) : auditData.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No consistency data found for this report. (Try a report with tables and charts).
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Summary stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                <div className="card" style={{ padding: '20px', textAlign: 'center', borderTop: '3px solid var(--accent-emerald)' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-emerald)' }}>
                    {auditData.filter(d => d.status === 'CONSISTENT').length}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Consistent</div>
                </div>
                <div className="card" style={{ padding: '20px', textAlign: 'center', borderTop: '3px solid var(--accent-blue)' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-blue)' }}>
                    {auditData.filter(d => d.status === 'MINOR_VARIANCE').length}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Variances</div>
                </div>
                <div className="card" style={{ padding: '20px', textAlign: 'center', borderTop: '3px solid var(--accent-red)' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent-red)' }}>
                    {auditData.filter(d => d.status === 'CONFLICTING').length}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Conflicts</div>
                </div>
              </div>

              {/* Detail List */}
              {auditData.map((item, idx) => (
                <div key={idx} className="card" style={{ borderLeft: `4px solid ${getStatusColor(item.status)}` }}>
                  <div className="card-header" style={{ paddingBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ fontSize: 16, fontWeight: 600 }}>{item.kpi_name}</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: getStatusColor(item.status), backgroundColor: 'var(--bg-secondary)', padding: '4px 10px', borderRadius: '16px' }}>
                        {getStatusIcon(item.status)}
                        {item.status.replace('_', ' ')}
                      </div>
                    </div>
                  </div>
                  
                  <div className="card-content" style={{ padding: '0 20px 20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', backgroundColor: 'var(--bg-secondary)', padding: '16px', borderRadius: '8px' }}>
                      
                      {/* Source A */}
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                          Primary Extraction (e.g. Text)
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 600 }}>{item.values[0]?.value} {item.values[0]?.unit}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: '4px' }}>
                          Source Node: {item.values[0]?.node_id || 'Unknown'}
                        </div>
                      </div>

                      {/* Source B */}
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                          Secondary Extraction (e.g. Table/Chart)
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 600 }}>{item.values[1]?.value} {item.values[1]?.unit}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: '4px' }}>
                          Source Node: {item.values[1]?.node_id || 'Unknown'}
                        </div>
                      </div>

                    </div>
                    
                    {item.explanation && (
                      <div style={{ marginTop: '16px', fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.5, borderLeft: '2px solid var(--border-color)', paddingLeft: '12px' }}>
                        {item.explanation}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
