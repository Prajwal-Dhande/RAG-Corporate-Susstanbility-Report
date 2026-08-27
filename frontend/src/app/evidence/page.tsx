'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Search, FileText, Layers, Eye, ChevronRight, Shield, X, ExternalLink
} from 'lucide-react';
import {
  getReport, getReportGraph, getEvidence, getReportPages,
  getStorageUrl, Report, GraphData, GraphEntity, EvidenceData
} from '@/lib/api';

function EvidenceContent() {
  const searchParams = useSearchParams();
  const reportId = searchParams.get('id');

  const [report, setReport] = useState<Report | null>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<GraphEntity | null>(null);
  const [evidence, setEvidence] = useState<EvidenceData | null>(null);
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!reportId) { setLoading(false); return; }
    (async () => {
      try {
        const [r, g] = await Promise.all([
          getReport(reportId),
          getReportGraph(reportId),
        ]);
        setReport(r);
        setGraphData(g);
      } catch { /* empty */ }
      finally { setLoading(false); }
    })();
  }, [reportId]);

  const filteredEntities = graphData?.entities.filter(e => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return e.name.toLowerCase().includes(q) ||
      e.type.toLowerCase().includes(q) ||
      (e.description || '').toLowerCase().includes(q);
  }) || [];

  const selectEntity = async (entity: GraphEntity) => {
    setSelectedEntity(entity);
    if (reportId) {
      try {
        const ev = await getEvidence(reportId, entity.id);
        setEvidence(ev);
        if (entity.page_numbers.length > 0) {
          setSelectedPage(entity.page_numbers[0]);
        }
      } catch { setEvidence(null); }
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>;
  }

  if (!reportId || !report) {
    return (
      <div className="animate-in" style={{ textAlign: 'center', padding: '80px 0' }}>
        <Search size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 16px' }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No Report Selected</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Select a processed report to explore evidence.</p>
      </div>
    );
  }

  return (
    <div className="animate-in">
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 4 }}>
          Evidence Explorer
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          {report.company_name} — Trace extracted facts back to source document regions
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16, height: 'calc(100vh - 160px)' }}>
        {/* Entity List Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Search */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                className="input"
                placeholder="Search entities..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ paddingLeft: 36 }}
              />
            </div>
          </div>

          {/* Entity list */}
          <div className="card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
                {filteredEntities.length} entities
              </span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredEntities.map(entity => (
                <div
                  key={entity.id}
                  onClick={() => selectEntity(entity)}
                  style={{
                    padding: '10px 16px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border-subtle)',
                    background: selectedEntity?.id === entity.id ? 'var(--accent-blue-glow)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseOver={e => {
                    if (selectedEntity?.id !== entity.id)
                      e.currentTarget.style.background = 'var(--bg-card-hover)';
                  }}
                  onMouseOut={e => {
                    if (selectedEntity?.id !== entity.id)
                      e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {entity.type}
                    </span>
                    {entity.page_numbers.length > 0 && (
                      <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                        p.{entity.page_numbers.map(p => p + 1).join(',')}
                      </span>
                    )}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{entity.name}</div>
                  {entity.description && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entity.description}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <div className={`confidence-bar ${(entity.confidence || 0) >= 0.7 ? 'confidence-high' : (entity.confidence || 0) >= 0.4 ? 'confidence-mid' : 'confidence-low'}`} style={{ flex: 1, maxWidth: 80 }}>
                      <div className="confidence-track" style={{ height: 4 }}>
                        <div className="confidence-fill" style={{ width: `${(entity.confidence || 0) * 100}%`, height: 4 }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {((entity.confidence || 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel: Evidence Details + Page Viewer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflow: 'hidden' }}>
          {selectedEntity && evidence ? (
            <>
              {/* Evidence Detail */}
              <div className="evidence-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 12 }}>
                  <div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-emerald)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {selectedEntity.type}
                    </span>
                    <h3 style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{selectedEntity.name}</h3>
                  </div>
                  <button onClick={() => { setSelectedEntity(null); setEvidence(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                    <X size={16} />
                  </button>
                </div>

                {selectedEntity.description && (
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
                    {selectedEntity.description}
                  </p>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
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
                  <div style={{ background: 'var(--bg-secondary)', padding: 10, borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Method</div>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{evidence.provenance.extraction_method || '—'}</div>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', padding: 10, borderRadius: 'var(--radius-sm)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>Model</div>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{evidence.provenance.model_name?.split('/').pop() || '—'}</div>
                  </div>
                </div>

                {/* Page buttons */}
                {evidence.provenance.page_numbers.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Source Pages</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {evidence.provenance.page_numbers.map(p => (
                        <button
                          key={p}
                          className={`btn ${selectedPage === p ? 'btn-primary' : 'btn-secondary'}`}
                          style={{ padding: '4px 12px', fontSize: 12 }}
                          onClick={() => setSelectedPage(p)}
                        >
                          <FileText size={12} /> Page {p + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Related entities */}
                {evidence.related_entities.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                      Related Entities ({evidence.related_entities.length})
                    </div>
                    <div style={{ maxHeight: 120, overflowY: 'auto' }}>
                      {evidence.related_entities.map(re => (
                        <div
                          key={re.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 12, cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)' }}
                          onClick={() => {
                            const ent = graphData?.entities.find(e => e.id === re.id);
                            if (ent) selectEntity(ent);
                          }}
                        >
                          <Layers size={10} style={{ color: 'var(--accent-violet)' }} />
                          <span style={{ flex: 1 }}>{re.name}</span>
                          <span className="badge badge-neutral" style={{ fontSize: 9, padding: '2px 6px' }}>{re.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Page Image Viewer */}
              {selectedPage !== null && (
                <div className="card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Eye size={14} /> Page {selectedPage + 1}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Components: {evidence.provenance.source_component_ids.join(', ') || '—'}
                    </span>
                  </div>
                  <div style={{ flex: 1, overflow: 'auto', padding: 8, display: 'flex', alignItems: 'start', justifyContent: 'center', background: '#0d1117' }}>
                    <img
                      src={getStorageUrl(`pages/${reportId}/page_${String(selectedPage + 1).padStart(4, '0')}.png`)}
                      alt={`Page ${selectedPage + 1}`}
                      style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 4, border: '1px solid var(--border-color)' }}
                      onError={e => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <div style={{ textAlign: 'center' }}>
                <Search size={36} style={{ margin: '0 auto 12px' }} />
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Select an entity</div>
                <div style={{ fontSize: 13 }}>Click on any entity to view its provenance, source pages, and related evidence</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EvidencePage() {
  return (
    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}><div className="spinner" style={{ width: 32, height: 32 }} /></div>}>
      <EvidenceContent />
    </Suspense>
  );
}
