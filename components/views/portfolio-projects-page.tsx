"use client";
import {ManagerReadBoundary} from "@/components/app/manager-read-boundary";
import {useMemo} from "react";
import {useTranslations} from "next-intl";
import {AppDataScope,useAppData} from "@/components/app/app-data";
import {usePortfolio} from "@/components/app/portfolio-provider";
import {ProjectsView} from "./projects";
export function PortfolioProjectsPage(){
  const own=useAppData(),scope=usePortfolio(),t=useTranslations("portfolio");
  const signature=JSON.stringify(scope?.ids),roster=JSON.stringify(scope?.artists);
  const data=useMemo(()=>({...own,preview:false,previewDate:undefined,projects:[],calendar:[],payments:[],contacts:[],organizations:[],contracts:[],inbox:[],externalEvents:[],portfolio:{artists:scope?.artists.filter(artist=>scope.ids?.includes(artist.id))||[]}}),[own,signature,roster]); // eslint-disable-line react-hooks/exhaustive-deps -- snapshots follow the serialized scope
  if(scope?.capability.enabled&&!scope.ready)return <p role="status">{t("loading")}</p>;
  if(!scope?.capability.enabled||scope.ids===null)return <ProjectsView/>;
  if(!scope.ids.length)return <><h1>{t("projects")}</h1><p className="empty">{t("choose")}</p></>;
  return <ManagerReadBoundary ids={scope.ids}><AppDataScope data={data}><ProjectsView readOnly/></AppDataScope></ManagerReadBoundary>;
}
