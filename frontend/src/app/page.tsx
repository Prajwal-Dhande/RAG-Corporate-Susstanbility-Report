'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload, FileText, Clock, CheckCircle, XCircle, Loader2,
  ChevronRight, Building2, Calendar, Layers, GitBranch, Target
} from 'lucide-react';
import { uploadReport, getReports, getReportStatus, Report } from '@/lib/api';

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [fiscalYear, setFiscalYear] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const fetchReports = useCallback(async () => {
    try {
      const data = await getReports();
      setReports(data);
    } catch { /* empty */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  // Poll processing reports
  useEffect(() => {
    const processing = reports.filter(r =>
      !['completed', 'failed'].includes(r.status)
    );
    if (processing.length === 0) return;
    const interval = setInterval(fetchReports, 3000);
    return () => clearInterval(interval);
  }, [reports, fetchReports]);

  const handleUpload = async (file: File) => {
    if (!companyName.trim()) {
      setError('Please enter a company name');
      return;
    }
    setError('');
    setUploading(true);
    try {
      await uploadReport(
        file,
        companyName.trim(),
        fiscalYear ? parseInt(fiscalYear) : undefined
      );
      setCompanyName('');
      setFiscalYear('');
      await fetchReports();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally { setUploading(false); }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') handleUpload(file);
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle size={16} style={{ color: 'var(--status-success)' }} />;
      case 'failed': return <XCircle size={16} style={{ color: 'var(--status-error)' }} />;
      default: return <Loader2 size={16} className="spinner" style={{ color: 'var(--accent-blue)' }} />;
    }
  };

  const statusBadge = (status: string) => {
    const cls = status === 'completed' ? 'badge-success' :
                status === 'failed' ? 'badge-error' : 'badge-info';
    return <span className={`badge ${cls}`}>{statusIcon(status)} {status}</span>;
  };

  return (
    <div className="animate-in">
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 6 }}>
          Sustainability Reports
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
          Upload and process corporate sustainability reports for automated analysis
        </p>
      </div>

      {/* Upload Zone */}
      <div className="card" style={{ padding: 28, marginBottom: 32 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Upload size={18} /> Upload New Report
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>
              Company Name *
            </label>
            <input
              className="input"
              placeholder="e.g., Tesla, Microsoft, Apple"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>
              Fiscal Year
            </label>
            <input
              className="input"
              placeholder="e.g., 2024"
              type="number"
              value={fiscalYear}
              onChange={e => setFiscalYear(e.target.value)}
            />
          </div>
        </div>

        <div
          className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.pdf';
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) handleUpload(file);
            };
            input.click();
          }}
        >
          {uploading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div className="spinner" style={{ width: 32, height: 32 }} />
              <span style={{ color: 'var(--text-secondary)' }}>Uploading and processing...</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <Upload size={36} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontWeight: 600 }}>Drop PDF here or click to browse</span>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Sustainability, ESG, or CSR reports (max 200 MB)
              </span>
            </div>
          )}
        </div>

        {error && (
          <div style={{ marginTop: 12, color: 'var(--status-error)', fontSize: 13 }}>
            {error}
          </div>
        )}
      </div>

      {/* Reports List */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={18} /> Processed Reports
          </h2>
          <span className="badge badge-neutral">{reports.length} reports</span>
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 12px', width: 28, height: 28 }} />
            <span style={{ color: 'var(--text-secondary)' }}>Loading reports...</span>
          </div>
        ) : reports.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            No reports yet. Upload a sustainability PDF to get started.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Report</th>
                <th>Company</th>
                <th>Year</th>
                <th>Pages</th>
                <th>Entities</th>
                <th>KPIs</th>
                <th>Targets</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {reports.map(report => (
                <tr
                  key={report.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    if (report.status === 'completed') router.push(`/dashboard?id=${report.id}`);
                  }}
                >
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <FileText size={16} style={{ color: 'var(--accent-blue)' }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{report.title}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {report.file_size_bytes ? `${(report.file_size_bytes / 1024 / 1024).toFixed(1)} MB` : ''}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Building2 size={14} style={{ color: 'var(--text-muted)' }} />
                      {report.company_name || '—'}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
                      {report.fiscal_year || '—'}
                    </div>
                  </td>
                  <td>{report.page_count || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Layers size={14} style={{ color: 'var(--accent-violet)' }} />
                      {report.entity_count}
                    </div>
                  </td>
                  <td>{report.kpi_count}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Target size={14} style={{ color: 'var(--accent-amber)' }} />
                      {report.target_count}
                    </div>
                  </td>
                  <td>{statusBadge(report.status)}</td>
                  <td>
                    {!['completed', 'failed'].includes(report.status) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ width: 100 }}>
                          <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${(report.processing_progress || 0) * 100}%` }} />
                          </div>
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          {report.processing_message || 'Processing...'}
                        </span>
                      </div>
                    )}
                    {report.status === 'completed' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
