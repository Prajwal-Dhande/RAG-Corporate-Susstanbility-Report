'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, RadialBarChart, RadialBar, Legend,
} from 'recharts';
import {
  Activity, Zap, Droplets, Trash2, Target, TrendingUp, Leaf, AlertTriangle, Download, Award
} from 'lucide-react';
import { getReport, getKPIs, getTargets, analyzeEmissions, getESGScore, getExportCSVUrl, Report } from '@/lib/api';

function DashboardContent() {
  const searchParams = useSearchParams();
  const reportId = searchParams.get('id');

  const [report, setReport] = useState<Report | null>(null);
  const [kpis, setKPIs] = useState<{ kpis: { id: string; name: string; description: string; confidence: number; page_numbers: number[]; values: unknown[] }[]; count: number }>({ kpis: [], count: 0 });
  const [targets, setTargets] = useState<{ targets: unknown[]; count: number }>({ targets: [], count: 0 });
  const [emissions, setEmissions] = useState<{ result?: { conclusion?: { emissions?: Record<string, { value: number }> } } }>({});
  const [esgScore, setEsgScore] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!reportId) { setLoading(false); return; }
    (async () => {
      try {
        const [r, k, t, e, esg] = await Promise.all([
          getReport(reportId),
          getKPIs(reportId),
          getTargets(reportId),
          analyzeEmissions(reportId).catch(() => ({})),
          getESGScore(reportId).catch(() => null),
        ]);
        setReport(r);
        setKPIs(k);
        setTargets(t);
        setEmissions(e);
        setEsgScore(esg);
      } catch { /* empty */ }
      finally { setLoading(false); }
    })();
  }, [reportId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  if (!reportId || !report) {
    return (
      <div className="animate-in" style={{ textAlign: 'center', padding: '80px 0' }}>
        <Activity size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No Report Selected</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Upload and process a sustainability report first, then select it from the Reports page.
        </p>
      </div>
    );
  }

  const statCards = [
    { label: 'Pages', value: report.page_count || 0, icon: Activity, color: 'var(--accent-blue)' },
    { label: 'KPIs Extracted', value: kpis.count, icon: Zap, color: 'var(--accent-emerald)' },
    { label: 'Targets Found', value: targets.count, icon: Target, color: 'var(--accent-amber)' },
    { label: 'Entities', value: report.entity_count, icon: Leaf, color: 'var(--accent-violet)' },
    { label: 'Relations', value: report.relation_count, icon: TrendingUp, color: 'var(--accent-blue)' },
  ];

  // Build category breakdown from KPIs
  const categories: Record<string, number> = {};
  kpis.kpis.forEach(k => {
    const name = k.name.toLowerCase();
    let cat = 'Other';
    if (name.includes('emission') || name.includes('ghg') || name.includes('co2') || name.includes('carbon')) cat = 'Emissions';
    else if (name.includes('energy') || name.includes('electricity') || name.includes('renewable')) cat = 'Energy';
    else if (name.includes('water')) cat = 'Water';
    else if (name.includes('waste')) cat = 'Waste';
    else if (name.includes('safety') || name.includes('employee') || name.includes('diversity')) cat = 'Social';
    categories[cat] = (categories[cat] || 0) + 1;
  });

  const categoryData = Object.entries(categories).map(([name, count]) => ({
    name, value: count,
  }));

  const COLORS = ['#10b981', '#3b82f6', '#06b6d4', '#f59e0b', '#8b5cf6', '#f43f5e'];

  // Confidence distribution
  const confBuckets = [0, 0, 0, 0, 0]; // 0-20, 20-40, 40-60, 60-80, 80-100
  kpis.kpis.forEach(k => {
    const c = k.confidence || 0;
    const idx = Math.min(Math.floor(c * 5), 4);
    confBuckets[idx]++;
  });
  const confData = ['0-20%', '20-40%', '40-60%', '60-80%', '80-100%'].map((label, i) => ({
    range: label, count: confBuckets[i],
  }));

  return (
    <div className="animate-in">
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 4 }}>
            Sustainability Dashboard
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {report.company_name} — {report.title} {report.fiscal_year ? `(FY${report.fiscal_year})` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {esgScore && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 16px', borderRadius: '10px',
              background: esgScore.grade?.startsWith('A') ? '#10b98115' : esgScore.grade?.startsWith('B') ? '#3b82f615' : '#f59e0b15',
              border: `1px solid ${esgScore.grade?.startsWith('A') ? '#10b98130' : esgScore.grade?.startsWith('B') ? '#3b82f630' : '#f59e0b30'}`,
            }}>
              <Award size={18} style={{ color: esgScore.grade?.startsWith('A') ? '#10b981' : esgScore.grade?.startsWith('B') ? '#3b82f6' : '#f59e0b' }} />
              <span style={{ fontSize: 20, fontWeight: 800, color: esgScore.grade?.startsWith('A') ? '#10b981' : esgScore.grade?.startsWith('B') ? '#3b82f6' : '#f59e0b' }}>
                {esgScore.grade}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{esgScore.overall_score}/100</span>
            </div>
          )}
          <a
            href={getExportCSVUrl(reportId!)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: '8px',
              backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)',
              fontWeight: 500, fontSize: 13, textDecoration: 'none',
              border: '1px solid var(--border-color)',
            }}
          >
            <Download size={14} />
            Export CSV
          </a>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 28 }}>
        {statCards.map((s, i) => (
          <div key={s.label} className={`stat-card animate-slide-up stagger-${i + 1} opacity-0`}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="stat-label">{s.label}</span>
              <s.icon size={20} style={{ color: s.color }} />
            </div>
            <div className="stat-value">{s.value.toLocaleString()}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24, marginBottom: 24 }}>
        {/* Categories Chart */}
        <div className="card animate-slide-up stagger-4 opacity-0" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, letterSpacing: '-0.01em' }}>KPI Category Breakdown</h3>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%" cy="50%"
                  innerRadius={70} outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  isAnimationActive={true}
                  animationBegin={200}
                  animationDuration={1200}
                  animationEasing="ease-out"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} style={{ filter: 'drop-shadow(0px 4px 6px rgba(0,0,0,0.1))' }} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ background: 'var(--bg-card)', border: 'none', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                  itemStyle={{ color: 'var(--text-primary)', fontWeight: 600 }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: 20, fontSize: 13, fontWeight: 500 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Confidence Chart */}
        <div className="card animate-slide-up stagger-5 opacity-0" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, letterSpacing: '-0.01em' }}>Extraction Confidence Distribution</h3>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={confData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-blue)" stopOpacity={0.9}/>
                    <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0.6}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="range" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{ fill: 'var(--bg-secondary)' }}
                  contentStyle={{ background: 'var(--bg-card)', border: 'none', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                />
                <Bar 
                  dataKey="count" 
                  fill="url(#colorCount)" 
                  radius={[6, 6, 0, 0]} 
                  isAnimationActive={true}
                  animationBegin={400}
                  animationDuration={1500}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* KPI List */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>Extracted KPIs</h3>
        </div>
        {kpis.kpis.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>KPI Name</th>
                <th>Description</th>
                <th>Confidence</th>
                <th>Source Pages</th>
              </tr>
            </thead>
            <tbody>
              {kpis.kpis.map(kpi => (
                <tr key={kpi.id}>
                  <td style={{ fontWeight: 600 }}>{kpi.name}</td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {kpi.description || '—'}
                  </td>
                  <td>
                    <div className={`confidence-bar ${kpi.confidence >= 0.7 ? 'confidence-high' : kpi.confidence >= 0.4 ? 'confidence-mid' : 'confidence-low'}`}>
                      <div className="confidence-track">
                        <div className="confidence-fill" style={{ width: `${(kpi.confidence || 0) * 100}%` }} />
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 36 }}>
                        {((kpi.confidence || 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {kpi.page_numbers?.map(p => p + 1).join(', ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
            No KPIs extracted yet. Process a report first.
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>}>
      <DashboardContent />
    </Suspense>
  );
}
