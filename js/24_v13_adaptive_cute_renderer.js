// ===== v1.3 patch: adaptive cute renderer (image-dependent 32x32 output) =====
(function(){
'use strict';
const VERSION_V13='1.3-adaptive-cute-renderer';
function qs3(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function px(data,x,y,rgba){ if(x<0||y<0||x>=32||y>=32)return; const i=(y*32+x)*4; data[i]=rgba[0]; data[i+1]=rgba[1]; data[i+2]=rgba[2]; data[i+3]=rgba[3] ?? 255; }
function blend(data,x,y,rgba,a=.7){ if(x<0||y<0||x>=32||y>=32)return; const i=(y*32+x)*4; const aa=clamp(a,0,1); data[i]=Math.round(data[i]*(1-aa)+rgba[0]*aa); data[i+1]=Math.round(data[i+1]*(1-aa)+rgba[1]*aa); data[i+2]=Math.round(data[i+2]*(1-aa)+rgba[2]*aa); data[i+3]=Math.max(data[i+3],rgba[3] ?? 255); }
function rect(data,x,y,w,h,rgba){ for(let yy=y;yy<y+h;yy++) for(let xx=x;xx<x+w;xx++) px(data,xx,yy,rgba); }
function ellipse(data,cx,cy,rx,ry,rgba){ for(let y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++) for(let x=Math.floor(cx-rx);x<=Math.ceil(cx+rx);x++){ const dx=(x-cx)/Math.max(1,rx),dy=(y-cy)/Math.max(1,ry); if(dx*dx+dy*dy<=1) px(data,x,y,rgba); } }
function tri(data,p1,p2,p3,rgba){ const minx=Math.floor(Math.min(p1[0],p2[0],p3[0])), maxx=Math.ceil(Math.max(p1[0],p2[0],p3[0])); const miny=Math.floor(Math.min(p1[1],p2[1],p3[1])), maxy=Math.ceil(Math.max(p1[1],p2[1],p3[1])); const sign=(p,a,b)=>(p[0]-b[0])*(a[1]-b[1])-(a[0]-b[0])*(p[1]-b[1]); for(let y=miny;y<=maxy;y++)for(let x=minx;x<=maxx;x++){ const p=[x+.5,y+.5],d1=sign(p,p1,p2),d2=sign(p,p2,p3),d3=sign(p,p3,p1); if(!(((d1<0)||(d2<0)||(d3<0))&&((d1>0)||(d2>0)||(d3>0)))) px(data,x,y,rgba); } }
function line(data,x0,y0,x1,y1,rgba){ const dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1; let err=dx-dy,x=x0,y=y0; for(let i=0;i<96;i++){ px(data,x,y,rgba); if(x===x1&&y===y1)break; const e2=2*err; if(e2>-dy){err-=dy;x+=sx;} if(e2<dx){err+=dx;y+=sy;} } }
function outline(data){ const src=new Uint8ClampedArray(data), col=[58,48,74,255]; for(let y=1;y<31;y++)for(let x=1;x<31;x++){ const i=(y*32+x)*4; if(src[i+3])continue; let near=0; for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy)continue; if(src[((y+dy)*32+(x+dx))*4+3])near++; } if(near>=2){data[i]=col[0];data[i+1]=col[1];data[i+2]=col[2];data[i+3]=180;} } }
function hexToRgba(hex,fb){ if(!hex||hex[0]!=='#')return fb.slice(); const n=parseInt(hex.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255,255]; }
function mix(a,b,t){ return [Math.round(a[0]*(1-t)+b[0]*t),Math.round(a[1]*(1-t)+b[1]*t),Math.round(a[2]*(1-t)+b[2]*t),Math.round((a[3]??255)*(1-t)+(b[3]??255)*t)]; }
function light(c,t=.22){ return mix(c,[255,255,255,255],t); }
function dark(c,t=.28){ return mix(c,[28,24,36,255],t); }
function satBoost(c,amt=.08){ const avg=(c[0]+c[1]+c[2])/3; return [clamp(Math.round(avg+(c[0]-avg)*(1+amt)),0,255),clamp(Math.round(avg+(c[1]-avg)*(1+amt)),0,255),clamp(Math.round(avg+(c[2]-avg)*(1+amt)),0,255),c[3]??255]; }
function groupInfo(res,name){ const g=res?.sprite32V10?.groups?.[name]; return g || {area:0,parts:0,color:null}; }
function parts(res,label){ return (res?.candidates||[]).filter(r=>r.label===label || (Array.isArray(label)&&label.includes(r.label))); }
function bboxUnion(list){ if(!list.length)return null; let minx=1e9,miny=1e9,maxx=-1,maxy=-1,area=0; for(const r of list){ minx=Math.min(minx,r.minx??0); miny=Math.min(miny,r.miny??0); maxx=Math.max(maxx,r.maxx??((r.minx??0)+(r.w??0))); maxy=Math.max(maxy,r.maxy??((r.miny??0)+(r.h??0))); area+=r.area||0; } return {minx,miny,maxx,maxy,w:maxx-minx+1,h:maxy-miny+1,area}; }
function inferTraitsV13(res){ 
  const hair=groupInfo(res,'hair'), sleeve=groupInfo(res,'sleeve'), leg=groupInfo(res,'leg'), body=groupInfo(res,'body'), face=groupInfo(res,'face'), ornament=groupInfo(res,'ornament');
  const hb=bboxUnion(parts(res,['hair','front_hair','side_hair_left','side_hair_right','back_hair','hair_soft','hair_tip']));
  const bb=res?.pre?.bbox || res?.lines?.bbox || {h:512,w:368};
  const longHair=hb ? (hb.h > bb.h*.30 || hair.area > body.area*.45) : hair.area>2500;
  const wideHair=hb ? (hb.w > bb.w*.45) : hair.area>3500;
  const hasSleeve=sleeve.area>250 || parts(res,['transparent_cloth','sleeve_left','sleeve_right','sheer','sheer_soft']).length>0;
  const hasEars=parts(res,'ears').length>0 || /elf|ear/i.test((res?.sourceType||''));
  const hasLegs=leg.area>500 || parts(res,['left_leg','right_leg','legs','leg']).length>0;
  const ornate=ornament.area>40 || parts(res,['cloth_ornament','body_ornament','ornament_detail','necklace','belt']).length>0;
  const bodyBright=hexToRgba(body.color,[30,88,70,255]); 
  const isDress=(body.area>0 && leg.area>0 && body.area/Math.max(1,leg.area)>2.4);
  return {longHair,wideHair,hasSleeve,hasEars,hasLegs,ornate,isDress,bodyBright,areas:{hair:hair.area,body:body.area,leg:leg.area,face:face.area,sleeve:sleeve.area,ornament:ornament.area}};
}
function paletteV13(res){ 
  const hair=hexToRgba(groupInfo(res,'hair').color,[156,142,188,255]);
  const skin=hexToRgba(groupInfo(res,'face').color,[238,190,174,255]);
  const body=hexToRgba(groupInfo(res,'body').color,[28,92,72,255]);
  const sleeve=hexToRgba(groupInfo(res,'sleeve').color,[188,226,205,210]);
  const leg=hexToRgba(groupInfo(res,'leg').color,body);
  const shoe=hexToRgba(groupInfo(res,'shoe').color,dark(body,.32));
  const ornament=hexToRgba(groupInfo(res,'ornament').color,[220,172,82,255]);
  return {
    outline:dark(hair,.42),
    hairDark:dark(satBoost(hair,.15),.26),
    hairMid:satBoost(hair,.12),
    hairLight:light(hair,.36),
    skin:light(skin,.08),
    skinLight:light(skin,.24),
    blush:mix(light(skin,.12),[236,132,160,255],.42),
    eyeDark:dark(hair,.45),
    eyeMid:mix(dark(hair,.2),[126,80,110,255],.35),
    eyeHi:[248,246,250,255],
    bodyDark:dark(satBoost(body,.2),.32),
    body:satBoost(body,.12),
    bodyLight:light(satBoost(body,.1),.24),
    sleeve:mix(light(sleeve,.18),[190,230,205,210],.35),
    sleeveLight:light(sleeve,.34),
    leg:dark(satBoost(leg,.1),.08),
    legLight:light(leg,.22),
    shoe:dark(shoe,.05),
    gold:light(ornament,.1),
    goldLight:light(ornament,.34),
    shadow:[92,94,108,118]
  };
}
function drawHairV13(d,pal,tr){ 
  const cx=16;
  if(tr.longHair){
    ellipse(d,cx,6.5,tr.wideHair?6.8:5.8,5.5,pal.hairMid);
    ellipse(d,cx,7,tr.wideHair?5.8:4.9,4.8,pal.hairLight);
    line(d,11,9,9,16,pal.hairDark); line(d,9,16,8,22,pal.hairMid); line(d,8,22,9,25,pal.hairDark);
    line(d,21,9,23,16,pal.hairDark); line(d,23,16,24,22,pal.hairMid); line(d,24,22,23,25,pal.hairDark);
    line(d,12,11,10,21,pal.hairMid); line(d,20,11,22,21,pal.hairMid);
    px(d,8,19,pal.hairLight); px(d,24,19,pal.hairLight); px(d,9,24,pal.hairLight); px(d,23,24,pal.hairLight);
  }else{
    ellipse(d,cx,6.5,6.2,5.2,pal.hairMid);
    ellipse(d,cx,7,5.2,4.5,pal.hairLight);
    rect(d,11,10,10,3,pal.hairMid);
    px(d,10,12,pal.hairDark); px(d,21,12,pal.hairDark);
  }
  rect(d,12,3,8,2,pal.hairLight);
  px(d,12,5,pal.hairLight); px(d,13,5,pal.hairMid); px(d,14,5,pal.hairLight); px(d,15,5,pal.hairDark); px(d,16,5,pal.hairMid); px(d,17,5,pal.hairLight); px(d,18,5,pal.hairMid); px(d,19,5,pal.hairDark);
  px(d,13,6,pal.hairMid); px(d,15,6,pal.hairLight); px(d,16,6,pal.hairLight); px(d,18,6,pal.hairMid);
  line(d,12,7,11,11,pal.hairMid); line(d,20,7,21,11,pal.hairMid);
  px(d,11,4,pal.hairLight); px(d,20,4,pal.hairLight); px(d,12,9,pal.hairLight); px(d,20,9,pal.hairLight);
}
function drawFaceV13(d,pal,tr){ 
  if(tr.hasEars){ tri(d,[9,9],[6,10],[9,11],pal.skin); tri(d,[23,9],[26,10],[23,11],pal.skin); px(d,7,10,pal.skinLight); px(d,25,10,pal.skinLight); }
  ellipse(d,16,9.5,4.6,4.2,pal.skin);
  ellipse(d,16,8.8,4.0,2.9,pal.skinLight);
  px(d,13,12,pal.blush); px(d,19,12,pal.blush);
  px(d,13,9,pal.eyeDark); px(d,14,9,pal.eyeDark); px(d,18,9,pal.eyeDark); px(d,19,9,pal.eyeDark);
  px(d,13,10,pal.eyeMid); px(d,14,10,pal.eyeMid); px(d,18,10,pal.eyeMid); px(d,19,10,pal.eyeMid);
  px(d,14,9,pal.eyeHi); px(d,19,9,pal.eyeHi);
  px(d,12,8,pal.hairDark); px(d,20,8,pal.hairDark);
  px(d,15,12,mix(pal.skin,[190,90,110,255],.38)); px(d,16,12,mix(pal.skin,[190,90,110,255],.42));
  px(d,15,13,pal.skin); px(d,16,13,pal.skinLight); px(d,17,13,pal.skin);
}
function drawBodyV13(d,pal,tr){ 
  // body top and torso shape, adapted between bodysuit and dress-like body.
  px(d,14,13,pal.gold); px(d,18,13,pal.gold); px(d,16,13,light(pal.body,.25));
  rect(d,13,14,7,2,pal.bodyLight);
  rect(d,12,16,9,4,pal.bodyDark);
  if(tr.isDress){ rect(d,11,20,11,2,pal.body); rect(d,10,22,13,2,pal.bodyLight); }
  else { rect(d,13,20,7,2,pal.body); }
  px(d,12,15,pal.bodyLight); px(d,20,15,pal.bodyLight); px(d,13,17,pal.bodyLight); px(d,19,17,pal.bodyLight);
  if(tr.ornate){ px(d,16,15,pal.goldLight); px(d,15,17,pal.gold); px(d,17,17,pal.gold); px(d,14,18,pal.goldLight); px(d,18,18,pal.goldLight); px(d,16,20,pal.gold); }
}
function drawSleevesArmsV13(d,pal,tr){ 
  if(tr.hasSleeve){
    line(d,11,15,8,22,pal.sleeve); line(d,10,16,7,22,pal.sleeveLight); line(d,12,16,10,23,pal.sleeve);
    line(d,21,15,24,22,pal.sleeve); line(d,22,16,25,22,pal.sleeveLight); line(d,20,16,22,23,pal.sleeve);
    px(d,7,23,pal.sleeve); px(d,25,23,pal.sleeve);
  }else{
    line(d,12,15,10,20,dark(pal.body,.05)); line(d,20,15,22,20,dark(pal.body,.05));
  }
  px(d,10,21,pal.skin); px(d,22,21,pal.skin); px(d,9,21,pal.skinLight); px(d,23,21,pal.skinLight);
}
function drawLegsShoesV13(d,pal,tr){ 
  if(tr.hasLegs && !tr.isDress){
    rect(d,14,22,2,7,pal.leg); rect(d,17,22,2,7,pal.leg);
    line(d,13,22,14,28,dark(pal.leg,.25)); line(d,19,22,18,28,dark(pal.leg,.25));
    px(d,15,23,pal.legLight); px(d,18,23,pal.legLight); px(d,15,27,pal.legLight); px(d,18,27,pal.legLight);
  }else{
    rect(d,13,24,2,5,pal.skin); rect(d,18,24,2,5,pal.skin);
  }
  rect(d,13,29,3,2,pal.shoe); rect(d,17,29,3,2,pal.shoe);
  if(tr.ornate){ px(d,14,29,pal.gold); px(d,18,29,pal.gold); px(d,13,30,pal.goldLight); px(d,19,30,pal.goldLight); }
}
function renderSprite32V13(res){ 
  if(res?.gameGroupsV10 && !res.sprite32V10?.groups){
    try{ res.sprite32V10=res.sprite32V10||{}; res.sprite32V10.groups={}; for(const [k,g] of Object.entries(res.gameGroupsV10)){ res.sprite32V10.groups[k]={label:g.label,area:g.area,parts:g.parts?.length||0,color:'#'+(g.color||[0,0,0]).map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('')}; } }catch(e){}
  }
  const pal=paletteV13(res), tr=inferTraitsV13(res);
  const id=new ImageData(32,32), d=id.data; for(let i=0;i<d.length;i+=4){ d[i]=0; d[i+1]=0; d[i+2]=0; d[i+3]=0; }
  drawHairV13(d,pal,tr);
  drawFaceV13(d,pal,tr);
  drawBodyV13(d,pal,tr);
  drawSleevesArmsV13(d,pal,tr);
  drawLegsShoesV13(d,pal,tr);
  if(tr.ornate){ px(d,21,6,pal.gold); px(d,10,6,pal.goldLight); }
  for(let x=11;x<=21;x++) blend(d,x,31,pal.shadow,.8);
  outline(d);
  res.sprite32V13={imageData:id,status:'ok',renderer:'adaptive_cute_v1_3',traits:tr,palette:{hair:pal.hairMid,skin:pal.skin,body:pal.body,sleeve:pal.sleeve,leg:pal.leg,shoe:pal.shoe},note:'uses current image group colors, areas, and detected parts; no fixed elf-only sprite'};
  res.sprite32V12=res.sprite32V13; res.sprite32V11=res.sprite32V13; res.sprite32V10=res.sprite32V10||{}; res.sprite32V10.imageData=id; res.sprite32V10.status='ok-adaptive-cute-v1.3';
  return id;
}
function fit(c,w,h){ c.width=w; c.height=h; }
function drawV13(){ 
  if(!state.result)return;
  const id=renderSprite32V13(state.result);
  const c32=qs3('cSprite32'), prev=qs3('cSpritePreview'), st=qs3('spriteStatus'), log=qs3('pixelLog');
  if(c32){ fit(c32,32,32); const ctx=c32.getContext('2d'); ctx.clearRect(0,0,32,32); ctx.putImageData(id,0,0); }
  if(prev){ fit(prev,320,320); const ctx=prev.getContext('2d'); ctx.imageSmoothingEnabled=false; ctx.fillStyle='#0b111b'; ctx.fillRect(0,0,320,320); ctx.strokeStyle='rgba(255,255,255,.08)'; for(let i=0;i<=32;i++){ ctx.beginPath(); ctx.moveTo(i*10,0); ctx.lineTo(i*10,320); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,i*10); ctx.lineTo(320,i*10); ctx.stroke(); } const t=document.createElement('canvas'); t.width=32; t.height=32; t.getContext('2d').putImageData(id,0,0); ctx.drawImage(t,0,0,320,320); }
  if(st) st.textContent='v1.3 adaptive cute ready';
  if(log){ const tr=state.result.sprite32V13?.traits||{}; log.textContent=`Sprite v1.3\\nstatus=ok\\nrenderer=adaptive_cute_v1_3\\n\\n画像別反映:\\n- longHair=${!!tr.longHair}\\n- wideHair=${!!tr.wideHair}\\n- ears=${!!tr.hasEars}\\n- sleeve=${!!tr.hasSleeve}\\n- ornate=${!!tr.ornate}\\n- dress=${!!tr.isDress}\\n\\n修正内容:\\n- 固定エルフ画像テンプレを廃止\\n- 現在画像のグループ色を髪/肌/服/脚/靴へ反映\\n- 耳・袖・長髪・装飾の有無を現在画像から判定\\n- 画像が変われば配色と一部形状が変わる\\n\\n保存: 32x32 PNG保存 / ドット絵JSON保存`; }
}
function canvasV13(){ const id=state.result?.sprite32V13?.imageData || renderSprite32V13(state.result); const c=document.createElement('canvas'); c.width=32; c.height=32; c.getContext('2d').putImageData(id,0,0); return c; }
function saveLink(dataUrl,name,label){ try{ const a=document.createElement('a'); a.href=dataUrl; a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>a.remove(),400); }catch(e){} const log=qs3('pixelLog')||qs3('log'); if(log){ let box=document.getElementById('saveLinksV13'); if(!box){ box=document.createElement('div'); box.id='saveLinksV13'; box.style.marginTop='10px'; log.parentNode.appendChild(box); } const a=document.createElement('a'); a.href=dataUrl; a.download=name; a.target='_blank'; a.rel='noopener'; a.textContent=label||name; a.style.display='inline-block'; a.style.margin='6px 8px 0 0'; a.style.padding='8px 10px'; a.style.border='1px solid #58a6ff'; a.style.borderRadius='10px'; a.style.color='#58a6ff'; box.prepend(a); } }
function saveSprite32V13(){ if(!state.result){ alert('先に解析してください。'); return; } saveLink(canvasV13().toDataURL('image/png'),'sprite_front_32_v1_3_adaptive.png','画像を開く/保存 sprite_front_32_v1_3_adaptive.png'); }
function projectV13(){ const res=state.result; if(!res)return {version:VERSION_V13,status:'no_result'}; if(!res.sprite32V13)renderSprite32V13(res); return {version:VERSION_V13,type:'game_sprite_32_adaptive_cute',output:{sprite:'sprite_front_32_v1_3_adaptive.png',size:{w:32,h:32}},renderer:'adaptive_cute_v1_3',traits:res.sprite32V13.traits,palette:res.sprite32V13.palette,goal:'different source images produce different cute 32x32 sprites by using current image colors and part traits'}; }
function saveProjectV13(){ if(!state.result){ alert('先に解析してください。'); return; } saveLink('data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(projectV13(),null,2)),'sprite_pixel_project_v1_3_adaptive.json','JSONを開く/保存 sprite_pixel_project_v1_3_adaptive.json'); }
function installV13(){ 
  const b1=qs3('saveSprite32'); if(b1)b1.onclick=saveSprite32V13;
  const b2=qs3('savePixelProject'); if(b2)b2.onclick=saveProjectV13;
  const oldAnalyze=(typeof analyze==='function')?analyze:null;
  async function analyzeV13(){ if(oldAnalyze)await oldAnalyze(); try{ if(state.result)drawV13(); }catch(e){console.warn('v1.3 draw failed',e);} }
  analyze=analyzeV13; window.analyzeV13=analyzeV13; window.renderSprite32V13=renderSprite32V13; window.saveSprite32V13=saveSprite32V13;
  const run=qs3('run'); if(run)run.onclick=analyzeV13;
  ['adjFace','adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{ const el=qs3(id); if(el)el.oninput=()=>{state.lineAdjust={face:+(qs3('adjFace')?.value||0),shoulder:+(qs3('adjShoulder')?.value||0),waist:+(qs3('adjWaist')?.value||0),crotch:+(qs3('adjCrotch')?.value||0),ankle:+(qs3('adjAnkle')?.value||0)}; analyzeV13();};});
  document.title='Sprite Studio Pixel Pipeline v1.3';
  const h1=document.querySelector('h1'); if(h1)h1.textContent='Sprite Studio Pixel Pipeline v1.3';
  const sub=document.querySelector('.sub'); if(sub)sub.textContent='AIなし / Canvas + localStorageのみ。v1.3: adaptive cute mode。画像ごとの色・長髪・耳・袖・装飾を反映します。';
  const footer=document.querySelector('.footer'); if(footer)footer.textContent='v1.3は adaptive cute renderer です。固定テンプレではなく、現在画像のグループ色・面積・検出パーツから32x32を再構成します。';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installV13); else installV13();
if(typeof metadata092==='function'){ const oldMeta=metadata092; metadata092=function(){ const m=oldMeta(); m.version=VERSION_V13; m.pixel_sprite_v13={status:state.result?.sprite32V13?.status||'not_run',renderer:'adaptive_cute_v1_3',traits:state.result?.sprite32V13?.traits||null}; return m; }; }
})();
