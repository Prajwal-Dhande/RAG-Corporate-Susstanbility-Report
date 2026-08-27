'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Target, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, Clock, ArrowRight } from 'lucide-react';
import { getReport, analyzeTargetProgress, getTargets, Report, TargetResult } from '@/lib/api';

function TargetContent() {
  const searchParams = useSearchParams();
  const reportId = searchParams.get('id');

  const [report, setReport] = useState<Report | null>(null);
  const [analysisResults, setAnalysisResults] = useState<TargetResult[]>([]);
  const [rawTargets, setRawTargets] = useState<{ targets: { id: string; name: string; description: string; kpi_name: string; confidence: number; page_numbers: number[]; properties: Record<string, unknown> }[]; count: number }>({ targets: [], count: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [expandedTarget, setExpandedTarget] = useState<number | null>(null);

  useEffect(() => {
    if (!reportId) { setLoading(false); return; }
    (async () => {
      try {
        const [r, t] = await Promise.all([
          getReport(reportId),
          getTargets(reportId),
        ]);
        setReport(r);
        setRawTargets(t);
      } catch { /* empty */ }
      finally { setLoading(false); }
    })();
  }, [reportId]);

  const runAnalysis = async () => {
    if (!reportId) return;
    setAnalyzing(true);
    try {
      const data = await analyzeTargetProgress(reportId);
      setAnalysisResults(data.results || []);
    } catch { /* empty */ }
    finally { setAnalyzing(false); }
  };

  const statusColor = (status?: string) => {
    switch (status) {
      case 'achieved': return 'var(--status-success)';
      case 'on_track': return '#22c55e';
      case 'behind': return 'var(--status-warning)';
      case 'not_started': return 'var(--text-muted)';
      default: return 'var(--text-secondary)';
    }
  };

  const statusIcon = (status?: string) => {
    switch (status) {
      case 'achieved': return <CheckCircle size={16} style={{ color: statusColor(status) }} />;
      case 'on_track': return <CheckCircle size={16} style={{ color: statusColor(status) }} />;
      case 'behind': return <AlertTriangle size={16} style={{ color: statusColor(status) }} />;
      default: return <Clock size={16} style={{ color: statusColor(status) }} />;
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>;
  }

  if (!reportId || !report) {
    return (
      <div className="animate-in" style={{ textAlign: 'center', padding: '80px 0' }}>
        <Target size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No Report Selected</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Select a processed report to analyze targets.</p>
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 4 }}>
            Target Analysis
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {report.company_name} — Sustainability target progress assessment
          </p>
        </div>
        <button className="btn btn-primary" onClick={runAnalysis} disabled={analyzing}>
          {analyzing ? <><div className="spinner" /> Analyzing...</> : <><Target size={16} /> Run Target Analysis</>}
        </button>
      </div>

      {/* Raw targets table */}
      <div className="card" style={{ overflow: 'hidden', marginBottom: 28 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>Extracted Targets</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {rawTargets.count} targets found in the knowledge graph
          </span>
        </div>
        {rawTargets.targets.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Target</th>
                <th>Related KPI</th>
                <th>Confidence</th>
                <th>Source Pages</th>
              </tr>
            </thead>
            <tbody>
              {rawTargets.targets.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.name}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{t.kpi_name || '—'}</td>
                  <td>
                    <span style={{ fontSize: 13, color: t.confidence >= 0.7 ? 'var(--status-success)' : 'var(--status-warning)' }}>
                      {((t.confidence || 0) * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {t.page_numbers?.map(p => p + 1).join(', ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            No targets found. Process a report with target commitments.
          </div>
        )}
      </div>

      {/* Analysis Results */}
      {analysisResults.length > 0 && (
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>Target Progress Analysis</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Deterministic gap analysis with reasoning paths
            </span>
          </div>

          {analysisResults.map((result, idx) => (
            <div key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div
                style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, transition: 'background 0.15s' }}
                onClick={() => setExpandedTarget(expandedTarget === idx ? null : idx)}
                onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
              >
                {statusIcon(result.conclusion.status)}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{result.conclusion.target_name || `Target ${idx + 1}`}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {result.conclusion.kpi_name ? `KPI: ${result.conclusion.kpi_name}` : ''}
                    {result.conclusion.gap !== null && result.conclusion.gap !== undefined ? ` • Gap: ${result.conclusion.gap}` : ''}
                  </div>
                </div>
                <span className={`badge ${result.conclusion.status === 'achieved' || result.conclusion.status === 'on_track' ? 'badge-success' : result.conclusion.status === 'behind' ? 'badge-warning' : 'badge-neutral'}`}>
                  {result.conclusion.status || 'unknown'}
                </span>
                {expandedTarget === idx ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </div>

              {expandedTarget === idx && (
                <div style={{ padding: '0 20px 20px', background: 'var(--bg-secondary)' }}>
                  {/* Conclusion Summary */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
                    {[
                      { label: 'Target Value', value: result.conclusion.target_value },
                      { label: 'Baseline', value: result.conclusion.baseline_value },
                      { label: 'Current Value', value: result.conclusion.current_value },
                      { label: 'Gap', value: result.conclusion.gap },
                    ].map(item => (
                      <div key={item.label} style={{ background: 'var(--bg-card)', padding: 14, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4 }}>{item.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>
                          {item.value !== null && item.value !== undefined ? item.value : '—'}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Reasoning Path */}
                  {result.reasoning_path.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Reasoning Path
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {result.reasoning_path.map((step, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                            <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent-blue-glow)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                              {step.step}
                            </span>
                            <span style={{ fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 10, minWidth: 60 }}>
                              {step.action}
                            </span>
                            <span>{step.description}</span>
                            {i < result.reasoning_path.length - 1 && (
                              <ArrowRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Evidence Pages */}
                  {result.evidence_pages.length > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      <strong>Supporting Evidence:</strong> Pages {result.evidence_pages.map(p => p + 1).join(', ')}
                    </div>
                  )}

                  {/* Warnings */}
                  {result.warnings.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {result.warnings.map((w, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--status-warning)' }}>
                          <AlertTriangle size={12} /> {w}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TargetsPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>}>
      <TargetContent />
    </Suspense>
  );
}
