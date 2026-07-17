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
  PublicCommerceIdentityField,
  PublicCommerceIdentityInput,
  PublicCommerceProduct,
  PublicCommerceResult,
  PublicCommerceTenant,
  PublicCommerceWhatsAppReceipt,
} from './types';

type PublicCommerceContextValue = {
  tenant: PublicCommerceTenant | null;
  draft: PublicCommerceDraft | null;
  pending: boolean;
  error: string | null;
  identityFieldErrors: Partial<Record<PublicCommerceIdentityField, string>>;
  salesOrderId: string | null;
  whatsappReceipt: PublicCommerceWhatsAppReceipt | null;
  whatsappError: string | null;
  open: boolean;
  configureTenant(tenant: PublicCommerceTenant): Promise<void>;
  addProduct(product: PublicCommerceProduct): Promise<boolean>;
  updateQuantity(productId: string, quantity: number): Promise<boolean>;
  removeProduct(productId: string): Promise<boolean>;
  resolveSummary(): Promise<boolean>;
  prepareIdentity(identity: PublicCommerceIdentityInput): Promise<boolean>;
  confirmDraft(): Promise<boolean>;
  submitDraft(): Promise<boolean>;
  setOpen(open: boolean): void;
};

type PublicCommerceAddContextValue = {
  enabled: boolean;
  submitted: boolean;
  addProduct(product: PublicCommerceProduct): Promise<boolean>;
};

const PublicCommerceContext = createContext<PublicCommerceContextValue | null>(null);
const PublicCommerceAddContext = createContext<PublicCommerceAddContextValue | null>(null);

export function PublicCommerceProvider({ children }: { children: ReactNode }) {
  const serviceRef = useRef<PublicCommerceService | null>(null);
  const tenantRef = useRef<PublicCommerceTenant | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const [tenant, setTenant] = useState<PublicCommerceTenant | null>(null);
  const [draft, setDraft] = useState<PublicCommerceDraft | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identityFieldErrors, setIdentityFieldErrors] = useState<
    Partial<Record<PublicCommerceIdentityField, string>>
  >({});
  const [salesOrderId, setSalesOrderId] = useState<string | null>(null);
  const [whatsappReceipt, setWhatsappReceipt] = useState<PublicCommerceWhatsAppReceipt | null>(null);
  const [whatsappError, setWhatsappError] = useState<string | null>(null);
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
      setIdentityFieldErrors({});
      if (result.salesOrderId) setSalesOrderId(result.salesOrderId);
      else if (result.draft?.status !== 'submitted') setSalesOrderId(null);
      setWhatsappReceipt(result.whatsappReceipt ?? null);
      setWhatsappError(result.whatsappError ?? null);
    } else {
      setError(result.error);
      setIdentityFieldErrors(result.fieldErrors ?? {});
    }
  }, []);

  const enqueue = useCallback((operation: () => Promise<PublicCommerceResult>, openAfter = false) => {
    setPending(true);
    let succeeded = false;
    const task = queueRef.current.then(async () => {
      try {
        const result = await operation();
        succeeded = result.ok;
        applyResult(result);
        if (result.ok && openAfter) setOpen(true);
      } catch {
        setError('No se pudo actualizar el pedido de esta sesion.');
        setIdentityFieldErrors({});
      } finally {
        setPending(false);
      }
    });
    queueRef.current = task.catch(() => undefined);
    return task.then(() => succeeded);
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
    if (!currentTenant?.enabled) return Promise.resolve(false);
    return enqueue(() => service().addProduct(currentTenant, product), true);
  }, [enqueue, service]);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    const currentTenant = tenantRef.current;
    if (!currentTenant?.enabled) return Promise.resolve(false);
    return enqueue(() => service().updateQuantity(currentTenant, productId, quantity));
  }, [enqueue, service]);

  const removeProduct = useCallback((productId: string) => {
    const currentTenant = tenantRef.current;
    if (!currentTenant?.enabled) return Promise.resolve(false);
    return enqueue(() => service().removeProduct(currentTenant, productId));
  }, [enqueue, service]);

  const resolveSummary = useCallback(() => {
    const currentTenant = tenantRef.current;
    if (!currentTenant?.enabled) return Promise.resolve(false);
    return enqueue(() => service().resolveSummary(currentTenant));
  }, [enqueue, service]);

  const prepareIdentity = useCallback((identity: PublicCommerceIdentityInput) => {
    const currentTenant = tenantRef.current;
    if (!currentTenant?.enabled) return Promise.resolve(false);
    return enqueue(() => service().prepareIdentity(currentTenant, identity));
  }, [enqueue, service]);

  const confirmDraft = useCallback(() => {
    const currentTenant = tenantRef.current;
    if (!currentTenant?.enabled) return Promise.resolve(false);
    return enqueue(() => service().confirmDraft(currentTenant));
  }, [enqueue, service]);

  const submitDraft = useCallback(() => {
    const currentTenant = tenantRef.current;
    if (!currentTenant?.enabled) return Promise.resolve(false);
    return enqueue(() => service().submitDraft(currentTenant));
  }, [enqueue, service]);

  const value = useMemo<PublicCommerceContextValue>(() => ({
    tenant,
    draft,
    pending,
    error,
    identityFieldErrors,
    salesOrderId,
    whatsappReceipt,
    whatsappError,
    open,
    configureTenant,
    addProduct,
    updateQuantity,
    removeProduct,
    resolveSummary,
    prepareIdentity,
    confirmDraft,
    submitDraft,
    setOpen,
  }), [
    tenant,
    draft,
    pending,
    error,
    identityFieldErrors,
    salesOrderId,
    whatsappReceipt,
    whatsappError,
    open,
    configureTenant,
    addProduct,
    updateQuantity,
    removeProduct,
    resolveSummary,
    prepareIdentity,
    confirmDraft,
    submitDraft,
  ]);

  const addValue = useMemo<PublicCommerceAddContextValue>(() => ({
    enabled: tenant?.enabled === true && draft?.status !== 'submitted',
    submitted: draft?.status === 'submitted',
    addProduct,
  }), [addProduct, draft?.status, tenant?.enabled]);

  return (
    <PublicCommerceAddContext.Provider value={addValue}>
      <PublicCommerceContext.Provider value={value}>{children}</PublicCommerceContext.Provider>
    </PublicCommerceAddContext.Provider>
  );
}

export function usePublicCommerce() {
  const context = useContext(PublicCommerceContext);
  if (!context) throw new Error('PublicCommerceProvider is required.');
  return context;
}

export function usePublicCommerceAddProduct() {
  const context = useContext(PublicCommerceAddContext);
  if (!context) throw new Error('PublicCommerceProvider is required.');
  return context;
}
