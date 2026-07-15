/**
 * Класифициране на входящи auth deep link-ове от Supabase (implicit flow).
 * Токените/грешките пристигат в URL ФРАГМЕНТА (#access_token=...&type=signup),
 * не в query-то — Linking.parse не ги връща като queryParams, затова
 * фрагментът се парсва ръчно. Чиста функция без RN зависимости (тестваема).
 */

export type AuthLink =
  /** Линк за нова парола — обработва се от ResetPasswordScreen с приоритет. */
  | { kind: 'recovery' }
  /** Линк за потвърждение на имейл: сесията се установява от токените. */
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  /** Изтекъл/невалиден линк: Supabase връща #error=...&error_code=... */
  | { kind: 'error'; errorCode: string | null; errorDescription: string | null }
  /** URL без auth съдържание (обикновен deep link, dev URL и т.н.). */
  | { kind: 'none' };

/** Параметрите от фрагмента (частта след '#') на URL, или null ако няма фрагмент. */
export function parseUrlFragment(url: string): URLSearchParams | null {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return null;
  return new URLSearchParams(url.slice(hashIndex + 1));
}

export function classifyAuthLink(url: string): AuthLink {
  const params = parseUrlFragment(url);

  // Reset потокът има приоритет: собствен екран, който сам установява сесията.
  if (url.includes('reset-password') || params?.get('type') === 'recovery') {
    return { kind: 'recovery' };
  }

  if (!params) return { kind: 'none' };

  if (params.get('error') || params.get('error_code')) {
    return {
      kind: 'error',
      errorCode: params.get('error_code'),
      errorDescription: params.get('error_description'),
    };
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    return { kind: 'tokens', accessToken, refreshToken };
  }

  return { kind: 'none' };
}
