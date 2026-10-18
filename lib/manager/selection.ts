import type {ArtistAccess} from "./scope";
/** Preserve an explicit empty selection; an outdated membership never expands the scope. */
export function restorePortfolioSelection(value:unknown,artists:ArtistAccess[]):string[]|null {
  if(value===null)return null;
  if(!Array.isArray(value)||!value.every(id=>typeof id==="string"))return null;
  return [...new Set(value)].filter(id=>artists.some(artist=>artist.id===id));
}
export const portfolioPages=["/","/calendar","/finance","/projects"];
export function portfolioLink(href:string,ids:string[]|null) {
  const url=new URL(href,"http://localhost");
  if(ids===null||!portfolioPages.includes(url.pathname))return href;
  url.searchParams.set("portfolio","1");url.searchParams.delete("artist");
  if(!ids.length)url.searchParams.set("artist","none");else ids.forEach(id=>url.searchParams.append("artist",id));
  return `${url.pathname}${url.search}${url.hash}`;
}
