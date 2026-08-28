'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getReports, getRegulatoryMapping, Report } from '@/lib/api';
import { Scale, AlertCircle, RefreshCw, CheckCircle, XCircle } from 'lucide-react';

function RegulatoryContent() {
  const searchParams = useSearchParams();
  const paramReportId = searchParams.get('id');

  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<string>('');
  const [regData, setRegData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => { loadReports(); }, []);

  async function loadReports() {
    try {
      setLoading(true);
      const data = await getReports();
      const processed = data.filter(r => r.status === 'completed');
      setReports(processed);
      const initial = paramReportId || (processed.length > 0 ? processed[0].id : '');
      setSelectedReport(initial);
    } catch { /* empty */ }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (selectedReport) fetchMapping();
  }, [selectedReport]);

  async function fetchMapping() {
    try {
      setAnalyzing(true);
      const data = await getRegulatoryMapping(selectedReport);
      setRegData(data);
    } catch { /* empty */ }
    finally { setAnalyzing(false); }
  }

  const fwColors: Record<string, string> = {
    GRI: '#10b981',
    SASB: '#3b82f6',
    TCFD: '#8b5cf6',
    EU_TAXONOMY: '#f59e0b',
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1 className="page-title">
            <Scale size={24} style={{ color: 'var(--accent-purple)' }} />
            Regulatory Framework Compliance
          </h1>
          <p className="page-subtitle">Map your sustainability disclosures against GRI, SASB, TCFD, and EU Taxonomy standards.</p>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px' }}>
        {/* Sidebar */}
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card-header"><h2 className="card-title">Select Report</h2></div>
          <div className="card-content" style={{ padding: '0 20px 20px' }}>
            {loading ? <p style={{ color: 'var(--text-muted)' }}>Loading...</p> :
            reports.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>No reports available.</p> :
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {reports.map(r => (
                <button key={r.id} onClick={() => setSelectedReport(r.id)} style={{
                  padding: '10px 14px', borderRadius: '8px', textAlign: 'left', cursor: 'pointer',
                  backgroundColor: selectedReport === r.id ? 'var(--bg-card)' : 'transparent',
                  border: selectedReport === r.id ? '1px solid var(--accent-purple)' : '1px solid var(--border-color)',
                }}>
                  <div style={{ fontWeight: selectedReport === r.id ? 600 : 400, fontSize: 14 }}>{r.company_name || r.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>FY {r.fiscal_year || 'N/A'}</div>
                </button>
              ))}
            </div>}
          </div>
        </div>

        {/* Main */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {analyzing ? (
            <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
              Mapping against regulatory frameworks...
            </div>
          ) : !regData?.frameworks ? (
            <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Select a report to check regulatory compliance.
            </div>
          ) : (
            <>
              {/* Overview Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                {regData.frameworks.map((fw: any) => {
                  const color = fwColors[fw.framework_id] || 'var(--text-muted)';
                  return (
                    <div key={fw.framework_id} className="card" style={{ padding: '20px', textAlign: 'center', borderTop: `3px solid ${color}` }}>
                      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 8 }}>
                        {fw.framework_id.replace('_', ' ')}
                      </div>
                      <div style={{ fontSize: 32, fontWeight: 800, color }}>{fw.coverage_percent}%</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                        {fw.indicators_covered}/{fw.indicators_total} indicators
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Detail Cards for each Framework */}
              {regData.frameworks.map((fw: any) => {
                const color = fwColors[fw.framework_id] || 'var(--text-muted)';
                return (
                  <div key={fw.framework_id} className="card">
                    <div className="card-header" style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <h3 style={{ fontSize: 16, fontWeight: 700 }}>{fw.framework_name}</h3>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                            {fw.indicators_covered} of {fw.indicators_total} indicators covered
                          </div>
                        </div>
                        <div style={{
                          fontSize: 14, fontWeight: 700, color,
                          padding: '6px 14px', borderRadius: '20px',
                          background: `${color}15`,
                        }}>
                          {fw.coverage_percent}%
                        </div>
                      </div>
                      {/* Progress Bar */}
                      <div style={{ marginTop: 12, height: 6, backgroundColor: 'var(--bg-secondary)', borderRadius: 3 }}>
                        <div style={{ height: '100%', width: `${fw.coverage_percent}%`, backgroundColor: color, borderRadius: 3, transition: 'width 0.5s' }} />
                      </div>
                    </div>
                    <div className="card-content" style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                        {fw.indicators.map((ind: any) => (
                          <div key={ind.code} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '10px 14px', borderRadius: '8px',
                            backgroundColor: ind.covered ? `${color}08` : 'var(--bg-secondary)',
                            border: ind.covered ? `1px solid ${color}30` : '1px solid transparent',
                          }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500 }}>
                                <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>{ind.code}</span>
                                {ind.name}
                              </div>
                              {ind.covered && ind.matched_entities?.length > 0 && (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                                  Matched: {ind.matched_entities.slice(0, 2).join(', ')}
                                </div>
                              )}
                            </div>
                            {ind.covered ?
                              <CheckCircle size={16} style={{ color, flexShrink: 0 }} /> :
                              <XCircle size={16} style={{ color: 'var(--text-muted)', flexShrink: 0, opacity: 0.4 }} />
                            }
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RegulatoryPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>}>
      <RegulatoryContent />
    </Suspense>
  );
}
