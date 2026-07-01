'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { PublicCommerceService } from './service';
import type {
  PublicCommerceDraft,
  PublicCommerceProduct,
  PublicCommerceResult,
  PublicCommerceTenant,
} from './types';

type PublicCommerceContextValue = {
  tenant: PublicCommerceTenant | null;
  draft: PublicCommerceDraft | null;
  pending: boolean;
  error: string | null;
  open: boolean;
  configureTenant(tenant: PublicCommerceTenant): Promise<void>;
  addProduct(product: PublicCommerceProduct): Promise<void>;
  updateQuantity(productId: string, quantity: number): Promise<void>;
  removeProduct(productId: string): Promise<void>;
  resolveSummary(): Promise<void>;
  setOpen(open: boolean): void;
};

const PublicCommerceContext = createContext<PublicCommerceContextValue | null>(null);

export function PublicCommerceProvider({ children }: { children: ReactNode }) {
  const serviceRef = useRef<PublicCommerceService | null>(null);
  const tenantRef = useRef<PublicCommerceTenant | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const [tenant, setTenant] = useState<PublicCommerceTenant | null>(null);
  const [draft, setDraft] = useState<PublicCommerceDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const service = useCallback(() => {
    if (!serviceRef.current) {
      serviceRef.current = new PublicCommerceService(window.sessionStorage);
    }
    return serviceRef.current;
  }, []);

  const applyResult = useCallback((result: PublicCommerceResult) => {
    if (result.ok) {
      setDraft(result.draft);
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  const enqueue = useCallback((operation: () => Promise<PublicCommerceResult>, openAfter = false) => {
    setPending(true);
    const task = queueRef.current.then(async () => {
      try {
        const result = await operation();
        applyResult(result);
        if (result.ok && openAfter) setOpen(true);
      } catch {
        setError('No se pudo actualizar el pedido de esta sesion.');
      } finally {
        setPending(false);
      }
    });
    queueRef.current = task.catch(() => undefined);
    return task;
  }, [applyResult]);

  const configureTenant = useCallback(async (nextTenant: PublicCommerceTenant) => {
    tenantRef.current = nextTenant;
    setTenant(nextTenant);
    setPending(true);
    try {
      applyResult(await service().getSessionDraft(nextTenant));
    } finally {
      setPending(false);
    }
  }, [applyResult, service]);

  const addProduct = useCallback((product: PublicCommerceProduct) => {
    const currentTenant = tenantRef.current;
    if (!currentTenant?.enabled) return Promise.resolve();
    return enqueue(() => service().addProduct(currentTenant, product), true);
  }, [enqueue, service]);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    const currentTenant = tenantRef.current;
    if (!currentTenant?.enabled) return Promise.resolve();
    return enqueue(() => service().updateQuantity(currentTenant, productId, quantity));
  }, [enqueue, service]);

  const removeProduct = useCallback((productId: string) => {
    const currentTenant = tenantRef.current;
    if (!currentTenant?.enabled) return Promise.resolve();
    return enqueue(() => service().removeProduct(currentTenant, productId));
  }, [enqueue, service]);

  const resolveSummary = useCallback(() => {
    const currentTenant = tenantRef.current;
    if (!currentTenant?.enabled) return Promise.resolve();
    return enqueue(() => service().resolveSummary(currentTenant));
  }, [enqueue, service]);

  const value = useMemo<PublicCommerceContextValue>(() => ({
    tenant,
    draft,
    pending,
    error,
    open,
    configureTenant,
    addProduct,
    updateQuantity,
    removeProduct,
    resolveSummary,
    setOpen,
  }), [
    tenant,
    draft,
    pending,
    error,
    open,
    configureTenant,
    addProduct,
    updateQuantity,
    removeProduct,
    resolveSummary,
  ]);

  return <PublicCommerceContext.Provider value={value}>{children}</PublicCommerceContext.Provider>;
}

export function usePublicCommerce() {
  const context = useContext(PublicCommerceContext);
  if (!context) throw new Error('PublicCommerceProvider is required.');
  return context;
}
