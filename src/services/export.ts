import { db } from '@/db/client';
import { properties, leases, tenants, payments } from '@/db/schema';
import type { Property, Lease, Tenant, Payment } from '@/db/schema';
import { ownedAndLive, currentUserId } from '@/db/owner';
import { EXPORT_VERSION } from '@/services/import';

export interface ExportData {
  /** Версия на формата (EXPORT_VERSION) — проверява се при импорт. */
  version: number;
  exportDate: string;
  properties: Property[];
  tenants: Tenant[];
  leases: Lease[];
  payments: Payment[];
}

export async function exportDataAsJSON(): Promise<ExportData> {
  const uid = currentUserId();
  if (!uid) {
    return { version: EXPORT_VERSION, exportDate: new Date().toISOString(), properties: [], tenants: [], leases: [], payments: [] };
  }
  const [propsData, tenantsData, leasesData, paymentsData] = await Promise.all([
    db.select().from(properties).where(ownedAndLive(properties, uid)),
    db.select().from(tenants).where(ownedAndLive(tenants, uid)),
    db.select().from(leases).where(ownedAndLive(leases, uid)),
    db.select().from(payments).where(ownedAndLive(payments, uid)),
  ]);

  return {
    version: EXPORT_VERSION,
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

// Импортът/restore живее в services/import.ts (parseImportFile + applyImport):
// sync-съвместим replace с tombstone-и и свеж updatedAt, вместо предишния
// наивен „изтрий всичко и вмъкни", който се чупеше при включен облак.
