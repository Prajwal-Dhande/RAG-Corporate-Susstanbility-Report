'use client';

import { useEffect, useState, useMemo } from 'react';
import { getReports, getBenchmarkData, Report } from '@/lib/api';
import { BarChart2, AlertCircle, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function BenchmarkingPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [benchmarkData, setBenchmarkData] = useState<any[]>([]);
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
      const processedReports = data.filter(r => r.status === 'completed');
      setReports(processedReports);
      
      // Auto-select first two by default if available
      if (processedReports.length >= 2) {
        setSelectedIds([processedReports[0].id, processedReports[1].id]);
      } else if (processedReports.length === 1) {
        setSelectedIds([processedReports[0].id]);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (selectedIds.length > 0) {
      runBenchmark();
    } else {
      setBenchmarkData([]);
    }
  }, [selectedIds]);

  async function runBenchmark() {
    try {
      setAnalyzing(true);
      const data = await getBenchmarkData(selectedIds);
      if (data && data.results) {
        setBenchmarkData(data.results);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  }

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Colors for different companies
  const colors = ['#6c3bff', '#a855f7', '#ec4899', '#f43f5e', '#f97316'];

  // Prepare data for recharts: group by KPI, with each company as a bar
  const chartData = useMemo(() => {
    return benchmarkData.map(result => {
      const dataPoint: any = {
        name: result.kpi_name,
        unit: result.unit
      };
      // add companies
      Object.entries(result.companies).forEach(([comp, valInfo]: [string, any]) => {
        dataPoint[comp] = valInfo.value;
      });
      return dataPoint;
    });
  }, [benchmarkData]);

  // Extract unique company names from the data for the legend/bars
  const companyNames = useMemo(() => {
    const names = new Set<string>();
    benchmarkData.forEach(res => {
      Object.keys(res.companies).forEach(c => names.add(c));
    });
    return Array.from(names);
  }, [benchmarkData]);

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1 className="page-title">
            <BarChart2 size={24} style={{ color: 'var(--accent-blue)' }} />
            Cross-Company Benchmarking
          </h1>
          <p className="page-subtitle">Compare sustainability KPIs and emissions across multiple companies.</p>
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
            <h2 className="card-title">Select Reports</h2>
          </div>
          <div className="card-content" style={{ padding: '0 20px 20px' }}>
            {loading ? (
              <p style={{ color: 'var(--text-muted)' }}>Loading reports...</p>
            ) : reports.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No processed reports available.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {reports.map(report => (
                  <label 
                    key={report.id} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '10px',
                      padding: '10px',
                      backgroundColor: 'var(--bg-secondary)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      border: selectedIds.includes(report.id) ? '1px solid var(--accent-blue)' : '1px solid transparent'
                    }}
                  >
                    <input 
                      type="checkbox" 
                      checked={selectedIds.includes(report.id)}
                      onChange={() => toggleSelection(report.id)}
                      style={{ accentColor: 'var(--accent-blue)' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{report.company_name || report.title || 'Unknown Company'}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>FY {report.fiscal_year || 'N/A'} • {report.entity_count} entities</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Content: Charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h2 className="card-title">Emissions Comparison</h2>
              {analyzing && <RefreshCw size={16} className="spin" style={{ color: 'var(--text-muted)' }} />}
            </div>
            
            <div className="card-content" style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {selectedIds.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
                  Select at least one report to benchmark.
                </div>
              ) : chartData.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center' }}>
                  {analyzing ? 'Analyzing data...' : 'No comparable emissions data found in the selected reports.'}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={12} tickMargin={10} />
                    <YAxis stroke="var(--text-muted)" fontSize={12} tickFormatter={(val) => `${val.toLocaleString()}`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', borderRadius: '8px' }}
                      itemStyle={{ color: '#fff' }}
                      formatter={(value: any) => [`${Number(value).toLocaleString()}`, '']}
                    />
                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                    {companyNames.map((comp, idx) => (
                      <Bar 
                        key={comp} 
                        dataKey={comp} 
                        fill={colors[idx % colors.length]} 
                        radius={[4, 4, 0, 0]}
                        maxBarSize={60}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Details Table */}
          {benchmarkData.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">Raw Data Matrix</h2>
              </div>
              <div className="card-content" style={{ padding: '0 20px 20px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>KPI</th>
                      {companyNames.map(comp => (
                        <th key={comp} style={{ padding: '12px 8px', color: 'var(--text-muted)', fontWeight: 500 }}>{comp}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {benchmarkData.map(res => (
                      <tr key={res.kpi_name} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '12px 8px', fontWeight: 500 }}>{res.kpi_name}</td>
                        {companyNames.map(comp => (
                          <td key={comp} style={{ padding: '12px 8px' }}>
                            {res.companies[comp] ? (
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span>{res.companies[comp].value.toLocaleString()} {res.unit}</span>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>"{res.companies[comp].raw}"</span>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)' }}>—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
