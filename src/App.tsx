import { type ReactNode, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Edge,
  Handle,
  MarkerType,
  Node,
  NodeProps,
  Position,
  ReactFlowProvider,
  useReactFlow
} from 'reactflow';
import { BannerAdWrapper } from './ads/BannerAdWrapper';
import { getBannerAdGroupId } from './ads/adConstants';
import { exportGraphPng, shareGraph } from './app/share/share';
import {
  addEdge,
  addNode,
  createHistory,
  GraphHistoryState,
  removeEdge,
  removeNode,
  replaceGraph,
  updateEdge,
  updateNode
} from './domain/graph-ops';
import { EDGE_TYPE_LABEL, FlowEdge, FlowGraph, FlowNode, NODE_TYPE_LABEL, NodeType, ThemeName } from './domain/graph-model';
import { detectEnvironment } from './infra/environment';
import { loadGraph, saveGraph } from './infra/storage';

interface FlowNodeData {
  label: string;
  type: NodeType;
  topLabel?: string;
  subtype?: string;
}

type Selection =
  | { kind: 'node'; value: FlowNode }
  | { kind: 'edge'; value: FlowEdge }
  | { kind: 'none' };

type ComposerKind = 'account' | 'card' | 'expense';

type AccountSubtype = 'spending' | 'saving' | 'invest';

const FLOW_BOUNDS: [[number, number], [number, number]] = [
  [0, 0],
  [356, 3800]
];

const THEMES: Record<ThemeName, { title: string; className: string }> = {
  'calm-mint': { title: 'Calm Mint', className: 'theme-calm-mint' },
  'deep-ocean': { title: 'Deep Ocean', className: 'theme-deep-ocean' },
  'warm-sand': { title: 'Warm Sand', className: 'theme-warm-sand' }
};

function nodeClass(type: NodeType, subtype?: string): string {
  if (type === 'salary_account') return 'node-shape node-salary';
  if (type === 'asset_account') {
    const subtypeClass = subtype ? `node-account-${subtype}` : 'node-account-spending';
    return `node-shape node-account ${subtypeClass}`;
  }
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

function createSalaryStarterGraph(): FlowGraph {
  return {
    version: 1,
    settings: {
      theme: 'calm-mint',
      legendVisible: true
    },
    nodes: [
      {
        id: 'salary-main',
        type: 'salary_account',
        name: '?붽툒?듭옣',
        meta: {
          purpose: '硫붿씤 ?듭옣',
          institution: '二쇨굅?????
        },
        ui: { x: 138, y: 60 }
      }
    ],
    edges: []
  };
}

function orderRank(node: FlowNode): number {
  if (node.type === 'salary_account') return 0;
  if (node.type === 'asset_account') return 1;
  if (node.type === 'payment_instrument') return 2;
  if (node.type === 'expense_category') return 3;
  return 4;
}

function gridXByCols(cols: number): number[] {
  if (cols <= 1) return [148];
  if (cols === 2) return [72, 224];
  if (cols === 3) return [24, 148, 272];
  return [18, 106, 194, 282];
}

function applyPrettyMobileLayout(graph: FlowGraph): FlowGraph {
  const root = graph.nodes.find((node) => node.type === 'salary_account') ?? graph.nodes[0];
  if (!root) return graph;

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!edge.active) continue;
    const list = outgoing.get(edge.sourceId) ?? [];
    list.push(edge.targetId);
    outgoing.set(edge.sourceId, list);
    const incomingList = incoming.get(edge.targetId) ?? [];
    incomingList.push(edge.sourceId);
    incoming.set(edge.targetId, incomingList);
  }

  const depth = new Map<string, number>([[root.id, 0]]);
  const queue = [root.id];

  while (queue.length) {
    const sourceId = queue.shift()!;
    const currentDepth = depth.get(sourceId) ?? 0;
    const nextIds = outgoing.get(sourceId) ?? [];

    for (const targetId of nextIds) {
      if (depth.has(targetId)) continue;
      depth.set(targetId, currentDepth + 1);
      queue.push(targetId);
    }
  }

  let maxDepth = Math.max(...depth.values());
  for (const node of graph.nodes) {
    if (depth.has(node.id)) continue;
    maxDepth += 1;
    depth.set(node.id, maxDepth);
  }

  const byDepth = new Map<number, FlowNode[]>();
  for (const node of graph.nodes) {
    const d = depth.get(node.id) ?? 1;
    const bucket = byDepth.get(d) ?? [];
    bucket.push(node);
    byDepth.set(d, bucket);
  }

  const positioned = new Map<string, FlowNode>();
  const rootNode = graph.nodes.find((node) => node.id === root.id)!;
  positioned.set(root.id, { ...rootNode, ui: { ...rootNode.ui, x: 138, y: 60 } });

  const depthKeys = [...byDepth.keys()].filter((d) => d > 0).sort((a, b) => a - b);
  for (const d of depthKeys) {
    const rawNodes = [...(byDepth.get(d) ?? [])];
    const nodes = rawNodes.sort((a, b) => {
      const parentsA = incoming.get(a.id) ?? [];
      const parentsB = incoming.get(b.id) ?? [];
      const avgParentXA =
        parentsA.reduce((sum, parentId) => sum + (positioned.get(parentId)?.ui?.x ?? 148), 0) / Math.max(parentsA.length, 1);
      const avgParentXB =
        parentsB.reduce((sum, parentId) => sum + (positioned.get(parentId)?.ui?.x ?? 148), 0) / Math.max(parentsB.length, 1);
      if (Math.abs(avgParentXA - avgParentXB) > 8) return avgParentXA - avgParentXB;
      const rank = orderRank(a) - orderRank(b);
      if (rank !== 0) return rank;
      return a.name.localeCompare(b.name);
    });

    const cols = nodes.length <= 3 ? nodes.length || 1 : nodes.length <= 9 ? 3 : 4;
    const xList = gridXByCols(cols);
    const layerY = 60 + d * 164;

    for (const [index, node] of nodes.entries()) {
      const col = index % cols;
      const row = Math.floor(index / cols);
      positioned.set(node.id, {
        ...node,
        ui: {
          ...node.ui,
          x: xList[col],
          y: layerY + row * 124
        }
      });
    }
  }

  return {
    ...graph,
    nodes: graph.nodes.map((node) => positioned.get(node.id) ?? node)
  };
}

function MobileIntro({ onEnter }: { onEnter: () => void }) {
  return (
    <section className="intro-screen">
      <p className="intro-eyebrow">MOBILE ONLY MONEY FLOW</p>
      <h1>'愿由щ퉬, ?듭떊鍮??대뵒???섍??붾씪?'</h1>
      <p className="intro-body">?뚯쨷?????붽툒, Money Flow濡?愿由ы븯?몄슂</p>
      <ol className="intro-steps">
        <li>?썵截??붽툒?듭옣遺???꾧툑 ?먮쫫 ?뺤씤?댁슂</li>
        <li>?뮥 媛뽮퀬 ?덈뒗 ?듭옣, 二쇱떇, ?좎슜/泥댄겕移대뱶 紐⑤몢 愿由ы빐??/li>
        <li>?뵊 ?대뵒?먯꽌 ?????섍??붿? ?쎄쾶 李얠븘??/li>
      </ol>
      <button type="button" className="btn btn-primary intro-cta" onClick={onEnter}>
        ??Money Flow 留뚮뱾湲?      </button>
    </section>
  );
}

function BottomSheet({
  open,
  title,
  onClose,
  children
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="sheet-overlay" role="presentation" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <header className="sheet-header">
          <strong>{title}</strong>
          <button type="button" className="btn btn-weak" onClick={onClose}>
            ?リ린
          </button>
        </header>
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

  const [composerKind, setComposerKind] = useState<ComposerKind>('account');

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
    const base = loaded && loaded.nodes.length ? loaded : createSalaryStarterGraph();
    const salaryNode: FlowNode = {
      id: 'salary-main',
      type: 'salary_account',
      name: '월급통장',
      meta: { purpose: '메인 통장', institution: '주거래 은행' },
      ui: { x: 138, y: 60 }
    };
    const withSalary: FlowGraph = base.nodes.some((node) => node.type === 'salary_account')
      ? base
      : {
          ...base,
          nodes: [salaryNode, ...base.nodes]
        };
    setHistory(createHistory(applyPrettyMobileLayout(withSalary)));
  }, []);

  useEffect(() => {
    if (!history) return;
    saveGraph(history.present);
  }, [history]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 2200);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!history || showIntro) return;
    const timer = window.setTimeout(() => {
      void fitView({ padding: 0.22, duration: 280 });
    }, 30);
    return () => window.clearTimeout(timer);
  }, [history?.present.nodes.length, history?.present.edges.length, fitView, showIntro]);

  useEffect(() => {
    if (!history) return;
    const defaultSource = history.present.nodes.find((node) => node.type === 'salary_account')?.id ?? '';
    if (!accountLinkSourceId) setAccountLinkSourceId(defaultSource);
    if (!cardLinkAccountId) {
      const account = history.present.nodes.find((node) => node.type === 'asset_account');
      setCardLinkAccountId(account?.id ?? defaultSource);
    }
    if (!expenseLinkSourceId) {
      const accountOrCard = history.present.nodes.find(
        (node) => node.type === 'asset_account' || node.type === 'payment_instrument'
      );
      setExpenseLinkSourceId(accountOrCard?.id ?? defaultSource);
    }
  }, [history, accountLinkSourceId, cardLinkAccountId, expenseLinkSourceId]);

  const graph = history?.present;
  const env = detectEnvironment();
  const themeClass = graph ? THEMES[graph.settings.theme].className : THEMES['calm-mint'].className;

  const accountLinkCandidates = useMemo(
    () => graph?.nodes.filter((node) => node.type === 'salary_account' || node.type === 'asset_account') ?? [],
    [graph]
  );

  const cardLinkCandidates = useMemo(
    () => graph?.nodes.filter((node) => node.type === 'salary_account' || node.type === 'asset_account') ?? [],
    [graph]
  );

  const expenseLinkCandidates = useMemo(
    () => graph?.nodes.filter((node) => node.type === 'salary_account' || node.type === 'asset_account' || node.type === 'payment_instrument') ?? [],
    [graph]
  );

  const rfNodes = useMemo<Node<FlowNodeData>[]>(() => {
    if (!graph) return [];
    return graph.nodes.map((node) => {
      let topLabel = '';
      if (node.type === 'asset_account') {
        const purpose = node.meta?.purpose ?? node.name;
        const institution = node.meta?.institution ?? '???;
        topLabel = `${purpose} (${institution})`;
      }
      if (node.type === 'payment_instrument') {
        const purpose = node.meta?.purpose ?? node.name;
        const institution = node.meta?.institution ?? '移대뱶??;
        topLabel = `${purpose} (${institution})`;
      }

      return {
        id: node.id,
        position: { x: node.ui?.x ?? 0, y: node.ui?.y ?? 0 },
        type: 'flowShape',
        data: {
          label: node.name,
          type: node.type,
          topLabel,
          subtype: node.meta?.subtype
        }
      };
    });
  }, [graph]);

  const rfEdges = useMemo<Edge[]>(() => {
    if (!graph) return [];
    return graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.sourceId,
      target: edge.targetId,
      type: 'smoothstep',
      label: edge.label || EDGE_TYPE_LABEL[edge.type],
      labelBgPadding: [6, 2],
      labelBgBorderRadius: 999,
      labelBgStyle: { fill: '#ffffffcc' },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 16,
        height: 16,
        color: edge.active ? '#2f6f9f' : '#8fa9be'
      },
      pathOptions: {
        borderRadius: 20,
        offset: 26
      },
      style: edge.active
        ? { strokeWidth: 2.4, stroke: '#2f6f9f' }
        : { opacity: 0.35, strokeWidth: 1.8, stroke: '#8fa9be' },
      animated: false
    }));
  }, [graph]);

  const summary = useMemo(() => {
    if (!graph) return { account: 0, card: 0, expense: 0 };
    return {
      account: graph.nodes.filter((node) => node.type === 'asset_account').length,
      card: graph.nodes.filter((node) => node.type === 'payment_instrument').length,
      expense: graph.nodes.filter((node) => node.type === 'expense_category').length
    };
  }, [graph]);

  const clearComposer = () => {
    setAccountBank('');
    setAccountPurpose('');
    setAccountMemo('');
    setCardIssuer('');
    setCardPurpose('');
    setCardMemo('');
    setExpenseType('');
    setExpenseMemo('');
  };

  const handleAddByComposer = () => {
    if (!history) return;
    const salaryNodeId = history.present.nodes.find((node) => node.type === 'salary_account')?.id;

    try {
      if (composerKind === 'account') {
        if (!accountPurpose.trim() || !accountBank.trim() || !accountLinkSourceId) {
          setMessage('怨꾩쥖 ?⑸룄, ???醫낅쪟, ?곌껐 ?곸쐞 怨꾩쥖瑜??낅젰??二쇱꽭??');
          return;
        }
        const rootOutDegree = history.present.edges.filter(
          (edge) => edge.active && edge.sourceId === accountLinkSourceId
        ).length;

        const withNode = addNode(history, {
          type: 'asset_account',
          name: accountPurpose.trim(),
          meta: {
            subtype: accountSubtype,
            institution: accountBank.trim(),
            purpose: accountPurpose.trim(),
            linkSourceId: accountLinkSourceId,
            note: accountMemo.trim() || undefined
          },
          x: 148,
          y: 760
        });
        const newNode = withNode.present.nodes[withNode.present.nodes.length - 1];
        const withEdge = addEdge(withNode, {
          sourceId: accountLinkSourceId,
          targetId: newNode.id,
          label: '怨꾩쥖 ?먮쫫'
        });
        setHistory(replaceGraph(withEdge, applyPrettyMobileLayout(withEdge.present)));
        if (accountLinkSourceId === salaryNodeId && rootOutDegree >= 4) {
          setMessage('怨꾩쥖 ?몃뱶瑜?異붽??덉뼱?? ?붽툒?듭옣 吏곴껐??留롮븘吏硫?以묎컙 ?덈툕 怨꾩쥖濡?遺꾨━?섎뒗 寃껋쓣 異붿쿇?댁슂.');
        } else {
          setMessage('怨꾩쥖 ?몃뱶瑜?異붽??덉뼱??');
        }
      }

      if (composerKind === 'card') {
        if (!cardPurpose.trim() || !cardIssuer.trim() || !cardLinkAccountId) {
          setMessage('移대뱶 ?⑸룄, 移대뱶??醫낅쪟, ?곌껐 怨꾩쥖瑜??낅젰??二쇱꽭??');
          return;
        }

        const withNode = addNode(history, {
          type: 'payment_instrument',
          name: cardPurpose.trim(),
          meta: {
            institution: cardIssuer.trim(),
            purpose: cardPurpose.trim(),
            linkSourceId: cardLinkAccountId,
            note: cardMemo.trim() || undefined
          },
          x: 148,
          y: 760
        });
        const newNode = withNode.present.nodes[withNode.present.nodes.length - 1];
        const withEdge = addEdge(withNode, {
          sourceId: cardLinkAccountId,
          targetId: newNode.id,
          label: '移대뱶 ?곌껐'
        });
        setHistory(replaceGraph(withEdge, applyPrettyMobileLayout(withEdge.present)));
        setMessage('移대뱶 ?몃뱶瑜?異붽??덉뼱??');
      }

      if (composerKind === 'expense') {
        if (!expenseType.trim() || !expenseLinkSourceId) {
          setMessage('吏異쒗빆紐?醫낅쪟? ?곌껐 ??곸쓣 ?낅젰??二쇱꽭??');
          return;
        }

        const withNode = addNode(history, {
          type: 'expense_category',
          name: expenseType.trim(),
          meta: {
            expenseType: expenseType.trim(),
            linkSourceId: expenseLinkSourceId,
            note: expenseMemo.trim() || undefined
          },
          x: 148,
          y: 760
        });
        const newNode = withNode.present.nodes[withNode.present.nodes.length - 1];
        const withEdge = addEdge(withNode, {
          sourceId: expenseLinkSourceId,
          targetId: newNode.id,
          label: '吏異??먮쫫'
        });
        setHistory(replaceGraph(withEdge, applyPrettyMobileLayout(withEdge.present)));
        setMessage('吏異쒗빆紐??몃뱶瑜?異붽??덉뼱??');
      }

      clearComposer();
      setComposerOpen(false);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const handleShare = async () => {
    if (!graph) return;
    try {
      const result = await shareGraph(graph);
      setMessage(result);
    } catch {
      setMessage('怨듭쑀瑜??꾨즺?섏? 紐삵뻽?댁슂.');
    }
  };

  const handleExport = async () => {
    const canvas = document.getElementById('flow-canvas');
    if (!canvas) return;
    try {
      await exportGraphPng(canvas);
      setMessage('PNG ??μ쓣 ?꾨즺?덉뼱??');
    } catch {
      setMessage('PNG ??μ뿉 ?ㅽ뙣?덉뼱??');
    }
  };

  if (!history) {
    return (
      <main className="app-stage">
        <section className="mobile-frame">
          <section className="app-shell theme-calm-mint" />
        </section>
      </main>
    );
  }

  return (
    <main className="app-stage">
      <section className="mobile-frame">
        <div className={`app-shell ${themeClass}`}>
          {showIntro ? (
            <MobileIntro onEnter={() => setShowIntro(false)} />
          ) : (
            <>
              <header className="topbar">
                <div className="brand">
                  <h1>Money Flow</h1>
                  <span className="env-badge">{env.toUpperCase()}</span>
                </div>
                <div className="top-actions">
                  <button type="button" className="btn btn-weak" onClick={() => setResetConfirmOpen(true)}>
                    珥덇린??                  </button>
                  <button type="button" className="btn btn-weak" onClick={handleShare}>
                    怨듭쑀
                  </button>
                  <button type="button" className="btn btn-primary" onClick={() => setComposerOpen(true)}>
                    ?몃뱶 異붽?
                  </button>
                </div>
              </header>

              <section className="summary-card">
                <strong>?붽툒?듭옣?먯꽌 ?쒖옉?섎뒗 ???먮쫫</strong>
                <p>怨꾩쥖 {summary.account}媛?쨌 移대뱶 {summary.card}媛?쨌 吏異쒗빆紐?{summary.expense}媛?/p>
              </section>

              <section className="canvas-wrap" id="flow-canvas">
                <ReactFlow
                  nodes={rfNodes}
                  edges={rfEdges}
                  nodeTypes={nodeTypes}
                  proOptions={{ hideAttribution: true }}
                  onNodeClick={(_, node) => {
                    const selected = history.present.nodes.find((item) => item.id === node.id);
                    if (!selected) return;
                    setSelection({ kind: 'node', value: selected });
                    setDetailOpen(true);
                  }}
                  onEdgeClick={(_, edge) => {
                    const selected = history.present.edges.find((item) => item.id === edge.id);
                    if (!selected) return;
                    setSelection({ kind: 'edge', value: selected });
                    setDetailOpen(true);
                  }}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elementsSelectable
                  zoomOnPinch={false}
                  zoomOnScroll={false}
                  zoomOnDoubleClick={false}
                  panOnScroll={false}
                  nodeExtent={FLOW_BOUNDS}
                  translateExtent={FLOW_BOUNDS}
                  fitViewOptions={{ padding: 0.22 }}
                  fitView
                >
                  <Background />
                </ReactFlow>
              </section>

              <BottomSheet open={composerOpen} title="?몃뱶 異붽?" onClose={() => setComposerOpen(false)}>
                <div className="sheet-segment">
                  <button
                    type="button"
                    className={composerKind === 'account' ? 'btn btn-primary' : 'btn btn-weak'}
                    onClick={() => setComposerKind('account')}
                  >
                    怨꾩쥖
                  </button>
                  <button
                    type="button"
                    className={composerKind === 'card' ? 'btn btn-primary' : 'btn btn-weak'}
                    onClick={() => setComposerKind('card')}
                  >
                    移대뱶
                  </button>
                  <button
                    type="button"
                    className={composerKind === 'expense' ? 'btn btn-primary' : 'btn btn-weak'}
                    onClick={() => setComposerKind('expense')}
                  >
                    吏異쒗빆紐?                  </button>
                </div>

                {composerKind === 'account' && (
                  <div className="sheet-form">
                    <label>
                      怨꾩쥖 援щ텇
                      <select value={accountSubtype} onChange={(event) => setAccountSubtype(event.target.value as AccountSubtype)}>
                        <option value="spending">吏異?/option>
                        <option value="saving">?곴툑</option>
                        <option value="invest">?ъ옄</option>
                      </select>
                    </label>
                    <label>
                      ???醫낅쪟
                      <input value={accountBank} onChange={(event) => setAccountBank(event.target.value)} placeholder="?? ?좏븳??? maxLength={30} />
                    </label>
                    <label>
                      怨꾩쥖 ?⑸룄
                      <input value={accountPurpose} onChange={(event) => setAccountPurpose(event.target.value)} placeholder="?? ?앺솢鍮??듭옣" maxLength={30} />
                    </label>
                    <label>
                      ?곌껐???곸쐞 怨꾩쥖
                      <select value={accountLinkSourceId} onChange={(event) => setAccountLinkSourceId(event.target.value)}>
                        {accountLinkCandidates.map((node) => (
                          <option key={node.id} value={node.id}>
                            {node.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      湲고? 硫붾え
                      <input value={accountMemo} onChange={(event) => setAccountMemo(event.target.value)} maxLength={40} />
                    </label>
                  </div>
                )}

                {composerKind === 'card' && (
                  <div className="sheet-form">
                    <label>
                      移대뱶??醫낅쪟
                      <input value={cardIssuer} onChange={(event) => setCardIssuer(event.target.value)} placeholder="?? ?쇱꽦移대뱶" maxLength={30} />
                    </label>
                    <label>
                      移대뱶 ?⑸룄
                      <input value={cardPurpose} onChange={(event) => setCardPurpose(event.target.value)} placeholder="?? ?앺솢鍮?移대뱶" maxLength={30} />
                    </label>
                    <label>
                      ?곌껐??怨꾩쥖
                      <select value={cardLinkAccountId} onChange={(event) => setCardLinkAccountId(event.target.value)}>
                        {cardLinkCandidates.map((node) => (
                          <option key={node.id} value={node.id}>
                            {node.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      湲고? 硫붾え
                      <input value={cardMemo} onChange={(event) => setCardMemo(event.target.value)} maxLength={40} />
                    </label>
                  </div>
                )}

                {composerKind === 'expense' && (
                  <div className="sheet-form">
                    <label>
                      吏異쒗빆紐?醫낅쪟
                      <input value={expenseType} onChange={(event) => setExpenseType(event.target.value)} placeholder="?? 二쇱쑀鍮? maxLength={30} />
                    </label>
                    <label>
                      ?곌껐??怨꾩쥖 ?먮뒗 移대뱶
                      <select value={expenseLinkSourceId} onChange={(event) => setExpenseLinkSourceId(event.target.value)}>
                        {expenseLinkCandidates.map((node) => (
                          <option key={node.id} value={node.id}>
                            {node.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      湲고? 硫붾え
                      <input value={expenseMemo} onChange={(event) => setExpenseMemo(event.target.value)} maxLength={40} />
                    </label>
                  </div>
                )}

                <div className="sheet-inline-buttons">
                  <button type="button" className="btn btn-primary" onClick={handleAddByComposer}>
                    異붽??섍린
                  </button>
                  <button
                    type="button"
                    className="btn btn-weak"
                    onClick={() => {
                      if (!history) return;
                      const next = replaceGraph(history, applyPrettyMobileLayout(history.present));
                      setHistory(next);
                      setMessage('?몃뱶瑜??덉걯寃??ㅼ떆 ?뺣젹?덉뼱??');
                    }}
                  >
                    ?ㅼ떆 ?뺣젹
                  </button>
                </div>
              </BottomSheet>

              <BottomSheet open={detailOpen && selection.kind !== 'none'} title="?곸꽭 ?뺣낫" onClose={() => setDetailOpen(false)}>
                {selection.kind === 'node' && (
                  <div className="sheet-form">
                    <p>?몃뱶 ??? {NODE_TYPE_LABEL[selection.value.type]}</p>
                    <label>
                      ?대쫫
                      <input
                        value={selection.value.name}
                        onChange={(event) =>
                          setSelection((prev) =>
                            prev.kind === 'node' ? { ...prev, value: { ...prev.value, name: event.target.value } } : prev
                          )
                        }
                      />
                    </label>
                    <label>
                      硫붾え
                      <input
                        value={selection.value.meta?.note ?? ''}
                        onChange={(event) =>
                          setSelection((prev) =>
                            prev.kind === 'node'
                              ? { ...prev, value: { ...prev.value, meta: { ...prev.value.meta, note: event.target.value } } }
                              : prev
                          )
                        }
                      />
                    </label>
                    <div className="sheet-inline-buttons">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                          if (selection.kind !== 'node') return;
                          try {
                            const next = updateNode(history, selection.value.id, {
                              name: selection.value.name,
                              meta: selection.value.meta
                            });
                            setHistory(replaceGraph(next, applyPrettyMobileLayout(next.present)));
                            setMessage('?몃뱶 ?뺣낫瑜???ν뻽?댁슂.');
                            setDetailOpen(false);
                          } catch (error) {
                            setMessage((error as Error).message);
                          }
                        }}
                      >
                        ???                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => {
                          if (selection.kind !== 'node') return;
                          if (selection.value.type === 'salary_account') {
                            setMessage('?붽툒?듭옣? ??젣?????놁뼱??');
                            return;
                          }
                          const next = removeNode(history, selection.value.id);
                          setHistory(replaceGraph(next, applyPrettyMobileLayout(next.present)));
                          setSelection({ kind: 'none' });
                          setDetailOpen(false);
                        }}
                      >
                        ??젣
                      </button>
                    </div>
                  </div>
                )}

                {selection.kind === 'edge' && (
                  <div className="sheet-form">
                    <p>?곌껐 ??? {EDGE_TYPE_LABEL[selection.value.type]}</p>
                    <label>
                      ?쇰꺼
                      <input
                        value={selection.value.label ?? ''}
                        onChange={(event) =>
                          setSelection((prev) =>
                            prev.kind === 'edge' ? { ...prev, value: { ...prev.value, label: event.target.value } } : prev
                          )
                        }
                      />
                    </label>
                    <label>
                      硫붾え
                      <input
                        value={selection.value.memo ?? ''}
                        onChange={(event) =>
                          setSelection((prev) =>
                            prev.kind === 'edge' ? { ...prev, value: { ...prev.value, memo: event.target.value } } : prev
                          )
                        }
                      />
                    </label>
                    <div className="sheet-inline-buttons">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                          if (selection.kind !== 'edge') return;
                          try {
                            const next = updateEdge(history, selection.value.id, {
                              label: selection.value.label,
                              memo: selection.value.memo
                            });
                            setHistory(next);
                            setMessage('?곌껐 ?뺣낫瑜???ν뻽?댁슂.');
                            setDetailOpen(false);
                          } catch (error) {
                            setMessage((error as Error).message);
                          }
                        }}
                      >
                        ???                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => {
                          if (selection.kind !== 'edge') return;
                          const next = removeEdge(history, selection.value.id);
                          setHistory(replaceGraph(next, applyPrettyMobileLayout(next.present)));
                          setSelection({ kind: 'none' });
                          setDetailOpen(false);
                        }}
                      >
                        ??젣
                      </button>
                    </div>
                  </div>
                )}

                <button type="button" className="btn btn-weak" onClick={handleExport}>
                  PNG ???                </button>
              </BottomSheet>

              <BottomSheet open={resetConfirmOpen} title="?몃뱶 珥덇린?? onClose={() => setResetConfirmOpen(false)}>
                <div className="sheet-form">
                  <p>?곗씠?곌? 紐⑤몢 ??젣?⑸땲??</p>
                  <div className="sheet-inline-buttons">
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => {
                        const starter = createSalaryStarterGraph();
                        setHistory(replaceGraph(history, starter));
                        setSelection({ kind: 'none' });
                        setComposerOpen(false);
                        setDetailOpen(false);
                        setResetConfirmOpen(false);
                        setMessage('珥덇린?붽? ?꾨즺?먯뼱??');
                      }}
                    >
                      ?꾩껜 珥덇린??                    </button>
                    <button type="button" className="btn btn-weak" onClick={() => setResetConfirmOpen(false)}>
                      痍⑥냼
                    </button>
                  </div>
                </div>
              </BottomSheet>

              {message && <div className="toast">{message}</div>}

              <footer className="bottom-ad">
                <BannerAdWrapper adGroupId={getBannerAdGroupId('text')} mode="fixed" />
              </footer>
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

