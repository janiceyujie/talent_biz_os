"use client";

// The assistant is a Later feature (docs/architecture.md). The panel keeps the
// prototype's layout so the dashboard reads right; input stays disabled.
export function AssistantView({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`assistant-panel ${compact ? "" : "assistant-expanded"}`}>
      <header>
        <div className="assistant-mark">✦</div>
        <div>
          <span>Talent Assistant</span>
          <small>即將推出 · 只回答，不執行外部動作</small>
        </div>
      </header>
      <div className="message-list" aria-live="polite">
        <p className="message">
          之後可以問我今天／明天的行程、未收款或合約紀錄。這個功能還在開發中。
        </p>
      </div>
      <div className="quick-prompts">
        {["我今天要做什麼？", "我明天要做什麼？", "還有多少錢沒收？"].map((p) => (
          <button key={p} disabled>
            {p}
          </button>
        ))}
      </div>
      <form className="assistant-input" onSubmit={(e) => e.preventDefault()}>
        <input aria-label="助理訊息" placeholder="問你的案件、行程或款項…" disabled />
        <button aria-label="送出問題" disabled>
          ↑
        </button>
      </form>
    </section>
  );
}
