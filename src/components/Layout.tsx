import React, { useState } from 'react';
import {
  LuBookOpen,
  LuChartPie,
  LuClipboardList,
  LuHouse,
  LuLink2,
  LuMenu,
  LuNavigation,
  LuSettings,
  LuTrainFront,
  LuTriangleAlert,
  LuX,
} from 'react-icons/lu';
import { Link, useRoute } from '../lib/router';
import { useStore } from '../lib/store';
import { InstallButton } from './InstallButton';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LuHouse, match: (p: string) => p === '/' },
  { to: '/dove', label: 'Dove devo andare?', icon: LuNavigation, match: (p: string) => p.startsWith('/dove') },
  { to: '/prc', label: 'PRC C7', icon: LuClipboardList, match: (p: string) => p.startsWith('/prc') || p.startsWith('/attivita') },
  { to: '/manuali', label: 'Manuali', icon: LuBookOpen, match: (p: string) => p.startsWith('/manual') || p.startsWith('/viewer') || p.startsWith('/documenti') },
  { to: '/collegamenti', label: 'Collegamenti', icon: LuLink2, match: (p: string) => p.startsWith('/collegamenti') },
  { to: '/verifica', label: 'Da verificare', icon: LuTriangleAlert, match: (p: string) => p.startsWith('/verifica'), badge: true },
  { to: '/stato', label: 'Stato documentazione', icon: LuChartPie, match: (p: string) => p.startsWith('/stato') },
  { to: '/impostazioni', label: 'Impostazioni', icon: LuSettings, match: (p: string) => p.startsWith('/impostazioni') },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { path } = useRoute();
  const { model } = useStore();
  const [open, setOpen] = useState(false);
  const nav = (
    <nav className="flex flex-col gap-0.5 px-3">
      {NAV.map((n) => {
        const active = n.match(path);
        const Icon = n.icon;
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition ${
              active ? 'bg-brand-50 text-brand-700' : 'text-[#33435a] hover:bg-canvas hover:text-ink'
            }`}
          >
            <Icon className={`text-[18px] ${active ? 'text-brand-600' : 'text-muted'}`} />
            <span className="flex-1">{n.label}</span>
            {n.badge && model && model.stats.reviewOpen > 0 && (
              <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-bold text-warn">{model.stats.reviewOpen}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
  const brand = (
    <Link to="/" className="flex items-center gap-3 px-6 py-5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white shadow-sm">
        <LuTrainFront className="text-[20px]" />
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-bold text-ink">Manutenzione FAL</span>
        <span className="block text-[11px] font-medium uppercase tracking-wider text-muted">Stadler SB · SBT · ST</span>
      </span>
    </Link>
  );
  return (
    <div className="min-h-screen lg:flex">
      <aside className="no-print sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col border-r border-line bg-white lg:flex">
        {brand}
        {nav}
        <div className="mt-auto px-6 pt-4">
          <InstallButton compact className="w-full justify-center" />
        </div>
        <div className="px-6 py-5 text-[11px] leading-relaxed text-muted">
          Dati e manuali restano su questo dispositivo.
          <br />
          Fonte primaria: i documenti originali.
        </div>
      </aside>
      <header className="no-print sticky top-0 z-40 flex items-center justify-between border-b border-line bg-white/95 px-4 py-2 backdrop-blur lg:hidden">
        <Link to="/" className="flex items-center gap-2 font-bold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
            <LuTrainFront />
          </span>
          Manutenzione FAL
        </Link>
        <div className="flex items-center gap-1">
          <InstallButton compact />
          <button className="rounded-lg p-2 hover:bg-canvas" onClick={() => setOpen(true)} aria-label="Menu">
            <LuMenu className="text-xl" />
          </button>
        </div>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 bg-ink/40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="h-full w-[280px] bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button className="rounded-lg p-2 hover:bg-canvas" onClick={() => setOpen(false)} aria-label="Chiudi menu">
                <LuX />
              </button>
            </div>
            {nav}
          </div>
        </div>
      )}
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-[1280px]">{children}</div>
      </main>
    </div>
  );
}
