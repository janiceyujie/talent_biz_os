export const LIST_PAGE_SIZE = 20;
export type CursorPage<T> = { items: T[]; nextCursor: string | null; total: number };
/** Updates can move an existing row into a later page. Preserve its position without duplicating it. */
export function appendPage<T extends { id: string }>(previous: T[], next: T[]) {
  return [...new Map([...previous, ...next].map(item => [item.id, item])).values()];
}
