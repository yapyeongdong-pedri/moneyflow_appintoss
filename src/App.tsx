import { type ReactNode, useEffect, useMemo, useState } from 'react';
import ReactFlow, { Background, Edge, Handle, MarkerType, Node, NodeProps, Position, ReactFlowProvider, useReactFlow } from 'reactflow';
import { BannerAdWrapper } from './ads/BannerAdWrapper';
import { getBannerAdGroupId } from './ads/adConstants';
import { exportGraphPng, shareGraph } from './app/share/share';
import { addEdge, addNode, createHistory, GraphHistoryState, removeNode, replaceGraph, updateNode } from './domain/graph-ops';
import { FlowGraph, FlowNode, NodeType, ThemeName } from './domain/graph-model';
import { detectEnvironment } from './infra/environment';
import { loadGraph, saveGraph } from './infra/storage';

interface FlowNodeData {
  label: string;
  type: NodeType;
  topLabel?: string;
  subtype?: string;
}

type Selection = { kind: 'node'; value: FlowNode } | { kind: 'none' };
type ComposerKind = 'account' | 'card' | 'expense';
type AccountSubtype = 'spending' | 'saving' | 'invest';

const FLOW_BOUNDS: [[number, number], [number, number]] = [[0, 0], [356, 3800]];

const THEMES: Record<ThemeName, { className: string }> = {
  'calm-mint': { className: 'theme-calm-mint' },
  'deep-ocean': { className: 'theme-deep-ocean' },
  'warm-sand': { className: 'theme-warm-sand' }
};

const NODE_LABEL: Record<NodeType, string> = {
  salary_account: '월급통장',
  income_source: '수입원',
  asset_account: '계좌',
  payment_instrument: '카드',
  expense_category: '지출항목',
  liability_bucket: '부채 버킷'
};

function nodeClass(type: NodeType, subtype?: string): string {
  if (type === 'salary_account') return 'node-shape node-salary';
  if (type === 'asset_account') return `node-shape node-account ${subtype ? `node-account-${subtype}` : 'node-account-spending'}`;
  if (type === 'payment_instrument') return 'node-shape node-card';
  if (type === 'expense_category') return 'node-shape node-expense';
  return 'node-shape node-rounded';
}

function FlowShapeNode(props: NodeProps<FlowNodeData>) {
  const { type, topLabel, label, subtype } = props.data;
  return (
    <div className="node-wrap">
      {topLabel && <div className="node-top-label">{topLabel}</div>}
      <div className={nodeClass(type, subtype)}>
        {type !== 'salary_account' && <Handle type="target" position={Position.Top} />}
        <span>{label}</span>
        {type !== 'expense_category' && <Handle type="source" position={Position.Bottom} />}
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
    ui: { x: 138, y: 60 }
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

function rank(node: FlowNode): number {
  if (node.type === 'salary_account') return 0;
  if (node.type === 'asset_account') return 1;
  if (node.type === 'payment_instrument') return 2;
  if (node.type === 'expense_category') return 3;
  return 4;
}

function xSlots(cols: number): number[] {
  if (cols <= 1) return [148];
  if (cols === 2) return [72, 224];
  if (cols === 3) return [24, 148, 272];
  return [18, 106, 194, 282];
}

function prettyLayout(graph: FlowGraph): FlowGraph {
  const root = graph.nodes.find((n) => n.type === 'salary_account') ?? graph.nodes[0];
  if (!root) return graph;

  const out = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!e.active) continue;
    const o = out.get(e.sourceId) ?? [];
    o.push(e.targetId);
    out.set(e.sourceId, o);
    const i = incoming.get(e.targetId) ?? [];
    i.push(e.sourceId);
    incoming.set(e.targetId, i);
  }

  const depth = new Map<string, number>([[root.id, 0]]);
  const q = [root.id];
  while (q.length) {
    const id = q.shift()!;
    const d = depth.get(id) ?? 0;
    for (const t of out.get(id) ?? []) {
      if (depth.has(t)) continue;
      depth.set(t, d + 1);
      q.push(t);
    }
  }

  let maxDepth = Math.max(...depth.values());
  for (const n of graph.nodes) {
    if (depth.has(n.id)) continue;
    maxDepth += 1;
    depth.set(n.id, maxDepth);
  }

  const byDepth = new Map<number, FlowNode[]>();
  for (const n of graph.nodes) {
    const d = depth.get(n.id) ?? 1;
    byDepth.set(d, [...(byDepth.get(d) ?? []), n]);
  }

  const pos = new Map<string, FlowNode>();
  pos.set(root.id, { ...root, ui: { ...root.ui, x: 138, y: 60 } });

  for (const d of [...byDepth.keys()].filter((v) => v > 0).sort((a, b) => a - b)) {
    const nodes = [...(byDepth.get(d) ?? [])].sort((a, b) => {
      const pa = incoming.get(a.id) ?? [];
      const pb = incoming.get(b.id) ?? [];
      const xa = pa.reduce((s, p) => s + (pos.get(p)?.ui?.x ?? 148), 0) / Math.max(pa.length, 1);
      const xb = pb.reduce((s, p) => s + (pos.get(p)?.ui?.x ?? 148), 0) / Math.max(pb.length, 1);
      if (Math.abs(xa - xb) > 8) return xa - xb;
      const rr = rank(a) - rank(b);
      return rr !== 0 ? rr : a.name.localeCompare(b.name);
    });

    const cols = nodes.length <= 3 ? Math.max(nodes.length, 1) : nodes.length <= 9 ? 3 : 4;
    const xs = xSlots(cols);
    const yBase = 60 + d * 164;
    nodes.forEach((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      pos.set(node.id, { ...node, ui: { ...node.ui, x: xs[col], y: yBase + row * 124 } });
    });
  }

  return { ...graph, nodes: graph.nodes.map((n) => pos.get(n.id) ?? n) };
}

function BottomSheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="sheet-overlay" role="presentation" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-header"><strong>{title}</strong><button type="button" className="btn btn-weak" onClick={onClose}>닫기</button></header>
        <div className="sheet-body">{children}</div>
      </section>
    </div>
  );
}

function AppBody() {
  const { fitView } = useReactFlow();
  const [history, setHistory] = useState<GraphHistoryState | null>(null);
  const [showIntro, setShowIntro] = useState(true);
  const [message, setMessage] = useState('');
  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const [composerOpen, setComposerOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

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

  useEffect(() => {
    const loaded = loadGraph();
    const base = loaded && loaded.nodes.length ? loaded : starterGraph();
    const withSalary: FlowGraph = base.nodes.some((n) => n.type === 'salary_account') ? base : { ...base, nodes: [salaryNode(), ...base.nodes] };
    setHistory(createHistory(prettyLayout(withSalary)));
  }, []);

  useEffect(() => { if (history) saveGraph(history.present); }, [history]);
  useEffect(() => { if (!message) return; const t = window.setTimeout(() => setMessage(''), 2200); return () => window.clearTimeout(t); }, [message]);
  useEffect(() => {
    if (!history || showIntro) return;
    const t = window.setTimeout(() => { void fitView({ padding: 0.22, duration: 280 }); }, 30);
    return () => window.clearTimeout(t);
  }, [history?.present.nodes.length, history?.present.edges.length, fitView, showIntro]);

  useEffect(() => {
    if (!history) return;
    const salaryId = history.present.nodes.find((n) => n.type === 'salary_account')?.id ?? '';
    if (!accountLinkSourceId) setAccountLinkSourceId(salaryId);
    if (!cardLinkAccountId) setCardLinkAccountId(history.present.nodes.find((n) => n.type === 'asset_account')?.id ?? salaryId);
    if (!expenseLinkSourceId) setExpenseLinkSourceId(history.present.nodes.find((n) => n.type === 'asset_account' || n.type === 'payment_instrument')?.id ?? salaryId);
  }, [history, accountLinkSourceId, cardLinkAccountId, expenseLinkSourceId]);

  const graph = history?.present;
  const env = detectEnvironment();
  const themeClass = graph ? THEMES[graph.settings.theme].className : THEMES['calm-mint'].className;

  const accountLinks = useMemo(() => graph?.nodes.filter((n) => n.type === 'salary_account' || n.type === 'asset_account') ?? [], [graph]);
  const expenseLinks = useMemo(() => graph?.nodes.filter((n) => n.type === 'salary_account' || n.type === 'asset_account' || n.type === 'payment_instrument') ?? [], [graph]);

  const rfNodes = useMemo<Node<FlowNodeData>[]>(() => (graph?.nodes ?? []).map((n) => ({
    id: n.id,
    position: { x: n.ui?.x ?? 0, y: n.ui?.y ?? 0 },
    type: 'flowShape',
    data: {
      label: n.name,
      type: n.type,
      topLabel: n.type === 'asset_account' || n.type === 'payment_instrument' ? `${n.meta?.purpose ?? n.name} (${n.meta?.institution ?? (n.type === 'asset_account' ? '은행' : '카드사')})` : '',
      subtype: n.meta?.subtype
    }
  })), [graph]);

  const rfEdges = useMemo<Edge[]>(() => (graph?.edges ?? []).map((e) => ({
    id: e.id,
    source: e.sourceId,
    target: e.targetId,
    type: 'smoothstep',
    label: e.label ?? '흐름',
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: e.active ? '#2f6f9f' : '#8fa9be' },
    pathOptions: { borderRadius: 20, offset: 26 },
    labelBgPadding: [6, 2],
    labelBgBorderRadius: 999,
    labelBgStyle: { fill: '#ffffffcc' },
    style: e.active ? { strokeWidth: 2.4, stroke: '#2f6f9f' } : { opacity: 0.35, strokeWidth: 1.8, stroke: '#8fa9be' },
    animated: false
  })), [graph]);

  if (!history) return <main className="app-stage"><section className="mobile-frame"><section className="app-shell theme-calm-mint" /></section></main>;

  const addByComposer = () => {
    if (!history) return;
    try {
      if (kind === 'account') {
        if (!accountPurpose.trim() || !accountBank.trim() || !accountLinkSourceId) return setMessage('계좌 정보를 입력해 주세요.');
        let h = addNode(history, { type: 'asset_account', name: accountPurpose.trim(), meta: { subtype: accountSubtype, institution: accountBank.trim(), purpose: accountPurpose.trim(), linkSourceId: accountLinkSourceId, note: accountMemo.trim() || undefined }, x: 148, y: 760 });
        const node = h.present.nodes[h.present.nodes.length - 1];
        h = addEdge(h, { sourceId: accountLinkSourceId, targetId: node.id, label: '계좌 흐름' });
        setHistory(replaceGraph(h, prettyLayout(h.present)));
        setMessage('계좌 노드를 추가했어요.');
      }
      if (kind === 'card') {
        if (!cardPurpose.trim() || !cardIssuer.trim() || !cardLinkAccountId) return setMessage('카드 정보를 입력해 주세요.');
        let h = addNode(history, { type: 'payment_instrument', name: cardPurpose.trim(), meta: { institution: cardIssuer.trim(), purpose: cardPurpose.trim(), linkSourceId: cardLinkAccountId, note: cardMemo.trim() || undefined }, x: 148, y: 760 });
        const node = h.present.nodes[h.present.nodes.length - 1];
        h = addEdge(h, { sourceId: cardLinkAccountId, targetId: node.id, label: '카드 연결' });
        setHistory(replaceGraph(h, prettyLayout(h.present)));
        setMessage('카드 노드를 추가했어요.');
      }
      if (kind === 'expense') {
        if (!expenseType.trim() || !expenseLinkSourceId) return setMessage('지출 정보를 입력해 주세요.');
        let h = addNode(history, { type: 'expense_category', name: expenseType.trim(), meta: { expenseType: expenseType.trim(), linkSourceId: expenseLinkSourceId, note: expenseMemo.trim() || undefined }, x: 148, y: 760 });
        const node = h.present.nodes[h.present.nodes.length - 1];
        h = addEdge(h, { sourceId: expenseLinkSourceId, targetId: node.id, label: '지출 흐름' });
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
            <section className="intro-screen"><p className="intro-eyebrow">MOBILE ONLY MONEY FLOW</p><h1>'관리비, 통신비 어디서 나가더라?'</h1><p className="intro-body">소중한 내 월급, Money Flow로 관리하세요</p><ol className="intro-steps"><li>🛣️ 월급통장부터 현금 흐름 확인해요</li><li>💰 갖고 있는 통장, 주식, 신용/체크카드 모두 관리해요</li><li>🔎 어디에서 내 돈 나가는지 쉽게 찾아요</li></ol><button type="button" className="btn btn-primary intro-cta" onClick={() => setShowIntro(false)}>내 Money Flow 만들기</button></section>
          ) : (
            <>
              <header className="topbar"><div className="brand"><h1>Money Flow</h1><span className="env-badge">{env.toUpperCase()}</span></div><div className="top-actions"><button type="button" className="btn btn-weak" onClick={() => setResetConfirmOpen(true)}>초기화</button><button type="button" className="btn btn-weak" onClick={async () => { try { if (graph) setMessage(await shareGraph(graph)); } catch { setMessage('공유를 완료하지 못했어요.'); } }}>공유</button><button type="button" className="btn btn-primary" onClick={() => setComposerOpen(true)}>노드 추가</button></div></header>
              <section className="summary-card"><strong>월급통장에서 시작되는 내 흐름</strong><p>계좌 {history.present.nodes.filter((n) => n.type === 'asset_account').length}개 · 카드 {history.present.nodes.filter((n) => n.type === 'payment_instrument').length}개 · 지출항목 {history.present.nodes.filter((n) => n.type === 'expense_category').length}개</p></section>
              <section className="canvas-wrap" id="flow-canvas"><ReactFlow nodes={rfNodes} edges={rfEdges} nodeTypes={nodeTypes} proOptions={{ hideAttribution: true }} onNodeClick={(_, node) => { const s = history.present.nodes.find((n) => n.id === node.id); if (s) { setSelection({ kind: 'node', value: s }); setDetailOpen(true); } }} nodesDraggable={false} nodesConnectable={false} elementsSelectable zoomOnPinch={false} zoomOnScroll={false} zoomOnDoubleClick={false} panOnScroll={false} nodeExtent={FLOW_BOUNDS} translateExtent={FLOW_BOUNDS} fitViewOptions={{ padding: 0.22 }} fitView><Background /></ReactFlow></section>

              <BottomSheet open={composerOpen} title="노드 추가" onClose={() => setComposerOpen(false)}>
                <div className="sheet-segment"><button type="button" className={kind === 'account' ? 'btn btn-primary' : 'btn btn-weak'} onClick={() => setKind('account')}>계좌</button><button type="button" className={kind === 'card' ? 'btn btn-primary' : 'btn btn-weak'} onClick={() => setKind('card')}>카드</button><button type="button" className={kind === 'expense' ? 'btn btn-primary' : 'btn btn-weak'} onClick={() => setKind('expense')}>지출항목</button></div>
                {kind === 'account' && <div className="sheet-form"><label>계좌 구분<select value={accountSubtype} onChange={(e) => setAccountSubtype(e.target.value as AccountSubtype)}><option value="spending">지출</option><option value="saving">적금</option><option value="invest">투자</option></select></label><label>은행 종류<input value={accountBank} onChange={(e) => setAccountBank(e.target.value)} maxLength={30} /></label><label>계좌 용도<input value={accountPurpose} onChange={(e) => setAccountPurpose(e.target.value)} maxLength={30} /></label><label>연결될 상위 계좌<select value={accountLinkSourceId} onChange={(e) => setAccountLinkSourceId(e.target.value)}>{accountLinks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label><label>기타 메모<input value={accountMemo} onChange={(e) => setAccountMemo(e.target.value)} maxLength={40} /></label></div>}
                {kind === 'card' && <div className="sheet-form"><label>카드사 종류<input value={cardIssuer} onChange={(e) => setCardIssuer(e.target.value)} maxLength={30} /></label><label>카드 용도<input value={cardPurpose} onChange={(e) => setCardPurpose(e.target.value)} maxLength={30} /></label><label>연결될 계좌<select value={cardLinkAccountId} onChange={(e) => setCardLinkAccountId(e.target.value)}>{accountLinks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label><label>기타 메모<input value={cardMemo} onChange={(e) => setCardMemo(e.target.value)} maxLength={40} /></label></div>}
                {kind === 'expense' && <div className="sheet-form"><label>지출항목 종류<input value={expenseType} onChange={(e) => setExpenseType(e.target.value)} maxLength={30} /></label><label>연결될 계좌 또는 카드<select value={expenseLinkSourceId} onChange={(e) => setExpenseLinkSourceId(e.target.value)}>{expenseLinks.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label><label>기타 메모<input value={expenseMemo} onChange={(e) => setExpenseMemo(e.target.value)} maxLength={40} /></label></div>}
                <div className="sheet-inline-buttons"><button type="button" className="btn btn-primary" onClick={addByComposer}>추가하기</button><button type="button" className="btn btn-weak" onClick={() => { const next = replaceGraph(history, prettyLayout(history.present)); setHistory(next); setMessage('노드를 다시 정렬했어요.'); }}>다시 정렬</button></div>
              </BottomSheet>

              <BottomSheet open={detailOpen && selection.kind !== 'none'} title="상세 정보" onClose={() => setDetailOpen(false)}>
                {selection.kind === 'node' && <div className="sheet-form"><p>노드 타입: {NODE_LABEL[selection.value.type]}</p><label>이름<input value={selection.value.name} onChange={(e) => setSelection((prev) => prev.kind === 'node' ? { ...prev, value: { ...prev.value, name: e.target.value } } : prev)} /></label><label>메모<input value={selection.value.meta?.note ?? ''} onChange={(e) => setSelection((prev) => prev.kind === 'node' ? { ...prev, value: { ...prev.value, meta: { ...prev.value.meta, note: e.target.value } } } : prev)} /></label><div className="sheet-inline-buttons"><button type="button" className="btn btn-primary" onClick={() => { if (selection.kind !== 'node') return; try { const next = updateNode(history, selection.value.id, { name: selection.value.name, meta: selection.value.meta }); setHistory(replaceGraph(next, prettyLayout(next.present))); setMessage('노드 정보를 저장했어요.'); setDetailOpen(false); } catch (e) { setMessage((e as Error).message); } }}>저장</button><button type="button" className="btn btn-danger" onClick={() => { if (selection.kind !== 'node') return; if (selection.value.type === 'salary_account') return setMessage('월급통장은 삭제할 수 없어요.'); const next = removeNode(history, selection.value.id); setHistory(replaceGraph(next, prettyLayout(next.present))); setSelection({ kind: 'none' }); setDetailOpen(false); }}>삭제</button></div></div>}
                <button type="button" className="btn btn-weak" onClick={async () => { const canvas = document.getElementById('flow-canvas'); if (!canvas) return; try { await exportGraphPng(canvas); setMessage('PNG 저장을 완료했어요.'); } catch { setMessage('PNG 저장에 실패했어요.'); } }}>PNG 저장</button>
              </BottomSheet>

              <BottomSheet open={resetConfirmOpen} title="노드 초기화" onClose={() => setResetConfirmOpen(false)}>
                <div className="sheet-form"><p>데이터가 모두 삭제됩니다.</p><div className="sheet-inline-buttons"><button type="button" className="btn btn-danger" onClick={() => { const starter = starterGraph(); setHistory(replaceGraph(history, starter)); setSelection({ kind: 'none' }); setComposerOpen(false); setDetailOpen(false); setResetConfirmOpen(false); setMessage('초기화가 완료됐어요.'); }}>전체 초기화</button><button type="button" className="btn btn-weak" onClick={() => setResetConfirmOpen(false)}>취소</button></div></div>
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
