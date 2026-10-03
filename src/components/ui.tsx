import React from 'react';
import { createPortal } from 'react-dom';
import { LuX } from 'react-icons/lu';
import { STATUS_META } from '../lib/engine';
import type { Status } from '../lib/types';

export const STATUS_STYLE: Record<Status, { fg: string; bg: string; dot: string }> = {
  complete: { fg: 'text-ok', bg: 'bg-ok-bg', dot: 'bg-ok' },
  partial: { fg: 'text-part', bg: 'bg-part-bg', dot: 'bg-[#e0a800]' },
  missing: { fg: 'text-miss', bg: 'bg-miss-bg', dot: 'bg-miss' },
  verify: { fg: 'text-warn', bg: 'bg-warn-bg', dot: 'bg-warn' },
};

export function StatusBadge({ status, short, className = '' }: { status: Status; short?: boolean; className?: string }) {
  const m = STATUS_META[status];
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.bg} ${s.fg} ${className}`} title={m.desc}>
      <span aria-hidden>{m.emoji}</span>
      {short ? m.short : m.label}
    </span>
  );
}

export function PageHeader({ title, subtitle, actions, icon }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-ink sm:text-[28px]">
          {icon && <span className="text-brand-600">{icon}</span>}
          {title}
        </h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = '', title, actions, pad = true }: { children: React.ReactNode; className?: string; title?: React.ReactNode; actions?: React.ReactNode; pad?: boolean }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {actions}
        </div>
      )}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

export function Empty({ icon, title, children, action }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 text-4xl text-brand-200">{icon}</div>}
      <div className="text-base font-semibold text-ink">{title}</div>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div className={`card max-h-[92vh] w-full overflow-auto rounded-b-none sm:rounded-b-[14px] ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-white px-5 py-3.5">
          <h3 className="font-semibold">{title}</h3>
          <button className="rounded-lg p-1.5 hover:bg-canvas" onClick={onClose} aria-label="Chiudi">
            <LuX />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Confidence({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const color = pct >= 80 ? 'bg-ok' : pct >= 55 ? 'bg-[#e0a800]' : 'bg-warn';
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted" title="Affidabilità del collegamento">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
        <span className={`block h-full ${color}`} style={{ width: `${pct}%` }} />
      </span>
      {pct}%
    </span>
  );
}

export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const ts = terms.map((t) => t.trim()).filter((t) => t.length >= 3);
  if (!ts.length || !text) return <>{text}</>;
  const esc = ts.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${esc.join('|')})`, 'gi');
  const one = new RegExp(`^(${esc.join('|')})$`, 'i');
  const parts = text.split(re);
  return (
    <>
      {parts.map((p, i) =>
        one.test(p) ? (
          <mark key={i} className="mark">
            {p}
          </mark>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </>
  );
}

export function Kv({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="label">{k}</div>
      <div className={`mt-0.5 text-sm text-ink ${mono ? 'code' : ''}`}>{v || <span className="text-muted">—</span>}</div>
    </div>
  );
}

export function Progress({ value, total }: { value: number; total: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line">
      <div className="h-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function StatusBar({ counts, total }: { counts: Record<Status, number>; total: number }) {
  const order: Status[] = ['complete', 'partial', 'verify', 'missing'];
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-line">
      {order.map((s) =>
        counts[s] ? <div key={s} className={STATUS_STYLE[s].dot} style={{ width: `${(counts[s] / total) * 100}%` }} title={`${STATUS_META[s].label}: ${counts[s]}`} /> : null,
      )}
    </div>
  );
}

export function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function displayManual(name: string) {
  // ripulisce gli a-capo dell'impaginazione del PdM ("1423-001- 0022" → "1423-001-0022")
  return name.replace(/(\d) (?=\d)/g, '$1').replace(/([-_./]) (?=\S)/g, '$1').replace(/ (?=[_])/g, '').replace(/\s+/g, ' ').trim();
}
