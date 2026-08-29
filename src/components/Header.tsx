// 상단 사이트 이름 + 탭 메뉴.
// 지금은 디자인만 — 탭은 눌러도 동작하지 않는다. (다음 단계에서 필터 연결)

const tabs = ["전체", "맛집", "카페", "데이트코스", "추억"] as const;

export function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-border/70 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-5 sm:px-8">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-extrabold tracking-tight">date.log</span>
          <span className="text-sm text-muted">우리가 함께 걸은 곳</span>
        </div>

        <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {tabs.map((tab, i) => (
            <button
              key={tab}
              type="button"
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                i === 0
                  ? "bg-accent text-white shadow-sm"
                  : "bg-card text-muted ring-1 ring-border hover:text-accent hover:ring-accent/40"
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
