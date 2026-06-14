import * as Sentry from '@sentry/react-native';

/**
 * Crash reporting (Phase 4.6). Изцяло опционално: без EXPO_PUBLIC_SENTRY_DSN
 * в .env Sentry не се инициализира и приложението работи нормално.
 *
 * Поверителност (вход за GDPR декларацията от Фаза 5A):
 *  - sendDefaultPii: false (изрично) — без IP/устройствени идентификатори отвъд нужното;
 *  - потребителски контекст = само Supabase userId, никога имейл;
 *  - console breadcrumbs се режат изцяло (логовете може да съдържат данни —
 *    имена на наематели, суми) — по-сигурно от прочистване на всеки log;
 *  - tracesSampleRate: 0 — само грешки, без performance tracing (засега).
 */

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

/** Дали crash reporting-ът е конфигуриран (DSN наличен). */
export const isSentryEnabled = Boolean(dsn);

export function initSentry() {
  // Sentry.init се вика ВИНАГИ и преди Sentry.wrap — иначе wrap предхожда init-а
  // (предупреждение „Sentry.wrap was called before Sentry.init") и app-start
  // span-ът се губи. Без DSN просто enabled: false → нищо не се праща. В dev
  // също не пращаме (за тест на устройство: временно сложи enabled: true тук).
  Sentry.init({
    dsn,
    enabled: Boolean(dsn) && !__DEV__,
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeBreadcrumb(breadcrumb) {
      // Никакви console breadcrumbs — там минават съобщения с лични данни.
      return breadcrumb.category === 'console' ? null : breadcrumb;
    },
    beforeSend(event) {
      // Защита в дълбочина: каквото и да е закачил някой по user контекста,
      // навън излиза само id-то.
      if (event.user) event.user = { id: event.user.id };
      return event;
    },
  });
}

/** Закача/маха потребителския контекст — САМО userId, без имейл (PII). */
export function setSentryUser(userId: string | null) {
  if (!isSentryEnabled) return;
  Sentry.setUser(userId ? { id: userId } : null);
}

/** Неочаквана грешка (DB init, error boundary). No-op без DSN. */
export function reportError(error: unknown) {
  if (!isSentryEnabled) return;
  Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
}

// Мрежови провали са очаквани (offline) — не са crash-ове и не се докладват.
const NETWORK_ERROR = /network|fetch|timeout|abort|socket|connection|offline/i;

// Дедупликация: фоновият sync се повтаря на 60s — една и съща грешка от едно
// устройство се праща веднъж на сесия, не 1000 пъти без мрежа.
const reportedSyncErrors = new Set<string>();

/** Тих фонов sync провал → доклад само ако е неочакван и нов за тази сесия. */
export function reportSyncError(error: unknown) {
  if (!isSentryEnabled) return;
  const message = error instanceof Error ? error.message : String(error);
  if (NETWORK_ERROR.test(message)) return;
  if (reportedSyncErrors.has(message)) return;
  reportedSyncErrors.add(message);
  Sentry.captureException(error instanceof Error ? error : new Error(message));
}
