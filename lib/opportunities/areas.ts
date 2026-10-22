// Where an applicant lives, as ISO 3166-2 codes: Taiwan's counties and cities,
// and the US states, DC, and territories (each has its own arts council).
// Names are in the messages, under opportunities.areas.

export const taiwanAreas = [
  "TW-TPE", "TW-NWT", "TW-KEE", "TW-TAO", "TW-HSZ", "TW-HSQ", "TW-MIA", "TW-TXG", "TW-CHA", "TW-NAN", "TW-YUN",
  "TW-CYI", "TW-CYQ", "TW-TNN", "TW-KHH", "TW-PIF", "TW-ILA", "TW-HUA", "TW-TTT", "TW-PEN", "TW-KIN", "TW-LIE",
] as const;

export const usAreas = [
  "US-AL", "US-AK", "US-AZ", "US-AR", "US-CA", "US-CO", "US-CT", "US-DE", "US-DC", "US-FL", "US-GA", "US-HI", "US-ID",
  "US-IL", "US-IN", "US-IA", "US-KS", "US-KY", "US-LA", "US-ME", "US-MD", "US-MA", "US-MI", "US-MN", "US-MS", "US-MO",
  "US-MT", "US-NE", "US-NV", "US-NH", "US-NJ", "US-NM", "US-NY", "US-NC", "US-ND", "US-OH", "US-OK", "US-OR", "US-PA",
  "US-RI", "US-SC", "US-SD", "US-TN", "US-TX", "US-UT", "US-VT", "US-VA", "US-WA", "US-WV", "US-WI", "US-WY",
  "US-AS", "US-GU", "US-MP", "US-PR", "US-VI",
] as const;

export const areas = [...taiwanAreas, ...usAreas] as const;
export type Area = (typeof areas)[number];

/** The areas to pick from for a country; none for "other". */
export const areasOf = (country: string | null): readonly Area[] => (country === "TW" ? taiwanAreas : country === "US" ? usAreas : []);
