import { useEffect, useState } from "react";
import API from "../../api/axios";

export default function PrivateImage({path, fallback, alt}) {
  const [source,setSource]=useState(null);
  useEffect(()=>{
    if(!path)return;
    const controller=new AbortController();
    let url;
    API.get(path,{responseType:"blob",signal:controller.signal}).then(({data})=>{
      if(controller.signal.aborted)return;
      url=URL.createObjectURL(data);
      setSource({path,url});
    }).catch(()=>{});
    return ()=>{controller.abort();if(url)URL.revokeObjectURL(url);};
  },[path]);
  const url=source?.path===path ? source?.url : fallback;
  return url ? <img src={url} alt={alt} draggable={false}/> : null;
}
