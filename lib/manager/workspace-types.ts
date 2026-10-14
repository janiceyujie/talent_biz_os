import type {ArtistAccess} from "./scope";
import type {CalendarItem,Payment,ProjectSummary} from "@/lib/types";
export type ArtistRecord = {artistId:string;artistName:string};
export type PortfolioWorkspace = {
  artists:ArtistAccess[];
  selectedIds:string[];
  limited:boolean;
  calendar:(CalendarItem & ArtistRecord)[];
  payments:(Payment & ArtistRecord)[];
  projects:ProjectSummary[];
};
