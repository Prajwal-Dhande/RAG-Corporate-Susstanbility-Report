'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { GitBranch, Filter, ZoomIn, ZoomOut, Maximize2, X } from 'lucide-react';
import { getReport, getReportGraph, getEvidence, Report, GraphData, GraphEntity, EvidenceData } from '@/lib/api';

// Entity type color map
const TYPE_COLORS: Record<string, string> = {
  Company: '#3b82f6',
  Report: '#6366f1',
  Page: '#64748b',
  KPI: '#10b981',
  KPIValue: '#22d3ee',
  Target: '#f59e0b',
  Baseline: '#fb923c',
  ActualValue: '#06b6d4',
  EmissionScope: '#ef4444',
  FiscalPeriod: '#a78bfa',
  Commitment: '#f43f5e',
  Unit: '#94a3b8',
  BusinessSegment: '#84cc16',
  GeographicRegion: '#14b8a6',
  RegulatoryFramework: '#e879f9',
  SustainabilityGoal: '#fbbf24',
  Deadline: '#fb7185',
  MaterialTopic: '#38bdf8',
};

function GraphContent() {
  const searchParams = useSearchParams();
  const reportId = searchParams.get('id');

  const [report, setReport] = useState<Report | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<GraphEntity | null>(null);
  const [evidence, setEvidence] = useState<EvidenceData | null>(null);
  const [filterType, setFilterType] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!reportId) { setLoading(false); return; }
    (async () => {
      try {
        const [r, g] = await Promise.all([
          getReport(reportId),
          getReportGraph(reportId, filterType || undefined),
        ]);
        setReport(r);
        setGraphData(g);
      } catch { /* empty */ }
      finally { setLoading(false); }
    })();
  }, [reportId, filterType]);

  // Layout — force-directed simplified
  useEffect(() => {
    if (!graphData || graphData.entities.length === 0) return;
    const pos: Record<string, { x: number; y: number }> = {};
    const entities = graphData.entities;
    const cx = 400, cy = 300;

    // Group by type
    const typeGroups: Record<string, GraphEntity[]> = {};
    entities.forEach(e => {
      const t = e.type;
      if (!typeGroups[t]) typeGroups[t] = [];
      typeGroups[t].push(e);
    });

    const typeKeys = Object.keys(typeGroups);
    typeKeys.forEach((type, ti) => {
      const group = typeGroups[type];
      const angle0 = (2 * Math.PI * ti) / typeKeys.length;
      const radius = 180 + group.length * 5;
      group.forEach((e, ei) => {
        const spread = group.length > 1 ? (Math.PI / 3) * ((ei / (group.length - 1)) - 0.5) : 0;
        const a = angle0 + spread;
        pos[e.id] = {
          x: cx + radius * Math.cos(a) + (Math.random() - 0.5) * 30,
          y: cy + radius * Math.sin(a) + (Math.random() - 0.5) * 30,
        };
      });
    });

    setPositions(pos);
  }, [graphData]);

  // Canvas rendering
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !graphData) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width = canvas.offsetWidth * 2;
    const h = canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2); // HiDPI

    ctx.clearRect(0, 0, w / 2, h / 2);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    // Draw edges
    graphData.relations.forEach(rel => {
      const src = positions[rel.source_id];
      const tgt = positions[rel.target_id];
      if (!src || !tgt) return;

      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)'; // Darker slate for light mode
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Draw nodes
    graphData.entities.forEach(entity => {
      const pos = positions[entity.id];
      if (!pos) return;

      const color = TYPE_COLORS[entity.type] || '#64748b';
      const isSelected = selectedEntity?.id === entity.id;
      const radius = isSelected ? 12 : 7;

      // Glow / Shadow effect
      ctx.shadowColor = color;
      ctx.shadowBlur = isSelected ? 20 : 5;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 4;

      if (isSelected) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 22, 0, Math.PI * 2);
        ctx.fillStyle = color + '20';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      
      // 3D Ball Effect using Radial Gradient
      const gradient = ctx.createRadialGradient(
        pos.x - radius * 0.3, pos.y - radius * 0.3, radius * 0.1, // Highlight source
        pos.x, pos.y, radius // Outer edge
      );
      gradient.addColorStop(0, '#ffffff'); // Shiny highlight
      gradient.addColorStop(0.3, color); // Base color
      gradient.addColorStop(1, '#00000080'); // Dark shadow on the edge
      
      ctx.fillStyle = gradient;
      ctx.fill();
      
      // Reset shadow for stroke and text
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      ctx.strokeStyle = isSelected ? '#0f172a' : '#ffffff';
      ctx.lineWidth = isSelected ? 3 : 1.5;
      ctx.stroke();

      // Label
      ctx.font = `${isSelected ? '700' : '500'} ${isSelected ? 12 : 10}px Inter, sans-serif`;
      ctx.fillStyle = isSelected ? '#0f172a' : '#334155'; // Dark slate for light mode
      ctx.textAlign = 'center';
      const label = entity.name.length > 25 ? entity.name.slice(0, 22) + '...' : entity.name;
      ctx.fillText(label, pos.x, pos.y + radius + 14);
    });

    ctx.restore();
  }, [graphData, positions, selectedEntity, zoom, pan]);

  useEffect(() => { draw(); }, [draw]);

  // Canvas click → find entity
  const handleCanvasClick = async (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !graphData) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - pan.x) / zoom;
    const my = (e.clientY - rect.top - pan.y) / zoom;

    let closest: GraphEntity | null = null;
    let minDist = 20;
    graphData.entities.forEach(entity => {
      const pos = positions[entity.id];
      if (!pos) return;
      const dist = Math.sqrt((mx - pos.x) ** 2 + (my - pos.y) ** 2);
      if (dist < minDist) {
        minDist = dist;
        closest = entity;
      }
    });

    if (closest) {
      setSelectedEntity(closest);
      if (reportId) {
        try {
          const ev = await getEvidence(reportId, (closest as GraphEntity).id);
          setEvidence(ev);
        } catch { setEvidence(null); }
      }
    } else {
      setSelectedEntity(null);
      setEvidence(null);
    }
  };

  // Pan handling
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };
  const handleMouseUp = () => setDragging(false);

  const entityTypes = graphData ? [...new Set(graphData.entities.map(e => e.type))] : [];

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>;
  }

  if (!reportId || !report) {
    return (
      <div className="animate-in" style={{ textAlign: 'center', padding: '80px 0' }}>
        <GitBranch size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No Report Selected</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Select a processed report to explore its knowledge graph.</p>
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 4 }}>
          Knowledge Graph Explorer
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          {report.company_name} — {graphData?.entity_count || 0} entities, {graphData?.relation_count || 0} relations
        </p>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={14} style={{ color: 'var(--text-muted)' }} />
          <select
            className="input"
            style={{ width: 200, padding: '6px 10px', fontSize: 13 }}
            value={filterType}
            onChange={e => { setFilterType(e.target.value); setLoading(true); }}
          >
            <option value="">All Entity Types</option>
            {entityTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => setZoom(z => Math.min(z + 0.2, 3))}>
          <ZoomIn size={14} />
        </button>
        <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => setZoom(z => Math.max(z - 0.2, 0.3))}>
          <ZoomOut size={14} />
        </button>
        <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
          <Maximize2 size={14} />
        </button>

        {/* Legend */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {entityTypes.slice(0, 6).map(t => (
            <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: TYPE_COLORS[t] || '#64748b' }} />
              {t}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedEntity ? '1fr 360px' : '1fr', gap: 16 }}>
        {/* Graph Canvas */}
        <div className="graph-container" style={{ position: 'relative' }}>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%', cursor: dragging ? 'grabbing' : 'grab' }}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          {(!graphData || graphData.entities.length === 0) && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              No graph data. Process a report first.
            </div>
          )}
        </div>

        {/* Entity Detail Panel */}
        {selectedEntity && (
          <div className="evidence-panel" style={{ maxHeight: 600, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: TYPE_COLORS[selectedEntity.type] || 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  {selectedEntity.type}
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>{selectedEntity.name}</h3>
              </div>
              <button onClick={() => { setSelectedEntity(null); setEvidence(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={16} />
              </button>
            </div>

            {selectedEntity.description && (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.5 }}>
                {selectedEntity.description}
              </p>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              <div style={{ background: 'var(--bg-secondary)', padding: 10, borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Confidence</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: (selectedEntity.confidence || 0) >= 0.7 ? 'var(--status-success)' : 'var(--status-warning)' }}>
                  {((selectedEntity.confidence || 0) * 100).toFixed(0)}%
                </div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', padding: 10, borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Modality</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{selectedEntity.modality || 'text'}</div>
              </div>
            </div>

            {selectedEntity.page_numbers.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Source Pages</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {selectedEntity.page_numbers.map(p => (
                    <span key={p} className="badge badge-info" style={{ fontSize: 11 }}>
                      Page {p + 1}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Provenance from evidence */}
            {evidence && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>Provenance</div>
                <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                  <div><strong>Method:</strong> {evidence.provenance.extraction_method}</div>
                  <div><strong>Model:</strong> {evidence.provenance.model_name}</div>
                  <div><strong>Components:</strong> {evidence.provenance.source_component_ids.join(', ') || '—'}</div>
                </div>

                {evidence.related_entities.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Related Entities</div>
                    {evidence.related_entities.slice(0, 10).map(re => (
                      <div key={re.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, borderBottom: '1px solid var(--border-subtle)' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: TYPE_COLORS[re.type] || '#64748b' }} />
                        <span style={{ flex: 1 }}>{re.name}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{re.type}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function GraphPage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>}>
      <GraphContent />
    </Suspense>
  );
}
