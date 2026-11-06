import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const leagues = await prisma.league.findMany({
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { teams: true, matches: true } } },
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">Лиги</h1>
      <p className="text-gray-400 mb-8">Турниры, за которыми следит сайт. Данные синхронизируются из Online Soccer Manager.</p>

      {leagues.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-gray-300">
          Пока нет ни одной лиги. Загрузите тестовые данные командой <code className="text-orange-400">npm run seed</code>{" "}
          или запустите синхронизацию <code className="text-orange-400">npm run sync -- 154274365</code>.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {leagues.map((l) => (
          <Link
            key={l.id}
            href={`/league/${l.osmLeagueId}`}
            className="group rounded-2xl border border-white/10 bg-white/5 p-5 hover:border-orange-500/50 hover:bg-white/10 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-orange-400 mb-1">Сезон {l.seasonNr}</div>
                <h2 className="text-xl font-semibold group-hover:text-orange-300">{l.name}</h2>
              </div>
              <span className="text-xs text-gray-500 whitespace-nowrap">ID {l.osmLeagueId}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-300">
              <span>{l._count.teams} команд</span>
              <span>Тур {l.weekNr} из {l.weeks}</span>
              <span>{l._count.matches} матчей</span>
            </div>
            <div className="mt-3 text-xs text-gray-500">
              Обновлено: {formatDateTime(l.lastSyncedAt)}
              {l.lastSyncError && <span className="text-red-400"> · ошибка синхронизации</span>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
