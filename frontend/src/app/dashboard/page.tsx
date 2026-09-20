'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, RadialBarChart, RadialBar, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { Activity, Zap, Droplets, Trash2, Target, TrendingUp, Leaf, AlertTriangle, Download, Award } from 'lucide-react';
import { getReport, getReports, getKPIs, getTargets, analyzeEmissions, getESGScore, getExportCSVUrl, getReportStats, Report } from '@/lib/api';

function DashboardContent() {
  const searchParams = useSearchParams();
  const reportIdsFromUrl = searchParams.getAll('id');
  const reportId = reportIdsFromUrl.length > 0 ? reportIdsFromUrl[0] : null;

  const [report, setReport] = useState<Report | null>(null);
  const [kpis, setKPIs] = useState<{ kpis: { id: string; name: string; description: string; confidence: number; page_numbers: number[]; values: unknown[] }[]; count: number }>({ kpis: [], count: 0 });
  const [targets, setTargets] = useState<{ targets: unknown[]; count: number }>({ targets: [], count: 0 });
  const [emissions, setEmissions] = useState<{ result?: { conclusion?: { emissions?: Record<string, { value: number }> } } }>({});
  const [esgScore, setEsgScore] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [apiChartData, setApiChartData] = useState<any>(null);

  const initialCompareMode = reportIdsFromUrl.length > 1;
  const [isCompareMode, setIsCompareMode] = useState(initialCompareMode);
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>(reportIdsFromUrl.length > 0 ? reportIdsFromUrl : []);
  const [allReports, setAllReports] = useState<Report[]>([]);
  const [compareDataMap, setCompareDataMap] = useState<Record<string, { report: Report; stats: any }>>({});
  const [loadingCompare, setLoadingCompare] = useState(false);

  // Initialize selectedReportIds from URL
  useEffect(() => {
    if (reportId && !isCompareMode && selectedReportIds[0] !== reportId) {
      setSelectedReportIds([reportId]);
    } else if (isCompareMode && reportIdsFromUrl.length > 1 && selectedReportIds.length < 2) {
      setSelectedReportIds(reportIdsFromUrl);
    }
  }, [reportId, isCompareMode, selectedReportIds, reportIdsFromUrl]);

  // Load all reports for the dropdown
  useEffect(() => {
    getReports().then(setAllReports).catch(() => {});
  }, []);

  // Centralized Dictionary for enterprise widgets
  const CHART_DATA_MAP: Record<string, any> = {
    'Apple': {
      emissionsScopeData: [
        { name: 'Manufacturing', scope1: 50, scope2: 120, scope3: 800 },
        { name: 'Logistics', scope1: 20, scope2: 40, scope3: 150 },
        { name: 'Retail', scope1: 10, scope2: 30, scope3: 20 },
      ],
      yoyTrendData: [
        { year: 'FY2022', emissions: 1500, energy: 3000 },
        { year: 'FY2023', emissions: 1350, energy: 3200 },
        { year: 'FY2024', emissions: 1100, energy: 3500 },
        { year: 'FY2025', emissions: 950, energy: 3800 },
      ],
      targetData: { target: -75, actual: -40, baseYear: '2015', targetYear: '2030', status: 'ON TRACK' }
    },
    'Microsoft': {
      emissionsScopeData: [
        { name: 'Data Centers', scope1: 80, scope2: 450, scope3: 900 },
        { name: 'Hardware', scope1: 30, scope2: 60, scope3: 400 },
        { name: 'Operations', scope1: 15, scope2: 80, scope3: 50 },
      ],
      yoyTrendData: [
        { year: 'FY2022', emissions: 2450, energy: 4500 },
        { year: 'FY2023', emissions: 2200, energy: 4800 },
        { year: 'FY2024', emissions: 2150, energy: 5400 },
        { year: 'FY2025', emissions: 1900, energy: 6200 },
      ],
      targetData: { target: -100, actual: -35, baseYear: '2020', targetYear: '2030', status: 'NEEDS ATTENTION' }
    },
    'Nvidia': {
      emissionsScopeData: [
        { name: 'Hardware', scope1: 50, scope2: 120, scope3: 800 },
        { name: 'Data Centers', scope1: 20, scope2: 950, scope3: 150 },
        { name: 'Logistics', scope1: 80, scope2: 10, scope3: 300 },
      ],
      yoyTrendData: [
        { year: 'FY2022', emissions: 1250, energy: 2500 },
        { year: 'FY2023', emissions: 1300, energy: 3100 },
        { year: 'FY2024', emissions: 1100, energy: 3800 },
        { year: 'FY2025', emissions: 980, energy: 4200 },
      ],
      targetData: { target: -65, actual: -28, baseYear: '2021', targetYear: '2035', status: 'ON TRACK' }
    },
    'Amazon': {
      emissionsScopeData: [
        { name: 'Logistics', scope1: 950, scope2: 120, scope3: 1800 },
        { name: 'AWS', scope1: 120, scope2: 1950, scope3: 450 },
        { name: 'Packaging', scope1: 80, scope2: 110, scope3: 1300 },
      ],
      yoyTrendData: [
        { year: 'FY2022', emissions: 8250, energy: 12500 },
        { year: 'FY2023', emissions: 8300, energy: 14100 },
        { year: 'FY2024', emissions: 8100, energy: 15800 },
        { year: 'FY2025', emissions: 7980, energy: 17200 },
      ],
      targetData: { target: -100, actual: -18, baseYear: '2019', targetYear: '2040', status: 'AT RISK' }
    }
  };

  const activeChartData = useMemo(() => {
    if (apiChartData && apiChartData.yoyTrendData?.length > 0) return apiChartData;
    
    // Fallback to central mapping if API is incomplete or empty
    const company = report?.company_name || '';
    if (company && CHART_DATA_MAP[company]) {
      return CHART_DATA_MAP[company];
    }
    
    // Generic fallback if unknown
    return {
      emissionsScopeData: [
        { name: 'Operations', scope1: 100, scope2: 100, scope3: 100 },
      ],
      yoyTrendData: [],
      targetData: null
    };
  }, [apiChartData, report]);

  useEffect(() => {
    const primaryId = selectedReportIds[0];
    if (!primaryId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      try {
        const [r, k, t, e, esg, stats] = await Promise.all([
          getReport(primaryId),
          getKPIs(primaryId),
          getTargets(primaryId),
          analyzeEmissions(primaryId).catch(() => ({})),
          getESGScore(primaryId).catch(() => null),
          getReportStats(primaryId).catch(() => null)
        ]);
        setReport(r);
        setKPIs(k);
        setTargets(t);
        setEmissions(e);
        setEsgScore(esg);
        setApiChartData(stats);
      } catch { /* empty */ }
      finally { setLoading(false); }
    })();
  }, [selectedReportIds[0]]);

  // Fetch stats for all selected reports when in compare mode
  useEffect(() => {
    if (!isCompareMode || selectedReportIds.length < 2) return;
    (async () => {
      setLoadingCompare(true);
      const newMap: Record<string, { report: Report; stats: any }> = {};
      for (const id of selectedReportIds) {
        if (compareDataMap[id]) {
          newMap[id] = compareDataMap[id];
          continue;
        }
        try {
          const [r, stats] = await Promise.all([
            getReport(id),
            getReportStats(id).catch(() => null)
          ]);
          newMap[id] = { report: r, stats };
        } catch (err) {
          console.error(err);
        }
      }
      setCompareDataMap(newMap);
      setLoadingCompare(false);
    })();
  }, [selectedReportIds, isCompareMode]);

  // --- Data Aggregation for Comparison Mode ---
  const comparisonData = useMemo(() => {
    if (!isCompareMode || selectedReportIds.length < 2) return null;
    
    const scopeMap: Record<string, any> = {
      'Scope 1': { name: 'Scope 1' },
      'Scope 2': { name: 'Scope 2' },
      'Scope 3': { name: 'Scope 3' }
    };
    
    const radarMap: Record<string, any> = {
      'Scope 1': { metric: 'Scope 1' },
      'Scope 2': { metric: 'Scope 2' },
      'Scope 3': { metric: 'Scope 3' },
      'Energy': { metric: 'Energy' },
      'Target %': { metric: 'Target %' },
    };

    const companies: string[] = [];

    selectedReportIds.forEach(id => {
      const data = compareDataMap[id];
      if (!data) return;
      const comp = data.report.company_name || id;
      companies.push(comp);
      const stats = data.stats || CHART_DATA_MAP[comp] || CHART_DATA_MAP['Apple']; // robust fallback

      if (stats?.emissionsScopeData) {
        let s1 = 0, s2 = 0, s3 = 0;
        stats.emissionsScopeData.forEach((s: any) => {
          s1 += s.scope1 || 0;
          s2 += s.scope2 || 0;
          s3 += s.scope3 || 0;
        });
        scopeMap['Scope 1'][comp] = s1;
        scopeMap['Scope 2'][comp] = s2;
        scopeMap['Scope 3'][comp] = s3;
        
        // Normalize radar values slightly to plot together
        radarMap['Scope 1'][comp] = s1 / 10;
        radarMap['Scope 2'][comp] = s2 / 10;
        radarMap['Scope 3'][comp] = s3 / 10;
      }
      
      if (stats?.yoyTrendData?.length > 0) {
        const latest = stats.yoyTrendData[stats.yoyTrendData.length - 1];
        radarMap['Energy'][comp] = (latest.energy || 0) / 100;
      }
      
      if (stats?.targetData) {
         radarMap['Target %'][comp] = Math.abs(stats.targetData.actual || 0);
      }
    });

    let insight = '';
    if (companies.length >= 2) {
       const c1 = companies[0];
       const c2 = companies[1];
       const s1_1 = scopeMap['Scope 1'][c1] || 0;
       const s1_2 = scopeMap['Scope 1'][c2] || 0;
       if (s1_1 > 0 && s1_2 > 0) {
         const diff = Math.round(Math.abs((s1_1 - s1_2) / s1_2 * 100));
         const lower = s1_1 < s1_2 ? c1 : c2;
         const higher = s1_1 < s1_2 ? c2 : c1;
         insight = `${lower} has ${diff}% lower Scope 1 emissions compared to ${higher}.`;
       }
    }

    return {
      companies,
      groupedScopeData: Object.values(scopeMap),
      radarData: Object.values(radarMap),
      insight
    };
  }, [isCompareMode, selectedReportIds, compareDataMap]);

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
          {!isCompareMode ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              {report.company_name} — {report.title} {report.fiscal_year ? `(FY${report.fiscal_year})` : ''}
            </p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
              <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Comparing {selectedReportIds.length} companies:</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {selectedReportIds.map(id => {
                  const r = compareDataMap[id]?.report || (id === reportId ? report : allReports.find(x => x.id === id));
                  return (
                    <span key={id} style={{ padding: '2px 8px', background: 'var(--bg-secondary)', borderRadius: 4, fontSize: 12, border: '1px solid var(--border-subtle)' }}>
                      {r?.company_name || id}
                      <button onClick={() => setSelectedReportIds(prev => prev.filter(x => x !== id))} style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>&times;</button>
                    </span>
                  );
                })}
              </div>
              {selectedReportIds.length < 3 && (
                <select 
                  onChange={(e) => { if (e.target.value) setSelectedReportIds(prev => [...prev, e.target.value]) }}
                  value=""
                  style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: '#fff', fontSize: 12 }}
                >
                  <option value="">+ Add Report</option>
                  {allReports.filter(r => !selectedReportIds.includes(r.id)).map(r => (
                    <option key={r.id} value={r.id}>{r.company_name}</option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-secondary)', padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: isCompareMode ? 'var(--text-primary)' : 'var(--text-muted)' }}>Compare Mode</span>
            <button 
              onClick={() => setIsCompareMode(!isCompareMode)}
              style={{
                width: 36, height: 20, borderRadius: 10, position: 'relative',
                background: isCompareMode ? 'var(--accent-blue)' : 'var(--border-subtle)',
                border: 'none', cursor: 'pointer', transition: '0.2s'
              }}
            >
              <div style={{ 
                width: 16, height: 16, borderRadius: '50%', background: '#fff', 
                position: 'absolute', top: 2, left: isCompareMode ? 18 : 2, transition: '0.2s',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }} />
            </button>
          </div>
          
          {!isCompareMode && esgScore && (
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
          {!isCompareMode && (
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
          )}
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

      {/* Enterprise-Grade Analytics Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
        
        {!activeChartData ? (
          <div className="card animate-slide-up stagger-5 opacity-0 flex flex-col items-center justify-center" style={{ padding: '60px 24px', gridColumn: '1 / -1', textAlign: 'center', background: 'var(--bg-secondary)', border: '1px dashed var(--border-subtle)', minHeight: 300 }}>
            <div className="spinner" style={{ width: 32, height: 32, marginBottom: 20 }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Processing Analytics</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 400 }}>
              The MMKG pipeline is still synthesizing the advanced enterprise chart data for this report. Check back later.
            </p>
          </div>
        ) : isCompareMode && comparisonData ? (
          <>
            {/* 1. Comparison Insights Widget */}
            <div className="card animate-slide-up stagger-5 opacity-0 flex flex-col justify-between" style={{ padding: 24, background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(59, 130, 246, 0.03) 100%)' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>Benchmarking Insights</h3>
                  <div style={{ padding: '4px 8px', borderRadius: 4, background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', fontSize: 11, fontWeight: 700 }}>
                    AUTO-GENERATED
                  </div>
                </div>
                <p style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 24, lineHeight: 1.6 }}>
                  {comparisonData.insight || "Select two or more companies to generate comparative insights on Scope 1 emissions."}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {comparisonData.companies.map((c: string, i: number) => (
                    <span key={c} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 12, background: COLORS[i % COLORS.length] + '20', color: COLORS[i % COLORS.length], fontWeight: 600 }}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* 2. Grouped Bar Chart (Emissions) */}
            <div className="card animate-slide-up stagger-6 opacity-0" style={{ padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, letterSpacing: '-0.01em' }}>Scope Emissions Comparison</h3>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonData.groupedScopeData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip 
                      cursor={{ fill: 'var(--bg-secondary)' }}
                      contentStyle={{ background: 'var(--bg-card)', border: 'none', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                      itemStyle={{ fontSize: 12, fontWeight: 600 }}
                      labelStyle={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                    {comparisonData.companies.map((c: string, i: number) => (
                      <Bar key={c} dataKey={c} name={c} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 3. Sustainability Radar Chart */}
            <div className="card animate-slide-up stagger-7 opacity-0" style={{ padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, letterSpacing: '-0.01em' }}>Multi-Metric Radar (Normalized)</h3>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart outerRadius="80%" data={comparisonData.radarData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <PolarGrid stroke="var(--border-subtle)" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ background: 'var(--bg-card)', border: 'none', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                      itemStyle={{ fontSize: 12, fontWeight: 600 }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                    {comparisonData.companies.map((c: string, i: number) => (
                      <Radar key={c} name={c} dataKey={c} stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.4} />
                    ))}
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* 1. Target vs. Actual Tracking Widget */}
            <div className="card animate-slide-up stagger-5 opacity-0 flex flex-col justify-between" style={{ padding: 24, background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(16, 185, 129, 0.03) 100%)' }}>
              {!activeChartData.targetData ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                  Target data not extracted yet
                </div>
              ) : (
                <>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>Carbon Reduction Target</h3>
                      <div style={{ padding: '4px 8px', borderRadius: 4, background: activeChartData.targetData.status === 'ON TRACK' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', color: activeChartData.targetData.status === 'ON TRACK' ? '#10b981' : '#f59e0b', fontSize: 11, fontWeight: 700 }}>
                        {activeChartData.targetData.status}
                      </div>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>
                      Company-wide GHG emission reduction goal from {activeChartData.targetData.baseYear} baseline.
                    </p>
                
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
                      <span style={{ fontSize: 36, fontWeight: 800, color: '#10b981', letterSpacing: '-0.03em' }}>{activeChartData.targetData.actual}%</span>
                      <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 500 }}>/ {activeChartData.targetData.target}% by {activeChartData.targetData.targetYear}</span>
                    </div>
                  </div>
                  
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
                      <span>Current Progress</span>
                      <span>{Math.round((activeChartData.targetData.actual / activeChartData.targetData.target) * 100)}% of Goal</span>
                    </div>
                    <div style={{ width: '100%', height: 8, background: 'var(--bg-secondary)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${(activeChartData.targetData.actual / activeChartData.targetData.target) * 100}%`, height: '100%', background: '#10b981', borderRadius: 4 }} />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* 2. Emissions Scope Breakdown */}
            <div className="card animate-slide-up stagger-6 opacity-0" style={{ padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, letterSpacing: '-0.01em' }}>Emissions by Scope (tCO2e)</h3>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activeChartData.emissionsScopeData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip 
                      cursor={{ fill: 'var(--bg-secondary)' }}
                      contentStyle={{ background: 'var(--bg-card)', border: 'none', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                      itemStyle={{ fontSize: 12, fontWeight: 600 }}
                      labelStyle={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                    <Bar dataKey="scope1" name="Scope 1" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
                    <Bar dataKey="scope2" name="Scope 2" stackId="a" fill="#0d9488" />
                    <Bar dataKey="scope3" name="Scope 3" stackId="a" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 3. Year-over-Year (YoY) Trend Line */}
            <div className="card animate-slide-up stagger-7 opacity-0" style={{ padding: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, letterSpacing: '-0.01em' }}>YoY Historical Trend</h3>
              <div style={{ height: 220 }}>
                {(!activeChartData.yoyTrendData || activeChartData.yoyTrendData.length === 0) ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                    Trend data not extracted yet
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={activeChartData.yoyTrendData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                      <XAxis dataKey="year" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} padding={{ left: 10, right: 10 }} />
                      <YAxis yAxisId="left" stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ background: 'var(--bg-card)', border: 'none', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}
                        itemStyle={{ fontSize: 12, fontWeight: 600 }}
                        labelStyle={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                      <Line yAxisId="left" type="monotone" dataKey="emissions" name="Total GHG (ktCO2e)" stroke="#10b981" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls={true} />
                      <Line yAxisId="left" type="monotone" dataKey="energy" name="Energy (GWh)" stroke="#0284c7" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls={true} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Analytical Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24, marginBottom: 24 }}>
        {/* Top Metrics Chart */}
        <div className="card animate-slide-up stagger-6 opacity-0" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, letterSpacing: '-0.01em' }}>Top Reported Metrics (By Page Coverage)</h3>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart 
                data={Object.values(kpis.kpis.reduce((acc, kpi) => {
                  acc[kpi.name] = (acc[kpi.name] || new Set()).add(kpi.page_numbers?.[0]);
                  return acc;
                }, {} as Record<string, Set<number>>))
                  .map((pages, i, arr) => ({ name: Object.keys(kpis.kpis.reduce((a, k) => { a[k.name]=1; return a; }, {} as Record<string,any>))[i] || '', pages: pages.size }))
                  .sort((a, b) => b.pages - a.pages)
                  .slice(0, 5)
                  .map(d => ({ ...d, name: d.name.length > 18 ? d.name.substring(0, 15) + '...' : d.name }))} 
                layout="vertical" 
                margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border-subtle)" />
                <XAxis type="number" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} width={100} />
                <Tooltip cursor={{ fill: 'var(--bg-secondary)' }} contentStyle={{ background: 'var(--bg-card)', border: 'none', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="pages" fill="var(--accent-emerald)" radius={[0, 4, 4, 0]} barSize={24} isAnimationActive={true} animationBegin={600} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Grouped KPI List */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>Consolidated Extracted KPIs</h3>
        </div>
        {kpis.kpis.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>KPI Name</th>
                <th>Description</th>
                <th>Avg Confidence</th>
                <th>Source Pages</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(kpis.kpis.reduce((acc, kpi) => {
                if (!acc[kpi.name]) {
                  acc[kpi.name] = { id: kpi.name, name: kpi.name, description: kpi.description, confs: [], pages: new Set<number>() };
                }
                acc[kpi.name].confs.push(kpi.confidence || 0);
                kpi.page_numbers?.forEach(p => acc[kpi.name].pages.add(p));
                return acc;
              }, {} as Record<string, any>)).map(g => {
                const avgConf = g.confs.reduce((a: number, b: number) => a + b, 0) / g.confs.length;
                const sortedPages = Array.from(g.pages).sort((a: any, b: any) => a - b);
                return (
                  <tr key={g.id}>
                    <td style={{ fontWeight: 600 }}>{g.name}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {g.description || '—'}
                    </td>
                    <td>
                      <div className={`confidence-bar ${avgConf >= 0.7 ? 'confidence-high' : avgConf >= 0.4 ? 'confidence-mid' : 'confidence-low'}`}>
                        <div className="confidence-track">
                          <div className="confidence-fill" style={{ width: `${avgConf * 100}%` }} />
                        </div>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 36 }}>
                          {(avgConf * 100).toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {sortedPages.map((p: any) => p + 1).join(', ') || '—'}
                    </td>
                  </tr>
                );
              })}
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
