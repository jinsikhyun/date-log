export type Birthday = { name: string; birthDate: string };
export type AnniversaryKind = "birthday" | "hundred" | "anniversary" | "first-record";
export type Anniversary = {
  date: string;
  kind: AnniversaryKind;
  label: string;
  icon: string;
};

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const yearlyDate = (source: string, year: number) => {
  const [, month, day] = source.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return new Date(year, month - 1, Math.min(day, lastDay));
};

export function buildAnniversaries(
  startDate: string | null,
  birthdays: Birthday[],
  fromYear: number,
  toYear = fromYear,
  firstRecordDate: string | null = null,
): Anniversary[] {
  const events: Anniversary[] = [];

  for (let year = fromYear; year <= toYear; year += 1) {
    for (const birthday of birthdays) {
      events.push({
        date: dateKey(yearlyDate(birthday.birthDate, year)),
        kind: "birthday",
        label: `${birthday.name}의 생일`,
        icon: "🎂",
      });
    }

    if (startDate) {
      const start = parseLocalDate(startDate);
      const years = year - start.getFullYear();
      if (years > 0) {
        events.push({
          date: dateKey(yearlyDate(startDate, year)),
          kind: "anniversary",
          label: `우리의 ${years}주년`,
          icon: "💍",
        });
      }
    }

    if (firstRecordDate) {
      const firstRecord = parseLocalDate(firstRecordDate);
      const elapsed = year - firstRecord.getFullYear();
      if (elapsed >= 0) {
        events.push({
          date: dateKey(yearlyDate(firstRecordDate, year)),
          kind: "first-record",
          label: elapsed === 0 ? "우리의 첫 기록" : `첫 기록 ${elapsed}주년`,
          icon: "📖",
        });
      }
    }
  }

  if (startDate) {
    const start = parseLocalDate(startDate);
    const end = new Date(toYear, 11, 31);
    for (let milestone = 100; ; milestone += 100) {
      const date = new Date(start);
      date.setDate(date.getDate() + milestone - 1);
      if (date > end) break;
      if (date.getFullYear() >= fromYear) {
        events.push({
          date: dateKey(date),
          kind: "hundred",
          label: `함께한 지 ${milestone}일`,
          icon: "♥",
        });
      }
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export const anniversariesOn = (events: Anniversary[], date: string | null) =>
  date ? events.filter((event) => event.date === date) : [];

export function nextAnniversary(events: Anniversary[], today = new Date(), withinDays = 14) {
  const todayKey = dateKey(today);
  const limit = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  limit.setDate(limit.getDate() + withinDays);
  const limitKey = dateKey(limit);
  return events.find((event) => event.date >= todayKey && event.date <= limitKey) ?? null;
}
