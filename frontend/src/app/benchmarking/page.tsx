'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { getReports, getBenchmarkData, uploadReport, Report } from '@/lib/api';
import { BarChart2, AlertCircle, RefreshCw, Play, TrendingUp, TrendingDown, Upload, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useSearchParams } from 'next/navigation';

export default function BenchmarkingPage() {
  const searchParams = useSearchParams();
  const initialId = searchParams.get('id');

  const [reports, setReports] = useState<Report[]>([]);
  const [baseReportId, setBaseReportId] = useState<string>(initialId || '');
  const [compareReportId, setCompareReportId] = useState<string>('');
  
  const [selectedKpi, setSelectedKpi] = useState('GHG Emissions');
  const [selectedScope, setSelectedScope] = useState('All Scopes');
  
  const [generatedData, setGeneratedData] = useState<any[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);

  // Upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const fetchReports = useCallback(async () => {
    try {
      const data = await getReports();
      setReports(data);
      // Auto-set base report if none selected
      if (!baseReportId) {
        const completed = data.filter(r => r.status === 'completed');
        if (completed.length > 0) setBaseReportId(completed[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load reports');
    }
  }, [baseReportId]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Poll if any report is processing
  useEffect(() => {
    const processing = reports.filter(r => !['completed', 'failed'].includes(r.status));
    if (processing.length === 0) return;
    const interval = setInterval(fetchReports, 3000);
    return () => clearInterval(interval);
  }, [reports, fetchReports]);

  const baseReport = reports.find(r => r.id === baseReportId);
  const compareReport = reports.find(r => r.id === compareReportId);

  // Filter available comparison reports to be the same company, different year
  const availableCompareReports = useMemo(() => {
    if (!baseReport) return [];
    return reports.filter(r => r.company_name === baseReport.company_name && r.id !== baseReport.id);
  }, [baseReport, reports]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !baseReport) return;
    
    const yearStr = prompt(`Enter Fiscal Year for this new report of ${baseReport.company_name}:`, "2024");
    if (!yearStr) return;
    
    try {
      setUploading(true);
      await uploadReport(file, baseReport.company_name, parseInt(yearStr));
      await fetchReports();
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  async function handleGenerate() {
    if (!baseReportId || !compareReportId) return;
    try {
      setAnalyzing(true);
      setHasGenerated(true);
      const data = await getBenchmarkData([baseReportId, compareReportId]);
      if (data && data.results) {
        setGeneratedData(data.results);
      }
    } catch (err: any) {
      console.error(err);
      setError('Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }

  // Process data for side-by-side charts
  const displayData = useMemo(() => {
    let filtered = generatedData;
    
    // Simple mock filter based on KPI type
    if (selectedKpi === 'GHG Emissions') {
       filtered = generatedData.filter(d => 
         d.kpi_name.toLowerCase().includes('scope') || 
         d.kpi_name.toLowerCase().includes('ghg') || 
         d.kpi_name.toLowerCase().includes('emission')
       );
       if (selectedScope !== 'All Scopes') {
         filtered = filtered.filter(d => d.kpi_name.toLowerCase().includes(selectedScope.toLowerCase()));
       }
    } else if (selectedKpi === 'Energy Consumption') {
       filtered = generatedData.filter(d => 
         d.kpi_name.toLowerCase().includes('energy') || 
         d.kpi_name.toLowerCase().includes('electricity')
       );
    } else if (selectedKpi === 'Water Usage') {
       filtered = generatedData.filter(d => d.kpi_name.toLowerCase().includes('water'));
    }

    const baseName = baseReport ? `${baseReport.company_name} (FY ${baseReport.fiscal_year})` : 'Base';
    const compareName = compareReport ? `${compareReport.company_name} (FY ${compareReport.fiscal_year})` : 'Compare';

    const baseChart = filtered.map(d => ({
      name: d.kpi_name,
      value: d.companies[baseName]?.value || 0,
      unit: d.unit
    }));

    const compareChart = filtered.map(d => ({
      name: d.kpi_name,
      value: d.companies[compareName]?.value || 0,
      unit: d.unit
    }));

    return { baseChart, compareChart, filtered, baseName, compareName };
  }, [generatedData, selectedKpi, selectedScope, baseReport, compareReport]);

  const targetSummary = useMemo(() => {
    if (!hasGenerated || generatedData.length === 0) return null;
    let totalBase = 0;
    let totalCompare = 0;
    
    displayData.filtered.forEach(d => {
      totalBase += (d.companies[displayData.baseName]?.value || 0);
      totalCompare += (d.companies[displayData.compareName]?.value || 0);
    });

    if (totalBase === 0) return { text: "No baseline data available for comparison.", isGood: false, pct: 0, direction: "N/A" };
    
    const diff = totalCompare - totalBase;
    const pct = (diff / totalBase) * 100;
    
    // Logic: for GHG/Energy/Water, decrease is usually good
    const isGood = diff <= 0;
    
    return {
       direction: diff > 0 ? "Increased" : "Decreased",
       pct: Math.abs(pct).toFixed(1),
       isGood,
       text: `Total ${selectedKpi} have ${diff > 0 ? 'increased' : 'decreased'} by ${Math.abs(pct).toFixed(1)}% between FY ${baseReport?.fiscal_year} and FY ${compareReport?.fiscal_year}.`
    };
  }, [displayData, baseReport, compareReport, generatedData, hasGenerated, selectedKpi]);

  // Only allow completed base reports
  const completedReports = reports.filter(r => r.status === 'completed');

  return (
    <div className="page-container" style={{ maxWidth: '1400px' }}>
      <header className="page-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">
            <BarChart2 size={24} style={{ color: 'var(--accent-blue)' }} />
            Year-over-Year Report Benchmarking
          </h1>
          <p className="page-subtitle">Compare performance metrics of the same organization across different fiscal years.</p>
        </div>
      </header>

      {error && (
        <div className="error-banner" style={{ marginBottom: '20px' }}>
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* TOP CONTROL PANEL */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-content" style={{ padding: '20px', display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
              Base Report (Year 1)
            </label>
            <select 
              value={baseReportId} 
              onChange={e => {
                setBaseReportId(e.target.value);
                setCompareReportId(''); // reset comparison
                setHasGenerated(false);
              }}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            >
              <option value="" disabled>Select Base Report...</option>
              {completedReports.map(r => (
                <option key={r.id} value={r.id}>
                  {r.company_name} - FY {r.fiscal_year}
                </option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: '200px', display: 'flex', flexDirection: 'column' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
              <span>Comparison Report (Year 2)</span>
              {baseReportId && (
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', fontSize: 12, cursor: uploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  {uploading ? <Loader2 size={12} className="spin"/> : <Upload size={12}/>}
                  Upload New
                </button>
              )}
            </label>
            <select 
              value={compareReportId} 
              onChange={e => {
                setCompareReportId(e.target.value);
                setHasGenerated(false);
              }}
              disabled={!baseReportId || availableCompareReports.length === 0}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', opacity: (!baseReportId || availableCompareReports.length === 0) ? 0.5 : 1 }}
            >
              <option value="" disabled>
                {availableCompareReports.length === 0 ? 'No other years available for this company' : 'Select Target Year...'}
              </option>
              {availableCompareReports.map(r => (
                <option key={r.id} value={r.id} disabled={r.status !== 'completed'}>
                  {r.company_name} - FY {r.fiscal_year} {r.status !== 'completed' ? `(Processing...)` : ''}
                </option>
              ))}
            </select>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept="application/pdf" 
              onChange={handleFileUpload} 
            />
          </div>

          <div style={{ width: '180px' }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
              KPI Category
            </label>
            <select 
              value={selectedKpi} 
              onChange={e => setSelectedKpi(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            >
              <option value="GHG Emissions">GHG Emissions</option>
              <option value="Energy Consumption">Energy Consumption</option>
              <option value="Water Usage">Water Usage</option>
            </select>
          </div>

          <div style={{ width: '180px' }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
              Analysis Scope
            </label>
            <select 
              value={selectedScope} 
              onChange={e => setSelectedScope(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            >
              <option value="All Scopes">All Scopes</option>
              <option value="Scope 1">Scope 1 Only</option>
              <option value="Scope 2">Scope 2 Only</option>
              <option value="Scope 3">Scope 3 Only</option>
            </select>
          </div>

          <button 
            onClick={handleGenerate}
            disabled={!baseReportId || !compareReportId || analyzing}
            style={{ 
              height: '42px',
              padding: '0 24px', 
              backgroundColor: (!baseReportId || !compareReportId) ? 'var(--border-color)' : 'var(--accent-blue)', 
              color: '#fff', 
              border: 'none', 
              borderRadius: '8px', 
              fontWeight: 600,
              cursor: (!baseReportId || !compareReportId || analyzing) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
          >
            {analyzing ? <RefreshCw size={18} className="spin" /> : <Play size={18} />}
            Generate Report
          </button>
        </div>
      </div>

      {/* GRAPHS SECTION (Side by Side) */}
      {hasGenerated && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
          
          {/* Base Year Graph */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">FY {baseReport?.fiscal_year} Performance</h2>
            </div>
            <div className="card-content" style={{ height: '350px', padding: '20px' }}>
              {displayData.baseChart.length === 0 || !displayData.baseChart.some(d => d.value > 0) ? (
                 <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--status-error)', fontWeight: 500, textAlign: 'center', padding: '0 20px' }}>
                   No data extracted for {selectedKpi} in the FY {baseReport?.fiscal_year} report.
                 </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={displayData.baseChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickMargin={10} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} tickFormatter={v => v.toLocaleString()} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', borderRadius: '8px' }}
                      itemStyle={{ color: '#fff' }}
                      formatter={(val: any) => [val.toLocaleString(), 'Value']}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={80}>
                       {displayData.baseChart.map((entry, index) => (
                         <Cell key={`cell-${index}`} fill="var(--accent-violet)" />
                       ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Compare Year Graph */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">FY {compareReport?.fiscal_year} Performance</h2>
            </div>
            <div className="card-content" style={{ height: '350px', padding: '20px' }}>
              {displayData.compareChart.length === 0 || !displayData.compareChart.some(d => d.value > 0) ? (
                 <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--status-error)', fontWeight: 500, textAlign: 'center', padding: '0 20px' }}>
                   No data extracted for {selectedKpi} in the FY {compareReport?.fiscal_year} report.
                 </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={displayData.compareChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickMargin={10} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} tickFormatter={v => v.toLocaleString()} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', borderRadius: '8px' }}
                      itemStyle={{ color: '#fff' }}
                      formatter={(val: any) => [val.toLocaleString(), 'Value']}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={80}>
                       {displayData.compareChart.map((entry, index) => (
                         <Cell key={`cell-${index}`} fill={targetSummary?.isGood ? "var(--accent-emerald)" : "var(--status-error)"} />
                       ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TARGET SUMMARY SECTION */}
      {hasGenerated && targetSummary && (
        <div className="card" style={{ borderLeft: `4px solid ${targetSummary.isGood ? 'var(--accent-emerald)' : 'var(--status-error)'}` }}>
          <div className="card-content" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ padding: '16px', borderRadius: '50%', backgroundColor: targetSummary.isGood ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)' }}>
               {targetSummary.isGood ? (
                  <TrendingDown size={32} style={{ color: 'var(--accent-emerald)' }} />
               ) : (
                  <TrendingUp size={32} style={{ color: 'var(--status-error)' }} />
               )}
            </div>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                Target Summary: {selectedKpi}
              </h3>
              <p style={{ fontSize: 16, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                {targetSummary.text} 
                {targetSummary.pct !== '0.0' && targetSummary.pct !== '0' && (
                   <span style={{ 
                     display: 'inline-block', 
                     marginLeft: 10,
                     padding: '2px 10px', 
                     borderRadius: '12px', 
                     fontSize: 14,
                     fontWeight: 600,
                     backgroundColor: targetSummary.isGood ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                     color: targetSummary.isGood ? 'var(--accent-emerald)' : 'var(--status-error)'
                   }}>
                     {targetSummary.direction} {targetSummary.pct}%
                   </span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
