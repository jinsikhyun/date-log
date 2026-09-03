import type { Anniversary } from "@/lib/anniversaries";

const daysUntil = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(year, month - 1, day);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
};

export function AnniversaryPlanBanner({ event, onPlan }: { event: Anniversary; onPlan: () => void }) {
  const left = daysUntil(event.date);
  return (
    <section className="relative mb-5 overflow-hidden rounded-[20px] bg-[linear-gradient(135deg,#f8fffc_0%,#edf8f4_55%,#fff7f2_100%)] px-5 py-5 ring-1 ring-[#b8d9cf]/70 sm:px-6">
      <div className="absolute -right-8 -top-12 h-32 w-32 rounded-full bg-[#10a37f]/10 blur-2xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#10a37f] text-lg text-white shadow-sm" aria-hidden>{event.icon}</span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-extrabold tracking-[-0.01em]">곧 {event.label}이에요.</p>
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-[#087f65] ring-1 ring-[#b8d9cf]">{left === 0 ? "오늘" : `D-${left}`}</span>
            </div>
            <p className="mt-1 text-xs text-muted-2">우리의 특별한 날, 미리 데이트를 계획해볼까요?</p>
          </div>
        </div>
        <button type="button" onClick={onPlan} className="shrink-0 rounded-full bg-[#10a37f] px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-[#0d8f70]">
          데이트 코스 계획하기
        </button>
      </div>
    </section>
  );
}
