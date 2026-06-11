# Expo HAS CHANGED

Проектът е на **Expo SDK 54** (`expo` в `package.json` е `~54.0.0`).
Прочети точните версионирани докове на https://docs.expo.dev/versions/v54.0.0/
преди да пишеш какъвто и да е код. (Свери версията спрямо `package.json`, ако се
съмняваш — не приемай, че доковете за друга SDK версия важат.)

# Конвенции на проекта

- **UUID първични ключове** (text) на всички таблици — никога int autoincrement.
- **Миграции през drizzle-kit** (`npx drizzle-kit generate`) — не пипай файловете в `drizzle/` на ръка.
- **Soft delete** — изтриването задава `deletedAt` (+ каскада в `src/db/soft-delete.ts`); всяка четяща заявка филтрира с `isNull(deletedAt)`. Без твърд `db.delete` извън import-replace.
- **`updatedAt` bump-ва при всяка промяна** (`.$onUpdate()`) — sync двигателят (`src/services/sync.ts`, LWW) разчита на това.
- **Без `Alert.alert`** — потвърждения през `confirm()` (`src/store/confirm.ts`), резултати през toast (`src/store/toast.ts`), валидация през полеви грешки.
