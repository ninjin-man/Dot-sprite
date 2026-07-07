// ===== v0.9.3 distance/scores patch: Distance Transform + bg_residue_score + sheer_score =====
(function(){
'use strict';
const VERSION_093 = '0.9.3';
const PREPROCESSOR_VERSION_093 = 'v0.4-restored-stable+inner-recovery+guards+distance-scores';

function safeQS(id){ return typeof qs === 'function' ? qs(id) : document.getElementById(id); }
function n01(v){ return Math.max(0, Math.min(1, v)); }
function getPersonArea(lines){ return (lines && lines.bbox && lines.bbox.area) ? lines.bbox.area : Math.max(1, (state.w||1)*(state.h||1)); }
function getPersonH(lines){ return (lines && (lines.H || (lines.bbox && lines.bbox.h))) || state.h || 1; }
function samplePixels(pixels, maxN){
  if(!pixels || !pixels.length) return [];
  if(pixels.length <= maxN) return pixels;
  const out=[], step=Math.ceil(pixels.length/maxN);
  for(let i=0;i<pixels.length;i+=step) out.push(pixels[i]);
  return out;
}
function countMask(mask){ let n=0; if(!mask)return 0; for(let i=0;i<mask.length;i++) if(mask[i]) n++; return n; }
function ensureLabels093(){
  try{
    Object.assign(LABELS, {distance_debug:'距離解析', soft_edge:'外周soft', bg_residue:'背景残り', unknown_soft:'保留:薄色', ambiguous_overlap:'重なり候補'});
    Object.assign(COLORS, {distance_debug:[90,170,255], soft_edge:[90,140,255], bg_residue:[86,88,100], unknown_soft:[170,180,205], ambiguous_overlap:[255,150,80]});
  }catch(e){}
}
ensureLabels093();

function makeMaskFromCandidates(candidates, w, h, predicate){
  const m=new Uint8Array(w*h);
  for(const r of (candidates||[])){
    if(!predicate(r)) continue;
    for(const p of (r.pixels||[])) m[p]=1;
  }
  return m;
}
function makeZoneMask(pre, lines, w, h, zone){
  const m=new Uint8Array(w*h), src=pre && pre.finalMask;
  if(!src || !lines) return m;
  for(let y=0;y<h;y++){
    let ok=false;
    if(zone==='head') ok = y>=lines.top && y<=lines.shoulder;
    else if(zone==='face') ok = y>=lines.faceTop && y<=lines.faceBot;
    else if(zone==='body') ok = y>=lines.shoulder && y<=lines.ankle;
    if(ok) for(let x=0;x<w;x++){ const p=y*w+x; if(src[p]) m[p]=1; }
  }
  return m;
}
function makeBoundaryMask(finalMask, w, h){
  const b=new Uint8Array(w*h);
  if(!finalMask) return b;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=y*w+x; if(!finalMask[p]) continue;
    let edge = x===0 || y===0 || x===w-1 || y===h-1;
    if(!edge){
      if(!finalMask[p-1] || !finalMask[p+1] || !finalMask[p-w] || !finalMask[p+w]) edge=true;
    }
    if(edge) b[p]=1;
  }
  return b;
}
function distanceTransform(seedMask, w, h){
  const INF=1e9, d=new Float32Array(w*h);
  for(let i=0;i<d.length;i++) d[i]=seedMask && seedMask[i] ? 0 : INF;
  const D=1, DD=1.4142;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=y*w+x; let v=d[p];
    if(x>0) v=Math.min(v,d[p-1]+D);
    if(y>0) v=Math.min(v,d[p-w]+D);
    if(x>0&&y>0) v=Math.min(v,d[p-w-1]+DD);
    if(x<w-1&&y>0) v=Math.min(v,d[p-w+1]+DD);
    d[p]=v;
  }
  for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){
    const p=y*w+x; let v=d[p];
    if(x<w-1) v=Math.min(v,d[p+1]+D);
    if(y<h-1) v=Math.min(v,d[p+w]+D);
    if(x<w-1&&y<h-1) v=Math.min(v,d[p+w+1]+DD);
    if(x>0&&y<h-1) v=Math.min(v,d[p+w-1]+DD);
    d[p]=v;
  }
  return d;
}
function mapStatsForRegion(r, map, denom){
  const pix=samplePixels(r.pixels||[], 1200);
  if(!pix.length || !map) return {mean:999, min:999, max:999};
  let sum=0,min=1e9,max=0,n=0;
  for(const p of pix){ let v=map[p]; if(v>=1e8) continue; sum+=v; if(v<min)min=v; if(v>max)max=v; n++; }
  if(!n) return {mean:999,min:999,max:999};
  denom=Math.max(1,denom||1);
  return {mean:+(sum/n/denom).toFixed(4), min:+(min/denom).toFixed(4), max:+(max/denom).toFixed(4)};
}
function bgLikeScore093(r){
  try{
    const bg=state.result && state.result.pre && state.result.pre.bg;
    if(!bg || !r.mean) return 0;
    const d=labDist(rgb2lab(...r.mean), rgb2lab(...bg));
    return Math.round((1-n01(d/46))*100);
  }catch(e){ return 0; }
}
function paleScore093(r){
  const hue=r.hue||0,s=r.sat||0,v=r.val||0, mean=r.mean||[0,0,0];
  const G=mean[1]||0,R=mean[0]||0,B=mean[2]||0;
  let s1=0;
  if(hue>80&&hue<185) s1+=35;
  if(v>.43) s1+=25;
  if(s<.42) s1+=25;
  if(G>=R-9&&G>=B-12) s1+=15;
  return Math.max(0,Math.min(100,s1));
}
function buildDistanceContext(result){
  if(!result || !result.pre || !result.imgData) return null;
  const w=result.imgData.width,h=result.imgData.height, lines=result.lines, pre=result.pre, cands=result.candidates||[];
  let bodyMask=result.bodyCoreMask;
  if(!bodyMask || !countMask(bodyMask)){
    bodyMask = makeMaskFromCandidates(cands,w,h,r=>['face','eyes','ears','hands','arms_skin','chest_skin','skin','skin_candidate','cloth','leg','shoe','necklace','body_ornament','shoe_ornament'].includes(r.label));
    if(countMask(bodyMask)<w*h*.035) bodyMask=makeZoneMask(pre,lines,w,h,'body');
  }
  let headMask=makeMaskFromCandidates(cands,w,h,r=>['face','eyes','ears','hair','hair_soft','hair_ornament'].includes(r.label));
  if(countMask(headMask)<w*h*.015) headMask=makeZoneMask(pre,lines,w,h,'head');
  let faceMask=makeMaskFromCandidates(cands,w,h,r=>['face','eyes','ears'].includes(r.label));
  if(countMask(faceMask)<w*h*.005) faceMask=makeZoneMask(pre,lines,w,h,'face');
  const boundaryMask=makeBoundaryMask(pre.finalMask,w,h);
  const denom=getPersonH(lines);
  const ctx={
    bodyMask, headMask, faceMask, boundaryMask,
    bodyDist:distanceTransform(bodyMask,w,h),
    headDist:distanceTransform(headMask,w,h),
    faceDist:distanceTransform(faceMask,w,h),
    boundaryDist:distanceTransform(boundaryMask,w,h),
    denom
  };
  result.distanceContext093=ctx;
  return ctx;
}
function regionDistanceFeatures093(r, ctx){
  if(!ctx) return null;
  return {
    to_body_core: mapStatsForRegion(r, ctx.bodyDist, ctx.denom),
    to_head_core: mapStatsForRegion(r, ctx.headDist, ctx.denom),
    to_face_core: mapStatsForRegion(r, ctx.faceDist, ctx.denom),
    to_foreground_border: mapStatsForRegion(r, ctx.boundaryDist, ctx.denom)
  };
}
function scoreRegion093(r, lines, ctx){
  const dist=regionDistanceFeatures093(r,ctx) || {};
  const touch=r.touches||{}, z=r.visualZone||r.zone||'', oz=r.originZone||'', relX=typeof r.relX==='number'?r.relX:0;
  const ar=(r.area||0)/getPersonArea(lines), hr=(r.h||0)/getPersonH(lines);
  const bgLike=bgLikeScore093(r), pale=paleScore093(r);
  const alpha=r.meanAlpha==null?255:r.meanAlpha;
  const bodyD=dist.to_body_core?.mean ?? 999;
  const headD=dist.to_head_core?.mean ?? 999;
  const borderD=dist.to_foreground_border?.mean ?? 999;
  let bgResidue=0;
  bgResidue += bgLike*.42;
  bgResidue += (touch.border?20:0);
  bgResidue += borderD<.035?16:(borderD<.08?8:0);
  bgResidue += bodyD>.18?12:0;
  bgResidue += alpha<170?10:0;
  bgResidue -= (['face','torso','legs'].includes(z)&&bodyD<.08)?16:0;
  bgResidue = Math.round(Math.max(0,Math.min(100,bgResidue)));
  let sheer=0;
  sheer += pale*.34;
  sheer += (z==='torso'||z==='legs'||touch.shoulder||touch.torso||touch.waist)?24:0;
  sheer += relX>.12?13:0;
  sheer += alpha<230?8:0;
  sheer += bodyD<.16?10:0;
  sheer -= (z==='head'||z==='face')?20:0;
  sheer -= touch.ankle?10:0;
  sheer = Math.round(Math.max(0,Math.min(100,sheer)));
  let hairSoft=0;
  hairSoft += (headD<.11?30:(headD<.18?18:0));
  hairSoft += (z==='head'||z==='face'||oz==='head'||oz==='face')?23:0;
  hairSoft += ((r.hue||0)>235 || (r.sat||0)<.24)?18:0;
  hairSoft += (!touch.waist&&!touch.ankle)?16:0;
  hairSoft -= hr>.45?20:0;
  hairSoft -= ar>.045?16:0;
  hairSoft = Math.round(Math.max(0,Math.min(100,hairSoft)));
  let overlap=0;
  const adj=r.adjacentParts||[];
  if(adj.includes('hair') && (adj.includes('cloth') || adj.includes('sheer') || adj.includes('sheer_soft'))) overlap+=35;
  if(adj.includes('face') && adj.includes('hair')) overlap+=20;
  if(ar>.01 && ar<.08 && bodyD<.10 && headD<.18) overlap+=15;
  overlap=Math.max(0,Math.min(100,overlap));
  return {bg_residue_score:bgResidue, sheer_score:sheer, hair_soft_score:hairSoft, overlap_score:overlap, bg_like_score:bgLike, pale_score:pale, area_ratio:+ar.toFixed(5), height_ratio:+hr.toFixed(4), distances:dist};
}
function relabelWithScores093(r, lines, ctx){
  const s=scoreRegion093(r,lines,ctx);
  r.analysis093=s;
  const old=r.label;
  const holdLabels=['unknown','needs_review','unknown_soft','soft_edge','bg_residue','background_residue','hair_soft','sheer_soft'];
  if(s.bg_residue_score>=76 && holdLabels.includes(r.label)){
    r.previous_label = r.previous_label || old;
    r.label='bg_residue';
    r.reason=(r.reason||'')+' / v0.9.3 bg_residue_score='+s.bg_residue_score;
    r.needsReview=true;
  }else if((r.label==='hair_soft'||r.label==='unknown_soft'||r.label==='soft_edge') && s.sheer_score>=74 && s.sheer_score>=s.hair_soft_score+8){
    r.previous_label = r.previous_label || old;
    r.label='sheer_soft';
    r.reason=(r.reason||'')+' / v0.9.3 sheer_score='+s.sheer_score;
    r.needsReview=true;
  }else if(r.label==='hair_soft' && s.hair_soft_score<45){
    r.previous_label = r.previous_label || old;
    r.label=s.bg_residue_score>62?'bg_residue':'unknown_soft';
    r.reason=(r.reason||'')+' / v0.9.3 weak_hair_soft_score='+s.hair_soft_score;
    r.needsReview=true;
  }else if(holdLabels.includes(r.label) && s.overlap_score>=55){
    r.previous_label = r.previous_label || old;
    r.label='ambiguous_overlap';
    r.reason=(r.reason||'')+' / v0.9.3 overlap_score='+s.overlap_score;
    r.needsReview=true;
  }
  if(old!==r.label){
    try{ r.scores=scoreFor(r.label,r,lines); }catch(e){ r.scores=r.scores||{}; }
    const conf = r.scores && r.scores.confidence ? r.scores.confidence : Math.min(r.conf||r.confidence||62,68);
    r.conf=r.confidence=r.finalConfidence=Math.min(conf, r.label==='sheer_soft'?76:66);
    r.reject_reason = r.reject_reason || [];
    r.reject_reason.push('v0.9.3_score_relabel_from_'+old);
  }
  return r;
}
function applyDistanceScores093(result){
  if(!result || !result.candidates || !result.lines) return result;
  const ctx=buildDistanceContext(result);
  for(const r of result.candidates){
    relabelWithScores093(r,result.lines,ctx);
    if(r.features){
      r.features.distance_to_body_core = r.analysis093.distances?.to_body_core || null;
      r.features.distance_to_head_core = r.analysis093.distances?.to_head_core || null;
      r.features.distance_to_face_core = r.analysis093.distances?.to_face_core || null;
      r.features.distance_to_foreground_border = r.analysis093.distances?.to_foreground_border || null;
    }
  }
  try{ buildAdjacency(result.candidates); }catch(e){}
  result.scoreStats093={
    bg_residue_high: result.candidates.filter(r=>r.analysis093?.bg_residue_score>=76).length,
    sheer_high: result.candidates.filter(r=>r.analysis093?.sheer_score>=74).length,
    weak_hair_soft: result.candidates.filter(r=>r.label==='hair_soft' && (r.analysis093?.hair_soft_score||0)<45).length
  };
  return result;
}

const previousAnalyze = (typeof analyze === 'function') ? analyze : null;
async function analyze093(){
  if(!previousAnalyze) return;
  await previousAnalyze();
  if(state.result && state.result.candidates){
    applyDistanceScores093(state.result);
    try{ renderAll(); }catch(e){}
  }
}
window.analyze093 = analyze093;
try{
  document.title='Sprite Studio Region Viewer v0.9.3';
  const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Region Viewer v0.9.3';
  const sub=document.querySelector('.sub'); if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v0.9.3: Distance Transform、bg_residue_score、sheer_score、距離特徴量を追加。';
  const footer=document.querySelector('.footer'); if(footer) footer.textContent='MVP目的：完全自動ではなく、AIなしで補正しやすい候補Regionを作る。v0.9.3は距離特徴量と薄布/背景残りスコア追加版です。';
  analyze=analyze093;
  const run=safeQS('run'); if(run) run.onclick=analyze093;
  const merge=safeQS('mergeMode'); if(merge) merge.onchange=analyze093;
  ['adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{const el=safeQS(id); if(el) el.oninput=()=>{state.lineAdjust={shoulder:+safeQS('adjShoulder').value,waist:+safeQS('adjWaist').value,crotch:+safeQS('adjCrotch').value,ankle:+safeQS('adjAnkle').value}; analyze093();};});
}catch(e){}

if(typeof metadata092 === 'function'){
  const prevMeta=metadata092;
  metadata092=function(){
    const m=prevMeta();
    m.version=VERSION_093;
    m.preprocessor=m.preprocessor||{};
    m.preprocessor.version=PREPROCESSOR_VERSION_093;
    m.analysis_v093={
      distance_transform:true,
      bg_residue_score:true,
      sheer_score:true,
      hair_soft_score:true,
      overlap_score:true,
      stats:state.result?.scoreStats093||null
    };
    if(Array.isArray(m.parts)){
      for(const p of m.parts){
        const live=(state.result?.candidates||[]).find(r=>(r.mid||r.id)===p.id);
        if(live){
          p.label=live.label; p.label_ja=LABELS[live.label]||live.label;
          p.confidence=live.confidence||live.conf||p.confidence;
          p.final_confidence=live.finalConfidence??p.final_confidence;
          p.previous_label=live.previous_label||p.previous_label||null;
          p.reject_reason=live.reject_reason||p.reject_reason||[];
          p.analysis_v093=live.analysis093||null;
          if(p.features && live.analysis093){
            p.features.distance_to_body_core=live.analysis093.distances?.to_body_core||null;
            p.features.distance_to_head_core=live.analysis093.distances?.to_head_core||null;
            p.features.distance_to_face_core=live.analysis093.distances?.to_face_core||null;
            p.features.distance_to_foreground_border=live.analysis093.distances?.to_foreground_border||null;
          }
        }
      }
    }
    return m;
  };
}
try{
  const json=safeQS('json'); if(json) json.onclick=()=>{if(!state.result)return;downloadBlob(JSON.stringify(metadata092(),null,2),'sprite_region_metadata_v0_9_3.json','application/json');};
  const summary=safeQS('summary'); if(summary) summary.onclick=()=>{let cards=[canvases.original,canvases.cutout,canvases.analysis,canvases.masks,canvases.lines,canvases.cluster,canvases.before,canvases.after,canvases.cand,canvases.unknownBefore,canvases.unknownAfter,canvases.part].filter(Boolean);let titles=['Original','Background Removed / Checker','Analysis','Masks','Base Lines','Color Cluster','Region Before','Region After','Candidates','Unknown Before','Unknown After','Part'];let W=960,H=1850,c=document.createElement('canvas');c.width=W;c.height=H;let ctx=c.getContext('2d');ctx.fillStyle='#0f1520';ctx.fillRect(0,0,W,H);ctx.fillStyle='#e8eef8';ctx.font='26px sans-serif';ctx.fillText('Sprite Studio Region Viewer v0.9.3 Summary',20,36);let cellW=290,cellH=320;for(let i=0;i<cards.length;i++){let cc=cards[i],col=i%3,row=(i/3)|0,x=20+col*(cellW+20),y=60+row*(cellH+35);ctx.fillStyle='#202a3a';ctx.fillRect(x,y,cellW,32);ctx.fillStyle='#e8eef8';ctx.font='16px sans-serif';ctx.fillText(titles[i],x+8,y+22);ctx.drawImage(cc,x,y+36,cellW,Math.min(cellH-38,cellW*cc.height/cc.width));}c.toBlob(b=>downloadBlob(b,'sprite_region_summary_v0_9_3.png','image/png'));};
}catch(e){}

if(typeof logResult === 'function'){
  const prevLog=logResult;
  logResult=function(){
    prevLog();
    const log=safeQS('log'); if(!log || !state.result) return;
    const st=state.result.scoreStats093||{};
    let top=(state.result.candidates||[]).slice(0,18).map(r=>`M${r.mid} ${LABELS[r.label]||r.label} bg=${r.analysis093?.bg_residue_score??'-'} sheer=${r.analysis093?.sheer_score??'-'} hairSoft=${r.analysis093?.hair_soft_score??'-'} bodyD=${r.analysis093?.distances?.to_body_core?.mean??'-'} headD=${r.analysis093?.distances?.to_head_core?.mean??'-'}`).join('\n');
    log.textContent += `\n[v0.9.3 distance scores]\ndistance_transform=ON / bg_high=${st.bg_residue_high||0} / sheer_high=${st.sheer_high||0} / weak_hair_soft=${st.weak_hair_soft||0}\n${top}\n`;
  };
}

})();
