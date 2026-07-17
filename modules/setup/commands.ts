'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { CreateCommerceTenant } from '@/core/tenant/use-cases/CreateCommerceTenant';
import {
  RUNIA_INTERNAL_SESSION_COOKIE,
  isValidRuniaInternalSession,
} from '@/lib/runiaInternalAuth';
import { SupabaseCommerceTenantSetupRepository } from './queries';
import type { SetupCommandResult } from './types';
import { validateSetupTransport } from './validators';

export async function createCommerceTenantFromSetup(
  input: unknown,
): Promise<SetupCommandResult> {
  const cookieStore = await cookies();
  const session = cookieStore.get(RUNIA_INTERNAL_SESSION_COOKIE)?.value;
  if (!(await isValidRuniaInternalSession(session))) {
    return commandError('UNAUTHORIZED', 'La sesión interna de Setup no es válida.');
  }

  const transport = validateSetupTransport(input);
  if (!transport) {
    return commandError('INVALID_INPUT', 'La solicitud de Setup no es válida.');
  }

  const useCase = new CreateCommerceTenant(
    new SupabaseCommerceTenantSetupRepository(),
  );
  const result = await useCase.execute(transport);
  if (!result.ok) {
    return {
      ok: false,
      code: result.error.code,
      message: null,
      error: result.error.message,
      fieldErrors: result.error.fieldErrors,
      setup: null,
    };
  }

  for (const path of ['/runia', '/runia/setup']) {
    try {
      revalidatePath(path);
    } catch {
      // Server Actions provide the static generation store; tests do not.
    }
  }

  return {
    ok: true,
    code: 'CREATED',
    message: 'Comercio creado y preparado para importar catálogo.',
    error: null,
    fieldErrors: {},
    setup: result.value,
  };
}

function commandError(
  code: SetupCommandResult['code'],
  error: string,
): SetupCommandResult {
  return {
    ok: false,
    code,
    message: null,
    error,
    fieldErrors: {},
    setup: null,
  };
}
