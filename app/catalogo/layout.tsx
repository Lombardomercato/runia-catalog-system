import type { ReactNode } from 'react';
import {
  DraftOrderPanel,
  PublicCommerceProvider,
} from '@/modules/public-commerce';

export default function CatalogLayout({ children }: { children: ReactNode }) {
  return (
    <PublicCommerceProvider>
      {children}
      <DraftOrderPanel />
    </PublicCommerceProvider>
  );
}
