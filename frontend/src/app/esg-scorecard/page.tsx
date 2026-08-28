'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getReports, getESGScore, Report } from '@/lib/api';
import { Award, AlertCircle, RefreshCw } from 'lucide-react';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';

function ESGContent() {
  const searchParams = useSearchParams();
  const paramReportId = searchParams.get('id');

  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<string>('');
  const [esgData, setEsgData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    loadReports();
  }, []);

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
    if (selectedReport) fetchScore();
  }, [selectedReport]);

  async function fetchScore() {
    try {
      setAnalyzing(true);
      const data = await getESGScore(selectedReport);
      setEsgData(data);
    } catch { /* empty */ }
    finally { setAnalyzing(false); }
  }

  const radarData = esgData ? [
    { subject: 'Environmental', score: esgData.environmental?.score || 0, fullMark: 100 },
    { subject: 'Social', score: esgData.social?.score || 0, fullMark: 100 },
    { subject: 'Governance', score: esgData.governance?.score || 0, fullMark: 100 },
  ] : [];

  const gradeColor = (grade: string) => {
    if (grade?.startsWith('A')) return '#10b981';
    if (grade?.startsWith('B')) return '#3b82f6';
    if (grade?.startsWith('C')) return '#f59e0b';
    return '#f43f5e';
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1 className="page-title">
            <Award size={24} style={{ color: '#f59e0b' }} />
            ESG Score Card
          </h1>
          <p className="page-subtitle">Automated ESG compliance scoring across Environmental, Social, and Governance dimensions.</p>
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
                  border: selectedReport === r.id ? '1px solid #f59e0b' : '1px solid var(--border-color)',
                }}>
                  <div style={{ fontWeight: selectedReport === r.id ? 600 : 400, fontSize: 14 }}>{r.company_name || r.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>FY {r.fiscal_year || 'N/A'}</div>
                </button>
              ))}
            </div>}
          </div>
        </div>

        {/* Main */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {analyzing ? (
            <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
              Computing ESG Score...
            </div>
          ) : !esgData ? (
            <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Select a report to view its ESG Score Card.
            </div>
          ) : (
            <>
              {/* Grade + Radar */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                {/* Grade Card */}
                <div className="card" style={{ padding: '32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '16px' }}>Overall ESG Grade</div>
                  <div style={{
                    width: 120, height: 120, borderRadius: '50%',
                    border: `4px solid ${gradeColor(esgData.grade)}`,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    background: `${gradeColor(esgData.grade)}15`,
                  }}>
                    <div style={{ fontSize: 48, fontWeight: 800, color: gradeColor(esgData.grade), lineHeight: 1 }}>{esgData.grade}</div>
                    <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>{esgData.overall_score}/100</div>
                  </div>
                  <div style={{ marginTop: '20px', fontSize: 14, color: 'var(--text-secondary)' }}>
                    Coverage: {esgData.coverage_percent}% of indicators
                  </div>
                </div>

                {/* Radar Chart */}
                <div className="card" style={{ padding: '24px' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Dimension Breakdown</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="var(--border-color)" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-secondary)', fontSize: 13 }} />
                      <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                      <Tooltip contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', borderRadius: '8px' }} />
                      <Radar name="Score" dataKey="score" stroke="#6c3bff" fill="#6c3bff" fillOpacity={0.3} strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Dimension Details */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                {['environmental', 'social', 'governance'].map(dim => {
                  const d = esgData[dim];
                  if (!d) return null;
                  const colors: any = { environmental: '#10b981', social: '#3b82f6', governance: '#8b5cf6' };
                  return (
                    <div key={dim} className="card" style={{ borderTop: `3px solid ${colors[dim]}` }}>
                      <div className="card-header">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <h3 style={{ fontSize: 15, fontWeight: 700, textTransform: 'capitalize' }}>{dim}</h3>
                          <span style={{ fontSize: 20, fontWeight: 800, color: colors[dim] }}>{d.score}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                          {d.indicators_found}/{d.indicators_total} indicators found
                        </div>
                      </div>
                      <div className="card-content" style={{ padding: '0 20px 20px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {d.details?.map((item: any) => (
                            <div key={item.id} style={{
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '6px 10px', borderRadius: '6px',
                              backgroundColor: item.found ? `${colors[dim]}10` : 'var(--bg-secondary)',
                            }}>
                              <span style={{ fontSize: 13, fontWeight: item.found ? 500 : 400 }}>{item.name}</span>
                              <span style={{
                                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: '12px',
                                backgroundColor: item.found ? `${colors[dim]}20` : 'transparent',
                                color: item.found ? colors[dim] : 'var(--text-muted)',
                              }}>
                                {item.found ? '✓ Found' : '✗ Missing'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ESGScoreCardPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>}>
      <ESGContent />
    </Suspense>
  );
}
