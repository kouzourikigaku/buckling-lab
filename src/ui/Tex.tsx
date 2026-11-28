import katex from 'katex';
import { useLayoutEffect, useMemo, useRef } from 'react';

export function Tex({ children, block = false }: { children: string; block?: boolean }) {
  const html = useMemo(
    () => katex.renderToString(children, { displayMode: block, throwOnError: false }),
    [children, block],
  );
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * 幅に収まるよう文字を縮めて表示する式(スクロールバーを出さない)。
 * 縮めるのは 0.6 倍まで。それでも入らない式は、式そのものを短くする。
 */
export function FitTex({ children, block = false, className = '' }: { children: string; block?: boolean; className?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const html = useMemo(
    () => katex.renderToString(children, { displayMode: false, throwOnError: false }),
    [children],
  );
  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const fit = () => {
      if (!o.clientWidth) return;
      i.style.fontSize = '1em';
      const w = i.scrollWidth;
      const s = w > o.clientWidth ? Math.max(0.6, (o.clientWidth - 2) / w) : 1;
      i.style.fontSize = `${s}em`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(o);
    return () => ro.disconnect();
  }, [html]);
  return (
    <div ref={outer} className={`min-w-0 ${block ? 'py-1 text-center' : ''} ${className}`}>
      <span ref={inner} className="inline-block whitespace-nowrap py-0.5 align-middle" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
