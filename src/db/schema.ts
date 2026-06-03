import { int, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const properties = sqliteTable('properties', {
  id: int('id').primaryKey({ autoIncrement: true }),
  type: text('type', { enum: ['apartment', 'garage', 'land', 'office', 'other'] }).notNull(),
  name: text('name').notNull(),
  address: text('address'),
  status: text('status', { enum: ['free', 'rented', 'unavailable'] }).notNull().default('free'),
  notes: text('notes'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const tenants = sqliteTable('tenants', {
  id: int('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  notes: text('notes'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const leases = sqliteTable('leases', {
  id: int('id').primaryKey({ autoIncrement: true }),
  propertyId: int('property_id').notNull().references(() => properties.id),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  rentAmount: real('rent_amount').notNull(),
  currency: text('currency', { enum: ['EUR', 'BGN'] }).notNull().default('EUR'),
  paymentDay: int('payment_day').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  depositAmount: real('deposit_amount'),
  status: text('status', { enum: ['active', 'ended'] }).notNull().default('active'),
  notes: text('notes'),
});

export const payments = sqliteTable('payments', {
  id: int('id').primaryKey({ autoIncrement: true }),
  leaseId: int('lease_id').notNull().references(() => leases.id),
  period: text('period').notNull(),
  amount: real('amount').notNull(),
  paidDate: text('paid_date'),
  status: text('status', { enum: ['paid', 'partial', 'pending'] }).notNull().default('pending'),
  method: text('method', { enum: ['cash', 'bank', 'other'] }),
  notes: text('notes'),
});

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type Lease = typeof leases.$inferSelect;
export type NewLease = typeof leases.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
