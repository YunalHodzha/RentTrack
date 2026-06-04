import { index, int, real, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

export const properties = sqliteTable('properties', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['apartment', 'garage', 'land', 'office', 'other'] }).notNull(),
  name: text('name').notNull(),
  address: text('address'),
  status: text('status', { enum: ['free', 'rented', 'unavailable'] }).notNull().default('free'),
  notes: text('notes'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  deletedAt: text('deleted_at'),
});

export const tenants = sqliteTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  notes: text('notes'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  deletedAt: text('deleted_at'),
});

export const leases = sqliteTable('leases', {
  id: text('id').primaryKey(),
  propertyId: text('property_id').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  tenantId: text('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  rentAmount: real('rent_amount').notNull(),
  currency: text('currency', { enum: ['EUR', 'BGN'] }).notNull().default('EUR'),
  paymentDay: int('payment_day').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  depositAmount: real('deposit_amount'),
  status: text('status', { enum: ['active', 'ended'] }).notNull().default('active'),
  notes: text('notes'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  deletedAt: text('deleted_at'),
}, (table) => [
  index('idx_leases_property_id').on(table.propertyId),
  index('idx_leases_tenant_id').on(table.tenantId),
]);

export const payments = sqliteTable('payments', {
  id: text('id').primaryKey(),
  leaseId: text('lease_id').notNull().references(() => leases.id, { onDelete: 'cascade' }),
  period: text('period').notNull(),
  amount: real('amount').notNull(),
  paidDate: text('paid_date'),
  status: text('status', { enum: ['paid', 'partial', 'pending', 'overdue'] }).notNull().default('pending'),
  method: text('method', { enum: ['cash', 'bank', 'other'] }),
  notes: text('notes'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  deletedAt: text('deleted_at'),
}, (table) => [
  unique('unique_lease_period').on(table.leaseId, table.period),
  index('idx_payments_lease_id').on(table.leaseId),
]);

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type Lease = typeof leases.$inferSelect;
export type NewLease = typeof leases.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
