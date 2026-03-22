import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Connection,
  Controls,
  Edge,
  Handle,
  Node,
  NodeProps,
  Position,
  ReactFlowProvider,
  useReactFlow
} from 'reactflow';
import { BannerAdWrapper } from './ads/BannerAdWrapper';
import { getBannerAdGroupId } from './ads/adConstants';
import { createEmptyGraph } from './app/onboarding/templates';
import { exportGraphPng, shareGraph } from './app/share/share';
import {
  addEdge,
  addNode,
  createHistory,
  GraphHistoryState,
  redo,
  removeEdge,
  removeNode,
  replaceGraph,
  undo,
  updateEdge,
  updateNode
} from './domain/graph-ops';
import { EDGE_TYPE_LABEL, FlowEdge, FlowGraph, FlowNode, NODE_TYPE_LABEL, NodeType, ThemeName } from './domain/graph-model';
import { resolveEdgeType } from './domain/graph-validator';
import { detectEnvironment } from './infra/environment';
import { loadGraph, saveGraph } from './infra/storage';

interface FlowNodeData {
  label: string;
  type: NodeType;
}

type Selection =
  | { kind: 'node'; value: FlowNode }
  | { kind: 'edge'; value: FlowEdge }
  | { kind: 'none' };

const FLOW_BOUNDS: [[number, number], [number, number]] = [
  [0, 0],
  [356, 2200]
];

const THEMES: Record<ThemeName, { title: string; className: string }> = {
  'calm-mint': { title: 'Calm Mint', className: 'theme-calm-mint' },
  'deep-ocean': { title: 'Deep Ocean', className: 'theme-deep-ocean' },
  'warm-sand': { title: 'Warm Sand', className: 'theme-warm-sand' }
};

const NODE_TYPE_OPTIONS = Object.entries(NODE_TYPE_LABEL) as Array<[NodeType, string]>;

function nodeClass(type: NodeType): string {
  switch (type) {
    case 'income_source':
      return 'node-shape node-diamond';
    case 'asset_account':
      return 'node-shape node-circle';
    case 'payment_instrument':
      return 'node-shape node-rounded';
    case 'expense_category':
      return 'node-shape node-hexagon';
    case 'liability_bucket':
      return 'node-shape node-octagon';
  }
}

function FlowShapeNode(props: NodeProps<FlowNodeData>) {
  return (
    <div className={nodeClass(props.data.type)}>
      <Handle type="target" position={Position.Top} />
      <span>{props.data.label}</span>
      <Handle type="source" position={Position.Bottom} />
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
      { id: 'income-main', type: 'income_source', name: '월급', ui: { x: 28, y: 64 } },
      { id: 'account-main', type: 'asset_account', name: '월급통장', ui: { x: 156, y: 68 } },
      { id: 'card-main', type: 'payment_instrument', name: '체크카드', ui: { x: 156, y: 208 } },
      { id: 'expense-life', type: 'expense_category', name: '생활비', ui: { x: 156, y: 352 } },
      { id: 'expense-fixed', type: 'expense_category', name: '고정비', ui: { x: 28, y: 470 } },
      { id: 'expense-saving', type: 'expense_category', name: '저축', ui: { x: 156, y: 470 } },
      { id: 'expense-invest', type: 'expense_category', name: '투자', ui: { x: 284, y: 470 } },
      { id: 'expense-loan', type: 'expense_category', name: '대출 상환', ui: { x: 156, y: 588 } }
    ],
    edges: [
      {
        id: 'edge-1',
        type: 'income_to_account',
        sourceId: 'income-main',
        targetId: 'account-main',
        label: '입금',
        active: true
      },
      {
        id: 'edge-2',
        type: 'account_to_card',
        sourceId: 'account-main',
        targetId: 'card-main',
        label: '카드 연결',
        active: true
      },
      {
        id: 'edge-3',
        type: 'card_to_expense',
        sourceId: 'card-main',
        targetId: 'expense-life',
        label: '생활 결제',
        active: true
      },
      {
        id: 'edge-4',
        type: 'account_to_expense',
        sourceId: 'account-main',
        targetId: 'expense-fixed',
        label: '자동이체',
        active: true
      },
      {
        id: 'edge-5',
        type: 'account_to_expense',
        sourceId: 'account-main',
        targetId: 'expense-saving',
        label: '저축 이체',
        active: true
      },
      {
        id: 'edge-6',
        type: 'account_to_expense',
        sourceId: 'account-main',
        targetId: 'expense-invest',
        label: '투자 이체',
        active: true
      },
      {
        id: 'edge-7',
        type: 'account_to_expense',
        sourceId: 'account-main',
        targetId: 'expense-loan',
        label: '원리금',
        active: true
      }
    ]
  };
}

function applyCashFlowLayout(graph: FlowGraph): FlowGraph {
  const incomeNodes = graph.nodes.filter((node) => node.type === 'income_source');
  const accountNodes = graph.nodes.filter((node) => node.type === 'asset_account');
  const cardNodes = graph.nodes.filter((node) => node.type === 'payment_instrument');
  const expenseNodes = graph.nodes.filter((node) => node.type === 'expense_category');
  const liabilityNodes = graph.nodes.filter((node) => node.type === 'liability_bucket');

  const map = new Map<string, FlowNode>();

  for (const [index, node] of incomeNodes.entries()) {
    map.set(node.id, {
      ...node,
      ui: {
        ...node.ui,
        x: 26,
        y: 60 + index * 92
      }
    });
  }

  for (const [index, node] of accountNodes.entries()) {
    map.set(node.id, {
      ...node,
      ui: {
        ...node.ui,
        x: 156,
        y: 66 + index * 106
      }
    });
  }

  for (const [index, node] of cardNodes.entries()) {
    map.set(node.id, {
      ...node,
      ui: {
        ...node.ui,
        x: 156,
        y: 208 + index * 104
      }
    });
  }

  for (const [index, node] of expenseNodes.entries()) {
    const columnX = [26, 156, 286][index % 3];
    const row = Math.floor(index / 3);
    map.set(node.id, {
      ...node,
      ui: {
        ...node.ui,
        x: columnX,
        y: 352 + row * 116
      }
    });
  }

  for (const [index, node] of liabilityNodes.entries()) {
    const columnX = [26, 156, 286][index % 3];
    const row = Math.floor(index / 3);
    map.set(node.id, {
      ...node,
      ui: {
        ...node.ui,
        x: columnX,
        y: 580 + row * 120
      }
    });
  }

  return {
    ...graph,
    nodes: graph.nodes.map((node) => map.get(node.id) ?? node)
  };
}

function buildDefaultNodeName(nodes: FlowNode[], type: NodeType): string {
  const baseLabel = NODE_TYPE_LABEL[type];
  const number = nodes.filter((node) => node.type === type).length + 1;
  return `${baseLabel} ${number}`;
}

function MobileIntro({ onEnter }: { onEnter: () => void }) {
  return (
    <section className="intro-screen">
      <p className="intro-eyebrow">MOBILE ONLY MONEY FLOW</p>
      <h1>월급통장에서 시작되는 현금 흐름을 한 화면에서 확인해요</h1>
      <p className="intro-body">
        이 앱은 거래내역 앱이 아니라 구조 파악용 도구예요. 월급통장을 기준으로 어디로 돈이 빠져나가는지,
        흐름 자체를 빠르게 점검할 수 있게 설계했어요.
      </p>
      <ol className="intro-steps">
        <li>월급통장을 상단 기준점으로 둡니다.</li>
        <li>아래로 생활비, 저축, 투자, 대출 상환 흐름을 연결합니다.</li>
        <li>메인 화면에서 대부분의 수정과 검토를 끝냅니다.</li>
      </ol>
      <button type="button" className="btn btn-primary intro-cta" onClick={onEnter}>
        메인 화면으로 시작하기
      </button>
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
            닫기
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
  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeType, setNewNodeType] = useState<NodeType>('expense_category');
  const [message, setMessage] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [nodesLocked, setNodesLocked] = useState(true);

  useEffect(() => {
    const loaded = loadGraph();
    if (!loaded || loaded.nodes.length === 0) {
      setHistory(createHistory(createSalaryStarterGraph()));
      return;
    }
    setHistory(createHistory(loaded));
  }, []);

  useEffect(() => {
    if (!history) return;
    saveGraph(history.present);
  }, [history]);

  useEffect(() => {
    if (!history?.present.nodes.length || showIntro) return;
    const timer = window.setTimeout(() => {
      void fitView({ padding: 0.25, duration: 250 });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [history?.present.nodes.length, history?.present.edges.length, fitView, showIntro]);

  const graph = history?.present;
  const env = detectEnvironment();
  const themeClass = graph ? THEMES[graph.settings.theme].className : THEMES['calm-mint'].className;

  const rfNodes = useMemo<Node<FlowNodeData>[]>(() => {
    if (!graph) return [];
    return graph.nodes.map((node) => ({
      id: node.id,
      position: { x: node.ui?.x ?? 0, y: node.ui?.y ?? 0 },
      type: 'flowShape',
      data: { label: node.name, type: node.type }
    }));
  }, [graph]);

  const rfEdges = useMemo<Edge[]>(() => {
    if (!graph) return [];
    return graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.sourceId,
      target: edge.targetId,
      label: edge.label || EDGE_TYPE_LABEL[edge.type],
      style: edge.active ? undefined : { opacity: 0.35 }
    }));
  }, [graph]);

  const summary = useMemo(() => {
    if (!graph) return { accountName: '-', accountCount: 0, expenseCount: 0, activeEdgeCount: 0 };
    const account = graph.nodes.find((node) => node.type === 'asset_account');
    return {
      accountName: account?.name ?? '월급통장',
      accountCount: graph.nodes.filter((node) => node.type === 'asset_account').length,
      expenseCount: graph.nodes.filter((node) => node.type === 'expense_category').length,
      activeEdgeCount: graph.edges.filter((edge) => edge.active).length
    };
  }, [graph]);

  const cycleTheme = () => {
    if (!history) return;
    const order: ThemeName[] = ['calm-mint', 'deep-ocean', 'warm-sand'];
    const current = history.present.settings.theme;
    const next = order[(order.indexOf(current) + 1) % order.length];
    setHistory(replaceGraph(history, { ...history.present, settings: { ...history.present.settings, theme: next } }));
    setMessage(`테마를 ${THEMES[next].title}(으)로 변경했어요.`);
  };

  const handleApplyLayout = () => {
    if (!history) return;
    setHistory(replaceGraph(history, applyCashFlowLayout(history.present)));
    setMessage('월급통장 중심 세로 흐름으로 정렬했어요.');
  };

  const handleAddNode = () => {
    if (!history) return;
    try {
      const name = newNodeName.trim() || buildDefaultNodeName(history.present.nodes, newNodeType);
      let nextHistory = addNode(history, {
        type: newNodeType,
        name,
        x: 156,
        y: 720
      });
      nextHistory = replaceGraph(nextHistory, applyCashFlowLayout(nextHistory.present));
      setHistory(nextHistory);
      setNewNodeName('');
      setComposerOpen(false);
      setMessage('노드를 추가했어요.');
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!history || !connection.source || !connection.target) return;
      try {
        const next = addEdge(history, {
          sourceId: connection.source,
          targetId: connection.target,
          label: '연결'
        });
        setHistory(next);
        setMessage('흐름 연결을 추가했어요.');
      } catch (error) {
        setMessage((error as Error).message);
      }
    },
    [history]
  );

  const applyNodePosition = (nodeId: string, x: number, y: number) => {
    if (!history || nodesLocked) return;
    const node = history.present.nodes.find((item) => item.id === nodeId);
    if (!node) return;
    setHistory(updateNode(history, nodeId, { ui: { ...node.ui, x, y } }));
  };

  const handleShare = async () => {
    if (!graph) return;
    try {
      const shareMessage = await shareGraph(graph);
      setMessage(shareMessage);
    } catch {
      setMessage('공유를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
  };

  const handleExport = async () => {
    const canvas = document.getElementById('flow-canvas');
    if (!canvas) return;
    try {
      await exportGraphPng(canvas);
      setMessage('PNG 저장을 완료했어요.');
    } catch {
      setMessage('PNG 저장에 실패했어요.');
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
            <MobileIntro
              onEnter={() => {
                setShowIntro(false);
                setHistory(replaceGraph(history, applyCashFlowLayout(history.present)));
              }}
            />
          ) : (
            <>
              <header className="topbar">
                <div className="brand">
                  <h1>Money Flow</h1>
                  <span className="env-badge">{env.toUpperCase()}</span>
                </div>
                <div className="top-actions">
                  <button type="button" className="btn btn-weak" onClick={cycleTheme}>
                    테마
                  </button>
                  <button type="button" className="btn btn-weak" onClick={handleShare}>
                    공유
                  </button>
                </div>
              </header>

              <section className="summary-card">
                <strong>{summary.accountName}</strong>
                <p>계좌 {summary.accountCount}개 · 지출 항목 {summary.expenseCount}개 · 활성 흐름 {summary.activeEdgeCount}개</p>
              </section>

              <section className="canvas-wrap" id="flow-canvas">
                <ReactFlow
                  nodes={rfNodes}
                  edges={rfEdges}
                  nodeTypes={nodeTypes}
                  onConnect={onConnect}
                  onNodeClick={(_, node) => {
                    const selected = history.present.nodes.find((item) => item.id === node.id);
                    if (!selected) return;
                    setSelection({ kind: 'node', value: selected });
                    setDetailOpen(true);
                  }}
                  onNodeDragStop={(_, node) => applyNodePosition(node.id, node.position.x, node.position.y)}
                  onEdgeClick={(_, edge) => {
                    const selected = history.present.edges.find((item) => item.id === edge.id);
                    if (!selected) return;
                    setSelection({ kind: 'edge', value: selected });
                    setDetailOpen(true);
                  }}
                  nodesDraggable={!nodesLocked}
                  preventScrolling={false}
                  panOnScroll={false}
                  zoomOnPinch={false}
                  zoomOnScroll={false}
                  zoomOnDoubleClick={false}
                  nodeExtent={FLOW_BOUNDS}
                  translateExtent={FLOW_BOUNDS}
                  fitView
                >
                  <Background />
                  <MiniLegend />
                  <Controls />
                </ReactFlow>
              </section>

              <div className="fab-dock">
                <button type="button" className="btn btn-primary" onClick={handleApplyLayout}>
                  흐름 정렬
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setComposerOpen(true)}>
                  노드 추가
                </button>
                <button
                  type="button"
                  className="btn btn-weak"
                  disabled={selection.kind === 'none'}
                  onClick={() => setDetailOpen(true)}
                >
                  상세 편집
                </button>
              </div>

              <BottomSheet open={composerOpen} title="새 노드 추가" onClose={() => setComposerOpen(false)}>
                <div className="sheet-form">
                  <label>
                    타입
                    <select value={newNodeType} onChange={(event) => setNewNodeType(event.target.value as NodeType)}>
                      {NODE_TYPE_OPTIONS.map(([type, label]) => (
                        <option key={type} value={type}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    이름
                    <input
                      value={newNodeName}
                      onChange={(event) => setNewNodeName(event.target.value)}
                      placeholder="비우면 자동 이름으로 생성"
                      maxLength={30}
                    />
                  </label>
                  <button type="button" className="btn btn-primary" onClick={handleAddNode}>
                    추가
                  </button>
                </div>
              </BottomSheet>

              <BottomSheet open={detailOpen && selection.kind !== 'none'} title="선택 항목 상세" onClose={() => setDetailOpen(false)}>
                {selection.kind === 'node' && (
                  <div className="sheet-form">
                    <p>타입: {NODE_TYPE_LABEL[selection.value.type]}</p>
                    <label>
                      이름
                      <input
                        value={selection.value.name}
                        onChange={(event) => {
                          const value = event.target.value;
                          setSelection((prev) => (prev.kind === 'node' ? { ...prev, value: { ...prev.value, name: value } } : prev));
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        try {
                          const next = updateNode(history, selection.value.id, { name: selection.value.name });
                          setHistory(next);
                          setMessage('노드 이름을 수정했어요.');
                          setDetailOpen(false);
                        } catch (error) {
                          setMessage((error as Error).message);
                        }
                      }}
                    >
                      이름 저장
                    </button>
                    <label className="switch-row">
                      노드 이동 잠금
                      <input
                        type="checkbox"
                        checked={nodesLocked}
                        onChange={(event) => {
                          setNodesLocked(event.target.checked);
                          setMessage(event.target.checked ? '노드 이동 잠금을 켰어요.' : '노드 이동 잠금을 껐어요.');
                        }}
                      />
                    </label>
                    <div className="sheet-inline-buttons">
                      <button type="button" className="btn btn-weak" onClick={() => setHistory(undo(history))}>
                        실행 취소
                      </button>
                      <button type="button" className="btn btn-weak" onClick={() => setHistory(redo(history))}>
                        다시 실행
                      </button>
                    </div>
                    <div className="sheet-inline-buttons">
                      <button type="button" className="btn btn-weak" onClick={handleExport}>
                        PNG 저장
                      </button>
                      <button
                        type="button"
                        className="btn btn-weak"
                        onClick={() => {
                          setHistory(replaceGraph(history, createEmptyGraph()));
                          setSelection({ kind: 'none' });
                          setDetailOpen(false);
                          setMessage('그래프를 비웠어요.');
                        }}
                      >
                        빈 화면
                      </button>
                    </div>
                    <button type="button" className="btn btn-danger" onClick={() => setDeleteConfirm(true)}>
                      노드 삭제
                    </button>
                    {deleteConfirm && (
                      <div className="confirm-box">
                        <p>연결된 흐름도 함께 삭제됩니다.</p>
                        <button
                          type="button"
                          className="btn btn-danger"
                          onClick={() => {
                            setHistory(removeNode(history, selection.value.id));
                            setSelection({ kind: 'none' });
                            setDeleteConfirm(false);
                            setDetailOpen(false);
                          }}
                        >
                          삭제 진행
                        </button>
                        <button type="button" className="btn btn-weak" onClick={() => setDeleteConfirm(false)}>
                          취소
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {selection.kind === 'edge' && (
                  <div className="sheet-form">
                    <p>타입: {EDGE_TYPE_LABEL[selection.value.type]}</p>
                    <p className="muted">
                      연결 규칙:
                      {(() => {
                        const source = history.present.nodes.find((node) => node.id === selection.value.sourceId);
                        const target = history.present.nodes.find((node) => node.id === selection.value.targetId);
                        if (!source || !target) return '오류';
                        return resolveEdgeType(source.type, target.type) ? '정상' : '비정상';
                      })()}
                    </p>
                    <label>
                      라벨
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
                      메모
                      <input
                        value={selection.value.memo ?? ''}
                        onChange={(event) =>
                          setSelection((prev) =>
                            prev.kind === 'edge' ? { ...prev, value: { ...prev.value, memo: event.target.value } } : prev
                          )
                        }
                      />
                    </label>
                    <label className="switch-row">
                      활성
                      <input
                        type="checkbox"
                        checked={selection.value.active}
                        onChange={(event) =>
                          setSelection((prev) =>
                            prev.kind === 'edge' ? { ...prev, value: { ...prev.value, active: event.target.checked } } : prev
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        try {
                          setHistory(
                            updateEdge(history, selection.value.id, {
                              label: selection.value.label,
                              memo: selection.value.memo,
                              active: selection.value.active
                            })
                          );
                          setMessage('연결 정보를 저장했어요.');
                          setDetailOpen(false);
                        } catch (error) {
                          setMessage((error as Error).message);
                        }
                      }}
                    >
                      저장
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => {
                        setHistory(removeEdge(history, selection.value.id));
                        setSelection({ kind: 'none' });
                        setDetailOpen(false);
                      }}
                    >
                      연결 삭제
                    </button>
                  </div>
                )}
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

function MiniLegend() {
  return (
    <div className="legend">
      <strong>범례</strong>
      <ul>
        <li>다이아: 수입원</li>
        <li>원형: 자산 계좌</li>
        <li>둥근 사각: 결제 수단</li>
        <li>육각형: 지출 항목</li>
        <li>팔각형: 부채 버킷</li>
      </ul>
    </div>
  );
}

export function App() {
  return (
    <ReactFlowProvider>
      <AppBody />
    </ReactFlowProvider>
  );
}
