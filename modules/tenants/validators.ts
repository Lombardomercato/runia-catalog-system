import type {
  CreateTenantInput,
  NormalizedCreateTenantInput,
  TenantCommandFieldErrors,
} from './types';

const colorPattern = /^#[0-9a-fA-F]{6}$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateCreateTenantInput(input: CreateTenantInput): {
  value: NormalizedCreateTenantInput | null;
  fieldErrors: TenantCommandFieldErrors;
} {
  const fieldErrors: TenantCommandFieldErrors = {};
  const name = normalizeRequiredText(input.name);
  const slug = normalizeSlug(input.slug);
  const primaryColor = normalizeRequiredText(input.primaryColor) || '#14b8a6';
  const secondaryColor = normalizeRequiredText(input.secondaryColor) || '#0f172a';

  if (!name) {
    fieldErrors.name = 'El nombre es obligatorio.';
  }

  if (!slug) {
    fieldErrors.slug = 'El slug es obligatorio.';
  } else if (!slugPattern.test(slug)) {
    fieldErrors.slug = 'Usa solo minusculas, numeros y guiones. Ejemplo: nueva-distribuidora.';
  }

  if (!colorPattern.test(primaryColor)) {
    fieldErrors.primaryColor = 'El color principal debe tener formato HEX, por ejemplo #14b8a6.';
  }

  if (!colorPattern.test(secondaryColor)) {
    fieldErrors.secondaryColor = 'El color secundario debe tener formato HEX, por ejemplo #0f172a.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      value: null,
      fieldErrors,
    };
  }

  return {
    value: {
      name,
      slug,
      primaryColor: primaryColor.toLowerCase(),
      secondaryColor: secondaryColor.toLowerCase(),
    },
    fieldErrors,
  };
}

export function suggestTenantSlug(value: string) {
  return normalizeSlug(value);
}

function normalizeRequiredText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSlug(value: unknown) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}
