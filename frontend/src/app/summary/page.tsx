'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { getReports, getExecutiveSummary, getExportCSVUrl, Report } from '@/lib/api';
import { FileBarChart, AlertCircle, RefreshCw, Download, Info, Award, ShieldCheck, CheckCircle, AlertTriangle } from 'lucide-react';

function SummaryContent() {
  const searchParams = useSearchParams();
  const paramReportId = searchParams.get('id');

  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<string>('');
  const [summaryData, setSummaryData] = useState<any>(null);
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
    if (selectedReport) fetchSummary();
  }, [selectedReport]);

  async function fetchSummary() {
    try {
      setAnalyzing(true);
      const data = await getExecutiveSummary(selectedReport);
      setSummaryData(data);
    } catch { /* empty */ }
    finally { setAnalyzing(false); }
  }

  const getSectionIcon = (type: string) => {
    switch (type) {
      case 'info': return <Info size={20} style={{ color: 'var(--accent-blue)' }} />;
      case 'score': return <Award size={20} style={{ color: '#f59e0b' }} />;
      case 'compliance': return <ShieldCheck size={20} style={{ color: 'var(--accent-purple)' }} />;
      case 'positive': return <CheckCircle size={20} style={{ color: 'var(--accent-emerald)' }} />;
      case 'warning': return <AlertTriangle size={20} style={{ color: 'var(--accent-red)' }} />;
      default: return <Info size={20} style={{ color: 'var(--text-muted)' }} />;
    }
  };

  const getSectionBorderColor = (type: string) => {
    switch (type) {
      case 'info': return 'var(--accent-blue)';
      case 'score': return '#f59e0b';
      case 'compliance': return 'var(--accent-purple)';
      case 'positive': return 'var(--accent-emerald)';
      case 'warning': return 'var(--accent-red)';
      default: return 'var(--border-color)';
    }
  };

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
            <FileBarChart size={24} style={{ color: 'var(--accent-blue)' }} />
            Executive Summary
          </h1>
          <p className="page-subtitle">AI-generated summary of key findings, ESG performance, and recommendations.</p>
        </div>
        {selectedReport && (
          <a
            href={getExportCSVUrl(selectedReport)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: '8px',
              backgroundColor: 'var(--accent-emerald)', color: '#fff',
              fontWeight: 600, fontSize: 14, textDecoration: 'none',
              transition: 'opacity 0.2s',
            }}
            onMouseOver={e => (e.currentTarget.style.opacity = '0.85')}
            onMouseOut={e => (e.currentTarget.style.opacity = '1')}
          >
            <Download size={16} />
            Export CSV
          </a>
        )}
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
                  border: selectedReport === r.id ? '1px solid var(--accent-blue)' : '1px solid var(--border-color)',
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
              Generating Executive Summary...
            </div>
          ) : !summaryData ? (
            <div className="card" style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
              Select a report to generate its executive summary.
            </div>
          ) : (
            <>
              {/* Header Card */}
              <div className="card" style={{ padding: '28px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>
                    {summaryData.company_name}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>
                    FY {summaryData.fiscal_year || 'N/A'} Sustainability Report Analysis
                  </div>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 24px', borderRadius: '12px',
                  background: `${gradeColor(summaryData.esg_grade)}15`,
                  border: `1px solid ${gradeColor(summaryData.esg_grade)}30`,
                }}>
                  <div style={{ fontSize: 36, fontWeight: 800, color: gradeColor(summaryData.esg_grade) }}>
                    {summaryData.esg_grade}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ESG Score</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{summaryData.esg_score}/100</div>
                  </div>
                </div>
              </div>

              {/* Summary Sections */}
              {summaryData.sections?.map((section: any, idx: number) => (
                <div key={idx} className="card" style={{ borderLeft: `4px solid ${getSectionBorderColor(section.type)}` }}>
                  <div style={{ padding: '20px 24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      {getSectionIcon(section.type)}
                      <h3 style={{ fontSize: 16, fontWeight: 700 }}>{section.title}</h3>
                    </div>
                    <p style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
                      {section.content}
                    </p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SummaryPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>}>
      <SummaryContent />
    </Suspense>
  );
}
