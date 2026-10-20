/** Folded-page helper from the existing green brand study; decorative beside text labels. */
export function AssistantMascot({ thinking = false, size = 40 }: { thinking?: boolean; size?: number }) {
  return <svg className={`assistant-mascot${thinking ? " is-thinking" : ""}`} width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
    <g className="assistant-mascot-body" stroke="#285e52" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6h25l9 9v37c0 4-3 7-7 7H19c-4 0-7-3-7-7V13c0-4 3-7 6-7Z" fill="#f3f7f4" strokeWidth="3"/>
      <path d="M43 6v9h9" fill="#8daf9f" strokeWidth="3"/>
      <path d="M15 33 8 38l7 6M49 33l7 5-7 6" strokeWidth="3"/>
      <path d="M22 52h19" stroke="#d47a55" strokeWidth="3"/>
      <g fill="#285e52" stroke="none"><circle cx="25" cy="30" r="2"/><circle cx="40" cy="30" r="2"/></g>
      {thinking ? <path d="M28 42h8M36 24l4-2" strokeWidth="2"/> : <path d="M27 40c3 3 8 3 11 0" strokeWidth="2.5"/>}
    </g>
  </svg>;
}
