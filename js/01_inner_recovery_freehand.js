// ===== v0.9.2.3 stability patch: inner-hole recovery + freehand teaching =====
const PREPROCESSOR_VERSION_0923 = 'v0.4-restored-stable+inner-recovery';
function ss_floodFillOutsideZeros(mask,w,h){
  const seen=new Uint8Array(w*h), q=[];
  function push(p){ if(p>=0&&p<w*h&&!seen[p]&&!mask[p]){seen[p]=1;q.push(p);} }
  for(let x=0;x<w;x++){push(x);push((h-1)*w+x)}
  for(let y=0;y<h;y++){push(y*w);push(y*w+w-1)}
  for(let qi=0;qi<q.length;qi++){
    const p=q[qi],x=p%w,y=(p/w)|0;
    if(x>0)push(p-1); if(x<w-1)push(p+1); if(y>0)push(p-w); if(y<h-1)push(p+w);
  }
  return seen;
}
function ss_recoverInteriorMask(pre,imgData){
  const w=imgData.width,h=imgData.height;
  if(!pre||!pre.finalMask)return pre;
  const final=pre.finalMask.slice(), core=pre.core?pre.core.slice():new Uint8Array(w*h), soft=pre.soft?pre.soft.slice():new Uint8Array(w*h);
  // 1) Fill only enclosed holes. This avoids extending the silhouette outward,
  // but recovers internal holes caused by over-aggressive background rejection.
  const outside=ss_floodFillOutsideZeros(final,w,h);
  let recovered=0;
  for(let p=0;p<w*h;p++){
    if(!final[p]&&!outside[p]){ final[p]=1; soft[p]=1; recovered++; }
  }
  // 2) Recover small interior slits where left/right or up/down are foreground nearby.
  // This is intentionally conservative and bounded to the existing silhouette area.
  const f2=final.slice();
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const p=y*w+x;if(f2[p])continue;
    let lr=0,ud=0;
    for(let d=1;d<=5;d++){
      if(x-d>=0&&f2[y*w+x-d])lr++;
      if(x+d<w&&f2[y*w+x+d])lr++;
      if(y-d>=0&&f2[(y-d)*w+x])ud++;
      if(y+d<h&&f2[(y+d)*w+x])ud++;
    }
    // Only recover if surrounded in both axes and not on the border.
    if(lr>=2&&ud>=2){final[p]=1;soft[p]=1;recovered++;}
  }
  const analysis=bgp2_analysisImage(imgData,core,soft,pre.distArr||pre.labD||null);
  // Raise alpha for recovered soft slightly to make review/cluster stable.
  const ad=analysis.data;
  for(let p=0;p<w*h;p++){
    if(final[p]&&!core[p]&&ad[p*4+3]>0&&ad[p*4+3]<96) ad[p*4+3]=96;
    if(!final[p]) ad[p*4+3]=0;
  }
  const bbox=bboxOf(final,w,h);
  const layers=bgp_layers(w,h,core,soft,final,pre.shadow||new Uint8Array(w*h),bbox);
  return {...pre, analysis, finalMask:final, core, soft, bbox, layers, recoveredInterior:recovered, score:Math.max(pre.score||0, Math.min(100,(pre.score||0)+ (recovered>0?0:0)))};
}
if(typeof runBackgroundPreprocessorV04==='function'){
  const __runBackgroundPreprocessorV04_0922 = runBackgroundPreprocessorV04;
  runBackgroundPreprocessorV04 = function(imgData,options={}){
    const pre = __runBackgroundPreprocessorV04_0922(imgData,options);
    return ss_recoverInteriorMask(pre,imgData);
  };
}
// Override metadata/log to show v0.9.2.3 and recovery diagnostics.
if(typeof metadata092==='function'){
  const __metadata092_0922 = metadata092;
  metadata092 = function(){
    const m=__metadata092_0922();
    m.version='0.9.2.3';
    if(m.preprocessor){
      m.preprocessor.version=PREPROCESSOR_VERSION_0923;
      m.preprocessor.recovered_interior_pixels=state.result?.pre?.recoveredInterior||0;
    }
    m.review_perf={...(m.review_perf||{}), freehand:true, circle_deprecated:true, inner_recovery:true};
    return m;
  };
}
// Freehand path utilities. A path is saved as seed/features, not as final mask.
function ss_simplifyPath(points,maxN=80){
  if(!points||points.length<=maxN)return points||[];
  const out=[]; const step=(points.length-1)/(maxN-1);
  for(let i=0;i<maxN;i++){out.push(points[Math.round(i*step)]);}return out;
}
function ss_pathBounds(path){
  let minx=1e9,miny=1e9,maxx=-1,maxy=-1;
  for(const p of path){if(p.x<minx)minx=p.x;if(p.x>maxx)maxx=p.x;if(p.y<miny)miny=p.y;if(p.y>maxy)maxy=p.y;}
  return {minx,miny,maxx,maxy,w:maxx-minx+1,h:maxy-miny+1};
}
function ss_pixelsNearPath(path,imgData,radius=8){
  const w=imgData.width,h=imgData.height,d=imgData.data;
  path=ss_simplifyPath(path,120);
  if(!path.length)return [];
  const b=ss_pathBounds(path), minx=Math.max(0,Math.floor(b.minx-radius)), maxx=Math.min(w-1,Math.ceil(b.maxx+radius));
  const miny=Math.max(0,Math.floor(b.miny-radius)), maxy=Math.min(h-1,Math.ceil(b.maxy+radius));
  const r2=radius*radius, pixels=[];
  for(let y=miny;y<=maxy;y++)for(let x=minx;x<=maxx;x++){
    let ok=false;
    // sampled distance to path points; cheap enough for small review canvas.
    for(let i=0;i<path.length;i+=2){let dx=x-path[i].x,dy=y-path[i].y;if(dx*dx+dy*dy<=r2){ok=true;break;}}
    if(ok){let p=y*w+x;if(d[p*4+3]>0)pixels.push(p);}
  }
  return pixels;
}
function ss_extractFeaturesFreehand(region,imgData,lines,path){
  const pixels=ss_pixelsNearPath(path,imgData,8);
  if(!pixels.length)return extractFeatures(region,imgData,lines,null);
  // create a light temporary region from selected pixels
  const w=imgData.width,h=imgData.height;let minx=w,miny=h,maxx=0,maxy=0,sx=0,sy=0;
  for(const p of pixels){const x=p%w,y=(p/w)|0;if(x<minx)minx=x;if(x>maxx)maxx=x;if(y<miny)miny=y;if(y>maxy)maxy=y;sx+=x;sy+=y;}
  const tmp={...region,pixels,area:pixels.length,minx,miny,maxx,maxy,w:maxx-minx+1,h:maxy-miny+1,cx:sx/pixels.length,cy:sy/pixels.length};
  return extractFeatures(tmp,imgData,lines,null);
}
function ss_drawReviewCanvasFreehand(){
  const r=state.review.current,img=state.result&&state.result.imgData,c=qs('reviewCanvas');
  if(!r||!img)return;
  fitCanvas(c,img.width,img.height);
  const ctx=c.getContext('2d');
  const base=new ImageData(new Uint8ClampedArray(img.data),img.width,img.height);
  const data=base.data;
  if(r.pixels){
    const max=4500,step=Math.max(1,Math.ceil(r.pixels.length/max)),ar=.38,rr=255,gg=80,bb=120;
    for(let k=0;k<r.pixels.length;k+=step){let p=r.pixels[k],i=p*4;data[i]=Math.round(data[i]*(1-ar)+rr*ar);data[i+1]=Math.round(data[i+1]*(1-ar)+gg*ar);data[i+2]=Math.round(data[i+2]*(1-ar)+bb*ar);data[i+3]=255;}
  }
  ctx.putImageData(base,0,0);
  ctx.strokeStyle='#ff4f68';ctx.lineWidth=3;ctx.strokeRect(r.minx,r.miny,r.w,r.h);
  ctx.fillStyle='#ff4f68';ctx.font='18px sans-serif';ctx.fillText(`${LABELS[r.label]||r.label} ${r.conf}`,r.minx,Math.max(20,r.miny-5));
  const path=state.review.freehandPath||[];
  if(path.length){ctx.strokeStyle='#58a6ff';ctx.lineWidth=8;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(path[0].x,path[0].y);for(const p of path.slice(1))ctx.lineTo(p.x,p.y);ctx.stroke();}
}
drawReviewCanvas = ss_drawReviewCanvasFreehand;
function ss_saveFeedbackFreehand(region,path){
  if(!state.result||!state.result.pre||state.result.pre.score<60){qs('log').textContent='pre.score < 60 のため補正記憶は保存しません。';return null;}
  const id='fb_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,7);
  const simple=ss_simplifyPath(path,80);
  const features=ss_extractFeaturesFreehand(region,state.result.imgData,state.result.lines,simple);
  const sample={id,image_hash:imageHash(state.result.imgData),part_id:region.mid||region.id,auto_label:region.label,final_label:region.label,feedback_type:'corrected_by_freehand',confidence_before:region.confidence||region.conf||0,user_path:simple.map(p=>({x:+p.x.toFixed(1),y:+p.y.toFixed(1)})),features};
  queueMemorySample(sample);region.feedbackStatus='corrected_by_freehand';region.feedbackId=id;return sample;
}
// Rebind review UI one more time: freehand replaces circle/ellipse.
(function rebindFreehandReview0923(){
  const old=qs('reviewCanvas'); if(!old)return; const c=old.cloneNode(true); old.parentNode.replaceChild(c,old);
  let down=false,last=0;
  function start(ev){if(!state.review.freehandMode)return;ev.preventDefault();down=true;state.review.freehandPath=[canvasPoint(ev,c)];ss_drawReviewCanvasFreehand();}
  function move(ev){if(!down||!state.review.freehandMode)return;ev.preventDefault();const now=Date.now();const pt=canvasPoint(ev,c);const path=state.review.freehandPath||[];const lastPt=path[path.length-1];if(!lastPt||Math.hypot(pt.x-lastPt.x,pt.y-lastPt.y)>3)path.push(pt);state.review.freehandPath=path;if(now-last>45){last=now;requestAnimationFrame(ss_drawReviewCanvasFreehand);}}
  function end(ev){if(!down||!state.review.freehandMode)return;ev.preventDefault();down=false;const path=state.review.freehandPath||[];if(path.length>=3){ss_saveFeedbackFreehand(state.review.current,path);qs('reviewHint').textContent='フリーハンド補正を保存しました。';nextReview();}}
  c.addEventListener('mousedown',start);c.addEventListener('mousemove',move);window.addEventListener('mouseup',end);
  c.addEventListener('touchstart',start,{passive:false});c.addEventListener('touchmove',move,{passive:false});c.addEventListener('touchend',end,{passive:false});
  qs('reviewCircle').textContent='フリーハンドで教える';
  qs('reviewCircle').onclick=()=>{state.review.freehandMode=true;state.review.circleMode=false;state.review.freehandPath=[];qs('reviewHint').textContent='フリーハンド: 対象部分を指でなぞってください。離すと保存します。';ss_drawReviewCanvasFreehand();};
  qs('reviewAccept').onclick=()=>{saveFeedback(state.review.current,'accepted');nextReview();};
  qs('reviewReject').onclick=()=>{saveFeedback(state.review.current,'rejected');nextReview();};
  qs('reviewSkip').onclick=()=>{saveFeedback(state.review.current,'skipped');nextReview();};
})();
// Make memory matching aware of freehand feedback too.
if(typeof applyMemoryToCandidates==='function'){
  const __applyMemoryToCandidates0922=applyMemoryToCandidates;
  applyMemoryToCandidates=function(candidates,imgData,lines){
    __applyMemoryToCandidates0922(candidates,imgData,lines);
    // existing implementation ignores corrected_by_freehand; add a small second-pass boost if needed
    const mem=loadMemory(),samples=mem.samples||[],limit=memoryLimit(mem);
    for(const r of candidates){
      let f=r.features||extractFeatures(r,imgData,lines);let bestDelta=0,best=null;
      for(const s of samples){if(s.feedback_type!=='corrected_by_freehand'||!s.features)continue;let label=s.final_label||s.auto_label;if(label!==r.label)continue;let sim=featureSimilarity(f,s.features);if(sim<.70)continue;let delta=sim>=.85?10:4;if(Math.abs(delta)>Math.abs(bestDelta)){bestDelta=delta;best=s;}}
      if(best&&Math.abs(bestDelta)>Math.abs(r.memoryScore||0)){r.memoryScore=clamp(bestDelta,-limit,limit);r.feedbackStatus='memory_applied';r.feedbackId=best.id||null;r.finalConfidence=clamp(Math.round((r.base_confidence||r.scores?.confidence||r.conf||0)+r.memoryScore),0,100);r.conf=r.confidence=r.finalConfidence;r.needsReview=!(r.finalConfidence>=85 && Math.abs(r.memoryScore)<=limit);}
    }
  };
}
// Override json filename/version button after all previous handlers.
qs('json').onclick=()=>{if(!state.result)return;downloadBlob(JSON.stringify(metadata092(),null,2),'sprite_region_metadata_v0_9_2_3.json','application/json');};
