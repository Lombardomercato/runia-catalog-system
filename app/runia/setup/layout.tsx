import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './setup.css';

export const metadata: Metadata = {
  title: 'Setup Engine · Runia',
  description: 'Configuración interna del motor Runia Commerce.',
};

export default function SetupEngineLayout({ children }: { children: ReactNode }) {
  return <div className="setup-engine">{children}</div>;
}
