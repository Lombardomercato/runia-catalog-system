import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './demo-commerce.css';

export const metadata: Metadata = {
  title: 'Commerce Edit — Runia',
  description: 'Una segunda experiencia editorial construida sobre Runia Commerce SDK.',
};

export default function DemoCommerceLayout({ children }: { children: ReactNode }) {
  return children;
}
