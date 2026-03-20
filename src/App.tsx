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
  ReactFlowProvider
} from 'reactflow';
import { BannerAdWrapper } from './ads/BannerAdWrapper';
import { getBannerAdGroupId } from './ads/adConstants';
import { createEmptyGraph, templates } from './app/onboarding/templates';
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
      <Handle type="target" position={Position.Left} />
      <span>{props.data.label}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { flowShape: FlowShapeNode };

function Onboarding({ onComplete }: { onComplete: (graph: FlowGraph) => void }) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(templates[0].id);
  const [renameMap, setRenameMap] = useState<Record<string, string>>({});

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? templates[0];
  const preview = selectedTemplate.createGraph();

  useEffect(() => {
    const defaults: Record<string, string> = {};
    for (const node of preview.nodes) {
      defaults[node.id] = node.name;
    }
    setRenameMap(defaults);
  }, [selectedTemplateId]);

  const startTemplate = () => {
    const graph = selectedTemplate.createGraph();
    graph.nodes = graph.nodes.map((node) => ({ ...node, name: renameMap[node.id]?.trim() || node.name }));
    onComplete(graph);
  };

  return (
    <section className="onboarding">
      <h1>Money Flow</h1>
      <p className="muted">3분 안에 내 돈 흐름 구조를 만들어요.</p>
      <div className="template-list">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            className={template.id === selectedTemplateId ? 'template-card active' : 'template-card'}
            onClick={() => setSelectedTemplateId(template.id)}
          >
            <strong>{template.name}</strong>
            <span>{template.description}</span>
          </button>
        ))}
      </div>
      <div className="rename-list">
        {preview.nodes.map((node) => (
          <label key={node.id}>
            {NODE_TYPE_LABEL[node.type]}
            <input
              value={renameMap[node.id] ?? ''}
              onChange={(event) => setRenameMap((prev) => ({ ...prev, [node.id]: event.target.value }))}
              maxLength={30}
            />
          </label>
        ))}
      </div>
      <div className="onboarding-actions">
        <button type="button" className="btn btn-primary" onClick={startTemplate}>
          템플릿으로 시작
        </button>
        <button type="button" className="btn btn-weak" onClick={() => onComplete(createEmptyGraph())}>
          빈 화면에서 시작
        </button>
      </div>
    </section>
  );
}

type Selection =
  | { kind: 'node'; value: FlowNode }
  | { kind: 'edge'; value: FlowEdge }
  | { kind: 'none' };

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
  const [history, setHistory] = useState<GraphHistoryState | null>(null);
  const [selection, setSelection] = useState<Selection>({ kind: 'none' });
  const [newNodeName, setNewNodeName] = useState('');
  const [newNodeType, setNewNodeType] = useState<NodeType>('expense_category');
  const [message, setMessage] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    const loaded = loadGraph();
    if (loaded) setHistory(createHistory(loaded));
  }, []);

  useEffect(() => {
    if (!history) return;
    saveGraph(history.present);
  }, [history]);

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

  const cycleTheme = () => {
    if (!history) return;
    const order: ThemeName[] = ['calm-mint', 'deep-ocean', 'warm-sand'];
    const current = history.present.settings.theme;
    const next = order[(order.indexOf(current) + 1) % order.length];
    setHistory(replaceGraph(history, { ...history.present, settings: { ...history.present.settings, theme: next } }));
  };

  const handleAddNode = () => {
    if (!history) return;
    try {
      const next = addNode(history, {
        type: newNodeType,
        name: newNodeName,
        x: 120 + Math.round(Math.random() * 240),
        y: 100 + Math.round(Math.random() * 320)
      });
      setHistory(next);
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
        setMessage('연결을 추가했어요.');
      } catch (error) {
        setMessage((error as Error).message);
      }
    },
    [history]
  );

  const applyNodePosition = (nodeId: string, x: number, y: number) => {
    if (!history) return;
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
      setMessage('PNG를 저장했어요.');
    } catch {
      setMessage('PNG 저장에 실패했어요.');
    }
  };

  if (!history) {
    return (
      <main className="app-shell theme-calm-mint">
        <Onboarding onComplete={(graphToStart) => setHistory(createHistory(graphToStart))} />
      </main>
    );
  }

  return (
    <main className={`app-shell ${themeClass}`}>
      <header className="topbar">
        <div className="brand">
          <h1>Money Flow</h1>
          <span className="env-badge">{env.toUpperCase()}</span>
        </div>
        <div className="top-actions">
          <button type="button" className="btn btn-weak" onClick={cycleTheme}>
            테마
          </button>
          <button type="button" className="btn btn-weak" onClick={handleExport}>
            PNG
          </button>
          <button type="button" className="btn btn-primary" onClick={handleShare}>
            공유
          </button>
        </div>
      </header>

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
          fitView
        >
          <Background />
          <MiniLegend />
          <Controls />
        </ReactFlow>
      </section>

      <div className="fab-dock">
        <button type="button" className="btn btn-weak" onClick={() => setHistory(undo(history))}>
          실행취소
        </button>
        <button type="button" className="btn btn-weak" onClick={() => setHistory(redo(history))}>
          다시실행
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
          선택 상세
        </button>
      </div>

      <BottomSheet open={composerOpen} title="빠른 노드 추가" onClose={() => setComposerOpen(false)}>
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
              placeholder="예: 생활비 통장"
              maxLength={30}
            />
          </label>
          <button type="button" className="btn btn-primary" onClick={handleAddNode}>
            추가
          </button>
        </div>
      </BottomSheet>

      <BottomSheet open={detailOpen && selection.kind !== 'none'} title="선택 상세" onClose={() => setDetailOpen(false)}>
        {selection.kind === 'none' && <p className="muted">노드나 연결선을 눌러 선택해 주세요.</p>}

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
                  setMessage('노드를 저장했어요.');
                  setDetailOpen(false);
                } catch (error) {
                  setMessage((error as Error).message);
                }
              }}
            >
              저장
            </button>
            <button type="button" className="btn btn-danger" onClick={() => setDeleteConfirm(true)}>
              노드 삭제
            </button>
            {deleteConfirm && (
              <div className="confirm-box">
                <p>연결된 엣지도 함께 삭제돼요.</p>
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
                  setMessage('엣지를 저장했어요.');
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
              엣지 삭제
            </button>
          </div>
        )}
      </BottomSheet>

      {message && <div className="toast">{message}</div>}

      <footer className="bottom-ad">
        <BannerAdWrapper adGroupId={getBannerAdGroupId('text')} mode="fixed" />
      </footer>
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
        <li>둥근사각: 결제 수단</li>
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
