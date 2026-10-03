import React, { useEffect, useState } from 'react';

// Router su hash (#/percorso?param=valore): funziona su GitHub Pages senza configurazione.
export interface Route {
  path: string;
  parts: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const h = decodeURI(location.hash.replace(/^#/, '')) || '/';
  const [p, q] = h.split('?');
  const path = p.startsWith('/') ? p : '/' + p;
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(q || '') };
}

export function useRoute(): Route {
  const [r, setR] = useState(parse);
  useEffect(() => {
    let last = parse().path;
    const on = () => {
      const r = parse();
      setR(r);
      if (r.path !== last) window.scrollTo({ top: 0 });
      last = r.path;
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

export function navigate(to: string, replace = false) {
  const h = to.startsWith('#') ? to : '#' + to;
  if (replace) location.replace(h);
  else location.hash = h;
}

export function href(to: string) {
  return '#' + to;
}

export function Link({ to, className, children, title, onClick }: { to: string; className?: string; children: React.ReactNode; title?: string; onClick?: () => void }) {
  return (
    <a href={href(to)} className={className} title={title} onClick={onClick}>
      {children}
    </a>
  );
}

export function viewerHref(docId: string, page?: number, q?: string, label?: string) {
  const p = new URLSearchParams();
  if (page) p.set('page', String(page));
  if (q) p.set('q', q);
  if (label) p.set('label', label);
  return `/viewer/${encodeURIComponent(docId)}?${p.toString()}`;
}
