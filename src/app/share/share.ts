import { toPng } from 'html-to-image';
import { FlowGraph } from '../../domain/graph-model';
import { detectEnvironment } from '../../infra/environment';

const TOSS_WEB_FRAMEWORK_MODULE = '@apps-in-toss/web-framework';

async function loadTossFramework(): Promise<Record<string, unknown>> {
  return (await import(/* @vite-ignore */ TOSS_WEB_FRAMEWORK_MODULE)) as Record<string, unknown>;
}

function buildFileName(): string {
  const now = new Date();
  const pad = (value: number) => `${value}`.padStart(2, '0');
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  return `money-flow-${y}${m}${d}-${hh}${mm}.png`;
}

export async function exportGraphPng(element: HTMLElement): Promise<void> {
  const pngDataUrl = await toPng(element, {
    cacheBust: true,
    pixelRatio: window.devicePixelRatio || 2
  });
  const link = document.createElement('a');
  link.href = pngDataUrl;
  link.download = buildFileName();
  link.click();
}

export async function shareGraph(graph: FlowGraph): Promise<string> {
  const title = '머니플로우';
  const text = `내 머니플로우를 공유해요. 노드 ${graph.nodes.length}개, 연결 ${graph.edges.length}개`;
  const env = detectEnvironment();

  if (env !== 'web') {
    try {
      const tossFramework = await loadTossFramework();
      const maybeGetLink = tossFramework.getTossShareLink as
        | ((params: { path: string; params: Record<string, string> }) => Promise<string>)
        | undefined;
      const maybeShare = tossFramework.share as
        | ((params: { title: string; text: string; url: string }) => Promise<void>)
        | undefined;
      if (maybeGetLink && maybeShare) {
        const url = await maybeGetLink({
          path: '/money-flow',
          params: {
            nodes: String(graph.nodes.length),
            edges: String(graph.edges.length)
          }
        });
        await maybeShare({ title, text, url });
        return 'Toss 공유를 완료했어요.';
      }
    } catch {
      // Toss SDK를 사용할 수 없는 경우 웹 공유로 fallback
    }
  }

  if (navigator.share) {
    await navigator.share({ title, text, url: location.href });
    return '공유를 완료했어요.';
  }

  await navigator.clipboard.writeText(`${title}\n${text}\n${location.href}`);
  return '공유 API를 사용할 수 없어 링크를 클립보드에 복사했어요.';
}
