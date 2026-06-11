# RentTrack

A simple rent-tracking app for small landlords — add your properties, tenants and leases, record payments, and always know what's collected, what's due and what's overdue. Built for the Bulgarian market: fully localized UI in Bulgarian, EUR/BGN currency support for the euro transition period.

> **Status: pre-release.** The app is feature-complete for personal use and is being prepared for App Store / Google Play release. The name "RentTrack" is a working title. See [ROADMAP.md](ROADMAP.md) for the plan and [STATUS.md](STATUS.md) for current progress.

## Features

- Properties (apartment / garage / land / office), tenants, and leases with full payment history
- Dashboard: monthly income, occupancy, collected vs. due, overdue warnings
- Local notifications for upcoming payment due dates, automatic overdue marking
- Monthly and yearly reports, JSON/CSV export
- Cloud sync across devices (optional, via Supabase) — offline-first, the app works fully without an account

## Tech stack

- **Expo SDK 54** + **TypeScript**, **Expo Router** (file-based navigation)
- **NativeWind** + a small custom design system (theme, toast, confirm dialog, skeletons)
- **expo-sqlite** + **Drizzle ORM** — local-first relational data, drizzle-kit migrations
- **Zustand** for state
- **Supabase** — email/password auth + sync (RLS per user, last-write-wins reconciliation, soft deletes)

## Getting started

```bash
npm install
cp .env.example .env   # fill in your Supabase URL + anon key (optional — app runs locally without it)
npx expo start
```

Notes:

- **Notifications and the date picker require a development build** ([docs](https://docs.expo.dev/develop/development-builds/introduction/)) — they don't fully work in Expo Go.
- `expo-sqlite` runs on device/emulator only (no web).
- Tests: `npm test` · Lint: `npx expo lint`

## Project structure

```
src/
  app/            # screens (Expo Router): tabs, property/[id], tenant/[id], reports
  components/     # design system (ui.tsx) and shared components
  db/             # Drizzle schema, soft-delete helpers
  services/       # notifications, reports, export, supabase, sync engine
  store/          # Zustand stores (data, auth, sync, toast, confirm)
  lib/ hooks/ theme/
drizzle/          # generated SQL migrations
supabase/         # Postgres schema + RLS policies
```

## License

[MIT](LICENSE)
