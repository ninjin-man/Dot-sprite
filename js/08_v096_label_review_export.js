// ===== v0.9.6.2 patch: label review panel / quality report / zoomed selected label preview / trim PNG export =====
(function(){
'use strict';
const VERSION_096='0.9.6.2';
const PREPROCESSOR_VERSION_096='v0.4-restored-stable+inner-recovery+guards+distance-scores+edge-texture+face-detail+eye-tuning+validated-eye-pair+label-review-export+json-save-fix+zoom-preview';
function safeQS(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function safeColor(label){ return (typeof COLORS!=='undefined' && (COLORS[label]||COLORS.unknown)) || [255,80,120]; }
function selectedLabel(){ return (typeof state!=='undefined' && state.selectedPart) || 'face'; }
function labelName(label){ return (typeof LABELS!=='undefined' && LABELS[label]) || label; }
function safeDownload(data,name,type){ if(typeof downloadBlob==='function') downloadBlob(data,name,type); }
function partStats096(){
  const cands=(state.result&&state.result.candidates)||[];
  const map={};
  for(const r of cands){
    const k=r.label||'unknown';
    if(!map[k]) map[k]={label:k,label_ja:labelName(k),count:0,area:0,review:0,avg_conf:0,max_area:0,ids:[],bbox:null};
    const s=map[k];
    s.count++; s.area+=r.area||0; s.review+=r.needsReview?1:0; s.avg_conf+=(r.confidence||r.conf||0); s.max_area=Math.max(s.max_area,r.area||0); s.ids.push(r.mid||r.id);
    const rb={x:r.minx??(r.bbox&&r.bbox[0])??0,y:r.miny??(r.bbox&&r.bbox[1])??0,w:r.w??(r.bbox&&r.bbox[2])??0,h:r.h??(r.bbox&&r.bbox[3])??0};
    if(rb.w&&rb.h){
      if(!s.bbox) s.bbox={...rb};
      else{ const x=Math.min(s.bbox.x,rb.x), y=Math.min(s.bbox.y,rb.y); const rgt=Math.max(s.bbox.x+s.bbox.w,rb.x+rb.w), bot=Math.max(s.bbox.y+s.bbox.h,rb.y+rb.h); s.bbox={x,y,w:rgt-x,h:bot-y}; }
    }
  }
  return Object.values(map).map(s=>({...s,avg_conf:s.count?Math.round(s.avg_conf/s.count):0,area_ratio:+(s.area/Math.max(1,(state.w||1)*(state.h||1))).toFixed(5)})).sort((a,b)=>b.area-a.area);
}
function qualityReport096(){
  const res=state.result||{}, pre=res.pre||{};
  const fd={
    eye_candidate_count:(res.eyeCandidates0952||res.eyeCandidates0951||res.eyeCandidates095||res.eyeCandidates||[]).length,
    eye_pair_count:(res.eyePairs0952||res.eyePairs0951||res.eyePairs095||res.eyePairs||[]).length,
    eye_validation:res.eyeValidation0952||null
  };
  const stats=partStats096();
  const reviewCount=((res.candidates||[]).filter(r=>r.needsReview)).length;
  const huge=(stats||[]).filter(s=>s.area_ratio>.12 && !['soft_shell'].includes(s.label)).map(s=>({label:s.label,area_ratio:s.area_ratio,count:s.count}));
  const eyeVal=fd&&fd.eye_validation;
  const warnings=[];
  if((pre.score||0)<80) warnings.push('preprocessor_score_low');
  if(huge.length) warnings.push('huge_label_present');
  if(reviewCount>10) warnings.push('many_review_targets');
  if(fd && fd.eye_candidate_count>0 && fd.eye_pair_count===0) warnings.push('eye_candidates_without_valid_pair');
  if(eyeVal && eyeVal.raw_count>=5 && eyeVal.valid_count<=1) warnings.push('eye_detector_noisy_but_filtered');
  if(!stats.find(s=>s.label==='face')) warnings.push('face_missing');
  return {
    version:VERSION_096,
    preprocessor_score:pre.score||0,
    foreground_ratio:pre.foreground_ratio||pre.layers?.finalRatio||0,
    part_label_count:stats.length,
    review_target_count:reviewCount,
    huge_labels:huge,
    warnings,
    ok: warnings.filter(w=>!['eye_candidates_without_valid_pair','eye_detector_noisy_but_filtered'].includes(w)).length===0
  };
}
function makeLabelImageData096(label){
  const res=state.result; if(!res||!res.imgData) return null;
  const img=res.imgData, w=img.width,h=img.height, out=makeImageData(w,h,[0,0,0,0]), src=img.data;
  const mask=new Uint8Array(w*h);
  for(const r of (res.candidates||[]).filter(r=>r.label===label)) if(r.pixels) for(const p of r.pixels) mask[p]=1;
  for(let p=0;p<w*h;p++) if(mask[p]){ const i=p*4; out.data[i]=src[i]; out.data[i+1]=src[i+1]; out.data[i+2]=src[i+2]; out.data[i+3]=src[i+3]; }
  return out;
}
function labelBBox096(label,pad=8){
  const res=state.result; if(!res||!res.imgData) return null;
  const list=(res.candidates||[]).filter(r=>r.label===label);
  if(!list.length) return null;
  let minx=1e9,miny=1e9,maxx=-1,maxy=-1;
  for(const r of list){
    const x=r.minx??(r.bbox&&r.bbox[0]); const y=r.miny??(r.bbox&&r.bbox[1]); const w=r.w??(r.bbox&&r.bbox[2]); const h=r.h??(r.bbox&&r.bbox[3]);
    if(x==null||y==null||!w||!h) continue;
    minx=Math.min(minx,x); miny=Math.min(miny,y); maxx=Math.max(maxx,x+w); maxy=Math.max(maxy,y+h);
  }
  if(maxx<0) return null;
  const iw=res.imgData.width, ih=res.imgData.height;
  minx=Math.max(0,Math.floor(minx-pad)); miny=Math.max(0,Math.floor(miny-pad));
  maxx=Math.min(iw,Math.ceil(maxx+pad)); maxy=Math.min(ih,Math.ceil(maxy+pad));
  return {x:minx,y:miny,w:Math.max(1,maxx-minx),h:Math.max(1,maxy-miny)};
}
function drawSelectedPart096(label){
  const res=state.result; if(!res||!canvases.part) return;
  const id=makeLabelImageData096(label); const c=canvases.part; if(!id) return;
  const bbox=labelBBox096(label,10);
  const ctx=c.getContext('2d');
  const useZoom=!!bbox && bbox.w>0 && bbox.h>0;
  if(useZoom){
    c.width=res.imgData.width; c.height=res.imgData.height;
    ctx.clearRect(0,0,c.width,c.height);
    const src=imageDataToCanvas(id);
    const pad=36;
    const scale=Math.min((c.width-pad*2)/bbox.w,(c.height-pad*2-28)/bbox.h);
    const dw=Math.max(1,bbox.w*scale), dh=Math.max(1,bbox.h*scale);
    const dx=(c.width-dw)/2, dy=34+(c.height-34-dh)/2;
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(src,bbox.x,bbox.y,bbox.w,bbox.h,dx,dy,dw,dh);
    const col=safeColor(label);
    ctx.strokeStyle=`rgba(${col[0]},${col[1]},${col[2]},0.95)`; ctx.lineWidth=2;
    ctx.strokeRect(dx,dy,dw,dh);
  }else{
    drawPart(c,res.imgData,res.candidates,label);
  }
  const stats=partStats096().find(s=>s.label===label);
  if(ctx&&stats){
    ctx.save();
    ctx.fillStyle='rgba(15,21,32,0.88)'; ctx.fillRect(0,0,c.width,32);
    const col=safeColor(label); ctx.fillStyle=`rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.font='15px sans-serif';
    const mode=useZoom?'zoom':'full';
    ctx.fillText(`${labelName(label)} / ${label} / ${stats.count}件 / review ${stats.review} / ${mode}`,8,22);
    ctx.restore();
  }
}
function imageDataToPngBlob096(id,cb){
  const c=document.createElement('canvas'); c.width=id.width; c.height=id.height; const ctx=c.getContext('2d'); ctx.putImageData(id,0,0); c.toBlob(cb,'image/png');
}
function cropImageData096(id,rect){
  if(!id||!rect) return id;
  const out=makeImageData(rect.w,rect.h,[0,0,0,0]);
  for(let y=0;y<rect.h;y++) for(let x=0;x<rect.w;x++){
    const sp=((rect.y+y)*id.width+(rect.x+x))*4, dp=(y*rect.w+x)*4;
    out.data[dp]=id.data[sp]; out.data[dp+1]=id.data[sp+1]; out.data[dp+2]=id.data[sp+2]; out.data[dp+3]=id.data[sp+3];
  }
  return out;
}
function downloadSelectedPart096(trim=false){
  const label=selectedLabel(); const id=makeLabelImageData096(label); if(!id) return;
  if(trim){
    const bbox=labelBBox096(label,4); const cropped=cropImageData096(id,bbox);
    imageDataToPngBlob096(cropped,b=>safeDownload(b,`sprite_region_part_${label}_trim_v0_9_8_1.png`,'image/png'));
  }else{
    imageDataToPngBlob096(id,b=>safeDownload(b,`sprite_region_part_${label}_full_v0_9_8_1.png`,'image/png'));
  }
}
function makePartButtons096(){
  const div=safeQS('partButtons'); if(!div) return;
  const stats=partStats096();
  div.innerHTML='';
  const top=document.createElement('div'); top.className='mini'; top.style.width='100%'; top.style.margin='2px 0 6px';
  const qr=qualityReport096();
  top.textContent=`品質: ${qr.ok?'OK':'要確認'} / review ${qr.review_target_count} / labels ${qr.part_label_count} / ${qr.warnings.join(', ')||'warningsなし'}`;
  div.appendChild(top);
  for(const s of stats){
    const b=document.createElement('button'); b.className='tag';
    const col=safeColor(s.label); b.style.border=`1px solid rgb(${col[0]},${col[1]},${col[2]})`;
    b.style.background=(state.selectedPart===s.label)?'rgba(88,166,255,.25)':'';
    b.textContent=`${s.label_ja} ${s.count}${s.review?' ⚠'+s.review:''}`;
    b.title=`${s.label} area=${s.area_ratio} avg=${s.avg_conf}`;
    b.onclick=()=>{state.selectedPart=s.label; drawSelectedPart096(s.label); makePartButtons096();};
    div.appendChild(b);
  }
  const saveFull=document.createElement('button'); saveFull.className='tag'; saveFull.textContent='選択部位PNG保存'; saveFull.onclick=()=>downloadSelectedPart096(false); div.appendChild(saveFull);
  const saveTrim=document.createElement('button'); saveTrim.className='tag'; saveTrim.textContent='トリムPNG保存'; saveTrim.onclick=()=>downloadSelectedPart096(true); div.appendChild(saveTrim);
}
function addUIPatch096(){
  const btn=safeQS('partPng'); if(btn) btn.onclick=()=>downloadSelectedPart096(false);
  try{
    document.title='Sprite Studio Region Viewer v0.9.6.2';
    const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Region Viewer v0.9.6.2';
    const sub=document.querySelector('.sub'); if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v0.9.6.2: ラベル別ズーム確認・選択部位PNG保存・トリムPNG保存・保存安定化。';
  }catch(e){}
  setTimeout(()=>{
    const log=safeQS('log');
    if(log && /^sample load error/i.test(log.textContent||'')) log.textContent='画像を選択してください。sample.pngなしでも動作します。';
  },650);
}
if(typeof renderAll==='function'){
  const prevRenderAll=renderAll;
  renderAll=function(){
    prevRenderAll();
    try{ drawSelectedPart096(selectedLabel()); makePartButtons096(); }catch(e){ console.warn('v0.9.6.2 render patch failed',e); }
  };
}
if(typeof makePartButtons==='function') makePartButtons=makePartButtons096;
if(typeof metadata092==='function'){
  const prevMeta=metadata092;
  metadata092=function(){
    const m=prevMeta();
    m.version=VERSION_096;
    m.preprocessor=m.preprocessor||{}; m.preprocessor.version=PREPROCESSOR_VERSION_096;
    m.part_stats_v096=partStats096();
    m.quality_v096=qualityReport096();
    m.export_v096={selected_part_png:true,selected_part_trim_png:true,label_review_buttons:true,part_preview_zoom:true,iphone_safe_single_png:true};
    return m;
  };
}
if(typeof logResult==='function'){
  const prevLog=logResult;
  logResult=function(){
    prevLog();
    const log=safeQS('log'); if(!log||!state.result) return;
    const qr=qualityReport096();
    const top=partStats096().slice(0,8).map(s=>`${s.label}:${s.count}/${s.review}`).join('  ');
    log.textContent += `\n[v0.9.6.2 label review]\nquality=${qr.ok?'OK':'CHECK'} / review=${qr.review_target_count} / warnings=${qr.warnings.join(', ')||'none'}\nlabels ${top}\n`;
  };
}
try{
  const json=safeQS('json'); if(json) json.onclick=()=>{if(!state.result)return;safeDownload(JSON.stringify(metadata092(),null,2),'sprite_region_metadata_v0_9_6_2.json','application/json'); const log=safeQS('log'); if(log) log.textContent+='\n保存: metadata v0.9.6.2';};
  const summary=safeQS('summary'); if(summary) summary.onclick=()=>{let cards=[canvases.original,canvases.cutout,canvases.analysis,canvases.masks,canvases.lines,canvases.cluster,canvases.before,canvases.after,canvases.cand,canvases.unknownBefore,canvases.unknownAfter,canvases.part].filter(Boolean);let titles=['Original','Background Removed / Checker','Analysis','Masks','Base Lines','Color Cluster','Region Before','Region After','Candidates','Unknown Before','Unknown After','Part'];let W=960,H=1850,c=document.createElement('canvas');c.width=W;c.height=H;let ctx=c.getContext('2d');ctx.fillStyle='#0f1520';ctx.fillRect(0,0,W,H);ctx.fillStyle='#e8eef8';ctx.font='26px sans-serif';ctx.fillText('Sprite Studio Region Viewer v0.9.6.2 Summary',20,36);let cellW=290,cellH=320;for(let i=0;i<cards.length;i++){let cc=cards[i],col=i%3,row=(i/3)|0,x=20+col*(cellW+20),y=60+row*(cellH+35);ctx.fillStyle='#202a3a';ctx.fillRect(x,y,cellW,32);ctx.fillStyle='#e8eef8';ctx.font='16px sans-serif';ctx.fillText(titles[i],x+8,y+22);ctx.drawImage(cc,x,y+36,cellW,Math.min(cellH-38,cellW*cc.height/cc.width));}c.toBlob(b=>safeDownload(b,'sprite_region_summary_v0_9_6_2.png','image/png'));};
}catch(e){}
addUIPatch096();
})();
