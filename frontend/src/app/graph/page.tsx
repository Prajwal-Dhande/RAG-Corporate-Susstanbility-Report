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
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set(['Page']));
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

  // Layout — Force-directed physics simulation
  useEffect(() => {
    if (!graphData || graphData.entities.length === 0) return;
    const pos: Record<string, { x: number; y: number; vx: number; vy: number }> = {};
    const entities = graphData.entities;
    const relations = graphData.relations;
    const cx = window.innerWidth / 2 || 400;
    const cy = window.innerHeight / 2 || 300;

    // 1. Initialize randomly around center
    entities.forEach(e => {
      pos[e.id] = {
        x: cx + (Math.random() - 0.5) * 600,
        y: cy + (Math.random() - 0.5) * 600,
        vx: 0, vy: 0
      };
    });

    // 2. Simulate physics synchronously (Fruchterman-Reingold with Hierarchical Radial Gravity)
    const k = Math.sqrt((800 * 600) / (entities.length || 1)) * 1.5; // Optimal distance

    // Radius map for semantic hierarchy
    const typeRadius: Record<string, number> = {
      'Company': 0,
      'Report': 0,
      'EmissionScope': 120,
      'MaterialTopic': 120,
      'BusinessSegment': 120,
      'KPI': 250,
      'Target': 250,
      'Baseline': 250,
    };
    const defaultRadius = 380; // KPIValue, Unit, Page, etc.
    
    for (let iter = 0; iter < 150; iter++) {
      // Repulsion
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const u = pos[entities[i].id];
          const v = pos[entities[j].id];
          let dx = u.x - v.x;
          let dy = u.y - v.y;
          if (dx === 0 && dy === 0) { dx = (Math.random() - 0.5); dy = (Math.random() - 0.5); }
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          if (dist < k * 2) {
            // Decrease repulsion by 50%
            const force = ((k * k) / dist) * 0.5;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            u.vx += fx; u.vy += fy;
            v.vx -= fx; v.vy -= fy;
          }
        }
      }

      // Attraction (Edges)
      relations.forEach(rel => {
        const u = pos[rel.source_id];
        const v = pos[rel.target_id];
        if (!u || !v) return;
        let dx = u.x - v.x;
        let dy = u.y - v.y;
        if (dx === 0 && dy === 0) { dx = (Math.random() - 0.5); dy = (Math.random() - 0.5); }
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        // Tighten springs: Increase attraction by 300%
        const force = (dist * dist) / k;
        const fx = (dx / dist) * force * 1.5;
        const fy = (dy / dist) * force * 1.5;
        u.vx -= fx; u.vy -= fy;
        v.vx += fx; v.vy += fy;
      });

      // Hierarchical Radial Gravity and Position Update
      entities.forEach(e => {
        const u = pos[e.id];
        
        const targetR = typeRadius[e.type] ?? defaultRadius;
        const angle = Math.atan2(u.y - cy, u.x - cx);
        const targetX = cx + Math.cos(angle) * targetR;
        const targetY = cy + Math.sin(angle) * targetR;
        
        // Strong pull towards the target semantic ring
        u.vx += (targetX - u.x) * 0.12; 
        u.vy += (targetY - u.y) * 0.12;
        
        // Clamp velocity to prevent physics explosion
        const speed = Math.sqrt(u.vx * u.vx + u.vy * u.vy);
        const maxSpeed = 50;
        if (speed > maxSpeed) {
           u.vx = (u.vx / speed) * maxSpeed;
           u.vy = (u.vy / speed) * maxSpeed;
        }

        u.vx *= 0.6; // Friction
        u.vy *= 0.6;
        
        u.x += u.vx;
        u.y += u.vy;
        
        // Failsafe for NaN
        if (!isFinite(u.x) || isNaN(u.x)) u.x = cx + Math.random() * 10;
        if (!isFinite(u.y) || isNaN(u.y)) u.y = cy + Math.random() * 10;
      });
    }

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

    // Filter visible entities based on hiddenTypes
    const visibleEntityIds = new Set(
      graphData.entities.filter(e => !hiddenTypes.has(e.type)).map(e => e.id)
    );

    // Count connections per visible node for sizing
    const connectionCount: Record<string, number> = {};
    graphData.relations.forEach(rel => {
      if (visibleEntityIds.has(rel.source_id) && visibleEntityIds.has(rel.target_id)) {
        connectionCount[rel.source_id] = (connectionCount[rel.source_id] || 0) + 1;
        connectionCount[rel.target_id] = (connectionCount[rel.target_id] || 0) + 1;
      }
    });

    // Draw edges
    graphData.relations.forEach(rel => {
      if (!visibleEntityIds.has(rel.source_id) || !visibleEntityIds.has(rel.target_id)) return;
      const src = positions[rel.source_id];
      const tgt = positions[rel.target_id];
      if (!src || !tgt) return;

      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Draw nodes
    graphData.entities.forEach(entity => {
      if (!visibleEntityIds.has(entity.id)) return;
      const pos = positions[entity.id];
      if (!pos || !isFinite(pos.x) || !isFinite(pos.y)) return;

      const color = TYPE_COLORS[entity.type] || '#64748b';
      const isSelected = selectedEntity?.id === entity.id;
      // Semantic node sizing based on hierarchy
      let baseRadius = 8; // Default for leaves (KPIValue, Unit, Page)
      if (entity.type === 'Company' || entity.type === 'Report') baseRadius = 26;
      else if (entity.type === 'EmissionScope' || entity.type === 'MaterialTopic' || entity.type === 'BusinessSegment') baseRadius = 18;
      else if (entity.type === 'KPI' || entity.type === 'Target' || entity.type === 'Baseline') baseRadius = 12;

      const radius = isSelected ? baseRadius + 6 : baseRadius;

      ctx.shadowColor = color;
      ctx.shadowBlur = isSelected ? 20 : 3;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;

      if (isSelected) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius + 10, 0, Math.PI * 2);
        ctx.fillStyle = color + '20';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);

      // 3D Ball Effect using Radial Gradient
      const safeRadius = Math.max(radius, 1);
      const gradient = ctx.createRadialGradient(
        pos.x - safeRadius * 0.3, pos.y - safeRadius * 0.3, safeRadius * 0.1,
        pos.x, pos.y, safeRadius
      );
      gradient.addColorStop(0, '#ffffff');
      gradient.addColorStop(0.3, color);
      gradient.addColorStop(1, '#00000080');

      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      ctx.strokeStyle = isSelected ? '#0f172a' : '#ffffff';
      ctx.lineWidth = isSelected ? 3 : 1.5;
      ctx.stroke();

      // Semantic label visibility: Always show important nodes
      const alwaysShow = ['Company', 'Report', 'EmissionScope', 'MaterialTopic', 'BusinessSegment', 'KPI', 'Target'].includes(entity.type);
      const showLabel = isSelected || alwaysShow;
      if (showLabel) {
        ctx.font = `${isSelected ? '700' : '500'} ${isSelected ? 12 : 10}px Inter, sans-serif`;
        ctx.fillStyle = isSelected ? '#0f172a' : '#475569';
        ctx.textAlign = 'center';
        const label = entity.name.length > 20 ? entity.name.slice(0, 17) + '...' : entity.name;
        ctx.fillText(label, pos.x, pos.y + radius + 14);
      }
    });

    ctx.restore();
  }, [graphData, positions, selectedEntity, zoom, pan, hiddenTypes]);

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

  const entityTypes = graphData ? [...new Set(graphData.entities.map(e => e.type))].sort() : [];
  const toggleType = (type: string) => {
    setHiddenTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) { next.delete(type); } else { next.add(type); }
      return next;
    });
  };

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

        {/* Interactive Legend — click to toggle types */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {entityTypes.map(t => {
            const isHidden = hiddenTypes.has(t);
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, fontSize: 11,
                  padding: '3px 8px', borderRadius: 12,
                  border: `1px solid ${isHidden ? 'var(--border-color)' : (TYPE_COLORS[t] || '#64748b')}`,
                  background: isHidden ? 'var(--bg-secondary)' : (TYPE_COLORS[t] || '#64748b') + '15',
                  color: isHidden ? 'var(--text-muted)' : (TYPE_COLORS[t] || '#64748b'),
                  cursor: 'pointer', opacity: isHidden ? 0.5 : 1,
                  textDecoration: isHidden ? 'line-through' : 'none',
                  fontWeight: 600, transition: 'all 0.2s',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: isHidden ? 'var(--text-muted)' : (TYPE_COLORS[t] || '#64748b') }} />
                {t}
              </button>
            );
          })}
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

            {/* Entity Properties */}
            {selectedEntity.properties && Object.keys(selectedEntity.properties).length > 0 && (
              <div style={{ marginBottom: 16, background: 'var(--bg-secondary)', padding: 12, borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Properties</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(selectedEntity.properties).map(([key, val]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{String(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Provenance</div>
              <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 'var(--radius-md)', fontSize: 12, lineHeight: 1.8 }}>
                <div><strong>Method:</strong> {evidence?.extraction_method || '—'}</div>
                <div><strong>Model:</strong> {evidence?.model_used || '—'}</div>
                <div><strong>Components:</strong> {evidence?.source_components?.join(', ') || '—'}</div>
              </div>
            </div>

            {/* Related entities */}
            {graphData && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Related Entities</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {graphData.relations
                    .filter(r => r.source_id === selectedEntity.id || r.target_id === selectedEntity.id)
                    .slice(0, 8)
                    .map(r => {
                      const otherId = r.source_id === selectedEntity.id ? r.target_id : r.source_id;
                      const otherName = r.source_id === selectedEntity.id ? r.target_name : r.source_name;
                      const otherEntity = graphData.entities.find(e => e.id === otherId);
                      return (
                        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: TYPE_COLORS[otherEntity?.type || ''] || '#64748b', flexShrink: 0 }} />
                            <span style={{ fontWeight: 500 }}>{otherName}</span>
                          </div>
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{otherEntity?.type || ''}</span>
                        </div>
                      );
                    })}
                </div>
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
    <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>}>
      <GraphContent />
    </Suspense>
  );
}
