import type {ArtistAccess} from "./scope";
import type {Currency} from "@/lib/domain/money";
export type ManagerOverview = {
  artistLimit?:number;
  limitReached?:boolean;
  nextCursor?:string;
  artists:ArtistAccess[]; selectedIds:string[]; start:string; end:string;
  calendar:{id:string;artistId:string;title:string;date:string;endDate?:string|null;time:string;timeZone:string;source:"event"|"todo"}[];
  messages:{id:string;artistId:string;receivedAt:string;status:string;body:string}[];
  finance:{artistId:string;currency:Currency;received:number;paid:number;receivable:number;payable:number}[];
};
