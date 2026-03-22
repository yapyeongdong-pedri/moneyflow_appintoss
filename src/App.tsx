import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, { Background, Edge, Handle, MarkerType, Node, NodeProps, Position, ReactFlowProvider, useReactFlow } from 'reactflow';
import { BannerAdWrapper } from './ads/BannerAdWrapper';
import { getBannerAdGroupId } from './ads/adConstants';
import { shareGraph } from './app/share/share';
import { addEdge, addNode, createHistory, GraphHistoryState, removeNode, replaceGraph } from './domain/graph-ops';
import { FlowGraph, FlowNode, NodeType, ThemeName } from './domain/graph-model';
import { resolveEdgeType } from './domain/graph-validator';
import { detectEnvironment } from './infra/environment';
import { loadGraph, saveGraph } from './infra/storage';

interface FlowNodeData {
  label: string;
  type: NodeType;
  purpose?: string;
  institution?: string;
  typeTag?: string;
  subtype?: string;
}

type Selection = { kind: 'node'; value: FlowNode } | { kind: 'none' };
type ComposerKind = 'account' | 'card' | 'expense' | 'salary';
type AccountSubtype = 'spending' | 'invest' | 'saving_spend' | 'saving_reserve' | 'pension';

const CANVAS_WIDTH = 356;
const CANVAS_HEIGHT = 560;
const NODE_BOX_WIDTH = 66;
const SALARY_NODE_WIDTH = 84;
const NODE_SIDE_GUTTER = 8;
const MAX_ROW_NODES = 5;
const FLOW_BOUNDS: [[number, number], [number, number]] = [[0, 0], [CANVAS_WIDTH, CANVAS_HEIGHT]];
const PAN_BOUNDS: [[number, number], [number, number]] = [[0, 0], [CANVAS_WIDTH, CANVAS_HEIGHT]];
const CANVAS_CENTER_X = CANVAS_WIDTH / 2;
const SALARY_X = Math.round(CANVAS_CENTER_X - SALARY_NODE_WIDTH / 2);
const DEFAULT_VIEW_MAX_ZOOM = 1;

const THEMES: Record<ThemeName, { className: string }> = {
  'calm-mint': { className: 'theme-calm-mint' },
  'deep-ocean': { className: 'theme-deep-ocean' },
  'warm-sand': { className: 'theme-warm-sand' }
};

function nodeClass(type: NodeType, subtype?: string): string {
  if (type === 'salary_account') return 'node-shape node-salary';
  if (type === 'asset_account') {
    const subtypeClass =
      subtype === 'invest' ? 'node-account-invest'
        : subtype === 'pension' ? 'node-account-pension'
          : subtype === 'saving_spend' ? 'node-account-saving-spend'
            : subtype === 'saving_reserve' || subtype === 'saving' ? 'node-account-saving-reserve'
              : 'node-account-spending';
    return `node-shape node-account ${subtypeClass}`;
  }
  if (type === 'payment_instrument') return 'node-shape node-card';
  if (type === 'expense_category') return 'node-shape node-expense';
  return 'node-shape node-rounded';
}

function normalizeAccountSubtype(value?: string): AccountSubtype {
  if (value === 'saving') return 'saving_reserve';
  if (value === 'saving_spend') return 'saving_spend';
  if (value === 'saving_reserve') return 'saving_reserve';
  if (value === 'invest') return 'invest';
  if (value === 'pension') return 'pension';
  return 'spending';
}

function isUpperAsset(node: FlowNode): boolean {
  if (node.type !== 'asset_account') return false;
  const subtype = normalizeAccountSubtype(node.meta?.subtype as string | undefined);
  return subtype === 'invest' || subtype === 'pension' || subtype === 'saving_reserve';
}

function FlowShapeNode(props: NodeProps<FlowNodeData>) {
  const { type, label, subtype, purpose, institution, typeTag } = props.data;
  const isAccountOrCard = type === 'asset_account' || type === 'payment_instrument';
  const showInstitution = isAccountOrCard || type === 'salary_account';
  const mainText = isAccountOrCard ? purpose ?? label : label;
  return (
    <div className="node-wrap">
      <div className={nodeClass(type, subtype)}>
        {typeTag && <span className="node-type-tag">{typeTag}</span>}
        {showInstitution && institution && (
          <div className="node-meta-inline">
            <small>{institution}</small>
          </div>
        )}
        {type !== 'salary_account' && <Handle id="target-top" type="target" position={Position.Top} />}
        {type !== 'salary_account' && <Handle id="target-bottom" type="target" position={Position.Bottom} />}
        {type === 'salary_account' && <Handle id="source-top" type="source" position={Position.Top} />}
        <span className="node-main-label">{mainText}</span>
        {type !== 'expense_category' && <Handle id="source-bottom" type="source" position={Position.Bottom} />}
      </div>
    </div>
  );
}

const nodeTypes = { flowShape: FlowShapeNode };

function salaryNode(): FlowNode {
  return {
    id: 'salary-main',
    type: 'salary_account',
    name: '월급통장',
    meta: { purpose: '메인 통장', institution: '주거래 은행' },
    ui: { x: SALARY_X, y: 60 }
  };
}

function starterGraph(): FlowGraph {
  return {
    version: 1,
    nodes: [salaryNode()],
    edges: [],
    settings: { theme: 'calm-mint', legendVisible: true }
  };
}

function prettyLayout(graph: FlowGraph): FlowGraph {
  const rowBand = CANVAS_HEIGHT / 4;
  const fiveBand = rowBand * 0.8;
  const rowTopInset = 10;
  const rowY: Record<string, number> = {
    asset_upper: Math.round(fiveBand * 0 + rowTopInset),
    salary_account: Math.round(fiveBand * 1 + rowTopInset),
    asset_account: Math.round(fiveBand * 2 + rowTopInset),
    payment_instrument: Math.round(fiveBand * 3 + rowTopInset),
    expense_category: Math.round(fiveBand * 4 + rowTopInset),
    other: Math.round(fiveBand * 4 + rowTopInset)
  };

  const incoming = new Map<string, string[]>();
  const xById = new Map<string, number>();
  for (const edge of graph.edges) {
    if (!edge.active) continue;
    const list = incoming.get(edge.targetId) ?? [];
    list.push(edge.sourceId);
    incoming.set(edge.targetId, list);
  }

  const toRowKey = (node: FlowNode): string => {
    if (node.type === 'salary_account') return 'salary_account';
    if (node.type === 'asset_account') return isUpperAsset(node) ? 'asset_upper' : 'asset_account';
    if (node.type === 'payment_instrument') return 'payment_instrument';
    if (node.type === 'expense_category') return 'expense_category';
    return 'other';
  };

  const rowKeys: string[] = ['asset_upper', 'salary_account', 'asset_account', 'payment_instrument', 'expense_category', 'other'];
  const byRow = new Map<string, FlowNode[]>();
  for (const key of rowKeys) byRow.set(key, []);
  for (const node of graph.nodes) byRow.get(toRowKey(node))?.push(node);

  const slotX = (count: number): number[] => {
    if (count <= 1) return [SALARY_X];
    const minX = NODE_SIDE_GUTTER;
    const maxX = CANVAS_WIDTH - NODE_BOX_WIDTH - NODE_SIDE_GUTTER;
    return Array.from({ length: count }, (_, idx) => Math.round(minX + (idx * (maxX - minX)) / Math.max(count - 1, 1)));
  };

  const positionRow = (rowKey: string, nodes: FlowNode[], yPos: number) => {
    if (!nodes.length) return;
    const rowNodes = rowKey === 'salary_account' ? nodes.slice(0, 1) : nodes.slice(0, MAX_ROW_NODES);
    const xs = slotX(rowNodes.length);
    if (rowKey === 'salary_account') {
      const salary = rowNodes[0];
      xById.set(salary.id, SALARY_X);
      salary.ui = { ...salary.ui, x: SALARY_X, y: yPos };
      return;
    }

    const withPreferred = rowNodes.map((node) => {
      const parents = incoming.get(node.id) ?? [];
      const preferredX = parents.length
        ? parents.reduce((sum, id) => sum + (xById.get(id) ?? CANVAS_CENTER_X), 0) / parents.length
        : CANVAS_CENTER_X;
      return { node, preferredX };
    }).sort((a, b) => {
      if (Math.abs(a.preferredX - b.preferredX) > 1) return a.preferredX - b.preferredX;
      return a.node.name.localeCompare(b.node.name);
    });

    const available = [...xs];
    withPreferred.forEach(({ node, preferredX }) => {
      let bestIdx = 0;
      let bestDist = Math.abs(available[0] - preferredX);
      for (let i = 1; i < available.length; i += 1) {
        const dist = Math.abs(available[i] - preferredX);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = i;
        }
      }
      const x = available[bestIdx];
      available.splice(bestIdx, 1);
      xById.set(node.id, x);
      node.ui = { ...node.ui, x, y: yPos };
    });
  };

  for (const row of rowKeys) {
    const nodes = byRow.get(row) ?? [];
    if (!nodes.length) continue;
    const sorted = [...nodes].sort((a, b) => {
      const parentsA = incoming.get(a.id) ?? [];
      const parentsB = incoming.get(b.id) ?? [];
      const avgXA = parentsA.reduce((sum, id) => sum + (xById.get(id) ?? 148), 0) / Math.max(parentsA.length, 1);
      const avgXB = parentsB.reduce((sum, id) => sum + (xById.get(id) ?? 148), 0) / Math.max(parentsB.length, 1);
      if (Math.abs(avgXA - avgXB) > 8) return avgXA - avgXB;
      return a.name.localeCompare(b.name);
    });
    positionRow(row, sorted, rowY[row]);
  }

  return { ...graph, nodes: [...graph.nodes] };
}

function BottomSheet({
  open,
  title,
  onClose,
  children,
  align
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  align?: 'bottom' | 'center';
}) {
  if (!open) return null;
  return (
    <div className={align === 'center' ? 'sheet-overlay sheet-overlay-center' : 'sheet-overlay'} role="presentation" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-header"><strong>{title}</strong><button type="button" className="btn btn-weak" onClick={onClose}>닫기</button></header>
        <div className="sheet-body">{children}</div>
      </section>
    </div>
  );
}

function AppBody() {
  const { setViewport } = useReactFlow();
  const [history, setHistory] = useState<GraphHistoryState | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  const [message, setMessage] = useState('');
  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const [composerOpen, setComposerOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [showTopHint, setShowTopHint] = useState(false);
  const [canTopMove, setCanTopMove] = useState(false);
  const topHintTimerRef = useRef<number | null>(null);
  const lockedViewportXRef = useRef(0);

  const [kind, setKind] = useState<ComposerKind>('account');
  const [accountSubtype, setAccountSubtype] = useState<AccountSubtype>('spending');
  const [accountBank, setAccountBank] = useState('');
  const [accountPurpose, setAccountPurpose] = useState('');
  const [accountLinkSourceId, setAccountLinkSourceId] = useState('');
  const [accountMemo, setAccountMemo] = useState('');
  const [cardIssuer, setCardIssuer] = useState('');
  const [cardPurpose, setCardPurpose] = useState('');
  const [cardLinkAccountId, setCardLinkAccountId] = useState('');
  const [cardMemo, setCardMemo] = useState('');
  const [expenseType, setExpenseType] = useState('');
  const [expenseLinkSourceId, setExpenseLinkSourceId] = useState('');
  const [expenseMemo, setExpenseMemo] = useState('');

  const [detailKind, setDetailKind] = useState<ComposerKind>('account');
  const [detailNodeId, setDetailNodeId] = useState('');
  const [detailAccountSubtype, setDetailAccountSubtype] = useState<AccountSubtype>('spending');
  const [detailAccountBank, setDetailAccountBank] = useState('');
  const [detailAccountPurpose, setDetailAccountPurpose] = useState('');
  const [detailAccountLinkSourceId, setDetailAccountLinkSourceId] = useState('');
  const [detailAccountMemo, setDetailAccountMemo] = useState('');
  const [detailCardIssuer, setDetailCardIssuer] = useState('');
  const [detailCardPurpose, setDetailCardPurpose] = useState('');
  const [detailCardLinkAccountId, setDetailCardLinkAccountId] = useState('');
  const [detailCardMemo, setDetailCardMemo] = useState('');
  const [detailExpenseType, setDetailExpenseType] = useState('');
  const [detailExpenseLinkSourceId, setDetailExpenseLinkSourceId] = useState('');
  const [detailExpenseMemo, setDetailExpenseMemo] = useState('');
  const [detailSalaryBank, setDetailSalaryBank] = useState('');

  useEffect(() => {
    const loaded = loadGraph();
    const base = loaded && loaded.nodes.length ? loaded : starterGraph();
    const withSalary: FlowGraph = base.nodes.some((n) => n.type === 'salary_account') ? base : { ...base, nodes: [salaryNode(), ...base.nodes] };
    setHistory(createHistory(prettyLayout(withSalary)));
  }, []);

  useEffect(() => { if (history) saveGraph(history.present); }, [history]);
  useEffect(() => { if (!message) return; const t = window.setTimeout(() => setMessage(''), 2200); return () => window.clearTimeout(t); }, [message]);
  const focusMiniView = () => {
    lockedViewportXRef.current = 0;
    void setViewport({ x: 0, y: 0, zoom: DEFAULT_VIEW_MAX_ZOOM }, { duration: 180 });
  };

  useEffect(() => {
    if (!history || showIntro) return;
    const t = window.setTimeout(() => { focusMiniView(); }, 30);
    return () => window.clearTimeout(t);
  }, [history?.present.nodes.length, history?.present.edges.length, setViewport, showIntro]);

  useEffect(() => {
    return () => {
      if (topHintTimerRef.current) window.clearTimeout(topHintTimerRef.current);
    };
  }, []);

  const graph = history?.present;
  const env = detectEnvironment();
  const themeClass = graph ? THEMES[graph.settings.theme].className : THEMES['calm-mint'].className;

  const accountLinks = useMemo(() => graph?.nodes.filter((n) => n.type === 'salary_account' || n.type === 'asset_account') ?? [], [graph]);
  const expenseLinks = useMemo(() => graph?.nodes.filter((n) => n.type === 'salary_account' || n.type === 'asset_account' || n.type === 'payment_instrument') ?? [], [graph]);
  const highlighted = useMemo(() => {
    if (!graph || selection.kind !== 'node') return null;
    const activeEdges = graph.edges.filter((e) => e.active);
    const relatedNodes = new Set<string>([selection.value.id]);
    const relatedEdges = new Set<string>();
    for (const edge of activeEdges) {
      if (edge.sourceId !== selection.value.id && edge.targetId !== selection.value.id) continue;
      relatedEdges.add(edge.id);
      relatedNodes.add(edge.sourceId);
      relatedNodes.add(edge.targetId);
    }
    return { relatedNodes, relatedEdges };
  }, [graph, selection]);
  const expenseSourceLabel = (n: FlowNode): string => {
    const purpose = n.meta?.purpose ?? n.name;
    if (n.type === 'asset_account') return `${purpose} (계좌 / ${n.meta?.institution ?? '은행'})`;
    if (n.type === 'payment_instrument') return `${purpose} (카드 / ${n.meta?.institution ?? '카드'})`;
    if (n.type === 'salary_account') return `${purpose} (월급통장 / ${n.meta?.institution ?? '통장'})`;
    return n.name;
  };

  const rfNodes = useMemo<Node<FlowNodeData>[]>(() => (graph?.nodes ?? []).map((n) => ({
    id: n.id,
    position: { x: n.ui?.x ?? 0, y: n.ui?.y ?? 0 },
    type: 'flowShape',
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    style: highlighted && !highlighted.relatedNodes.has(n.id)
      ? { opacity: 0.18, filter: 'grayscale(0.25)' }
      : highlighted && selection.kind === 'node' && selection.value.id === n.id
        ? { opacity: 1, filter: 'drop-shadow(0 0 4px rgba(20, 125, 233, 0.4))' }
        : undefined,
    data: {
      label: n.name,
      type: n.type,
      purpose: n.type === 'asset_account' || n.type === 'payment_instrument' ? n.meta?.purpose ?? n.name : undefined,
      institution: n.type === 'asset_account' || n.type === 'payment_instrument' || n.type === 'salary_account'
        ? n.meta?.institution ?? (n.type === 'asset_account' ? '은행' : n.type === 'payment_instrument' ? '카드사' : '주거래 은행')
        : undefined,
      typeTag: n.type === 'asset_account' ? '계좌' : n.type === 'payment_instrument' ? '카드' : undefined,
      subtype: n.meta?.subtype
    }
  })), [graph, highlighted]);

  const rfEdges = useMemo<Edge[]>(() => (graph?.edges ?? []).map((e) => {
    const sourceNode = (graph?.nodes ?? []).find((node) => node.id === e.sourceId);
    const targetType = (graph?.nodes ?? []).find((node) => node.id === e.targetId)?.type;
    const targetNode = (graph?.nodes ?? []).find((node) => node.id === e.targetId);
    const toExpense = targetType === 'expense_category';
    const sourceTop = sourceNode?.type === 'salary_account' && !!targetNode && isUpperAsset(targetNode);
    const dimmed = !!highlighted && !highlighted.relatedEdges.has(e.id);
    const emphasized = !!highlighted && highlighted.relatedEdges.has(e.id);
    return ({
    id: e.id,
    source: e.sourceId,
    target: e.targetId,
    sourceHandle: sourceTop ? 'source-top' : 'source-bottom',
    targetHandle: sourceTop ? 'target-bottom' : 'target-top',
    type: 'default',
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: emphasized ? 18 : 16,
      height: emphasized ? 18 : 16,
      color: emphasized ? '#147de9' : e.active ? '#2f6f9f' : '#8fa9be'
    },
    style: e.active
      ? {
          stroke: '#2f6f9f',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          strokeDasharray: toExpense ? '6 5' : undefined,
          opacity: dimmed ? 0.1 : 1,
          strokeWidth: emphasized ? 3.2 : 2.4
        }
      : {
          opacity: dimmed ? 0.12 : 0.35,
          strokeWidth: 1.8,
          stroke: '#8fa9be',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          strokeDasharray: toExpense ? '6 5' : undefined
        },
    animated: false
  });
  }), [graph, highlighted]);

  if (!history) return <main className="app-stage"><section className="mobile-frame"><section className="app-shell theme-calm-mint" /></section></main>;

  const resetComposerForm = () => {
    setKind('account');
    setAccountSubtype('spending');
    setAccountBank('');
    setAccountPurpose('');
    setAccountLinkSourceId('');
    setAccountMemo('');
    setCardIssuer('');
    setCardPurpose('');
    setCardLinkAccountId('');
    setCardMemo('');
    setExpenseType('');
    setExpenseLinkSourceId('');
    setExpenseMemo('');
  };

  const handleFlowMove = (event: unknown, viewport: { x: number; y: number; zoom: number }) => {
    if (Math.abs(viewport.x - lockedViewportXRef.current) > 0.5) {
      void setViewport({ x: lockedViewportXRef.current, y: viewport.y, zoom: viewport.zoom }, { duration: 0 });
    }
    const movedDown = viewport.y > 8;
    setCanTopMove(movedDown);
    const isScrollEvent = event instanceof WheelEvent;
    if (!isScrollEvent || !movedDown) return;
    setShowTopHint(true);
    if (topHintTimerRef.current) window.clearTimeout(topHintTimerRef.current);
    topHintTimerRef.current = window.setTimeout(() => setShowTopHint(false), 1300);
  };

  const handleFlowMoveEnd = (_event: unknown, viewport: { x: number; y: number; zoom: number }) => {
    if (Math.abs(viewport.x - lockedViewportXRef.current) > 0.5) {
      void setViewport({ x: lockedViewportXRef.current, y: viewport.y, zoom: viewport.zoom }, { duration: 80 });
    }
  };

  const selectedNodeLabel = selection.kind === 'node'
    ? (selection.value.meta?.purpose ?? selection.value.name)
    : '';

  const openDetailForNode = (node: FlowNode) => {
    const incomingEdge = history.present.edges.find((edge) => edge.active && edge.targetId === node.id);
    if (node.type === 'salary_account') {
      setDetailKind('salary');
      setDetailNodeId(node.id);
      setDetailSalaryBank(node.meta?.institution ?? '');
    }
    if (node.type === 'asset_account') {
      setDetailKind('account');
      setDetailNodeId(node.id);
      setDetailAccountSubtype(normalizeAccountSubtype(node.meta?.subtype as string | undefined));
      setDetailAccountBank(node.meta?.institution ?? '');
      setDetailAccountPurpose(node.meta?.purpose ?? node.name);
      setDetailAccountLinkSourceId(incomingEdge?.sourceId ?? '');
      setDetailAccountMemo(node.meta?.note ?? '');
    }
    if (node.type === 'payment_instrument') {
      setDetailKind('card');
      setDetailNodeId(node.id);
      setDetailCardIssuer(node.meta?.institution ?? '');
      setDetailCardPurpose(node.meta?.purpose ?? node.name);
      setDetailCardLinkAccountId(incomingEdge?.sourceId ?? '');
      setDetailCardMemo(node.meta?.note ?? '');
    }
    if (node.type === 'expense_category') {
      setDetailKind('expense');
      setDetailNodeId(node.id);
      setDetailExpenseType(node.meta?.expenseType ?? node.name);
      setDetailExpenseLinkSourceId(incomingEdge?.sourceId ?? '');
      setDetailExpenseMemo(node.meta?.note ?? '');
    }
    setSelection({ kind: 'node', value: node });
    setDetailOpen(true);
  };

  const saveDetailNode = () => {
    if (!history || !detailNodeId) return;
    const nextGraph: FlowGraph = JSON.parse(JSON.stringify(history.present)) as FlowGraph;
    const node = nextGraph.nodes.find((item) => item.id === detailNodeId);
    if (!node) return;
    const incomingEdge = nextGraph.edges.find((edge) => edge.active && edge.targetId === detailNodeId);

    if (detailKind === 'salary') {
      node.name = '월급통장';
      node.meta = {
        ...node.meta,
        purpose: '월급통장',
        institution: detailSalaryBank.trim() || '주거래 은행'
      };
    }

    if (detailKind === 'account') {
      node.name = detailAccountPurpose.trim() || node.name;
      node.meta = {
        ...node.meta,
        subtype: detailAccountSubtype,
        institution: detailAccountBank.trim(),
        purpose: detailAccountPurpose.trim() || node.name,
        note: detailAccountMemo.trim() || undefined
      };
      if (incomingEdge && detailAccountLinkSourceId) {
        incomingEdge.sourceId = detailAccountLinkSourceId;
        const sourceNode = nextGraph.nodes.find((item) => item.id === detailAccountLinkSourceId);
        if (sourceNode) {
          const resolved = resolveEdgeType(sourceNode.type, node.type);
          if (resolved) incomingEdge.type = resolved;
        }
      }
    }

    if (detailKind === 'card') {
      node.name = detailCardPurpose.trim() || node.name;
      node.meta = {
        ...node.meta,
        institution: detailCardIssuer.trim(),
        purpose: detailCardPurpose.trim() || node.name,
        note: detailCardMemo.trim() || undefined
      };
      if (incomingEdge && detailCardLinkAccountId) {
        incomingEdge.sourceId = detailCardLinkAccountId;
        const sourceNode = nextGraph.nodes.find((item) => item.id === detailCardLinkAccountId);
        if (sourceNode) {
          const resolved = resolveEdgeType(sourceNode.type, node.type);
          if (resolved) incomingEdge.type = resolved;
        }
      }
    }

    if (detailKind === 'expense') {
      node.name = detailExpenseType.trim() || node.name;
      node.meta = {
        ...node.meta,
        expenseType: detailExpenseType.trim() || node.name,
        note: detailExpenseMemo.trim() || undefined
      };
      if (incomingEdge && detailExpenseLinkSourceId) {
        incomingEdge.sourceId = detailExpenseLinkSourceId;
        const sourceNode = nextGraph.nodes.find((item) => item.id === detailExpenseLinkSourceId);
        if (sourceNode) {
          const resolved = resolveEdgeType(sourceNode.type, node.type);
          if (resolved) incomingEdge.type = resolved;
        }
      }
    }

    try {
      setHistory(replaceGraph(history, prettyLayout(nextGraph)));
      setDetailOpen(false);
      setMessage('노드 정보를 저장했어요.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const addByComposer = () => {
    if (!history) return;
    try {
      if (kind === 'account') {
        const currentAccounts = history.present.nodes.filter((n) => n.type === 'asset_account').length;
        if (currentAccounts >= MAX_ROW_NODES) return setMessage('계좌 노드는 최대 5개까지 추가할 수 있어요.');
        if (!accountPurpose.trim() || !accountBank.trim() || !accountLinkSourceId) return setMessage('계좌 정보를 입력해 주세요.');
        let h = addNode(history, { type: 'asset_account', name: accountPurpose.trim(), meta: { subtype: accountSubtype, institution: accountBank.trim(), purpose: accountPurpose.trim(), linkSourceId: accountLinkSourceId, note: accountMemo.trim() || undefined }, x: 148, y: 760 });
        const node = h.present.nodes[h.present.nodes.length - 1];
        h = addEdge(h, { sourceId: accountLinkSourceId, targetId: node.id });
        setHistory(replaceGraph(h, prettyLayout(h.present)));
        setMessage('계좌 노드를 추가했어요.');
      }
      if (kind === 'card') {
        const currentCards = history.present.nodes.filter((n) => n.type === 'payment_instrument').length;
        if (currentCards >= MAX_ROW_NODES) return setMessage('카드 노드는 최대 5개까지 추가할 수 있어요.');
        if (!cardPurpose.trim() || !cardIssuer.trim() || !cardLinkAccountId) return setMessage('카드 정보를 입력해 주세요.');
        let h = addNode(history, { type: 'payment_instrument', name: cardPurpose.trim(), meta: { institution: cardIssuer.trim(), purpose: cardPurpose.trim(), linkSourceId: cardLinkAccountId, note: cardMemo.trim() || undefined }, x: 148, y: 760 });
        const node = h.present.nodes[h.present.nodes.length - 1];
        h = addEdge(h, { sourceId: cardLinkAccountId, targetId: node.id });
        setHistory(replaceGraph(h, prettyLayout(h.present)));
        setMessage('카드 노드를 추가했어요.');
      }
      if (kind === 'expense') {
        const currentExpenses = history.present.nodes.filter((n) => n.type === 'expense_category').length;
        if (currentExpenses >= MAX_ROW_NODES) return setMessage('지출항목 노드는 최대 5개까지 추가할 수 있어요.');
        if (!expenseType.trim() || !expenseLinkSourceId) return setMessage('지출 정보를 입력해 주세요.');
        let h = addNode(history, { type: 'expense_category', name: expenseType.trim(), meta: { expenseType: expenseType.trim(), linkSourceId: expenseLinkSourceId, note: expenseMemo.trim() || undefined }, x: 148, y: 760 });
        const node = h.present.nodes[h.present.nodes.length - 1];
        h = addEdge(h, { sourceId: expenseLinkSourceId, targetId: node.id });
        setHistory(replaceGraph(h, prettyLayout(h.present)));
        setMessage('지출 노드를 추가했어요.');
      }
      setComposerOpen(false);
    } catch (e) { setMessage((e as Error).message); }
  };

  return (
    <main className="app-stage">
      <section className="mobile-frame">
        <div className={`app-shell ${themeClass}`}>
          {showIntro ? (
            <section className="intro-screen">
              <p className="intro-eyebrow">MOBILE ONLY MONEY FLOW</p>
              <h1 className="intro-title">관리비, 통신비, 구독료<br />어느 통장/카드에서 나가더라?</h1>
              <p className="intro-body">소중한 내 월급, Money Flow로 관리하세요</p>
              <div className="intro-cards">
                <div className="intro-card">
                  <span className="intro-emoji">💸</span>
                  <span className="intro-copy">월급통장부터 현금 흐름 확인해요</span>
                </div>
                <div className="intro-card">
                  <span className="intro-emoji">💳</span>
                  <span className="intro-copy">통장, 주식, 신용/체크카드 모두 관리해요</span>
                </div>
                <div className="intro-card">
                  <span className="intro-emoji">🔎</span>
                  <span className="intro-copy">어디에서 내 돈 나가는지 쉽게 찾아요</span>
                </div>
              </div>
              <button type="button" className="btn btn-primary intro-cta" onClick={() => setShowIntro(false)}>
                내 Money Flow 만들기
              </button>
            </section>
          ) : (
            <>
              <header className="topbar"><div className="brand"><h1>Money Flow</h1><span className="env-badge">{env.toUpperCase()}</span></div><div className="top-actions"><button type="button" className="btn btn-weak" onClick={() => setResetConfirmOpen(true)}>초기화</button><button type="button" className="btn btn-weak" onClick={async () => { try { if (graph) setMessage(await shareGraph(graph)); } catch { setMessage('공유를 완료하지 못했어요.'); } }}>공유</button><button type="button" className="btn btn-primary" onClick={() => { resetComposerForm(); setComposerOpen(true); }}>노드 추가</button></div></header>
              <section className="summary-card"><strong>월급통장에서 시작되는 내 흐름</strong><p>계좌 {history.present.nodes.filter((n) => n.type === 'asset_account').length}개 · 카드 {history.present.nodes.filter((n) => n.type === 'payment_instrument').length}개 · 지출항목 {history.present.nodes.filter((n) => n.type === 'expense_category').length}개</p></section>
              <section className="canvas-wrap" id="flow-canvas"><ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes} proOptions={{ hideAttribution: true }} onMove={handleFlowMove} onMoveEnd={handleFlowMoveEnd} onPaneClick={() => { setSelection({ kind: 'none' }); setDetailOpen(false); }} onNodeClick={(_, node) => { const s = history.present.nodes.find((n) => n.id === node.id); if (s) { setSelection({ kind: 'node', value: s }); setDetailOpen(false); } }} nodesDraggable={false} nodesConnectable={false} elementsSelectable zoomOnPinch={false} zoomOnScroll={false} zoomOnDoubleClick={false} minZoom={DEFAULT_VIEW_MAX_ZOOM} maxZoom={DEFAULT_VIEW_MAX_ZOOM} panOnScroll={false} panOnDrag={false} nodeExtent={FLOW_BOUNDS} translateExtent={PAN_BOUNDS}><Background /></ReactFlow></section>

              {selection.kind === 'node' && !detailOpen && (
                <section className="node-quickbar">
                  <strong>{selectedNodeLabel}</strong>
                  <div className="node-quickbar-actions">
                    <button type="button" className="btn btn-primary" onClick={() => openDetailForNode(selection.value)}>수정</button>
                    <button type="button" className="btn btn-weak" onClick={() => setSelection({ kind: 'none' })}>닫기</button>
                  </div>
                </section>
              )}

              {canTopMove && showTopHint && (
                <button
                  type="button"
                  className="scroll-top-chip"
                  onClick={() => {
                    void setViewport({ x: lockedViewportXRef.current, y: 0, zoom: DEFAULT_VIEW_MAX_ZOOM }, { duration: 260 });
                    setShowTopHint(false);
                  }}
                >
                  최상단으로
                </button>
              )}

              <BottomSheet open={composerOpen} title="노드 추가" onClose={() => setComposerOpen(false)} align="center">
                <div className="sheet-segment"><button type="button" className={kind === 'account' ? 'btn btn-primary' : 'btn btn-weak'} onClick={() => setKind('account')}>계좌</button><button type="button" className={kind === 'card' ? 'btn btn-primary' : 'btn btn-weak'} onClick={() => setKind('card')}>카드</button><button type="button" className={kind === 'expense' ? 'btn btn-primary' : 'btn btn-weak'} onClick={() => setKind('expense')}>지출항목</button></div>
                {kind === 'account' && <div className="sheet-form"><label>계좌 구분 *<select required value={accountSubtype} onChange={(e) => setAccountSubtype(e.target.value as AccountSubtype)}><option value="spending">지출</option><option value="invest">투자</option><option value="saving_spend">적금(지출용)</option><option value="saving_reserve">적금(저축용)</option><option value="pension">연금</option></select></label><label>은행명 *<input required value={accountBank} onChange={(e) => setAccountBank(e.target.value)} maxLength={30} /></label><label>계좌 용도 *<input required value={accountPurpose} onChange={(e) => setAccountPurpose(e.target.value)} maxLength={30} /></label><label>연결될 상위 계좌 *<select required value={accountLinkSourceId} onChange={(e) => setAccountLinkSourceId(e.target.value)}><option value="">선택하세요</option>{accountLinks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label><label>기타 메모<input value={accountMemo} onChange={(e) => setAccountMemo(e.target.value)} maxLength={40} /></label></div>}
                {kind === 'card' && <div className="sheet-form"><label>카드명 *<input required value={cardIssuer} onChange={(e) => setCardIssuer(e.target.value)} maxLength={30} /></label><label>카드 용도 *<input required value={cardPurpose} onChange={(e) => setCardPurpose(e.target.value)} maxLength={30} /></label><label>연결될 계좌 *<select required value={cardLinkAccountId} onChange={(e) => setCardLinkAccountId(e.target.value)}><option value="">선택하세요</option>{accountLinks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label><label>기타 메모<input value={cardMemo} onChange={(e) => setCardMemo(e.target.value)} maxLength={40} /></label></div>}
                {kind === 'expense' && <div className="sheet-form"><label>지출항목 종류 *<input required value={expenseType} onChange={(e) => setExpenseType(e.target.value)} maxLength={30} /></label><label>연결될 계좌 또는 카드 *<select required value={expenseLinkSourceId} onChange={(e) => setExpenseLinkSourceId(e.target.value)}><option value="">선택하세요</option>{expenseLinks.map((n) => <option key={n.id} value={n.id}>{expenseSourceLabel(n)}</option>)}</select></label><label>기타 메모<input value={expenseMemo} onChange={(e) => setExpenseMemo(e.target.value)} maxLength={40} /></label></div>}
                <div className="sheet-inline-buttons"><button type="button" className="btn btn-primary" onClick={addByComposer}>추가하기</button><button type="button" className="btn btn-weak" onClick={() => { const next = replaceGraph(history, prettyLayout(history.present)); setHistory(next); setMessage('노드를 다시 정렬했어요.'); }}>다시 정렬</button></div>
              </BottomSheet>

              <BottomSheet open={detailOpen && selection.kind !== 'none'} title="노드 상세 수정" onClose={() => setDetailOpen(false)} align="center">
                {detailKind === 'salary' && <div className="sheet-form"><label>은행명<input value={detailSalaryBank} onChange={(e) => setDetailSalaryBank(e.target.value)} maxLength={30} /></label><label>계좌 용도<input value="월급통장" readOnly /></label></div>}
                {detailKind === 'account' && <div className="sheet-form"><label>계좌 구분<select value={detailAccountSubtype} onChange={(e) => setDetailAccountSubtype(e.target.value as AccountSubtype)}><option value="spending">지출</option><option value="invest">투자</option><option value="saving_spend">적금(지출용)</option><option value="saving_reserve">적금(저축용)</option><option value="pension">연금</option></select></label><label>은행명<input value={detailAccountBank} onChange={(e) => setDetailAccountBank(e.target.value)} maxLength={30} /></label><label>계좌 용도<input value={detailAccountPurpose} onChange={(e) => setDetailAccountPurpose(e.target.value)} maxLength={30} /></label><label>연결될 상위 계좌<select value={detailAccountLinkSourceId} onChange={(e) => setDetailAccountLinkSourceId(e.target.value)}><option value="">선택하세요</option>{accountLinks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label><label>기타 메모<input value={detailAccountMemo} onChange={(e) => setDetailAccountMemo(e.target.value)} maxLength={40} /></label></div>}
                {detailKind === 'card' && <div className="sheet-form"><label>카드명<input value={detailCardIssuer} onChange={(e) => setDetailCardIssuer(e.target.value)} maxLength={30} /></label><label>카드 용도<input value={detailCardPurpose} onChange={(e) => setDetailCardPurpose(e.target.value)} maxLength={30} /></label><label>연결될 계좌<select value={detailCardLinkAccountId} onChange={(e) => setDetailCardLinkAccountId(e.target.value)}><option value="">선택하세요</option>{accountLinks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label><label>기타 메모<input value={detailCardMemo} onChange={(e) => setDetailCardMemo(e.target.value)} maxLength={40} /></label></div>}
                {detailKind === 'expense' && <div className="sheet-form"><label>지출항목 종류<input value={detailExpenseType} onChange={(e) => setDetailExpenseType(e.target.value)} maxLength={30} /></label><label>연결될 계좌 또는 카드<select value={detailExpenseLinkSourceId} onChange={(e) => setDetailExpenseLinkSourceId(e.target.value)}><option value="">선택하세요</option>{expenseLinks.map((n) => <option key={n.id} value={n.id}>{expenseSourceLabel(n)}</option>)}</select></label><label>기타 메모<input value={detailExpenseMemo} onChange={(e) => setDetailExpenseMemo(e.target.value)} maxLength={40} /></label></div>}
                <div className="sheet-inline-buttons"><button type="button" className="btn btn-primary" onClick={saveDetailNode}>저장</button><button type="button" className="btn btn-danger" onClick={() => { if (!detailNodeId) return; const target = history.present.nodes.find((n) => n.id === detailNodeId); if (!target) return; if (target.type === 'salary_account') return setMessage('월급통장은 삭제할 수 없어요.'); const next = removeNode(history, detailNodeId); setHistory(replaceGraph(next, prettyLayout(next.present))); setSelection({ kind: 'none' }); setDetailOpen(false); }}>삭제</button></div>
              </BottomSheet>

              <BottomSheet open={resetConfirmOpen} title="노드 초기화" onClose={() => setResetConfirmOpen(false)}>
                <div className="sheet-form"><p>데이터가 모두 삭제됩니다.</p><div className="sheet-inline-buttons"><button type="button" className="btn btn-danger" onClick={() => { const starter = starterGraph(); setHistory(replaceGraph(history, starter)); setSelection({ kind: 'none' }); setComposerOpen(false); setDetailOpen(false); setResetConfirmOpen(false); window.setTimeout(() => focusMiniView(), 60); setMessage('초기화가 완료됐어요.'); }}>전체 초기화</button><button type="button" className="btn btn-weak" onClick={() => setResetConfirmOpen(false)}>취소</button></div></div>
              </BottomSheet>

              {message && <div className="toast">{message}</div>}
              <footer className="bottom-ad"><BannerAdWrapper adGroupId={getBannerAdGroupId('text')} mode="fixed" /></footer>
            </>
          )}
        </div>
      </section>
    </main>
  );
}

export function App() {
  return (
    <ReactFlowProvider>
      <AppBody />
    </ReactFlowProvider>
  );
}




