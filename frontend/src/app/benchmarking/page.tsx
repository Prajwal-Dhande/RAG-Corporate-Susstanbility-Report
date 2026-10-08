'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { getReports, getBenchmarkData, Report } from '@/lib/api';
import { BarChart2, AlertCircle, Play, Info, Droplet, Zap, Trash2, Shield, Leaf, TrendingUp, TrendingDown } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend, LabelList } from 'recharts';

const getProperUnit = (kpiName: string, originalUnit: string) => {
  const name = kpiName.toLowerCase();
  if (name.includes('ghg') || name.includes('emission')) return 'MT CO2e';
  if (name.includes('water')) return 'm³';
  if (name.includes('energy') || name.includes('electricity')) return 'MWh';
  if (name.includes('waste')) return 'tonnes';
  if (name.includes('rate') || name.includes('percentage')) return '%';
  if (name.includes('duration') || name.includes('time')) return 'Years';
  return originalUnit === 'Metric Units' ? '' : originalUnit;
};

export default function BenchmarkingPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [baseReportId, setBaseReportId] = useState<string>('');
  const [compareReportId, setCompareReportId] = useState<string>('');
  
  const [selectedKpiCategory, setSelectedKpiCategory] = useState('GHG Emissions');
  const [selectedScope, setSelectedScope] = useState('All Scopes');
  
  const [generatedData, setGeneratedData] = useState<any[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);

  const fetchReports = useCallback(async () => {
    try {
      const data = await getReports();
      setReports(data);
      if (!baseReportId) {
        const completed = data.filter(r => r.status === 'completed');
        if (completed.length >= 2) {
          setBaseReportId(completed[0].id);
          setCompareReportId(completed[1].id);
        } else if (completed.length === 1) {
          setBaseReportId(completed[0].id);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load reports');
    }
  }, [baseReportId]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const baseReport = reports.find(r => r.id === baseReportId);
  const compareReport = reports.find(r => r.id === compareReportId);
  const completedReports = reports.filter(r => r.status === 'completed');

  const isSameCompany = baseReport && compareReport && baseReport.company_name === compareReport.company_name;

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

  // Pre-process data
  const baseName = baseReport ? `${baseReport.company_name} (FY ${baseReport.fiscal_year})` : 'Company A';
  const compareName = compareReport ? `${compareReport.company_name} (FY ${compareReport.fiscal_year})` : 'Company B';

  const displayData = useMemo(() => {
    let filtered = generatedData;
    
    if (selectedKpiCategory === 'GHG Emissions') {
       filtered = generatedData.filter(d => 
         d.kpi_name.toLowerCase().includes('scope') || 
         d.kpi_name.toLowerCase().includes('ghg') || 
         d.kpi_name.toLowerCase().includes('emission')
       );
       if (selectedScope !== 'All Scopes') {
         filtered = filtered.filter(d => d.kpi_name.toLowerCase().includes(selectedScope.toLowerCase()));
       }
    } else if (selectedKpiCategory === 'Energy Consumption') {
       filtered = generatedData.filter(d => 
         d.kpi_name.toLowerCase().includes('energy') || 
         d.kpi_name.toLowerCase().includes('electricity')
       );
    } else if (selectedKpiCategory === 'Water Usage') {
       filtered = generatedData.filter(d => d.kpi_name.toLowerCase().includes('water'));
    } else if (selectedKpiCategory === 'Waste Generated') {
       filtered = generatedData.filter(d => d.kpi_name.toLowerCase().includes('waste') || d.kpi_name.toLowerCase().includes('landfill'));
    }

    // 1. Data for Bar Chart (Cross Company)
    let primaryKpi = null;
    
    // First try exact match (since we'll populate the dropdown dynamically with exact names)
    primaryKpi = generatedData.find(d => d.kpi_name === selectedKpiCategory) || null;
    
    // Fallback to fuzzy match for default categories
    if (!primaryKpi && filtered.length > 0) {
      if (selectedKpiCategory === 'GHG Emissions') {
         primaryKpi = filtered.find(d => d.kpi_name.toLowerCase().includes('total')) || filtered[0];
      } else {
         primaryKpi = filtered[0];
      }
    }

    const chartData = [];
    if (primaryKpi) {
      chartData.push({
        name: baseReport?.company_name || 'Company A',
        value: primaryKpi.companies[baseName]?.value || 0,
        fill: 'var(--accent-blue)',
        unit: getProperUnit(primaryKpi.kpi_name, primaryKpi.unit)
      });
      chartData.push({
        name: compareReport?.company_name || 'Company B',
        value: primaryKpi.companies[compareName]?.value || 0,
        fill: 'var(--accent-emerald)',
        unit: getProperUnit(primaryKpi.kpi_name, primaryKpi.unit)
      });
    }

    // 2. Data for Line Chart (Same Company YoY)
    const timeSeriesData: any[] = [
      { year: baseName },
      { year: compareName }
    ];
    const kpiNames: string[] = [];
    filtered.forEach(d => {
      kpiNames.push(d.kpi_name);
      timeSeriesData[0][d.kpi_name] = d.companies[baseName]?.value || 0;
      timeSeriesData[1][d.kpi_name] = d.companies[compareName]?.value || 0;
    });

    return { chartData, primaryKpi, tableData: filtered, timeSeriesData, kpiNames, baseName, compareName };
  }, [generatedData, selectedKpiCategory, selectedScope, baseReport, compareReport, baseName, compareName]);

  const targetSummary = useMemo(() => {
    if (!hasGenerated || generatedData.length === 0 || !isSameCompany) return null;
    let totalBase = 0;
    let totalCompare = 0;
    
    displayData.tableData.forEach(d => {
      totalBase += (d.companies[displayData.baseName]?.value || 0);
      totalCompare += (d.companies[displayData.compareName]?.value || 0);
    });

    if (totalBase === 0) return null;
    
    const diff = totalCompare - totalBase;
    const pct = (diff / totalBase) * 100;
    const isGood = diff <= 0; // Decrease in emissions/energy is good
    
    return {
       direction: diff > 0 ? "Increased" : "Decreased",
       pct: Math.abs(pct).toFixed(1),
       isGood,
       text: `Total ${selectedKpiCategory} have ${diff > 0 ? 'increased' : 'decreased'} by ${Math.abs(pct).toFixed(1)}% between FY ${baseReport?.fiscal_year} and FY ${compareReport?.fiscal_year}.`
    };
  }, [displayData, baseReport, compareReport, generatedData, hasGenerated, selectedKpiCategory, isSameCompany]);

  const getCompanyIcon = (name: string) => {
    const lName = name.toLowerCase();
    if (lName.includes('apple')) return <Shield size={24} style={{color: '#000'}} />;
    if (lName.includes('wipro')) return <Shield size={24} style={{color: '#0000ff'}} />;
    return <Shield size={24} style={{color: 'var(--text-muted)'}} />;
  };

  const getKpiIcon = (name: string) => {
    const lName = name.toLowerCase();
    if (lName.includes('ghg') || lName.includes('emission')) return <Leaf size={18} style={{color: 'var(--accent-emerald)'}} />;
    if (lName.includes('water')) return <Droplet size={18} style={{color: 'var(--accent-blue)'}} />;
    if (lName.includes('energy')) return <Zap size={18} style={{color: 'var(--accent-amber)'}} />;
    return <Trash2 size={18} style={{color: 'var(--text-muted)'}} />;
  };

  const COLORS = ['var(--accent-blue)', 'var(--accent-emerald)', 'var(--accent-violet)', 'var(--accent-amber)', 'var(--accent-rose)'];

  return (
    <div className="page-container animate-fade-in-up">
      <header className="page-header" style={{ marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">
            <BarChart2 size={32} style={{ color: 'var(--accent-blue)' }} />
            {isSameCompany ? 'Year-over-Year Benchmarking' : 'Cross-Company ESG Comparative Performance'}
          </h1>
          <p className="page-subtitle">
            {isSameCompany 
              ? 'Compare performance metrics of the same organization across different fiscal years.' 
              : 'Data-driven insights for a more sustainable tomorrow.'}
          </p>
        </div>
      </header>

      {error && (
        <div className="error-banner" style={{ marginBottom: '20px' }}>
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      {/* TOP CONTROL PANEL */}
      <div className="card animate-fade-in-up stagger-1" style={{ marginBottom: '32px' }}>
        <div className="card-content" style={{ display: 'flex', gap: '20px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          
          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
              {isSameCompany ? 'Base Report (Year 1)' : 'Company A Report'}
            </label>
            <select 
              value={baseReportId} 
              onChange={e => { setBaseReportId(e.target.value); setHasGenerated(false); }}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            >
              <option value="" disabled>Select Report...</option>
              {completedReports.map(r => (
                <option key={r.id} value={r.id}>{r.company_name} - FY {r.fiscal_year}</option>
              ))}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: '150px' }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
              {isSameCompany ? 'Comparison Report (Year 2)' : 'Company B Report'}
            </label>
            <select 
              value={compareReportId} 
              onChange={e => { setCompareReportId(e.target.value); setHasGenerated(false); }}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            >
              <option value="" disabled>Select Report...</option>
              {completedReports.map(r => (
                <option key={r.id} value={r.id} disabled={r.id === baseReportId}>{r.company_name} - FY {r.fiscal_year}</option>
              ))}
            </select>
          </div>

          <div style={{ width: '220px' }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
              Selected KPI
            </label>
            <select 
              value={selectedKpiCategory} 
              onChange={e => setSelectedKpiCategory(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            >
              {generatedData.length === 0 ? (
                <>
                  <option value="GHG Emissions">GHG Emissions</option>
                  <option value="Energy Consumption">Energy Consumption</option>
                  <option value="Water Usage">Water Usage</option>
                  <option value="Waste Generated">Waste Generated</option>
                </>
              ) : (
                generatedData.map(d => (
                  <option key={d.kpi_name} value={d.kpi_name}>{d.kpi_name}</option>
                ))
              )}
            </select>
          </div>



          <button 
            onClick={handleGenerate}
            disabled={!baseReportId || !compareReportId || analyzing}
            style={{ 
              height: '42px', padding: '0 24px', backgroundColor: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700,
              cursor: (!baseReportId || !compareReportId || analyzing) ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
              opacity: (!baseReportId || !compareReportId || analyzing) ? 0.7 : 1
            }}
          >
            {analyzing ? <Play size={18} className="spin" /> : <Play size={18} />}
            Generate Report
          </button>
        </div>
      </div>

      {!hasGenerated ? null : isSameCompany ? (
        // ==============================================================
        // LINE CHART & YoY BENCHMARKING (Same Company)
        // ==============================================================
        <>
          <div className="card animate-fade-in-up stagger-2" style={{ marginBottom: '32px' }}>
            <div className="card-header">
              <h2 className="card-title">Comparative Performance: {selectedKpiCategory}</h2>
            </div>
            <div className="card-content" style={{ height: '480px' }}>
              {displayData.timeSeriesData.length === 0 || displayData.kpiNames.length === 0 ? (
                 <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--status-error)', fontWeight: 600, textAlign: 'center' }}>
                   No comparative data extracted for {selectedKpiCategory} in the selected scopes.
                 </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={displayData.timeSeriesData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                    <XAxis dataKey="year" stroke="var(--text-muted)" fontSize={14} fontWeight={600} tickMargin={12} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} tickFormatter={v => v.toLocaleString()} />
                    <Tooltip 
                      cursor={{ stroke: 'var(--border-color)', strokeWidth: 1, strokeDasharray: '3 3' }}
                      contentStyle={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-color)', borderRadius: '8px', color: 'var(--text-primary)' }}
                      itemStyle={{ color: 'var(--text-primary)' }}
                    />
                    <Legend verticalAlign="top" height={36} iconType="circle" />
                    {displayData.kpiNames.map((kpi, idx) => (
                      <Line 
                        key={kpi} 
                        type="monotone" 
                        dataKey={kpi} 
                        stroke={COLORS[idx % COLORS.length]} 
                        strokeWidth={4} 
                        activeDot={{ r: 8 }} 
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {targetSummary && (
            <div className="card animate-fade-in-up stagger-3" style={{ borderLeft: `4px solid ${targetSummary.isGood ? 'var(--accent-emerald)' : 'var(--status-error)'}`, marginBottom: '32px' }}>
              <div className="card-content" style={{ padding: '24px', display: 'flex', alignItems: 'center', gap: '24px' }}>
                <div style={{ padding: '16px', borderRadius: '50%', backgroundColor: targetSummary.isGood ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)' }}>
                   {targetSummary.isGood ? <TrendingDown size={32} style={{ color: 'var(--accent-emerald)' }} /> : <TrendingUp size={32} style={{ color: 'var(--status-error)' }} />}
                </div>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Target Summary: {selectedKpiCategory}</h3>
                  <p style={{ fontSize: 16, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                    {targetSummary.text} 
                    {targetSummary.pct !== '0.0' && (
                       <span style={{ 
                         display: 'inline-block', marginLeft: 10, padding: '2px 10px', borderRadius: '12px', fontSize: 14, fontWeight: 600,
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

          <div className="card animate-fade-in-up stagger-4">
            <div className="card-header">
              <h2 className="card-title">Detailed Variance Breakdown</h2>
            </div>
            <div className="card-content" style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>FY {baseReport?.fiscal_year} (Base)</th>
                    <th>FY {compareReport?.fiscal_year} (Target)</th>
                    <th>Variance</th>
                    <th>% Change</th>
                  </tr>
                </thead>
                <tbody>
                  {generatedData.map((d, i) => {
                    const baseVal = d.companies[displayData.baseName]?.value || 0;
                    const compVal = d.companies[displayData.compareName]?.value || 0;
                    const diff = compVal - baseVal;
                    const pct = baseVal !== 0 ? ((diff / baseVal) * 100).toFixed(1) : 'N/A';
                    const isGood = diff <= 0;
                    
                    return (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{d.kpi_name}</td>
                        <td>{baseVal.toLocaleString()} {d.unit}</td>
                        <td>{compVal.toLocaleString()} {d.unit}</td>
                        <td style={{ color: diff > 0 ? 'var(--status-error)' : 'var(--accent-emerald)', fontWeight: 600 }}>
                          {diff > 0 ? '+' : ''}{diff.toLocaleString()} {(() => {
                            const name = d.kpi_name.toLowerCase();
                            if (name.includes('ghg') || name.includes('emission')) return 'MT CO2e';
                            if (name.includes('water')) return 'm³';
                            if (name.includes('energy') || name.includes('electricity')) return 'MWh';
                            if (name.includes('waste')) return 'tonnes';
                            if (name.includes('rate') || name.includes('percentage')) return '%';
                            if (name.includes('duration') || name.includes('time')) return 'Years';
                            return d.unit === 'Metric Units' ? '' : d.unit;
                          })()}
                        </td>
                        <td>
                          {pct !== 'N/A' ? (
                            <span className={`badge ${isGood ? 'badge-success' : 'badge-error'}`}>
                              {diff > 0 ? <TrendingUp size={12}/> : <TrendingDown size={12}/>} {Math.abs(Number(pct))}%
                            </span>
                          ) : 'N/A'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        // ==============================================================
        // BAR CHART & CROSS-COMPANY (Different Companies)
        // ==============================================================
        <>
          <div className="card animate-fade-in-up stagger-2" style={{ marginBottom: '24px' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 className="card-title" style={{ fontSize: 20 }}>Comparative Performance: {selectedKpiCategory}</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 4 }}>Total reported values by each company based on selected metrics.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>
                <Info size={16} style={{ color: 'var(--accent-blue)' }} />
                Units shown dynamically based on selected KPI.
              </div>
            </div>
            
            <div className="card-content" style={{ padding: '24px' }}>
              {displayData.chartData.length > 0 ? (
                <>
                  <div style={{ height: '300px', marginBottom: '32px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={displayData.chartData} barSize={120} margin={{ top: 30, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--text-primary)', fontWeight: 600, fontSize: 16 }} />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: 'var(--text-muted)' }} 
                          tickFormatter={v => v.toLocaleString()} 
                          label={{ 
                            value: displayData.chartData[0]?.unit || '', 
                            angle: -90, 
                            position: 'insideLeft', 
                            offset: 0,
                            dy: 50,
                            style: { textAnchor: 'middle', fill: 'var(--text-muted)', fontWeight: 700, fontSize: 14 } 
                          }}
                        />
                        <Tooltip cursor={{ fill: 'var(--bg-secondary)' }} contentStyle={{ borderRadius: 8, border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-card)' }} />
                        <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                          <LabelList 
                            dataKey="value" 
                            position="top" 
                            formatter={(v: number) => v.toLocaleString()} 
                            style={{ fill: 'var(--text-primary)', fontWeight: 800, fontSize: 20 }} 
                            offset={10} 
                          />
                          {displayData.chartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    {displayData.chartData.map((data, idx) => (
                      <div key={idx} style={{ padding: '24px', border: '1px solid var(--border-color)', borderRadius: '12px', backgroundColor: idx === 0 ? 'rgba(59, 130, 246, 0.05)' : 'rgba(16, 185, 129, 0.05)', display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div style={{ padding: '16px', backgroundColor: '#fff', borderRadius: '50%', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
                          {getCompanyIcon(data.name)}
                        </div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{data.name}</div>
                          <div style={{ fontSize: 28, fontWeight: 800, color: data.fill, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            {data.value.toLocaleString()} <span style={{ fontSize: 16, fontWeight: 600 }}>{data.unit}</span>
                          </div>
                          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                            {displayData.primaryKpi?.kpi_name} (FY {idx === 0 ? baseReport?.fiscal_year : compareReport?.fiscal_year})
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>No data found.</div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
            <div className="card animate-fade-in-up stagger-3">
              <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <BarChart2 size={24} style={{ color: 'var(--accent-blue)' }} />
                <div>
                  <h2 className="card-title">Detailed KPI Comparison</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 2 }}>Key environmental metrics for {baseReport?.company_name} and {compareReport?.company_name}.</p>
                </div>
              </div>
              <div className="card-content">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ paddingLeft: 24 }}>KPI</th>
                      <th>{baseReport?.company_name}</th>
                      <th>{compareReport?.company_name}</th>
                      <th>Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {generatedData.map((d, i) => {
                      const vA = d.companies[displayData.baseName]?.value || 0;
                      const vB = d.companies[displayData.compareName]?.value || 0;
                      if (vA === 0 && vB === 0) return null;
                      return (
                        <tr key={i}>
                          <td style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 24 }}>{getKpiIcon(d.kpi_name)} {d.kpi_name}</td>
                          <td style={{ color: 'var(--accent-blue)', fontWeight: 700 }}>{vA.toLocaleString()}</td>
                          <td style={{ color: 'var(--accent-emerald)', fontWeight: 700 }}>{vB.toLocaleString()}</td>
                          <td style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                            {(() => {
                              const name = d.kpi_name.toLowerCase();
                              if (name.includes('ghg') || name.includes('emission')) return 'MT CO2e';
                              if (name.includes('water')) return 'm³';
                              if (name.includes('energy') || name.includes('electricity')) return 'MWh';
                              if (name.includes('waste')) return 'tonnes';
                              if (name.includes('rate') || name.includes('percentage')) return '%';
                              if (name.includes('duration') || name.includes('time')) return 'Years';
                              return d.unit === 'Metric Units' ? '' : d.unit;
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card animate-fade-in-up stagger-4" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <div className="card-header">
                <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Info size={20} style={{ color: 'var(--accent-blue)' }} />Comparison Insights</h2>
              </div>
              <div className="card-content" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ minWidth: 28, height: 28, borderRadius: '50%', backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>1</div>
                  <div><h4 style={{ fontSize: 14, fontWeight: 700 }}>One graph updates per selected KPI</h4><p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Quickly compare any ESG metric across companies.</p></div>
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ minWidth: 28, height: 28, borderRadius: '50%', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>2</div>
                  <div><h4 style={{ fontSize: 14, fontWeight: 700 }}>Units remain accurate</h4><p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Correct unit applied automatically.</p></div>
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ minWidth: 28, height: 28, borderRadius: '50%', backgroundColor: 'rgba(139, 92, 246, 0.1)', color: 'var(--accent-violet)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>3</div>
                  <div><h4 style={{ fontSize: 14, fontWeight: 700 }}>Table shows full comparison</h4><p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Complete view of metrics side by side.</p></div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
