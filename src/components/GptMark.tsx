/** GPT의 매듭형 심볼을 작은 UI에서도 읽히도록 단순화한 마크. */
export function GptMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <circle cx="12" cy="6.5" r="4.2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="16.8" cy="9.3" r="4.2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="16.8" cy="14.7" r="4.2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="17.5" r="4.2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="7.2" cy="14.7" r="4.2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="7.2" cy="9.3" r="4.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
