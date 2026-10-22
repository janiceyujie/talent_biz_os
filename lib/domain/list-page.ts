// A list served a page at a time with keyset cursors (decision 0011), shared by its endpoints and the pages that scroll them.

export const PAGE_SIZE = 50;
export const PAGE_MAX = 200; // a reload after a save asks for as many rows as were showing

export type ListPage<T> = {
  items: T[];
  nextCursor: string | null;
  /** Rows matching the list's filters, not just the ones loaded. */
  total: number;
};
