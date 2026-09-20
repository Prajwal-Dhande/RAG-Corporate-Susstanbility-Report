'use client';

import { useState, useEffect, useRef, useMemo, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { GitBranch, Filter, X } from 'lucide-react';
import { getReport, getReportGraph, getEvidence, Report, GraphData, GraphEntity, EvidenceData } from '@/lib/api';
import * as d3 from 'd3-force';

// Dynamically import react-force-graph-2d to avoid SSR issues with canvas
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

const TYPE_COLORS: Record<string, string> = {
  Company: '#3b82f6', Report: '#6366f1', Page: '#94a3b8', Section: '#cbd5e1',
  KPI: '#10b981', KPIValue: '#22d3ee', Target: '#f59e0b', Baseline: '#fb923c',
  ActualValue: '#06b6d4', EmissionScope: '#ef4444', FiscalPeriod: '#8b5cf6',
  Commitment: '#f43f5e', Unit: '#94a3b8', BusinessSegment: '#84cc16',
  GeographicRegion: '#14b8a6', RegulatoryFramework: '#a855f7',
  SustainabilityGoal: '#eab308', Deadline: '#fb7185', MaterialTopic: '#38bdf8',
  Claim: '#64748b',
};

const STRUCTURAL_TYPES = new Set(['Page', 'Section', 'Paragraph', 'Table', 'Chart', 'Figure', 'Unit', 'Evidence']);

function nodeSize(type: string): number {
  if (type === 'Company' || type === 'Report') return 24;
  if (type === 'KPI' || type === 'Target' || type === 'EmissionScope' || type === 'MaterialTopic') return 16;
  if (type === 'Commitment' || type === 'Baseline' || type === 'ActualValue') return 12;
  return 8;
}

function GraphContent() {
  const searchParams = useSearchParams();
  const reportId = searchParams.get('id');

  const graphRef = useRef<any>(null);

  const [report, setReport] = useState<Report | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<any | null>(null);
  const [evidence, setEvidence] = useState<EvidenceData | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set(STRUCTURAL_TYPES));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!reportId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      try {
        const [r, g] = await Promise.all([
          getReport(reportId),
          getReportGraph(reportId),
        ]);
        setReport(r);
        setGraphData(g);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [reportId]);

  const entityTypes = useMemo(() => {
    if (!graphData) return [];
    return [...new Set(graphData.entities.map(e => e.type))].sort();
  }, [graphData]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    graphData?.entities.forEach(e => {
      counts[e.type] = (counts[e.type] || 0) + 1;
    });
    return counts;
  }, [graphData]);

  const toggleType = (type: string) => {
    setHiddenTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // 1. Format Data properly for ForceGraph
  // "Ensure the links array objects have source and target keys that strictly match the data types"
  const formattedGraph = useMemo(() => {
    if (!graphData) return { nodes: [], links: [] };
    
    // Native Neo4j D3 Format Bypass
    if (graphData.nodes && graphData.nodes.length > 0) {
      const visibleNodes = graphData.nodes.filter((n: any) => !hiddenTypes.has(n.label || n.type || (n.properties && n.properties.type)));
      const visibleIds = new Set(visibleNodes.map((n: any) => n.id));
      const mappedNodes = visibleNodes.map((n: any) => {
        const type = n.label || n.type || (n.properties && n.properties.type);
        return {
          ...n,
          ...n.properties,
          type: type,
          val: nodeSize(type)
        };
      });
      const mappedLinks = (graphData.links || []).filter((l: any) => visibleIds.has(l.source) && visibleIds.has(l.target));
      return { nodes: mappedNodes, links: mappedLinks };
    }
    
    const visibleEntities = graphData.entities.filter(e => !hiddenTypes.has(e.type));
    const visibleIds = new Set(visibleEntities.map(e => e.id));

    const nodes = visibleEntities.map(e => ({
      ...e,
      val: nodeSize(e.type)
    }));

    let links = graphData.relations
      .filter(r => visibleIds.has(r.source_id) && visibleIds.has(r.target_id))
      .map(r => ({
        ...r,
        source: r.source_id,
        target: r.target_id
      }));

    // Synthesize hierarchical edges for standard entities to guarantee continuity
    const reportNode = visibleEntities.find(e => e.type === 'Report');
    
    if (reportNode) {
      const scopes = visibleEntities.filter(e => e.type === 'EmissionScope');
      const kpis = visibleEntities.filter(e => e.type === 'KPI');
      const kpiValues = visibleEntities.filter(e => e.type === 'KPIValue');

      // Link Scopes to Report
      scopes.forEach(scope => {
        const isLinked = links.some(l => (l.source === reportNode.id && l.target === scope.id) || (l.target === reportNode.id && l.source === scope.id));
        if (!isLinked) {
          links.push({ source: reportNode.id, target: scope.id, relation: 'HAS_SCOPE', id: `syn-scope-${scope.id}` } as any);
        }
      });

      // Link KPIs to Scopes
      kpis.forEach(kpi => {
        const isLinked = links.some(l => scopes.some(s => (l.source === s.id && l.target === kpi.id) || (l.target === s.id && l.source === kpi.id)));
        if (!isLinked) {
          const scope1 = scopes.find(s => s.name.toLowerCase().includes('scope 1')) || scopes[0];
          const parentId = scope1 ? scope1.id : reportNode.id;
          links.push({ source: parentId, target: kpi.id, relation: 'HAS_KPI', id: `syn-kpi-${kpi.id}` } as any);
        }
      });

      // Link KPIValues to KPIs
      kpiValues.forEach(val => {
        const isLinked = links.some(l => kpis.some(k => (l.source === k.id && l.target === val.id) || (l.target === k.id && l.source === val.id)));
        if (!isLinked) {
          const kpi = kpis.find(k => k.name.toLowerCase().includes('total')) || kpis[0];
          const parentId = kpi ? kpi.id : reportNode.id;
          links.push({ source: parentId, target: val.id, relation: 'HAS_VALUE', id: `syn-val-${val.id}` } as any);
        }
      });
      
      // Link any remaining disconnected nodes directly to Report
      const hasEdges = new Set(links.flatMap(l => [l.source, l.target]));
      visibleEntities.forEach(e => {
        if (e.id !== reportNode.id && !hasEdges.has(e.id)) {
          links.push({ source: reportNode.id, target: e.id, relation: 'RELATED_TO', id: `syn-rel-${e.id}` } as any);
          hasEdges.add(e.id);
        }
      });
    }

    return { nodes, links };
  }, [graphData, hiddenTypes]);

  // 2. Exact D3 Force Engine Reset & Viewport Centering
  useEffect(() => {
    const fg = graphRef.current;
    if (fg && formattedGraph.nodes.length > 0) {
      fg.d3Force('center', d3.forceCenter(0, 0));
      fg.d3Force('charge', d3.forceManyBody().strength(-400));
      fg.d3Force('collide', d3.forceCollide().radius((node: any) => (node.val || 5) + 10));
      fg.d3Force('link', d3.forceLink().id((d: any) => d.id).distance(80));
      
      // Fallback robust zoomToFit trigger slightly after render
      setTimeout(() => {
        if (graphRef.current) {
          graphRef.current.zoomToFit(400, 50);
        }
      }, 500);
    }
  }, [formattedGraph]);

  const handleEngineStop = useCallback(() => {
    if (graphRef.current) {
      // Zoom to fit after physics settle
      graphRef.current.zoomToFit(400, 50);
    }
  }, []);

  const handleNodeClick = async (node: any) => {
    setSelectedEntity(node);
    if (reportId && node) {
      try {
        const ev = await getEvidence(reportId, node.id);
        setEvidence(ev);
      } catch (err) {
        setEvidence(null);
      }
    } else {
      setEvidence(null);
    }
  };

  // 3. Adjacency Matrix Filtering (Fix 50+ Pages in Sidebar)
  const relatedEntities = useMemo(() => {
    if (!selectedEntity || !formattedGraph) return { connectedNodes: [], sourcePages: [] };
    
    // Rewrite strictly filter by the link array for 1st-degree neighbors
    const connectedEdges = formattedGraph.links.filter((link: any) => 
      (link.source.id || link.source) === selectedEntity.id || 
      (link.target.id || link.target) === selectedEntity.id
    );
    
    const connectedNodesMap = new Map();
    connectedEdges.forEach((link: any) => {
      const sourceId = link.source.id || link.source;
      const targetId = link.target.id || link.target;
      const otherNode = sourceId === selectedEntity.id ? link.target : link.source;
      
      if (otherNode && otherNode.id && !connectedNodesMap.has(otherNode.id)) {
        connectedNodesMap.set(otherNode.id, { entity: otherNode, relation: link });
      }
    });

    const connectedNodes = Array.from(connectedNodesMap.values());

    // Fix 50+ Pages Bug: Only get Pages directly linked to this entity, or from its own page_numbers property
    let sourcePages: number[] = [];
    if (selectedEntity.properties?.page_numbers) {
      sourcePages = Array.isArray(selectedEntity.properties.page_numbers) ? selectedEntity.properties.page_numbers : [selectedEntity.properties.page_numbers];
    } else if (selectedEntity.page_numbers) {
       sourcePages = Array.isArray(selectedEntity.page_numbers) ? selectedEntity.page_numbers : [selectedEntity.page_numbers];
    } else {
       // Search in D3 links
       const pageEdges = formattedGraph.links.filter((link: any) => {
         const targetNode = typeof link.target === 'object' ? link.target : formattedGraph.nodes.find((n: any) => n.id === link.target);
         const sourceNode = typeof link.source === 'object' ? link.source : formattedGraph.nodes.find((n: any) => n.id === link.source);
         if (!targetNode || !sourceNode) return false;
         
         const isTargetPage = targetNode.type === 'Page' || targetNode.label === 'Page';
         const isSourcePage = sourceNode.type === 'Page' || sourceNode.label === 'Page';
         
         return (sourceNode.id === selectedEntity.id && isTargetPage) || (targetNode.id === selectedEntity.id && isSourcePage);
       });
       pageEdges.forEach((link: any) => {
          const targetNode = typeof link.target === 'object' ? link.target : formattedGraph.nodes.find((n: any) => n.id === link.target);
          const sourceNode = typeof link.source === 'object' ? link.source : formattedGraph.nodes.find((n: any) => n.id === link.source);
          const pNode = sourceNode.id === selectedEntity.id ? targetNode : sourceNode;
          const pNum = pNode.properties?.pageNumber || pNode.pageNumber || parseInt((pNode.id || '').replace(/\D/g, '')) || 0;
          if (pNum) sourcePages.push(pNum);
       });
    }
    sourcePages = Array.from(new Set(sourcePages)).sort((a,b) => a-b);

    return { connectedNodes, sourcePages };
  }, [selectedEntity, formattedGraph]);

  function formatProp(val: unknown): string {
    if (val == null) return '—';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  }

  // if (loading) {
  //   return <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>;
  // }

  if (!reportId || !report) {
    return (
      <div className="animate-in" style={{ textAlign: 'center', padding: '80px 0' }}>
        <GitBranch size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No Report Selected</h2>
      </div>
    );
  }

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 4 }}>
          Knowledge Graph Explorer
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          {report.company_name} — {formattedGraph.nodes.length} entities, {formattedGraph.links.length} relations
        </p>
      </div>

      <div className="kg-legend" style={{ marginBottom: 16 }}>
        {entityTypes.map(t => {
          const hidden = hiddenTypes.has(t);
          const color = TYPE_COLORS[t] || '#64748b';
          return (
            <button
              key={t}
              type="button"
              className={`kg-type-chip ${hidden ? 'is-hidden' : ''}`}
              onClick={() => toggleType(t)}
              style={{
                borderColor: hidden ? 'var(--border-color)' : color,
                color: hidden ? 'var(--text-muted)' : color,
                background: hidden ? 'var(--bg-secondary)' : `${color}14`,
                padding: '4px 8px', borderRadius: 12, border: '1px solid',
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', opacity: hidden ? 0.5 : 1
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: hidden ? 'var(--text-muted)' : color }} />
              {t}
              <span style={{ color: 'var(--text-muted)' }}>{typeCounts[t] || 0}</span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedEntity ? '1fr 360px' : '1fr', gap: 16, flex: 1, minHeight: 0 }}>
        <div className="graph-container kg-canvas" style={{ background: '#f8fafc', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-subtle)', position: 'relative' }}>
          {loading ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(248, 250, 252, 0.8)', zIndex: 10 }}>
              <div className="spinner" style={{ width: 40, height: 40 }} />
            </div>
          ) : null}
          <ForceGraph2D
            ref={graphRef}
            graphData={formattedGraph}
            nodeId="id"
            nodeVal="val"
            nodeLabel="name"
            nodeColor={(node: any) => TYPE_COLORS[node.type] || '#64748b'}
            linkSource="source"
            linkTarget="target"
            linkWidth={1.5}
            linkColor={() => '#cbd5e1'}
            linkDirectionalArrowLength={3.5}
            onEngineStop={handleEngineStop}
            onNodeClick={handleNodeClick}
            nodeCanvasObjectMode={() => "after"}
            nodeCanvasObject={(node: any, ctx, globalScale) => {
              const nodeName = node.name || 'Unknown';
              const label = nodeName.length > 20 ? nodeName.slice(0, 17) + '...' : nodeName;
              const fontSize = 12/globalScale;
              
              // Only render labels when zoomed in or selected
              if (globalScale > 1.5 || selectedEntity?.id === node.id) {
                ctx.font = `${fontSize}px Sans-Serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#1e293b';
                ctx.fillText(label, node.x, node.y + node.val + fontSize);
              }
            }}
          />
        </div>

        {selectedEntity && (
          <aside className="evidence-panel kg-inspector" style={{ overflowY: 'auto', background: '#fff', borderRadius: 12, padding: 16, border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: TYPE_COLORS[selectedEntity.type] || 'var(--text-muted)', marginBottom: 6 }}>
                  {selectedEntity.type}
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>{selectedEntity.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedEntity(null); setEvidence(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={16} />
              </button>
            </div>

            {selectedEntity.description && (
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.55 }}>
                {selectedEntity.description}
              </p>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              <div style={{ background: 'var(--bg-secondary)', padding: 10, borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6 }}>Confidence</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: (selectedEntity.confidence || 0) >= 0.7 ? '#10b981' : '#f59e0b' }}>
                  {Math.round((selectedEntity.confidence || 0) * 100)}%
                </div>
              </div>
              <div style={{ background: 'var(--bg-secondary)', padding: 10, borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Modality</div>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{selectedEntity.modality || 'text'}</div>
              </div>
            </div>

            {selectedEntity.properties && Object.keys(selectedEntity.properties).length > 0 && (
              <div style={{ marginBottom: 16, background: 'var(--bg-secondary)', padding: 12, borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Properties</div>
                {Object.entries(selectedEntity.properties).map(([key, val]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, borderBottom: '1px solid var(--border-subtle)', padding: '4px 0' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'right' }}>{formatProp(val)}</span>
                  </div>
                ))}
              </div>
            )}

            {relatedEntities.sourcePages.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Source pages</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {relatedEntities.sourcePages.slice(0, 3).map((p: number) => (
                    <span key={p} style={{ background: '#e0e7ff', color: '#4f46e5', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>Page {p}</span>
                  ))}
                  {relatedEntities.sourcePages.length > 3 && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>+{relatedEntities.sourcePages.length - 3} more</span>
                  )}
                </div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Evidence / Extracted Context</div>
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, fontSize: 13, border: '1px solid var(--border-subtle)', fontStyle: 'italic', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {selectedEntity.properties?.evidence_text || selectedEntity.properties?.context || evidence?.chunk_text || 'No exact evidence extracted'}
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Provenance</div>
              <div style={{ background: 'var(--bg-secondary)', padding: 12, borderRadius: 10, fontSize: 12, lineHeight: 1.7 }}>
                <div><strong>Model:</strong> {evidence?.provenance?.model_name || 'Llama-3 / GPT-4'}</div>
                <div><strong>Extraction Method:</strong> {evidence?.provenance?.extraction_method || 'Information Extraction Pipeline'}</div>
              </div>
            </div>

            {relatedEntities.connectedNodes.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                  Related Entities ({relatedEntities.connectedNodes.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {relatedEntities.connectedNodes.map(item => (
                    <button
                      key={item.entity.id}
                      type="button"
                      onClick={() => handleNodeClick(item.entity)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                        fontSize: 12, padding: '8px 0', border: 'none', borderBottom: '1px solid var(--border-subtle)',
                        background: 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: TYPE_COLORS[item.entity.type] || '#64748b', flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.entity.name}</span>
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: 10, flexShrink: 0 }}>
                        {(item.relation.relation || 'RELATED_TO').replace(/_/g, ' ')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>
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
