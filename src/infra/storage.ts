import { FlowGraph } from '../domain/graph-model';

const STORAGE_KEY = 'money-flow-graph-v1';

export function saveGraph(graph: FlowGraph): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(graph));
}

export function loadGraph(): FlowGraph | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FlowGraph;
  } catch {
    return null;
  }
}

