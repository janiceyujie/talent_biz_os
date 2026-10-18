/** Deliberately opt-in; preparing the pipeline must not begin reading a real mailbox. */
export function mailPipelineEnabled(env:NodeJS.ProcessEnv=process.env){
  if(env.APP_ENV!=="development"||env.NODE_ENV==="production"||env.MAIL_PIPELINE_LOCAL_ENABLED!=="1")return false;
  try{return ["localhost","127.0.0.1","[::1]"].includes(new URL(env.DATABASE_URL??"").hostname);}catch{return false;}
}
