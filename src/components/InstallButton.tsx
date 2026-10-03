import React, { useEffect, useState } from 'react';
import { LuDownload } from 'react-icons/lu';
import { Modal } from './ui';

// L'evento di installazione arriva presto: lo catturiamo subito, prima che React sia montato.
let deferred: any = null;
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    listeners.forEach((f) => f());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((f) => f());
  });
}

const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;

export function InstallButton({ className = '', compact }: { className?: string; compact?: boolean }) {
  const [, force] = useState(0);
  const [help, setHelp] = useState(false);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    listeners.add(f);
    (navigator as any).getInstalledRelatedApps?.().then((apps: any[]) => setInstalled(apps.length > 0)).catch(() => {});
    return () => void listeners.delete(f);
  }, []);
  if (standalone()) return null; // già aperta come app

  async function click() {
    if (deferred) {
      deferred.prompt();
      const r = await deferred.userChoice.catch(() => null);
      if (r?.outcome === 'accepted') deferred = null;
      force((x) => x + 1);
    } else setHelp(true);
  }
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua);
  return (
    <>
      <button onClick={click} className={`btn ${compact ? 'btn-ghost btn-sm' : 'btn-primary'} ${className}`}>
        <LuDownload /> {installed && !deferred ? 'App installata' : 'Installa app'}
      </button>
      <Modal open={help} onClose={() => setHelp(false)} title="Installa Manutenzione FAL">
        <div className="space-y-3 text-sm">
          {installed ? (
            <p>
              Risulta <b>già installata</b> su questo telefono: cercala tra le app con il nome <b>Manutenzione</b>. Se vuoi reinstallarla, prima disinstallala (tieni premuta
              l’icona → Disinstalla), poi ricarica questa pagina e premi di nuovo “Installa app”.
            </p>
          ) : ios ? (
            <ol className="list-decimal space-y-1 pl-5">
              <li>Apri questa pagina con <b>Safari</b>.</li>
              <li>
                Tocca il pulsante <b>Condividi</b> (quadrato con freccia).
              </li>
              <li>
                Scegli <b>Aggiungi alla schermata Home</b> → <b>Aggiungi</b>.
              </li>
            </ol>
          ) : (
            <>
              <p>Il browser non ha ancora proposto l’installazione automatica. Puoi farlo dal menu:</p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>
                  Tocca <b>⋮</b> in alto a destra in Chrome.
                </li>
                <li>
                  Scegli <b>Installa app</b> (o <b>Aggiungi a schermata Home</b> → <b>Installa</b>).
                </li>
              </ol>
              <p className="text-muted">
                Se Chrome dice “app già installata” ma non la trovi, chiudi Chrome del tutto, riapri la pagina, attendi qualche secondo e premi di nuovo questo pulsante.
              </p>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
