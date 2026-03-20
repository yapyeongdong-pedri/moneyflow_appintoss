import { FlowGraph } from '../../domain/graph-model';

interface Template {
  id: string;
  name: string;
  description: string;
  createGraph: () => FlowGraph;
}

function baseGraph(): FlowGraph {
  return {
    version: 1,
    nodes: [],
    edges: [],
    settings: {
      theme: 'calm-mint',
      legendVisible: true
    }
  };
}

export const templates: Template[] = [
  {
    id: 'salary-basic',
    name: '월급 + 통장 + 카드 + 생활비',
    description: '가장 빠르게 시작할 수 있는 기본 구조',
    createGraph: () => ({
      ...baseGraph(),
      nodes: [
        { id: 'n1', type: 'income_source', name: '월급', ui: { x: 40, y: 180 } },
        { id: 'n2', type: 'asset_account', name: '주거래 통장', ui: { x: 260, y: 180 } },
        { id: 'n3', type: 'payment_instrument', name: '신용카드', ui: { x: 480, y: 120 } },
        { id: 'n4', type: 'expense_category', name: '생활비', ui: { x: 700, y: 80 } },
        { id: 'n5', type: 'expense_category', name: '관리비/통신비', ui: { x: 700, y: 240 } }
      ],
      edges: [
        { id: 'e1', type: 'income_to_account', sourceId: 'n1', targetId: 'n2', label: '입금', active: true },
        { id: 'e2', type: 'account_to_card', sourceId: 'n2', targetId: 'n3', label: '결제계좌', active: true },
        { id: 'e3', type: 'card_to_expense', sourceId: 'n3', targetId: 'n4', label: '카드 사용', active: true },
        { id: 'e4', type: 'account_to_expense', sourceId: 'n2', targetId: 'n5', label: '자동이체', active: true }
      ]
    })
  },
  {
    id: 'split-accounts',
    name: '월급 + 분리 계좌(생활/저축/투자)',
    description: '돈의 목적을 계좌 단위로 나눠서 관리',
    createGraph: () => ({
      ...baseGraph(),
      nodes: [
        { id: 'n1', type: 'income_source', name: '월급', ui: { x: 40, y: 260 } },
        { id: 'n2', type: 'asset_account', name: '생활비 통장', ui: { x: 260, y: 120 } },
        { id: 'n3', type: 'asset_account', name: '저축 통장', ui: { x: 260, y: 260 } },
        { id: 'n4', type: 'asset_account', name: '투자 계좌', ui: { x: 260, y: 400 } },
        { id: 'n5', type: 'expense_category', name: '고정비', ui: { x: 520, y: 120 } }
      ],
      edges: [
        { id: 'e1', type: 'income_to_account', sourceId: 'n1', targetId: 'n2', label: '생활비', active: true },
        { id: 'e2', type: 'income_to_account', sourceId: 'n1', targetId: 'n3', label: '저축', active: true },
        { id: 'e3', type: 'income_to_account', sourceId: 'n1', targetId: 'n4', label: '투자', active: true },
        { id: 'e4', type: 'account_to_expense', sourceId: 'n2', targetId: 'n5', label: '자동이체', active: true }
      ]
    })
  },
  {
    id: 'debt-aware',
    name: '대출 포함 구조',
    description: '부채 상환 경로를 함께 시각화',
    createGraph: () => ({
      ...baseGraph(),
      nodes: [
        { id: 'n1', type: 'income_source', name: '월급', ui: { x: 40, y: 220 } },
        { id: 'n2', type: 'asset_account', name: '하나은행 통장', ui: { x: 260, y: 220 } },
        { id: 'n3', type: 'liability_bucket', name: '주택담보대출', ui: { x: 520, y: 110 } },
        { id: 'n4', type: 'expense_category', name: '대출원리금', ui: { x: 760, y: 110 } },
        { id: 'n5', type: 'expense_category', name: '생활비', ui: { x: 520, y: 320 } }
      ],
      edges: [
        { id: 'e1', type: 'income_to_account', sourceId: 'n1', targetId: 'n2', label: '입금', active: true },
        { id: 'e2', type: 'account_to_liability', sourceId: 'n2', targetId: 'n3', label: '상환 재원', active: true },
        { id: 'e3', type: 'account_to_expense', sourceId: 'n2', targetId: 'n4', label: '원리금 납부', active: true },
        { id: 'e4', type: 'account_to_expense', sourceId: 'n2', targetId: 'n5', label: '생활비', active: true }
      ]
    })
  }
];

export function createEmptyGraph(): FlowGraph {
  return baseGraph();
}

