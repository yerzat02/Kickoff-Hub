import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/format";
import { SyncButton } from "@/components/SyncButton";

export const dynamic = "force-dynamic";

export default async function LeaguePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const osmLeagueId = Number(id);
  if (!Number.isInteger(osmLeagueId)) notFound();

  const league = await prisma.league.findUnique({
    where: { osmLeagueId },
    include: {
      teams: { include: { standing: true } },
      matches: { orderBy: [{ weekNr: "asc" }, { matchId: "asc" }] },
    },
  });
  if (!league) notFound();

  const teamByOsmId = new Map(league.teams.map((t) => [t.osmTeamId, t]));

  const table = [...league.teams]
    .map((t) => {
      const s = t.standing;
      const played = s ? s.won + s.drew + s.lost : 0;
      const diff = s ? s.goalsFor - s.goalsAgainst : 0;
      return { team: t, s, played, diff };
    })
    .sort((a, b) =>
      (b.s?.points ?? 0) - (a.s?.points ?? 0) ||
      b.diff - a.diff ||
      (b.s?.goalsFor ?? 0) - (a.s?.goalsFor ?? 0) ||
      (a.team.ranking ?? 99) - (b.team.ranking ?? 99) ||
      a.team.name.localeCompare(b.team.name),
    );

  const weeks = new Map<number, typeof league.matches>();
  for (const m of league.matches) {
    if (!weeks.has(m.weekNr)) weeks.set(m.weekNr, []);
    weeks.get(m.weekNr)!.push(m);
  }
  const weekNumbers = [...weeks.keys()].sort((a, b) => a - b);

  const th = "px-2 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400";
  const td = "px-2 py-2 text-sm";

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <Link href="/" className="text-sm text-gray-400 hover:text-white">← Все лиги</Link>

      <div className="mt-4 mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-orange-400 mb-1">
            Сезон {league.seasonNr} · Тур {league.weekNr} из {league.weeks} · {league.teams.length} команд
          </div>
          <h1 className="text-3xl md:text-4xl font-bold">{league.name}</h1>
          <div className="mt-2 text-xs text-gray-500">
            Информация обновлена: {formatDateTime(league.lastSyncedAt)}
            {league.lastSyncMode === "public" && (
              <span className="text-amber-400"> · публичные данные: таблица и матчи обновляются только с учётными данными OSM</span>
            )}
            {league.lastSyncError && (
              <span className="text-red-400"> · последняя синхронизация не удалась: {league.lastSyncError}</span>
            )}
          </div>
        </div>
        <SyncButton leagueId={league.osmLeagueId} />
      </div>

      {/* ---------- Standings ---------- */}
      <section className="mb-12">
        <h2 className="text-xl font-semibold mb-3">Турнирная таблица</h2>
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
          <table className="w-full min-w-[720px] text-left">
            <thead className="border-b border-white/10">
              <tr>
                <th className={th}>#</th>
                <th className={`${th} w-10`}></th>
                <th className={th}>Клуб</th>
                <th className={th}>Менеджер</th>
                <th className={th}>Клан</th>
                <th className={`${th} text-center`}>И</th>
                <th className={`${th} text-center`}>В</th>
                <th className={`${th} text-center`}>Н</th>
                <th className={`${th} text-center`}>П</th>
                <th className={`${th} text-center`}>Мячи</th>
                <th className={`${th} text-center`}>РМ</th>
                <th className={`${th} text-center`}>О</th>
              </tr>
            </thead>
            <tbody>
              {table.map(({ team, s, played, diff }, i) => (
                <tr key={team.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                  <td className={`${td} text-gray-400`}>{i + 1}</td>
                  <td className={td}>
                    {team.logoUrl ? (
                      <Image src={team.logoUrl} alt="" width={28} height={28} className="h-7 w-7 object-contain" unoptimized />
                    ) : (
                      <span className="inline-block h-7 w-7 rounded bg-white/10" />
                    )}
                  </td>
                  <td className={`${td} font-medium`}>{team.name}</td>
                  <td className={`${td} text-gray-300`}>
                    <span className="inline-flex items-center gap-2">
                      {team.managerCountry && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`https://flagcdn.com/16x12/${team.managerCountry.toLowerCase()}.png`}
                          alt={team.managerCountry}
                          width={16}
                          height={12}
                          className="rounded-sm"
                        />
                      )}
                      {team.managerName ?? "—"}
                    </span>
                  </td>
                  <td className={td}>
                    {team.crewName ? (
                      <span className="rounded bg-orange-500/20 px-2 py-0.5 text-xs font-semibold text-orange-300">{team.crewName}</span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className={`${td} text-center`}>{played}</td>
                  <td className={`${td} text-center`}>{s?.won ?? 0}</td>
                  <td className={`${td} text-center`}>{s?.drew ?? 0}</td>
                  <td className={`${td} text-center`}>{s?.lost ?? 0}</td>
                  <td className={`${td} text-center tabular-nums`}>{s?.goalsFor ?? 0}:{s?.goalsAgainst ?? 0}</td>
                  <td className={`${td} text-center tabular-nums`}>{diff > 0 ? `+${diff}` : diff}</td>
                  <td className={`${td} text-center font-bold`}>{s?.points ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------- Calendar ---------- */}
      <section>
        <h2 className="text-xl font-semibold mb-3">Календарь</h2>
        {weekNumbers.length === 0 && <p className="text-gray-400">Матчи ещё не загружены.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {weekNumbers.map((w) => {
            const isCurrent = w === league.weekNr + 1 || (league.weekNr === 0 && w === 1);
            return (
              <div
                key={w}
                className={`rounded-2xl border p-4 ${isCurrent ? "border-orange-500/60 bg-orange-500/5" : "border-white/10 bg-white/5"}`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold">Тур {w}</h3>
                  {isCurrent && <span className="text-xs text-orange-400">следующий</span>}
                </div>
                <ul className="space-y-2">
                  {weeks.get(w)!.map((m) => {
                    const home = teamByOsmId.get(m.homeTeamId);
                    const away = teamByOsmId.get(m.awayTeamId);
                    return (
                      <li key={m.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                        <span className="truncate text-right">{home?.name ?? `#${m.homeTeamId}`}</span>
                        <span
                          className={`min-w-[64px] rounded-md px-2 py-0.5 text-center tabular-nums ${
                            m.isPlayed ? "bg-white/10 font-semibold" : "text-gray-500"
                          }`}
                        >
                          {m.isPlayed ? `${m.homeGoals} : ${m.awayGoals}` : "— : —"}
                        </span>
                        <span className="truncate">{away?.name ?? `#${m.awayTeamId}`}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
