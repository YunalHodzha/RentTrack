import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { properties, leases, payments } from '@/db/schema';
import type { Property, Lease, Payment } from '@/db/schema';
import { ownedAndLive, currentUserId } from '@/db/owner';

export interface MonthlyReport {
  period: string;
  income: number;
  collected: number;
  outstanding: number;
  propertyBreakdown: Array<{
    propertyId: string;
    propertyName: string;
    rentAmount: number;
    collected: number;
    outstanding: number;
  }>;
}

export interface YearlyReport {
  year: number;
  months: MonthlyReport[];
  totalIncome: number;
  totalCollected: number;
  totalOutstanding: number;
}

/**
 * Pure computation of a monthly report from already-loaded data. Keeping this
 * separate from the DB read lets the yearly report load all tables once and
 * compute 12 months in memory instead of re-querying per month.
 */
function computeMonthlyReport(
  period: string,
  allLeases: Lease[],
  allPayments: Payment[],
  propertyMap: Map<string, Property>,
): MonthlyReport {
  const activeLeasesInPeriod = allLeases.filter((lease) => {
    const leaseStart = lease.startDate.substring(0, 7);
    const leaseEnd = lease.endDate?.substring(0, 7);
    return leaseStart <= period && (!leaseEnd || leaseEnd >= period);
  });

  const propertyBreakdown = activeLeasesInPeriod.map((lease) => {
    const prop = propertyMap.get(lease.propertyId);
    const payment = allPayments.find(
      (p) => p.leaseId === lease.id && p.period === period
    );

    const collected = payment && payment.status !== 'pending' && payment.status !== 'overdue'
      ? payment.amount
      : 0;

    return {
      propertyId: lease.propertyId,
      propertyName: prop?.name ?? 'Unknown',
      rentAmount: lease.rentAmount,
      collected,
      outstanding: Math.max(0, lease.rentAmount - collected),
    };
  });

  const income = activeLeasesInPeriod.reduce((sum, l) => sum + l.rentAmount, 0);
  const collected = propertyBreakdown.reduce((sum, p) => sum + p.collected, 0);
  const outstanding = propertyBreakdown.reduce((sum, p) => sum + p.outstanding, 0);

  return { period, income, collected, outstanding, propertyBreakdown };
}

export async function generateMonthlyReport(period: string): Promise<MonthlyReport> {
  const uid = currentUserId();
  if (!uid) return { period, income: 0, collected: 0, outstanding: 0, propertyBreakdown: [] };
  const [allLeases, allPayments, allProperties] = await Promise.all([
    db.select().from(leases).where(ownedAndLive(leases, uid)),
    db.select().from(payments).where(ownedAndLive(payments, uid)),
    db.select().from(properties).where(ownedAndLive(properties, uid)),
  ]);
  const propertyMap = new Map(allProperties.map((p) => [p.id, p]));
  return computeMonthlyReport(period, allLeases, allPayments, propertyMap);
}

export async function generateYearlyReport(year: number): Promise<YearlyReport> {
  const uid = currentUserId();
  if (!uid) return { year, months: [], totalIncome: 0, totalCollected: 0, totalOutstanding: 0 };
  // Load all tables once, then compute all 12 months in memory.
  const [allLeases, allPayments, allProperties] = await Promise.all([
    db.select().from(leases).where(ownedAndLive(leases, uid)),
    db.select().from(payments).where(ownedAndLive(payments, uid)),
    db.select().from(properties).where(ownedAndLive(properties, uid)),
  ]);
  const propertyMap = new Map(allProperties.map((p) => [p.id, p]));

  const months = Array.from({ length: 12 }, (_, i) =>
    `${year}-${String(i + 1).padStart(2, '0')}`
  );
  const monthlyReports = months.map((period) =>
    computeMonthlyReport(period, allLeases, allPayments, propertyMap)
  );

  const totalIncome = monthlyReports.reduce((sum, m) => sum + m.income, 0);
  const totalCollected = monthlyReports.reduce((sum, m) => sum + m.collected, 0);
  const totalOutstanding = monthlyReports.reduce((sum, m) => sum + m.outstanding, 0);

  return {
    year,
    months: monthlyReports,
    totalIncome,
    totalCollected,
    totalOutstanding,
  };
}

export async function generatePropertyReport(
  propertyId: string,
  startPeriod: string,
  endPeriod: string
): Promise<Array<{
  period: string;
  rentAmount: number;
  collected: number;
  status: string;
}>> {
  const uid = currentUserId();
  if (!uid) return [];

  const [property] = await db.select().from(properties)
    .where(ownedAndLive(properties, uid, eq(properties.id, propertyId)));
  if (!property) return [];

  const propertyLeases = await db.select().from(leases)
    .where(ownedAndLive(leases, uid, eq(leases.propertyId, propertyId)));
  const allPayments = await db.select().from(payments).where(ownedAndLive(payments, uid));

  const months: string[] = [];
  const [startYear, startMonth] = startPeriod.split('-').map(Number);
  const [endYear, endMonth] = endPeriod.split('-').map(Number);

  let currentYear = startYear;
  let currentMonth = startMonth;
  while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
    months.push(`${currentYear}-${String(currentMonth).padStart(2, '0')}`);
    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  return months.map((period) => {
    const activeLease = propertyLeases.find((lease) => {
      const leaseStart = lease.startDate.substring(0, 7);
      const leaseEnd = lease.endDate?.substring(0, 7);
      return (
        leaseStart <= period &&
        (!leaseEnd || leaseEnd >= period)
      );
    });

    if (!activeLease) {
      return { period, rentAmount: 0, collected: 0, status: 'no_lease' };
    }

    const payment = allPayments.find(
      (p) => p.leaseId === activeLease.id && p.period === period
    );

    const collected = payment && payment.status !== 'pending' && payment.status !== 'overdue'
      ? payment.amount
      : 0;

    return {
      period,
      rentAmount: activeLease.rentAmount,
      collected,
      status: payment?.status ?? 'pending',
    };
  });
}
