import type { Role } from "@/lib/roles";

// Original line illustrations for the role cards, drawn with currentColor so
// brand tokens apply. Ported from the prototype.
const art: Record<Role, React.ReactNode> = {
  musician: (
    <g>
      <rect x="27" y="15" width="18" height="29" rx="9" />
      <path d="M20 34v3a16 16 0 0 0 32 0v-3M36 53v10M26 63h20M29 25h14M29 31h14" />
    </g>
  ),
  manager: (
    <g>
      <rect x="14" y="22" width="45" height="36" rx="7" />
      <path d="M28 22v-7h18v7M14 37q23 10 45 0M32 38v9h10v-9" />
      <circle cx="58" cy="17" r="7" fill="var(--accent-soft)" />
    </g>
  ),
  video: (
    <g>
      <rect x="12" y="27" width="39" height="29" rx="6" />
      <path d="m51 36 13-8v27l-13-8" />
      <circle cx="23" cy="18" r="8" />
      <circle cx="42" cy="18" r="8" />
      <circle cx="31" cy="41" r="7" />
    </g>
  ),
  influencer: (
    <g>
      <rect x="23" y="10" width="29" height="51" rx="7" />
      <path d="M32 16h11M32 55h11m-8-27 12 8-12 8zM10 27l5 3M60 40l6 2M57 17l5-4" />
    </g>
  ),
  model: (
    <g>
      <rect x="16" y="11" width="43" height="52" rx="3" />
      <circle cx="38" cy="29" r="8" />
      <path d="M26 53c0-18 23-18 23 0M11 19h10M54 56h10M28 11v6M48 57v6" />
    </g>
  ),
  other: (
    <g>
      <path d="m36 10 7 19 20 7-20 7-7 20-7-20-20-7 20-7z" />
      <circle cx="59" cy="16" r="4" />
      <circle cx="14" cy="57" r="3" />
    </g>
  ),
};

export function RoleArt({ role }: { role: Role }) {
  return (
    <svg
      viewBox="0 0 76 76"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="38" cy="38" r="31" fill="var(--accent-soft)" stroke="none" />
      {art[role]}
    </svg>
  );
}
