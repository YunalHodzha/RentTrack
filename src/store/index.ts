import { create } from 'zustand';
import type { Property, Tenant, Lease, Payment } from '@/db/schema';

interface AppState {
  properties: Property[];
  tenants: Tenant[];
  leases: Lease[];
  payments: Payment[];

  setProperties: (properties: Property[]) => void;
  setTenants: (tenants: Tenant[]) => void;
  setLeases: (leases: Lease[]) => void;
  setPayments: (payments: Payment[]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  properties: [],
  tenants: [],
  leases: [],
  payments: [],

  setProperties: (properties) => set({ properties }),
  setTenants: (tenants) => set({ tenants }),
  setLeases: (leases) => set({ leases }),
  setPayments: (payments) => set({ payments }),
}));
