import { db } from '@/db/client';
import { properties, leases, tenants, payments } from '@/db/schema';
import type { Property, Lease, Tenant, Payment } from '@/db/schema';

export interface ExportData {
  exportDate: string;
  properties: Property[];
  tenants: Tenant[];
  leases: Lease[];
  payments: Payment[];
}

export async function exportDataAsJSON(): Promise<ExportData> {
  const [propsData, tenantsData, leasesData, paymentsData] = await Promise.all([
    db.select().from(properties),
    db.select().from(tenants),
    db.select().from(leases),
    db.select().from(payments),
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
  const [propsData, tenantsData, leasesData, paymentsData] = await Promise.all([
    db.select().from(properties),
    db.select().from(tenants),
    db.select().from(leases),
    db.select().from(payments),
  ]);

  const escapeCSV = (val: string | number | null | undefined): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (!str) return '';
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
