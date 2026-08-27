'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, RadialBarChart, RadialBar, Legend,
} from 'recharts';
import {
  Activity, Zap, Droplets, Trash2, Target, TrendingUp, Leaf, AlertTriangle
} from 'lucide-react';
import { getReport, getKPIs, getTargets, analyzeEmissions, Report } from '@/lib/api';

function DashboardContent() {
  const searchParams = useSearchParams();
  const reportId = searchParams.get('id');

  const [report, setReport] = useState<Report | null>(null);
  const [kpis, setKPIs] = useState<{ kpis: { id: string; name: string; description: string; confidence: number; page_numbers: number[]; values: unknown[] }[]; count: number }>({ kpis: [], count: 0 });
  const [targets, setTargets] = useState<{ targets: unknown[]; count: number }>({ targets: [], count: 0 });
  const [emissions, setEmissions] = useState<{ result?: { conclusion?: { emissions?: Record<string, { value: number }> } } }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!reportId) { setLoading(false); return; }
    (async () => {
      try {
        const [r, k, t, e] = await Promise.all([
          getReport(reportId),
          getKPIs(reportId),
          getTargets(reportId),
          analyzeEmissions(reportId).catch(() => ({})),
        ]);
        setReport(r);
        setKPIs(k);
        setTargets(t);
        setEmissions(e);
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
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 4 }}>
          Sustainability Dashboard
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          {report.company_name} — {report.title} {report.fiscal_year ? `(FY${report.fiscal_year})` : ''}
        </p>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 28 }}>
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="stat-label">{label}</span>
              <Icon size={18} style={{ color }} />
            </div>
            <span className="stat-value" style={{ color }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
        {/* KPI Category Breakdown */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>KPI Category Breakdown</h3>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                  dataKey="value" nameKey="name" paddingAngle={3} stroke="none">
                  {categoryData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: 'var(--text-secondary)' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              No KPI data available
            </div>
          )}
        </div>

        {/* Confidence Distribution */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Extraction Confidence Distribution</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={confData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
              <XAxis dataKey="range" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 8 }}
                itemStyle={{ color: 'var(--text-primary)' }}
              />
              <Bar dataKey="count" fill="var(--accent-blue)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
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
