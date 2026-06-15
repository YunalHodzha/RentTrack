import { eq, getTableColumns, inArray } from 'drizzle-orm';
import { leases, payments, properties, tenants } from '@/db/schema';
import type { Lease, NewLease, NewPayment, NewProperty, NewTenant, Payment, Property, Tenant } from '@/db/schema';
import type { AppDatabase } from '@/db/soft-delete';

/**
 * JSON import / restore, съвместим със sync двигателя (LWW по updatedAt).
 *
 * Наивният replace (изтрий всичко → вмъкни файла) се чупи при включен облак:
 * твърдо изтритите редове се връщат при следващия pull (няма tombstone), а
 * вмъкнатите със стар updatedAt никога не се качват (push-ва се само
 * updatedAt > курсора). Затова тук:
 *
 *  1. Живите локални редове на потребителя, които ги НЯМА във файла, се
 *     soft-delete-ват с нов updatedAt (tombstone, който се качва).
 *  2. Редовете от файла се upsert-ват с нов updatedAt, userId на текущия
 *     потребител (файлът може да идва от друг акаунт / отпреди auth) и
 *     deletedAt = null (експортът съдържа само живи редове; съживява и
 *     локално soft-изтрит ред, ако файлът го носи). UUID-тата се запазват,
 *     за да оцелеят релациите.
 *  3. Курсорът НЕ се нулира: следващият sync качва tombstone-ите и upsert-ите
 *     (updatedAt > курсора), а по-старите облачни версии губят по LWW.
 *
 * Викай под withSyncPaused, за да не се пише по средата на фонов sync.
 */

/** Версия на JSON формата за експорт/импорт. Вдигни при несъвместима промяна. */
export const EXPORT_VERSION = 1;

export interface ImportFile {
  version?: number;
  exportDate?: string;
  properties: Property[];
  tenants: Tenant[];
  leases: Lease[];
  payments: Payment[];
}

export interface ImportResult {
  properties: number;
  tenants: number;
  leases: number;
  payments: number;
}

/**
 * Валидира суров JSON низ като Имотник експорт. Хвърля Error с готово за
 * показване съобщение; не пише нищо — невалиден файл означава нула промени.
 * Файлове отпреди version полето (само с exportDate) се приемат.
 */
export function parseImportFile(json: string): ImportFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Невалиден JSON файл.');
  }

  const data = parsed as Partial<ImportFile> | null;
  if (
    !data || typeof data !== 'object' ||
    !Array.isArray(data.properties) ||
    !Array.isArray(data.tenants) ||
    !Array.isArray(data.leases) ||
    !Array.isArray(data.payments)
  ) {
    throw new Error('Файлът не е валиден Имотник експорт.');
  }
  if (data.version !== undefined && data.version !== EXPORT_VERSION) {
    throw new Error(`Неподдържана версия на експорта (${String(data.version)}).`);
  }
  if (data.version === undefined && typeof data.exportDate !== 'string') {
    throw new Error('Файлът не е валиден Имотник експорт (липсва version / exportDate).');
  }
  for (const rows of [data.properties, data.tenants, data.leases, data.payments] as unknown[][]) {
    for (const row of rows) {
      const id = (row as { id?: unknown } | null)?.id;
      if (!row || typeof row !== 'object' || typeof id !== 'string' || id.length === 0) {
        throw new Error('Файлът съдържа запис без валиден идентификатор.');
      }
    }
  }
  return data as ImportFile;
}

/** Само познатите колони на таблицата — чужди ключове от файла не стигат до SQL-а. */
function pickColumns(table: typeof properties | typeof tenants | typeof leases | typeof payments, row: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const source = row as Record<string, unknown>;
  for (const key of Object.keys(getTableColumns(table))) {
    if (key in source) out[key] = source[key];
  }
  return out;
}

type ExistingRow = { id: string; userId: string | null; deletedAt: string | null };

/** Живите редове на потребителя, които липсват във файла → за tombstone. */
function tombstoneIds(existing: ExistingRow[], fileRows: { id: string }[], userId: string): string[] {
  const inFile = new Set(fileRows.map((r) => r.id));
  return existing
    .filter((r) => r.userId === userId && r.deletedAt === null && !inFile.has(r.id))
    .map((r) => r.id);
}

/**
 * Прилага валидиран импорт файл върху локалната база (виж модула за модела).
 * Една транзакция — провал по средата (напр. FK) не оставя половин импорт.
 * `now` е инжектируем за детерминистични тестове.
 */
export async function applyImport(
  db: AppDatabase,
  file: ImportFile,
  userId: string,
  now: string = new Date().toISOString(),
): Promise<ImportResult> {
  // Снимка на наличните редове (id/собственик/жив) — четем преди транзакцията;
  // викащият държи sync mutex-а, така че няма конкурентен писач.
  const [exProperties, exTenants, exLeases, exPayments] = await Promise.all([
    db.select({ id: properties.id, userId: properties.userId, deletedAt: properties.deletedAt }).from(properties),
    db.select({ id: tenants.id, userId: tenants.userId, deletedAt: tenants.deletedAt }).from(tenants),
    db.select({ id: leases.id, userId: leases.userId, deletedAt: leases.deletedAt }).from(leases),
    db.select({ id: payments.id, userId: payments.userId, deletedAt: payments.deletedAt }).from(payments),
  ]);

  const exPropertyIds = new Set(exProperties.map((r) => r.id));
  const exTenantIds = new Set(exTenants.map((r) => r.id));
  const exLeaseIds = new Set(exLeases.map((r) => r.id));
  const exPaymentIds = new Set(exPayments.map((r) => r.id));

  const stamp = { deletedAt: now, updatedAt: now };

  // expo-sqlite транзакциите са синхронни: .run(), без await (както export.ts).
  db.transaction((tx) => {
    // 1) Tombstones — преди upsert-ите, за да освободят и partial unique
    //    индекса (lease_id, period) при заменено плащане за същия период.
    const tProperties = tombstoneIds(exProperties, file.properties, userId);
    const tTenants = tombstoneIds(exTenants, file.tenants, userId);
    const tLeases = tombstoneIds(exLeases, file.leases, userId);
    const tPayments = tombstoneIds(exPayments, file.payments, userId);
    if (tPayments.length) tx.update(payments).set(stamp).where(inArray(payments.id, tPayments)).run();
    if (tLeases.length) tx.update(leases).set(stamp).where(inArray(leases.id, tLeases)).run();
    if (tTenants.length) tx.update(tenants).set(stamp).where(inArray(tenants.id, tTenants)).run();
    if (tProperties.length) tx.update(properties).set(stamp).where(inArray(properties.id, tProperties)).run();

    // 2) Upsert от файла, parent-first заради FK-ите.
    for (const row of file.properties) {
      const values = { ...pickColumns(properties, row), userId, updatedAt: now, deletedAt: null } as NewProperty;
      if (exPropertyIds.has(row.id)) tx.update(properties).set(values).where(eq(properties.id, row.id)).run();
      else tx.insert(properties).values(values).run();
    }
    for (const row of file.tenants) {
      const values = { ...pickColumns(tenants, row), userId, updatedAt: now, deletedAt: null } as NewTenant;
      if (exTenantIds.has(row.id)) tx.update(tenants).set(values).where(eq(tenants.id, row.id)).run();
      else tx.insert(tenants).values(values).run();
    }
    for (const row of file.leases) {
      const values = { ...pickColumns(leases, row), userId, updatedAt: now, deletedAt: null } as NewLease;
      if (exLeaseIds.has(row.id)) tx.update(leases).set(values).where(eq(leases.id, row.id)).run();
      else tx.insert(leases).values(values).run();
    }
    for (const row of file.payments) {
      const values = { ...pickColumns(payments, row), userId, updatedAt: now, deletedAt: null } as NewPayment;
      if (exPaymentIds.has(row.id)) tx.update(payments).set(values).where(eq(payments.id, row.id)).run();
      else tx.insert(payments).values(values).run();
    }
  });

  return {
    properties: file.properties.length,
    tenants: file.tenants.length,
    leases: file.leases.length,
    payments: file.payments.length,
  };
}
