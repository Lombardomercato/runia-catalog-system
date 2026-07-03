import { ordersFailure } from '../draftOrder';
import type { OrdersResult } from '../errors';
import type {
  DraftOrderIdentity,
  DraftOrderIdentityInput,
  DraftOrderIdentityValidator,
} from '../interfaces';

export class ValidateDraftIdentity implements DraftOrderIdentityValidator {
  execute(input: DraftOrderIdentityInput): OrdersResult<DraftOrderIdentity> {
    const fieldErrors: Record<string, string> = {};
    const name = input.name.trim();
    const company = nullableText(input.company);
    const whatsapp = normalizeWhatsapp(input.whatsapp);
    const email = nullableText(input.email)?.toLowerCase() ?? null;
    const cuit = normalizeCuit(input.cuit);
    const notes = nullableText(input.notes);

    if (!name) fieldErrors.name = 'Name is required.';
    else if (name.length > 120) fieldErrors.name = 'Name must not exceed 120 characters.';
    if (company && company.length > 160) {
      fieldErrors.company = 'Company must not exceed 160 characters.';
    }
    if (!whatsapp) fieldErrors.whatsapp = 'A valid WhatsApp number is required.';
    if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      fieldErrors.email = 'Email format is invalid.';
    }
    if (nullableText(input.cuit) && !cuit) {
      fieldErrors.cuit = 'CUIT format is invalid.';
    }
    if (notes && notes.length > 1000) {
      fieldErrors.notes = 'Notes must not exceed 1000 characters.';
    }

    if (Object.keys(fieldErrors).length) {
      return ordersFailure(
        'INVALID_DRAFT_IDENTITY',
        'Draft order identity is invalid.',
        fieldErrors,
      );
    }

    return {
      ok: true,
      value: {
        name,
        company,
        whatsapp: whatsapp!,
        email,
        cuit,
        notes,
      },
    };
  }
}

function normalizeWhatsapp(value: string) {
  const normalized = value.trim();
  if (!/^\+?[\d\s().-]+$/.test(normalized)) return null;
  const digits = normalized.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return normalized.startsWith('+') ? `+${digits}` : digits;
}

function normalizeCuit(value: string | null | undefined) {
  const normalized = nullableText(value);
  if (!normalized || !/^\d{2}-?\d{8}-?\d$/.test(normalized)) return null;
  const digits = normalized.replace(/\D/g, '');
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}

function nullableText(value: string | null | undefined) {
  const normalized = value?.trim() ?? '';
  return normalized || null;
}
