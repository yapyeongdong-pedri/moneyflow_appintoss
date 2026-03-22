import { EdgeType, FlowEdge, FlowGraph, FlowNode, NodeType } from './graph-model';

type AllowedMatrix = Record<NodeType, Partial<Record<NodeType, EdgeType>>>;

export const ALLOWED_EDGE_MATRIX: AllowedMatrix = {
  salary_account: {
    asset_account: 'salary_to_account',
    payment_instrument: 'salary_to_card',
    expense_category: 'salary_to_expense'
  },
  income_source: {
    asset_account: 'income_to_account'
  },
  asset_account: {
    asset_account: 'account_to_account',
    payment_instrument: 'account_to_card',
    expense_category: 'account_to_expense',
    liability_bucket: 'account_to_liability'
  },
  payment_instrument: {
    expense_category: 'card_to_expense'
  },
  expense_category: {},
  liability_bucket: {}
};

export function resolveEdgeType(sourceType: NodeType, targetType: NodeType): EdgeType | null {
  return ALLOWED_EDGE_MATRIX[sourceType][targetType] ?? null;
}

export function validateNode(node: FlowNode): string[] {
  const errors: string[] = [];
  if (!node.name.trim()) {
    errors.push('노드 이름은 비어 있을 수 없어요.');
  }
  if (node.name.length > 30) {
    errors.push('노드 이름은 30자 이하여야 해요.');
  }
  return errors;
}

export function validateEdge(edge: FlowEdge, graph: FlowGraph): string[] {
  const errors: string[] = [];
  const source = graph.nodes.find((node) => node.id === edge.sourceId);
  const target = graph.nodes.find((node) => node.id === edge.targetId);

  if (!source || !target) {
    errors.push('연결의 시작/도착 노드가 존재하지 않아요.');
    return errors;
  }

  const expectedType = resolveEdgeType(source.type, target.type);
  if (!expectedType) {
    errors.push('허용되지 않는 노드 연결이에요.');
    return errors;
  }

  if (expectedType !== edge.type) {
    errors.push('연결 타입이 노드 조합 규칙과 맞지 않아요.');
  }

  const duplicate = graph.edges.find(
    (existing) =>
      existing.id !== edge.id &&
      existing.active &&
      edge.active &&
      existing.sourceId === edge.sourceId &&
      existing.targetId === edge.targetId &&
      existing.type === edge.type &&
      (existing.label ?? '') === (edge.label ?? '')
  );

  if (duplicate) {
    errors.push('같은 활성 연결이 이미 있어요.');
  }

  return errors;
}

export function validateGraph(graph: FlowGraph): string[] {
  const errors: string[] = [];
  const nodeIdSet = new Set<string>();
  const edgeIdSet = new Set<string>();

  for (const node of graph.nodes) {
    if (nodeIdSet.has(node.id)) {
      errors.push(`중복된 노드 ID: ${node.id}`);
    }
    nodeIdSet.add(node.id);
    errors.push(...validateNode(node));
  }

  for (const edge of graph.edges) {
    if (edgeIdSet.has(edge.id)) {
      errors.push(`중복된 연결 ID: ${edge.id}`);
    }
    edgeIdSet.add(edge.id);
    errors.push(...validateEdge(edge, graph));
  }

  return errors;
}
