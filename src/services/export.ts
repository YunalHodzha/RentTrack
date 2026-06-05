import { db } from '@/db/client';
import { properties, leases, tenants, payments } from '@/db/schema';
import type { Property, Lease, Tenant, Payment } from '@/db/schema';
import { ownedAndLive, currentUserId } from '@/db/owner';

export interface ExportData {
  exportDate: string;
  properties: Property[];
  tenants: Tenant[];
  leases: Lease[];
  payments: Payment[];
}

export async function exportDataAsJSON(): Promise<ExportData> {
  const uid = currentUserId();
  if (!uid) {
    return { exportDate: new Date().toISOString(), properties: [], tenants: [], leases: [], payments: [] };
  }
  const [propsData, tenantsData, leasesData, paymentsData] = await Promise.all([
    db.select().from(properties).where(ownedAndLive(properties, uid)),
    db.select().from(tenants).where(ownedAndLive(tenants, uid)),
    db.select().from(leases).where(ownedAndLive(leases, uid)),
    db.select().from(payments).where(ownedAndLive(payments, uid)),
  ]);

  return {
    exportDate: new Date().toISOString(),
    properties: propsData,
    tenants: tenantsData,
    leases: leasesData,
    payments: paymentsData,
  };
}

export async function exportDataAsCSV(): Promise<string> {
  const uid = currentUserId();
  const [propsData, tenantsData, leasesData, paymentsData] = uid
    ? await Promise.all([
        db.select().from(properties).where(ownedAndLive(properties, uid)),
        db.select().from(tenants).where(ownedAndLive(tenants, uid)),
        db.select().from(leases).where(ownedAndLive(leases, uid)),
        db.select().from(payments).where(ownedAndLive(payments, uid)),
      ])
    : [[], [], [], []] as [Property[], Tenant[], Lease[], Payment[]];

  const escapeCSV = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return '';
    let str = String(val);
    if (!str) return '';
    // Guard against CSV/formula injection: spreadsheet apps execute cells that
    // start with = + - @ (or tab/CR). Prefix such values with a single quote so
    // they're treated as text. Relevant once exports contain other users' data.
    if (/^[=+\-@\t\r]/.test(str)) {
      str = `'${str}`;
    }
    const escaped = str.replace(/"/g, '""');
    return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')
      ? `"${escaped}"`
      : escaped;
  };

  const lines: string[] = [];

  // Properties header and data
  lines.push('=== ИМОТИ ===');
  lines.push('ID,Тип,Име,Адрес,Статус,Бележки,Създан');
  propsData.forEach((p) => {
    lines.push([p.id, p.type, p.name, p.address, p.status, p.notes, p.createdAt].map((v) => escapeCSV(v)).join(','));
  });

  lines.push('');
  lines.push('=== НАЕМАТЕЛИ ===');
  lines.push('ID,Име,Телефон,Имейл,Бележки,Създан');
  tenantsData.forEach((t) => {
    lines.push([t.id, t.name, t.phone, t.email, t.notes, t.createdAt].map((v) => escapeCSV(v)).join(','));
  });

  lines.push('');
  lines.push('=== ДОГОВОРИ ===');
  lines.push('ID,Имот ID,Наемател ID,Наем,Валута,Ден за плащане,Начало,Край,Депозит,Статус,Бележки');
  leasesData.forEach((l) => {
    lines.push(
      [
        l.id,
        l.propertyId,
        l.tenantId,
        l.rentAmount,
        l.currency,
        l.paymentDay,
        l.startDate,
        l.endDate,
        l.depositAmount,
        l.status,
        l.notes,
      ]
        .map((v) => escapeCSV(v))
        .join(',')
    );
  });

  lines.push('');
  lines.push('=== ПЛАЩАНИЯ ===');
  lines.push('ID,Договор ID,Период,Сума,Платено на,Статус,Метод,Бележки');
  paymentsData.forEach((p) => {
    lines.push(
      [p.id, p.leaseId, p.period, p.amount, p.paidDate, p.status, p.method, p.notes]
        .map((v) => escapeCSV(v))
        .join(',')
    );
  });

  return lines.join('\n');
}

export function generateFileName(format: 'json' | 'csv'): string {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  return `renttrack-export-${dateStr}.${format}`;
}

export interface ImportResult {
  properties: number;
  tenants: number;
  leases: number;
  payments: number;
}

/**
 * Restore data from a JSON export string. This REPLACES all existing data
 * (full restore semantics) inside a single transaction so a malformed file
 * can't leave the database half-written.
 *
 * Tables are inserted parent-first (properties/tenants → leases → payments) to
 * satisfy the foreign keys, and cleared child-first.
 */
export function importDataFromJSON(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Невалиден JSON файл.');
  }

  const data = parsed as Partial<ExportData>;
  if (
    !data ||
    !Array.isArray(data.properties) ||
    !Array.isArray(data.tenants) ||
    !Array.isArray(data.leases) ||
    !Array.isArray(data.payments)
  ) {
    throw new Error('Файлът не е валиден RentTrack експорт.');
  }

  // expo-sqlite transactions are synchronous: the callback must use .run()
  // (not await) so all writes complete before the implicit commit fires.
  db.transaction((tx) => {
    // Clear existing data child-first to respect foreign keys.
    tx.delete(payments).run();
    tx.delete(leases).run();
    tx.delete(properties).run();
    tx.delete(tenants).run();

    // Insert parent-first.
    if (data.properties!.length) tx.insert(properties).values(data.properties as Property[]).run();
    if (data.tenants!.length) tx.insert(tenants).values(data.tenants as Tenant[]).run();
    if (data.leases!.length) tx.insert(leases).values(data.leases as Lease[]).run();
    if (data.payments!.length) tx.insert(payments).values(data.payments as Payment[]).run();
  });

  return {
    properties: data.properties!.length,
    tenants: data.tenants!.length,
    leases: data.leases!.length,
    payments: data.payments!.length,
  };
}
