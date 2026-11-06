# Kickoff Hub

Прототип сайта турниров по Online Soccer Manager (аналог weo-osm.com): таблица и календарь лиги из игры.

Стек: Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Prisma 6 · PostgreSQL.

## Деплой на Vercel

1. Import репозитория в Vercel (Add New → Project). Framework определится как Next.js.
2. До первого деплоя: в проекте Vercel откройте Storage → Create Database → Neon (Postgres) → Connect.
   Vercel сам добавит переменную `DATABASE_URL`.
3. В Settings → Environment Variables добавьте `CRON_SECRET` (любая длинная случайная строка)
   и, когда будут, учётные данные OSM (см. ниже).
4. Deploy. Скрипт `vercel-build` создаст таблицы, при пустой базе загрузит тестовую лигу и соберёт сайт.

Vercel Cron (vercel.json) раз в сутки вызывает `GET /api/sync`. На бесплатном тарифе Hobby чаще нельзя.
Для обновления каждые 10 минут используйте внешний сервис (например cron-job.org) с запросом
`POST https://<ваш-домен>/api/sync` и заголовком `x-sync-token: <SYNC_SECRET>`.

## Локальный запуск

Нужен PostgreSQL (локальный или та же база Neon). Впишите строку подключения в `.env` как `DATABASE_URL`.

```bash
npm install          # ставит зависимости и генерирует Prisma-клиент
npm run db:push      # создаёт таблицы по схеме
npm run seed         # загружает тестовую лигу из data/osm-sample-data.json
npm run dev          # http://localhost:3000  (или: npx next dev -p 3001)
```

Открыть: `/` — список лиг, `/league/154274365` — таблица и календарь тестовой лиги.

## Синхронизация с OSM

Проверено 06.11.2026 на лиге 154274365:

| Эндпоинт | Без токена |
|---|---|
| `GET /api/v1/leagues/{id}` | 200, открыт |
| `GET /api/v1/leagues/{id}/teams` | 200, открыт (логотипы в `assets`, type 3 = маленький) |
| `GET /api/v1/leagues/{id}/managers` | 200, открыт: `name`, `teamId`, `countryCode`, `crewId`, `crewTag`, `skillRating` |
| `GET /api/v1/leagues/{id}/teams/statistics` | 401, нужен токен |
| `GET /api/v1/leagues/{id}/matches/filter`, `/matches` | 401, нужен токен |
| `POST /token` (и `/oauth/token`, `/api/v1/token`) | 404 — путь авторизации из брифа не подтвердился, уточнить в DevTools |

Поэтому модуль работает в двух режимах:

- **public** (без учётных данных): обновляет лигу, команды, менеджеров, страны и теги кланов. Таблица и календарь остаются из прошлой синхронизации или из seed.
- **full** (с учётными данными): дополнительно таблица (`/teams/statistics`) и матчи.

1. Скопируйте `.env.example` в `.env` (уже сделано) и заполните:
   - `OSM_USERNAME`, `OSM_PASSWORD` — лучше отдельный аккаунт, не основной;
   - `OSM_CLIENT_ID`, `OSM_CLIENT_SECRET`, `OSM_PLATFORM_ID` — из консоли браузера на ru.onlinesoccermanager.com после входа:
     `appViewModel.sessionSettings.webapiClientId`, `...webapiClientSecret`, `...platform`;
   - либо вместо всего этого вставьте готовый токен в `OSM_ACCESS_TOKEN` (живёт ограниченное время).
2. Запуск:
   ```bash
   npm run sync                    # все лиги из базы
   npm run sync -- 154274365       # одна лига
   npm run sync -- 154274365 --force   # игнорировать минимальный интервал
   ```
   или `POST /api/sync?leagueId=154274365` (добавьте `&force=1` для принудительного запуска).
   Если в `.env` задан `SYNC_SECRET`, запрос должен содержать заголовок `x-sync-token`.
   На странице лиги есть кнопка «Синхронизировать», которая вызывает этот же роут.

Защита от блокировки: одна и та же лига синхронизируется не чаще, чем раз в `SYNC_MIN_INTERVAL_SEC` секунд (по умолчанию 300).
Ошибка API не ломает сайт: остаются последние сохранённые данные, на странице показывается `lastSyncedAt` и текст ошибки.

Токен после логина кэшируется в `.cache/osm-token.json` (в .gitignore), при 401 обновляется через `/tokenRefresh`, затем повторным логином.

### Что нужно уточнить в DevTools

- **Адрес авторизации.** `POST https://web-api.onlinesoccermanager.com/token` отвечает 404. Нужно посмотреть во вкладке Network, куда именно веб-клиент шлёт логин (возможно другой хост или путь), и поправить `tokenRequest()` в `lib/osm.ts`. Пока проще взять `access_token` из DevTools и вписать в `OSM_ACCESS_TOKEN`.
- Эндпоинт календаря. Модуль по очереди пробует `/api/v1/leagues/{id}/matches/filter`, `/matches`, `/fixtures`.
  Если точный путь другой, задайте его в `.env`: `OSM_MATCHES_PATH=/api/v1/leagues/{leagueId}/matches/filter?...`.
- Имена менеджеров: берутся из `/api/v1/leagues/{id}/managers`, если он отвечает; иначе остаются пустыми (после seed — из тестового файла).
- Названия кланов: `/api/v1.1/crews/{crewId}` (поле `tag` или `name`).

Разбор ответов сделан «терпимым» к разным именам полей (`id/teamId`, `won/wins` и т.д.), см. `lib/osm.ts`.

## Структура

```
prisma/schema.prisma   League, Team, Standing, Match (PostgreSQL)
lib/types.ts           LeagueSnapshot — единый формат данных
lib/store.ts           сохранение снимка лиги в БД (upsert в транзакции)
lib/sample.ts          конвертация osm-sample-data.json в LeagueSnapshot
lib/osm.ts             авторизация в OSM, запросы к API, syncLeague()
scripts/seed.ts        npm run seed
scripts/seed-if-empty.ts  seed только в пустую базу (используется при деплое)
vercel.json            расписание Vercel Cron
scripts/sync.ts        npm run sync
app/page.tsx           список лиг
app/league/[id]/page.tsx   таблица + календарь (id = osmLeagueId)
app/api/sync/route.ts  POST /api/sync
components/SyncButton.tsx  кнопка синхронизации на странице лиги
```
