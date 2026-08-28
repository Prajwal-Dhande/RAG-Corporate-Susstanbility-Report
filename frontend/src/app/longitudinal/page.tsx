'use client';

import { useEffect, useState, useMemo } from 'react';
import { getReports, getLongitudinalData, Report } from '@/lib/api';
import { TrendingUp, AlertCircle, RefreshCw, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function LongitudinalPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('');
  const [trendData, setTrendData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group reports by company
  const companies = useMemo(() => {
    const map = new Map<string, { id: string, name: string, count: number }>();
    reports.forEach(r => {
      const cid = r.company_id;
      if (!map.has(cid)) {
        map.set(cid, { id: cid, name: r.company_name || 'Unknown', count: 0 });
      }
      map.get(cid)!.count += 1;
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [reports]);

  useEffect(() => {
    loadReports();
  }, []);

  async function loadReports() {
    try {
      setLoading(true);
      const data = await getReports();
      const processed = data.filter(r => r.status === 'completed' && r.fiscal_year);
      setReports(processed);
    } catch (err: any) {
      setError(err.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }

  // Auto-select first company with multiple reports
  useEffect(() => {
    if (!selectedCompany && companies.length > 0) {
      const topCompany = companies.find(c => c.count > 1) || companies[0];
      setSelectedCompany(topCompany.id);
    }
  }, [companies, selectedCompany]);

  useEffect(() => {
    if (selectedCompany) {
      runLongitudinal();
    }
  }, [selectedCompany]);

  async function runLongitudinal() {
    try {
      setAnalyzing(true);
      const data = await getLongitudinalData(selectedCompany);
      if (data && data.results) {
        setTrendData(data.results);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  }

  const renderTrendIcon = (direction: string) => {
    if (direction === 'INCREASING') return <ArrowUpRight size={16} style={{ color: 'var(--accent-red)' }} />;
    if (direction === 'DECREASING') return <ArrowDownRight size={16} style={{ color: 'var(--accent-emerald)' }} />; // Decreasing emissions is good!
    return <Minus size={16} style={{ color: 'var(--text-muted)' }} />;
  };

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1 className="page-title">
            <TrendingUp size={24} style={{ color: 'var(--accent-emerald)' }} />
            Longitudinal Analysis
          </h1>
          <p className="page-subtitle">Track sustainability KPIs and target trajectory over consecutive fiscal years.</p>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px' }}>
        
        {/* Sidebar: Company Selection */}
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="card-header">
            <h2 className="card-title">Select Company</h2>
          </div>
          <div className="card-content" style={{ padding: '0 20px 20px' }}>
            {loading ? (
              <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
            ) : companies.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>No historical reports available.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {companies.map(company => (
                  <button
                    key={company.id}
                    onClick={() => setSelectedCompany(company.id)}
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      alignItems: 'center', 
                      padding: '12px 16px',
                      backgroundColor: selectedCompany === company.id ? 'var(--bg-card)' : 'transparent',
                      border: selectedCompany === company.id ? '1px solid var(--accent-emerald)' : '1px solid var(--border-color)',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <span style={{ fontWeight: selectedCompany === company.id ? 600 : 400 }}>
                      {company.name}
                    </span>
                    <span style={{ 
                      fontSize: 11, 
                      backgroundColor: 'var(--bg-secondary)', 
                      padding: '2px 8px', 
                      borderRadius: '12px',
                      color: company.count > 1 ? 'var(--text-primary)' : 'var(--text-muted)'
                    }}>
                      {company.count} yrs
                    </span>
                  </button>
                ))}
              </div>
            )}
            
            {companies.find(c => c.id === selectedCompany)?.count === 1 && (
              <div style={{ marginTop: '16px', fontSize: 12, color: 'var(--accent-orange)' }}>
                <AlertCircle size={14} style={{ display: 'inline', marginRight: 4 }} />
                Only 1 year of data available. We need 2+ years for longitudinal trends.
              </div>
            )}
          </div>
        </div>

        {/* Main Content: Trend Charts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {analyzing ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
              Computing multi-year trajectories...
            </div>
          ) : trendData.length === 0 ? (
            <div className="card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No longitudinal trend data available for this company.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
              {trendData.map((trend, idx) => (
                <div key={idx} className="card">
                  <div className="card-header" style={{ paddingBottom: '0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{trend.kpi_name}</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '4px 10px', backgroundColor: 'var(--bg-secondary)', borderRadius: '16px' }}>
                        {renderTrendIcon(trend.trend_direction)}
                        <span style={{ textTransform: 'capitalize' }}>
                          {trend.trend_direction.toLowerCase()}
                        </span>
                      </div>
                    </div>
                    {trend.cagr !== null && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: '8px' }}>
                        CAGR: {(trend.cagr * 100).toFixed(1)}%
                      </div>
                    )}
                  </div>
                  <div className="card-content" style={{ height: '240px', padding: '20px' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trend.data_points.sort((a: any, b: any) => a.year - b.year)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                        <XAxis dataKey="year" stroke="var(--text-muted)" fontSize={12} tickMargin={10} />
                        <YAxis stroke="var(--text-muted)" fontSize={12} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)', borderRadius: '8px' }}
                          itemStyle={{ color: '#fff' }}
                          formatter={(value: any) => [`${Number(value).toLocaleString()}`, trend.kpi_name]}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="value" 
                          stroke="var(--accent-emerald)" 
                          strokeWidth={3}
                          dot={{ r: 4, fill: 'var(--accent-emerald)' }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
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
