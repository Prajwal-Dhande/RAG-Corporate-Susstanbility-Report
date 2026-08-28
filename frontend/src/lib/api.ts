/**
 * Sustainability MMKG-RAG: API Client
 * Typed client for all backend REST endpoints
 */

import axios, { AxiosInstance } from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const api: AxiosInstance = axios.create({
  baseURL: API_BASE,
  timeout: 120000,
  headers: { 'Content-Type': 'application/json' },
});

/* ── Types ── */

export interface Report {
  id: string;
  company_id: string;
  company_name?: string;
  title: string;
  fiscal_year?: number;
  report_type?: string;
  file_name: string;
  file_size_bytes?: number;
  page_count?: number;
  version: number;
  status: string;
  processing_progress?: number;
  processing_message?: string;
  error_message?: string;
  entity_count: number;
  relation_count: number;
  kpi_count: number;
  target_count: number;
  created_at: string;
  updated_at: string;
}

export interface GraphEntity {
  id: string;
  name: string;
  type: string;
  modality?: string;
  description?: string;
  confidence?: number;
  page_numbers: number[];
  source_component_ids: string[];
  properties: Record<string, unknown>;
}

export interface GraphRelation {
  id: string;
  source_id: string;
  source_name: string;
  relation: string;
  target_id: string;
  target_name: string;
  confidence?: number;
  description?: string;
}

export interface GraphData {
  entities: GraphEntity[];
  relations: GraphRelation[];
  entity_count: number;
  relation_count: number;
}

export interface ReasoningStep {
  step: number;
  action: string;
  description: string;
  entity_name?: string;
  value?: unknown;
  evidence_pages: number[];
}

export interface TargetResult {
  analysis_type: string;
  status: string;
  conclusion: {
    target_name?: string;
    kpi_name?: string;
    target_value?: number;
    baseline_value?: number;
    current_value?: number;
    gap?: number;
    progress_percent?: number;
    status?: string;
    deadline?: string;
  };
  reasoning_path: ReasoningStep[];
  evidence_pages: number[];
  confidence: number;
  warnings: string[];
}

export interface EvidenceData {
  entity_id: string;
  entity_name: string;
  entity_type: string;
  provenance: {
    page_numbers: number[];
    source_component_ids: string[];
    extraction_method: string;
    model_name: string;
    confidence: number;
    source_text: string;
  };
  related_entities: { id: string; name: string; type: string; confidence: number }[];
  relations: { source_id: string; target_id: string; relation: string; confidence: number }[];
}

/* ── API Functions ── */

export async function uploadReport(
  file: File,
  companyName: string,
  fiscalYear?: number,
  reportType: string = 'sustainability'
): Promise<{ id: string; status: string; message: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('company_name', companyName);
  if (fiscalYear) formData.append('fiscal_year', fiscalYear.toString());
  formData.append('report_type', reportType);
  const { data } = await api.post('/api/reports/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function getReports(): Promise<Report[]> {
  const { data } = await api.get('/api/reports');
  return data;
}

export async function getReport(id: string): Promise<Report> {
  const { data } = await api.get(`/api/reports/${id}`);
  return data;
}

export async function getReportStatus(id: string) {
  const { data } = await api.get(`/api/reports/${id}/status`);
  return data;
}

export async function getReportGraph(id: string, entityType?: string): Promise<GraphData> {
  const params = entityType ? { entity_type: entityType } : {};
  const { data } = await api.get(`/api/reports/${id}/graph`, { params });
  return data;
}

export async function getGraphEntity(reportId: string, entityId: string) {
  const { data } = await api.get(`/api/reports/${reportId}/graph/entity/${entityId}`);
  return data;
}

export async function getKPIs(reportId: string) {
  const { data } = await api.get(`/api/reports/${reportId}/kpis`);
  return data;
}

export async function getTargets(reportId: string) {
  const { data } = await api.get(`/api/reports/${reportId}/targets`);
  return data;
}

export async function analyzeTargetProgress(reportId: string): Promise<{ results: TargetResult[] }> {
  const { data } = await api.post(`/api/reports/${reportId}/analysis/target-progress`);
  return data;
}

export async function analyzeEmissions(reportId: string) {
  const { data } = await api.post(`/api/reports/${reportId}/analysis/emissions`);
  return data;
}

export async function analyzeEnergy(reportId: string) {
  const { data } = await api.post(`/api/reports/${reportId}/analysis/energy`);
  return data;
}

export async function analyzeConsistency(reportId: string) {
  const { data } = await api.get(`/api/reports/${reportId}/analysis/consistency`);
  return data;
}

export async function getBenchmarkData(reportIds: string[]) {
  const { data } = await api.post(`/api/reports/analysis/benchmark`, reportIds);
  return data;
}

export async function getLongitudinalData(companyId: string) {
  const { data } = await api.post(`/api/reports/analysis/longitudinal`, { company_id: companyId });
  return data;
}

export async function getEvidence(reportId: string, entityId: string): Promise<EvidenceData> {
  const { data } = await api.get(`/api/reports/${reportId}/evidence/${entityId}`);
  return data;
}

export async function getReportPages(reportId: string) {
  const { data } = await api.get(`/api/reports/${reportId}/pages`);
  return data;
}

export function getStorageUrl(path: string): string {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return `${API_BASE}/storage/${path}`;
}
