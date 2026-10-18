/** Commercial allowance and tested architecture ceiling are separate from identity. */
export const DEFAULT_MANAGED_ARTISTS = 3;
export const SUPPORTED_MANAGED_ARTISTS = 30;
export const MANAGER_MESSAGE_PAGE_SIZE = 20;
export function validArtistLimit(limit: number) {
  return Number.isInteger(limit) && limit > 0 && limit <= SUPPORTED_MANAGED_ARTISTS;
}
