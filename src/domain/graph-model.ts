export type NodeType =
  | 'income_source'
  | 'asset_account'
  | 'payment_instrument'
  | 'expense_category'
  | 'liability_bucket';

export interface FlowNode {
  id: string;
  type: NodeType;
  name: string;
  meta?: {
    subtype?: string;
    note?: string;
  };
  ui?: {
    x?: number;
    y?: number;
    collapsed?: boolean;
  };
}

export type EdgeType =
  | 'income_to_account'
  | 'account_to_card'
  | 'account_to_expense'
  | 'card_to_expense'
  | 'account_to_liability';

export interface FlowEdge {
  id: string;
  type: EdgeType;
  sourceId: string;
  targetId: string;
  label?: string;
  amountHint?: string;
  memo?: string;
  active: boolean;
}

export type ThemeName = 'calm-mint' | 'deep-ocean' | 'warm-sand';

export interface FlowGraph {
  version: 1;
  nodes: FlowNode[];
  edges: FlowEdge[];
  settings: {
    theme: ThemeName;
    legendVisible: boolean;
  };
}

export const NODE_TYPE_LABEL: Record<NodeType, string> = {
  income_source: '수입원',
  asset_account: '자산 계좌',
  payment_instrument: '결제 수단',
  expense_category: '지출 항목',
  liability_bucket: '부채 버킷'
};

export const EDGE_TYPE_LABEL: Record<EdgeType, string> = {
  income_to_account: '수입->계좌',
  account_to_card: '계좌->카드',
  account_to_expense: '계좌->지출',
  card_to_expense: '카드->지출',
  account_to_liability: '계좌->부채'
};

let idCounter = 0;
export function createId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

