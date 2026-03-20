import { createId, EdgeType, FlowEdge, FlowGraph, FlowNode, NodeType } from './graph-model';
import { resolveEdgeType, validateEdge, validateGraph, validateNode } from './graph-validator';

const MAX_HISTORY = 20;

export interface GraphHistoryState {
  past: FlowGraph[];
  present: FlowGraph;
  future: FlowGraph[];
}

function cloneGraph(graph: FlowGraph): FlowGraph {
  return JSON.parse(JSON.stringify(graph)) as FlowGraph;
}

function pushHistory(state: GraphHistoryState, next: FlowGraph): GraphHistoryState {
  const past = [...state.past, cloneGraph(state.present)].slice(-MAX_HISTORY);
  return { past, present: next, future: [] };
}

export function createHistory(graph: FlowGraph): GraphHistoryState {
  return { past: [], present: graph, future: [] };
}

export function undo(state: GraphHistoryState): GraphHistoryState {
  if (!state.past.length) return state;
  const previous = state.past[state.past.length - 1];
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [cloneGraph(state.present), ...state.future].slice(0, MAX_HISTORY)
  };
}

export function redo(state: GraphHistoryState): GraphHistoryState {
  if (!state.future.length) return state;
  const next = state.future[0];
  return {
    past: [...state.past, cloneGraph(state.present)].slice(-MAX_HISTORY),
    present: next,
    future: state.future.slice(1)
  };
}

export interface AddNodeInput {
  type: NodeType;
  name: string;
  x?: number;
  y?: number;
}

export function addNode(state: GraphHistoryState, input: AddNodeInput): GraphHistoryState {
  const node: FlowNode = {
    id: createId('node'),
    type: input.type,
    name: input.name.trim(),
    ui: {
      x: input.x ?? 0,
      y: input.y ?? 0
    }
  };
  const nodeErrors = validateNode(node);
  if (nodeErrors.length) throw new Error(nodeErrors[0]);
  const graph: FlowGraph = {
    ...state.present,
    nodes: [...state.present.nodes, node]
  };
  return pushHistory(state, graph);
}

export function updateNode(state: GraphHistoryState, nodeId: string, patch: Partial<FlowNode>): GraphHistoryState {
  const graph: FlowGraph = {
    ...state.present,
    nodes: state.present.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node))
  };
  const target = graph.nodes.find((node) => node.id === nodeId);
  if (!target) throw new Error('노드를 찾을 수 없어요.');
  const errors = validateNode(target);
  if (errors.length) throw new Error(errors[0]);
  return pushHistory(state, graph);
}

export function removeNode(state: GraphHistoryState, nodeId: string): GraphHistoryState {
  const graph: FlowGraph = {
    ...state.present,
    nodes: state.present.nodes.filter((node) => node.id !== nodeId),
    edges: state.present.edges.filter((edge) => edge.sourceId !== nodeId && edge.targetId !== nodeId)
  };
  return pushHistory(state, graph);
}

export interface AddEdgeInput {
  sourceId: string;
  targetId: string;
  label?: string;
  amountHint?: string;
  memo?: string;
}

export function addEdge(state: GraphHistoryState, input: AddEdgeInput): GraphHistoryState {
  const source = state.present.nodes.find((node) => node.id === input.sourceId);
  const target = state.present.nodes.find((node) => node.id === input.targetId);
  if (!source || !target) throw new Error('노드를 찾을 수 없어요.');
  const edgeType = resolveEdgeType(source.type, target.type);
  if (!edgeType) throw new Error('허용되지 않는 연결입니다.');

  const edge: FlowEdge = {
    id: createId('edge'),
    type: edgeType as EdgeType,
    sourceId: input.sourceId,
    targetId: input.targetId,
    label: input.label?.trim(),
    amountHint: input.amountHint?.trim(),
    memo: input.memo?.trim(),
    active: true
  };

  const errors = validateEdge(edge, state.present);
  if (errors.length) throw new Error(errors[0]);
  const graph: FlowGraph = {
    ...state.present,
    edges: [...state.present.edges, edge]
  };
  return pushHistory(state, graph);
}

export function updateEdge(state: GraphHistoryState, edgeId: string, patch: Partial<FlowEdge>): GraphHistoryState {
  const graph: FlowGraph = {
    ...state.present,
    edges: state.present.edges.map((edge) => (edge.id === edgeId ? { ...edge, ...patch } : edge))
  };
  const target = graph.edges.find((edge) => edge.id === edgeId);
  if (!target) throw new Error('엣지를 찾을 수 없어요.');
  const errors = validateEdge(target, graph);
  if (errors.length) throw new Error(errors[0]);
  return pushHistory(state, graph);
}

export function removeEdge(state: GraphHistoryState, edgeId: string): GraphHistoryState {
  const graph: FlowGraph = {
    ...state.present,
    edges: state.present.edges.filter((edge) => edge.id !== edgeId)
  };
  return pushHistory(state, graph);
}

export function replaceGraph(state: GraphHistoryState, graph: FlowGraph): GraphHistoryState {
  const errors = validateGraph(graph);
  if (errors.length) throw new Error(errors[0]);
  return pushHistory(state, graph);
}

