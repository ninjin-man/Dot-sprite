// ===== v0.9.6 patch: label review panel / quality report / selected label PNG export =====
(function(){
'use strict';
const VERSION_096='0.9.6';
const PREPROCESSOR_VERSION_096='v0.4-restored-stable+inner-recovery+guards+distance-scores+edge-texture+face-detail+eye-tuning+validated-eye-pair+label-review-export';
function safeQS(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function safeColor(label){ return (COLORS && (COLORS[label]||COLORS.unknown)) || [255,80,120]; }
function selectedLabel(){ return state.selectedPart || 'face'; }
function labelName(label){ return (LABELS&&LABELS[label]) || label; }
function partStats096(){
  const cands=(state.result&&state.result.candidates)||[];
  const map={};
  for(const r of cands){
    const k=r.label||'unknown';
    if(!map[k]) map[k]={label:k,label_ja:labelName(k),count:0,area:0,review:0,avg_conf:0,max_area:0,ids:[]};
    const s=map[k]; s.count++; s.area+=r.area||0; s.review+=r.needsReview?1:0; s.avg_conf+=(r.confidence||r.conf||0); s.max_area=Math.max(s.max_area,r.area||0); s.ids.push(r.mid||r.id);
  }
  return Object.values(map).map(s=>({...s,avg_conf:s.count?Math.round(s.avg_conf/s.count):0,area_ratio:+(s.area/Math.max(1,(state.w||1)*(state.h||1))).toFixed(5)})).sort((a,b)=>b.area-a.area);
}
function qualityReport096(){
  const res=state.result||{}, pre=res.pre||{}, fd=(metadata092&&typeof metadata092==='function')?metadata092().face_detection:null;
  const stats=partStats096();
  const reviewCount=((res.candidates||[]).filter(r=>r.needsReview)).length;
  const huge=(stats||[]).filter(s=>s.area_ratio>.12 && !['soft_shell'].includes(s.label)).map(s=>({label:s.label,area_ratio:s.area_ratio,count:s.count}));
  const eyeVal=fd&&fd.eye_validation;
  const warnings=[];
  if(pre.score<80) warnings.push('preprocessor_score_low');
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
function drawSelectedPart096(label){
  const res=state.result; if(!res||!canvases.part) return;
  drawPart(canvases.part,res.imgData,res.candidates,label);
  const ctx=canvases.part.getContext('2d');
  const stats=partStats096().find(s=>s.label===label);
  if(ctx&&stats){
    ctx.save();
    ctx.fillStyle='rgba(15,21,32,0.82)'; ctx.fillRect(0,0,canvases.part.width,30);
    const col=safeColor(label); ctx.fillStyle=`rgb(${col[0]},${col[1]},${col[2]})`;
    ctx.font='16px sans-serif';
    ctx.fillText(`${labelName(label)} / ${label} / ${stats.count}件 / review ${stats.review}`,8,21);
    ctx.restore();
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
  const save=document.createElement('button'); save.className='tag'; save.textContent='選択部位PNG保存'; save.onclick=downloadSelectedPart096; div.appendChild(save);
}
function makeLabelImageData096(label){
  const res=state.result; if(!res||!res.imgData) return null;
  const img=res.imgData, w=img.width,h=img.height, out=makeImageData(w,h,[0,0,0,0]), src=img.data;
  const mask=new Uint8Array(w*h);
  for(const r of (res.candidates||[]).filter(r=>r.label===label)) for(const p of r.pixels) mask[p]=1;
  for(let p=0;p<w*h;p++) if(mask[p]){ const i=p*4; out.data[i]=src[i]; out.data[i+1]=src[i+1]; out.data[i+2]=src[i+2]; out.data[i+3]=src[i+3]; }
  return out;
}
function imageDataToPngBlob096(id,cb){
  const c=document.createElement('canvas'); c.width=id.width; c.height=id.height; const ctx=c.getContext('2d'); ctx.putImageData(id,0,0); c.toBlob(cb,'image/png');
}
function downloadSelectedPart096(){
  const label=selectedLabel(); const id=makeLabelImageData096(label); if(!id) return;
  imageDataToPngBlob096(id,b=>downloadBlob(b,`sprite_region_part_${label}_v0_9_6.png`,'image/png'));
}
function addUIPatch096(){
  const btn=safeQS('partPng'); if(btn) btn.onclick=downloadSelectedPart096;
  try{ document.title='Sprite Studio Region Viewer v0.9.6'; const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Region Viewer v0.9.6'; }catch(e){}
}
if(typeof renderAll==='function'){
  const prevRenderAll=renderAll;
  renderAll=function(){
    prevRenderAll();
    try{ drawSelectedPart096(selectedLabel()); makePartButtons096(); }catch(e){ console.warn('v0.9.6 render patch failed',e); }
  };
}
if(typeof makePartButtons==='function'){
  makePartButtons=makePartButtons096;
}
if(typeof metadata092==='function'){
  const prevMeta=metadata092;
  metadata092=function(){
    const m=prevMeta();
    m.version=VERSION_096;
    m.preprocessor=m.preprocessor||{}; m.preprocessor.version=PREPROCESSOR_VERSION_096;
    m.part_stats_v096=partStats096();
    m.quality_v096=qualityReport096();
    m.export_v096={selected_part_png:true,label_review_buttons:true,iphone_safe_single_png:true};
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
    log.textContent += `\n[v0.9.6 label review]\nquality=${qr.ok?'OK':'CHECK'} / review=${qr.review_target_count} / warnings=${qr.warnings.join(', ')||'none'}\nlabels ${top}\n`;
  };
}
try{
  const json=safeQS('json'); if(json) json.onclick=()=>{if(!state.result)return;downloadBlob(JSON.stringify(metadata092(),null,2),'sprite_region_metadata_v0_9_6.json','application/json');};
  const summary=safeQS('summary'); if(summary) summary.onclick=()=>{let cards=[canvases.original,canvases.cutout,canvases.analysis,canvases.masks,canvases.lines,canvases.cluster,canvases.before,canvases.after,canvases.cand,canvases.unknownBefore,canvases.unknownAfter,canvases.part].filter(Boolean);let titles=['Original','Background Removed / Checker','Analysis','Masks','Base Lines','Color Cluster','Region Before','Region After','Candidates','Unknown Before','Unknown After','Part'];let W=960,H=1850,c=document.createElement('canvas');c.width=W;c.height=H;let ctx=c.getContext('2d');ctx.fillStyle='#0f1520';ctx.fillRect(0,0,W,H);ctx.fillStyle='#e8eef8';ctx.font='26px sans-serif';ctx.fillText('Sprite Studio Region Viewer v0.9.6 Summary',20,36);let cellW=290,cellH=320;for(let i=0;i<cards.length;i++){let cc=cards[i],col=i%3,row=(i/3)|0,x=20+col*(cellW+20),y=60+row*(cellH+35);ctx.fillStyle='#202a3a';ctx.fillRect(x,y,cellW,32);ctx.fillStyle='#e8eef8';ctx.font='16px sans-serif';ctx.fillText(titles[i],x+8,y+22);ctx.drawImage(cc,x,y+36,cellW,Math.min(cellH-38,cellW*cc.height/cc.width));}c.toBlob(b=>downloadBlob(b,'sprite_region_summary_v0_9_6.png','image/png'));};
}catch(e){}
addUIPatch096();
})();
