// ===== v1.4 patch: design-adaptive cute renderer =====
(function(){
'use strict';
const VERSION_V14='1.4-design-adaptive-cute';
function qs4(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function px(data,x,y,rgba){ if(x<0||y<0||x>=32||y>=32)return; const i=(y*32+x)*4; data[i]=rgba[0]; data[i+1]=rgba[1]; data[i+2]=rgba[2]; data[i+3]=rgba[3] ?? 255; }
function blend(data,x,y,rgba,a=.7){ if(x<0||y<0||x>=32||y>=32)return; const i=(y*32+x)*4; const aa=clamp(a,0,1); data[i]=Math.round(data[i]*(1-aa)+rgba[0]*aa); data[i+1]=Math.round(data[i+1]*(1-aa)+rgba[1]*aa); data[i+2]=Math.round(data[i+2]*(1-aa)+rgba[2]*aa); data[i+3]=Math.max(data[i+3],rgba[3] ?? 255); }
function rect(data,x,y,w,h,rgba){ for(let yy=y;yy<y+h;yy++) for(let xx=x;xx<x+w;xx++) px(data,xx,yy,rgba); }
function ellipse(data,cx,cy,rx,ry,rgba){ for(let y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++) for(let x=Math.floor(cx-rx);x<=Math.ceil(cx+rx);x++){ const dx=(x-cx)/Math.max(1,rx),dy=(y-cy)/Math.max(1,ry); if(dx*dx+dy*dy<=1) px(data,x,y,rgba); } }
function tri(data,p1,p2,p3,rgba){ const minx=Math.floor(Math.min(p1[0],p2[0],p3[0])), maxx=Math.ceil(Math.max(p1[0],p2[0],p3[0])); const miny=Math.floor(Math.min(p1[1],p2[1],p3[1])), maxy=Math.ceil(Math.max(p1[1],p2[1],p3[1])); const sign=(p,a,b)=>(p[0]-b[0])*(a[1]-b[1])-(a[0]-b[0])*(p[1]-b[1]); for(let y=miny;y<=maxy;y++)for(let x=minx;x<=maxx;x++){ const p=[x+.5,y+.5],d1=sign(p,p1,p2),d2=sign(p,p2,p3),d3=sign(p,p3,p1); if(!(((d1<0)||(d2<0)||(d3<0))&&((d1>0)||(d2>0)||(d3>0)))) px(data,x,y,rgba); } }
function line(data,x0,y0,x1,y1,rgba){ const dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1; let err=dx-dy,x=x0,y=y0; for(let i=0;i<96;i++){ px(data,x,y,rgba); if(x===x1&&y===y1)break; const e2=2*err; if(e2>-dy){err-=dy;x+=sx;} if(e2<dx){err+=dx;y+=sy;} } }
function outline(data,col=[58,48,74,255]){ const src=new Uint8ClampedArray(data); for(let y=1;y<31;y++)for(let x=1;x<31;x++){ const i=(y*32+x)*4; if(src[i+3])continue; let near=0; for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){ if(!dx&&!dy)continue; if(src[((y+dy)*32+(x+dx))*4+3])near++; } if(near>=2){data[i]=col[0];data[i+1]=col[1];data[i+2]=col[2];data[i+3]=180;} } }
function fit(c,w,h){ c.width=w; c.height=h; }
function mix(a,b,t){ return [Math.round(a[0]*(1-t)+b[0]*t),Math.round(a[1]*(1-t)+b[1]*t),Math.round(a[2]*(1-t)+b[2]*t),Math.round((a[3]??255)*(1-t)+(b[3]??255)*t)]; }
function light(c,t=.22){ return mix(c,[255,255,255,255],t); }
function dark(c,t=.28){ return mix(c,[28,24,36,255],t); }
function satBoost(c,amt=.08){ const avg=(c[0]+c[1]+c[2])/3; return [clamp(Math.round(avg+(c[0]-avg)*(1+amt)),0,255),clamp(Math.round(avg+(c[1]-avg)*(1+amt)),0,255),clamp(Math.round(avg+(c[2]-avg)*(1+amt)),0,255),c[3]??255]; }
function hexToRgba(hex,fb){ if(!hex||hex[0]!=='#')return fb.slice(); const n=parseInt(hex.slice(1),16); return [(n>>16)&255,(n>>8)&255,n&255,255]; }
function groupInfo(res,name){ const g=res?.sprite32V10?.groups?.[name]; return g || {area:0,parts:0,color:null}; }
function parts(res,label){ return (res?.candidates||[]).filter(r=>r.label===label || (Array.isArray(label)&&label.includes(r.label))); }
function bboxUnion(list){ if(!list.length)return null; let minx=1e9,miny=1e9,maxx=-1,maxy=-1,area=0; for(const r of list){ minx=Math.min(minx,r.minx??0); miny=Math.min(miny,r.miny??0); maxx=Math.max(maxx,r.maxx??((r.minx??0)+(r.w??0))); maxy=Math.max(maxy,r.maxy??((r.miny??0)+(r.h??0))); area+=r.area||0; } return {minx,miny,maxx,maxy,w:maxx-minx+1,h:maxy-miny+1,area}; }
function ensureGroupsFromGameGroups(res){
  if(res?.gameGroupsV10 && !res.sprite32V10?.groups){
    try{
      res.sprite32V10=res.sprite32V10||{}; res.sprite32V10.groups={};
      for(const [k,g] of Object.entries(res.gameGroupsV10)){
        res.sprite32V10.groups[k]={label:g.label,area:g.area,parts:g.parts?.length||0,color:'#'+(g.color||[0,0,0]).map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('')};
      }
    }catch(e){}
  }
}
function inferDesignV14(res){
  ensureGroupsFromGameGroups(res);
  const hair=groupInfo(res,'hair'), sleeve=groupInfo(res,'sleeve'), leg=groupInfo(res,'leg'), body=groupInfo(res,'body'), face=groupInfo(res,'face'), ornament=groupInfo(res,'ornament'), armHand=groupInfo(res,'arm_hand');
  const hb=bboxUnion(parts(res,['hair','front_hair','side_hair_left','side_hair_right','back_hair','hair_soft','hair_tip']));
  const bb=res?.pre?.bbox || {w:256,h:512};
  const lower=bboxUnion(parts(res,['lower_cloth']));
  const upper=bboxUnion(parts(res,['upper_cloth']));
  const sheer=bboxUnion(parts(res,['transparent_cloth','sheer','sheer_soft','sleeve_left','sleeve_right']));
  const neckParts=parts(res,['neck','collar']);
  const earParts=parts(res,'ears');
  const handParts=parts(res,['hands','hand_candidate']);
  const hairStyle = !hb ? 'medium' : (hb.h > bb.h*0.40 ? (hb.w > bb.w*0.52 ? 'long_volume' : 'long_straight') : (hb.h > bb.h*0.24 ? 'medium' : 'bob'));
  let outfit='bodysuit';
  const sheerArea=sheer?.area||0, lowerArea=lower?.area||0, upperArea=upper?.area||0;
  if(sheerArea>2500 && sleeve.parts>=2) outfit='robe';
  else if(lowerArea>upperArea*1.2 || (body.area>0 && leg.area>0 && body.area/Math.max(1,leg.area)>2.6)) outfit='dress';
  else if(lowerArea>upperArea*.55) outfit='skirt';
  else outfit='bodysuit';
  let sleeveType='none';
  if(sheerArea>1600) sleeveType='drape';
  else if(sleeve.area>900) sleeveType='long';
  else if(sleeve.area>200 || sleeve.parts>0) sleeveType='short';
  const faceShape = face.area > 3000 ? 'round' : 'oval';
  const eyeMood = hairStyle==='bob' ? 'round' : (outfit==='robe' ? 'gentle' : 'normal');
  const hasEars = earParts.length>=2;
  const hasNecklace = neckParts.length>=2 || ornament.parts>=3;
  const hasVisibleHands = handParts.length>=1 || armHand.area>150;
  const ornamentLevel = ornament.parts>=4 || ornament.area>130 ? 'high' : (ornament.parts>0 ? 'low' : 'none');
  const silhouetteWidth = hb ? hb.w/bb.w : 0.35;
  return {
    hairStyle,outfit,sleeveType,faceShape,eyeMood,hasEars,hasNecklace,hasVisibleHands,ornamentLevel,
    silhouetteWidth,
    metrics:{hairArea:hair.area,bodyArea:body.area,legArea:leg.area,sleeveArea:sleeve.area,lowerArea,upperArea,sheerArea}
  };
}
function paletteV14(res){
  const hair=hexToRgba(groupInfo(res,'hair').color,[156,142,188,255]);
  const skin=hexToRgba(groupInfo(res,'face').color,[238,190,174,255]);
  const body=hexToRgba(groupInfo(res,'body').color,[28,92,72,255]);
  const sleeve=hexToRgba(groupInfo(res,'sleeve').color,[188,226,205,210]);
  const leg=hexToRgba(groupInfo(res,'leg').color,body);
  const shoe=hexToRgba(groupInfo(res,'shoe').color,dark(body,.32));
  const ornament=hexToRgba(groupInfo(res,'ornament').color,[220,172,82,255]);
  return {
    outline:dark(hair,.42),
    hairDark:dark(satBoost(hair,.15),.26), hairMid:satBoost(hair,.12), hairLight:light(hair,.36),
    skin:light(skin,.08), skinLight:light(skin,.24), blush:mix(light(skin,.12),[236,132,160,255],.42),
    eyeDark:dark(hair,.45), eyeMid:mix(dark(hair,.2),[126,80,110,255],.35), eyeHi:[248,246,250,255],
    bodyDark:dark(satBoost(body,.2),.32), body:satBoost(body,.12), bodyLight:light(satBoost(body,.1),.24),
    sleeve:mix(light(sleeve,.18),[190,230,205,210],.35), sleeveLight:light(sleeve,.34),
    leg:dark(satBoost(leg,.1),.08), legLight:light(leg,.22), shoe:dark(shoe,.05),
    gold:light(ornament,.1), goldLight:light(ornament,.34), shadow:[92,94,108,118]
  };
}
function drawHair(d,p,design){
  const cx=16;
  if(design.hairStyle==='bob'){
    ellipse(d,cx,6.2,6.0,4.8,p.hairMid); ellipse(d,cx,6.6,5.1,4.1,p.hairLight);
    rect(d,11,10,10,4,p.hairMid); line(d,10,10,9,15,p.hairDark); line(d,22,10,23,15,p.hairDark);
    px(d,9,15,p.hairMid); px(d,23,15,p.hairMid);
  }else if(design.hairStyle==='medium'){
    ellipse(d,cx,6.4,6.4,5.1,p.hairMid); ellipse(d,cx,6.9,5.5,4.4,p.hairLight);
    line(d,11,9,10,17,p.hairDark); line(d,10,17,10,21,p.hairMid); line(d,21,9,22,17,p.hairDark); line(d,22,17,22,21,p.hairMid);
  }else if(design.hairStyle==='long_straight'){
    ellipse(d,cx,6.6,6.2,5.3,p.hairMid); ellipse(d,cx,6.9,5.3,4.5,p.hairLight);
    line(d,11,9,10,20,p.hairDark); line(d,10,20,10,26,p.hairMid); line(d,21,9,22,20,p.hairDark); line(d,22,20,22,26,p.hairMid);
    line(d,13,11,12,23,p.hairMid); line(d,19,11,20,23,p.hairMid);
  }else{ // long_volume
    ellipse(d,cx,6.5,7.0,5.7,p.hairMid); ellipse(d,cx,6.9,6.0,4.9,p.hairLight);
    line(d,11,9,8,17,p.hairDark); line(d,8,17,7,23,p.hairMid); line(d,7,23,8,26,p.hairDark);
    line(d,21,9,24,17,p.hairDark); line(d,24,17,25,23,p.hairMid); line(d,25,23,24,26,p.hairDark);
    line(d,12,11,10,22,p.hairMid); line(d,20,11,22,22,p.hairMid);
    px(d,7,23,p.hairLight); px(d,25,23,p.hairLight);
  }
  rect(d,12,3,8,2,p.hairLight);
  px(d,12,5,p.hairLight); px(d,13,5,p.hairMid); px(d,14,5,p.hairLight); px(d,15,5,p.hairDark); px(d,16,5,p.hairMid); px(d,17,5,p.hairLight); px(d,18,5,p.hairMid); px(d,19,5,p.hairDark);
  px(d,13,6,p.hairMid); px(d,15,6,p.hairLight); px(d,16,6,p.hairLight); px(d,18,6,p.hairMid);
  line(d,12,7,11,11,p.hairMid); line(d,20,7,21,11,p.hairMid);
}
function drawFace(d,p,design){
  if(design.hasEars){ tri(d,[9,9],[6,10],[9,11],p.skin); tri(d,[23,9],[26,10],[23,11],p.skin); px(d,7,10,p.skinLight); px(d,25,10,p.skinLight); }
  if(design.faceShape==='round'){ ellipse(d,16,9.4,4.7,4.3,p.skin); ellipse(d,16,8.8,4.0,2.8,p.skinLight); }
  else { ellipse(d,16,9.2,4.2,4.5,p.skin); ellipse(d,16,8.6,3.6,3.0,p.skinLight); }
  px(d,13,12,p.blush); px(d,19,12,p.blush);
  if(design.eyeMood==='round'){
    px(d,13,9,p.eyeDark); px(d,14,9,p.eyeDark); px(d,18,9,p.eyeDark); px(d,19,9,p.eyeDark);
    px(d,13,10,p.eyeMid); px(d,14,10,p.eyeMid); px(d,18,10,p.eyeMid); px(d,19,10,p.eyeMid);
  } else if(design.eyeMood==='gentle'){
    line(d,13,10,14,9,p.eyeDark); line(d,18,9,19,10,p.eyeDark); px(d,14,10,p.eyeMid); px(d,18,10,p.eyeMid);
  } else {
    px(d,13,9,p.eyeDark); px(d,14,9,p.eyeDark); px(d,18,9,p.eyeDark); px(d,19,9,p.eyeDark); px(d,14,10,p.eyeMid); px(d,18,10,p.eyeMid);
  }
  px(d,14,9,p.eyeHi); px(d,19,9,p.eyeHi);
  px(d,12,8,p.hairDark); px(d,20,8,p.hairDark);
  px(d,15,12,mix(p.skin,[190,90,110,255],.38)); px(d,16,12,mix(p.skin,[190,90,110,255],.42));
  px(d,15,13,p.skin); px(d,16,13,p.skinLight); px(d,17,13,p.skin);
}
function drawBody(d,p,design){
  if(design.hasNecklace){ px(d,14,13,p.gold); px(d,18,13,p.gold); px(d,16,13,light(p.body,.25)); }
  // shoulders / chest
  rect(d,13,14,7,2,p.bodyLight);
  if(design.outfit==='robe'){
    rect(d,11,16,11,4,p.bodyDark); rect(d,10,20,13,3,p.body); rect(d,9,23,15,2,p.bodyLight);
  } else if(design.outfit==='dress'){
    rect(d,12,16,9,4,p.bodyDark); rect(d,11,20,11,2,p.body); rect(d,10,22,13,3,p.bodyLight); tri(d,[10,23],[16,28],[22,23],p.bodyLight);
  } else if(design.outfit==='skirt'){
    rect(d,12,16,9,4,p.bodyDark); rect(d,12,20,9,2,p.body); tri(d,[11,22],[16,25],[21,22],p.bodyLight);
  } else {
    rect(d,12,16,9,4,p.bodyDark); rect(d,13,20,7,2,p.body);
  }
  px(d,12,15,p.bodyLight); px(d,20,15,p.bodyLight); px(d,13,17,p.bodyLight); px(d,19,17,p.bodyLight);
  if(design.ornamentLevel!=='none'){ px(d,16,15,p.goldLight); px(d,15,17,p.gold); px(d,17,17,p.gold); if(design.ornamentLevel==='high'){ px(d,14,18,p.goldLight); px(d,18,18,p.goldLight); px(d,16,20,p.gold);} }
}
function drawArmsSleeves(d,p,design){
  if(design.sleeveType==='drape'){
    line(d,11,15,8,22,p.sleeve); line(d,10,16,7,23,p.sleeveLight); line(d,12,16,10,24,p.sleeve);
    line(d,21,15,24,22,p.sleeve); line(d,22,16,25,23,p.sleeveLight); line(d,20,16,22,24,p.sleeve);
    px(d,7,24,p.sleeve); px(d,25,24,p.sleeve);
  } else if(design.sleeveType==='long'){
    line(d,12,15,10,22,p.sleeve); line(d,20,15,22,22,p.sleeve); line(d,11,16,9,22,p.sleeveLight); line(d,21,16,23,22,p.sleeveLight);
  } else if(design.sleeveType==='short'){
    line(d,12,15,10,19,p.sleeve); line(d,20,15,22,19,p.sleeve); px(d,10,20,p.skin); px(d,22,20,p.skin);
  } else {
    line(d,12,15,10,19,dark(p.body,.05)); line(d,20,15,22,19,dark(p.body,.05)); px(d,10,20,p.skin); px(d,22,20,p.skin);
  }
  if(design.hasVisibleHands){ px(d,9,21,p.skinLight); px(d,10,21,p.skin); px(d,22,21,p.skin); px(d,23,21,p.skinLight); }
}
function drawLegsShoes(d,p,design){
  if(design.outfit==='dress'){
    rect(d,13,25,2,4,p.skin); rect(d,18,25,2,4,p.skin);
  } else if(design.outfit==='skirt'){
    rect(d,14,24,2,5,p.skin); rect(d,17,24,2,5,p.skin);
  } else {
    rect(d,14,22,2,7,p.leg); rect(d,17,22,2,7,p.leg); line(d,13,22,14,28,dark(p.leg,.25)); line(d,19,22,18,28,dark(p.leg,.25)); px(d,15,23,p.legLight); px(d,18,23,p.legLight); px(d,15,27,p.legLight); px(d,18,27,p.legLight);
  }
  rect(d,13,29,3,2,p.shoe); rect(d,17,29,3,2,p.shoe);
  if(design.ornamentLevel!=='none'){ px(d,14,29,p.gold); px(d,18,29,p.gold); }
}
function renderSprite32V14(res){
  ensureGroupsFromGameGroups(res);
  const design=inferDesignV14(res), p=paletteV14(res);
  const id=new ImageData(32,32), d=id.data; for(let i=0;i<d.length;i+=4){ d[i]=0; d[i+1]=0; d[i+2]=0; d[i+3]=0; }
  drawHair(d,p,design); drawFace(d,p,design); drawBody(d,p,design); drawArmsSleeves(d,p,design); drawLegsShoes(d,p,design);
  if(design.ornamentLevel==='high'){ px(d,21,6,p.gold); px(d,10,6,p.goldLight); }
  for(let x=11;x<=21;x++) blend(d,x,31,p.shadow,.8);
  outline(d,p.outline);
  res.sprite32V14={imageData:id,status:'ok',renderer:'design_adaptive_cute_v1_4',design,palette:{hair:p.hairMid,skin:p.skin,body:p.body,sleeve:p.sleeve,leg:p.leg,shoe:p.shoe},note:'different source images should now change not only color, but also hair style, outfit type, sleeve type, face shape, and ornament level'};
  res.sprite32V13=res.sprite32V14; res.sprite32V12=res.sprite32V14; res.sprite32V11=res.sprite32V14; res.sprite32V10=res.sprite32V10||{}; res.sprite32V10.imageData=id; res.sprite32V10.status='ok-design-adaptive-v1.4';
  return id;
}
function canvasV14(){ const id=state.result?.sprite32V14?.imageData || renderSprite32V14(state.result); const c=document.createElement('canvas'); c.width=32; c.height=32; c.getContext('2d').putImageData(id,0,0); return c; }
function saveLink(dataUrl,name,label){ try{ const a=document.createElement('a'); a.href=dataUrl; a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>a.remove(),400); }catch(e){} const log=qs4('pixelLog')||qs4('log'); if(log){ let box=document.getElementById('saveLinksV14'); if(!box){ box=document.createElement('div'); box.id='saveLinksV14'; box.style.marginTop='10px'; log.parentNode.appendChild(box); } const a=document.createElement('a'); a.href=dataUrl; a.download=name; a.target='_blank'; a.rel='noopener'; a.textContent=label||name; a.style.display='inline-block'; a.style.margin='6px 8px 0 0'; a.style.padding='8px 10px'; a.style.border='1px solid #58a6ff'; a.style.borderRadius='10px'; a.style.color='#58a6ff'; box.prepend(a); } }
function saveSprite32V14(){ if(!state.result){ alert('先に解析してください。'); return; } saveLink(canvasV14().toDataURL('image/png'),'sprite_front_32_v1_4_design_adaptive.png','画像を開く/保存 sprite_front_32_v1_4_design_adaptive.png'); }
function projectV14(){ const res=state.result; if(!res)return {version:VERSION_V14,status:'no_result'}; if(!res.sprite32V14)renderSprite32V14(res); return {version:VERSION_V14,type:'game_sprite_32_design_adaptive',output:{sprite:'sprite_front_32_v1_4_design_adaptive.png',size:{w:32,h:32}},renderer:'design_adaptive_cute_v1_4',design:res.sprite32V14.design,palette:res.sprite32V14.palette,goal:'different source images should produce visibly different design silhouettes, not only color changes'}; }
function saveProjectV14(){ if(!state.result){ alert('先に解析してください。'); return; } saveLink('data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(projectV14(),null,2)),'sprite_pixel_project_v1_4_design_adaptive.json','JSONを開く/保存 sprite_pixel_project_v1_4_design_adaptive.json'); }
function drawV14(){
  if(!state.result) return;
  const id=renderSprite32V14(state.result);
  const c32=qs4('cSprite32'), prev=qs4('cSpritePreview'), st=qs4('spriteStatus'), log=qs4('pixelLog');
  if(c32){ fit(c32,32,32); const ctx=c32.getContext('2d'); ctx.clearRect(0,0,32,32); ctx.putImageData(id,0,0); }
  if(prev){ fit(prev,320,320); const ctx=prev.getContext('2d'); ctx.imageSmoothingEnabled=false; ctx.fillStyle='#0b111b'; ctx.fillRect(0,0,320,320); ctx.strokeStyle='rgba(255,255,255,.08)'; for(let i=0;i<=32;i++){ ctx.beginPath(); ctx.moveTo(i*10,0); ctx.lineTo(i*10,320); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0,i*10); ctx.lineTo(320,i*10); ctx.stroke(); } const t=document.createElement('canvas'); t.width=32; t.height=32; t.getContext('2d').putImageData(id,0,0); ctx.drawImage(t,0,0,320,320); }
  if(st) st.textContent='v1.4 design adaptive ready';
  if(log){ const d=state.result.sprite32V14?.design||{}; log.textContent=`Sprite v1.4\nstatus=ok\nrenderer=design_adaptive_cute_v1_4\n\nデザイン判定:\n- hairStyle=${d.hairStyle}\n- outfit=${d.outfit}\n- sleeveType=${d.sleeveType}\n- faceShape=${d.faceShape}\n- eyeMood=${d.eyeMood}\n- ears=${!!d.hasEars}\n- necklace=${!!d.hasNecklace}\n- ornament=${d.ornamentLevel}\n\n改善内容:\n- 画像ごとの色反映だけでなく、髪型を bob / medium / long_straight / long_volume に分岐\n- 服を bodysuit / skirt / dress / robe に分岐\n- 袖を none / short / long / drape に分岐\n- 顔輪郭と目の雰囲気も分岐\n\n保存: 32x32 PNG保存 / ドット絵JSON保存`; }
}
function installV14(){
  const b1=qs4('saveSprite32'); if(b1) b1.onclick=saveSprite32V14;
  const b2=qs4('savePixelProject'); if(b2) b2.onclick=saveProjectV14;
  const oldAnalyze=(typeof analyze==='function') ? analyze : null;
  async function analyzeV14(){ if(oldAnalyze) await oldAnalyze(); try{ if(state.result) drawV14(); }catch(e){ console.warn('v1.4 draw failed',e); } }
  analyze=analyzeV14; window.analyzeV14=analyzeV14; window.renderSprite32V14=renderSprite32V14;
  const run=qs4('run'); if(run) run.onclick=analyzeV14;
  ['adjFace','adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{ const el=qs4(id); if(el) el.oninput=()=>{ state.lineAdjust={face:+(qs4('adjFace')?.value||0),shoulder:+(qs4('adjShoulder')?.value||0),waist:+(qs4('adjWaist')?.value||0),crotch:+(qs4('adjCrotch')?.value||0),ankle:+(qs4('adjAnkle')?.value||0)}; analyzeV14(); }; });
  document.title='Sprite Studio Pixel Pipeline v1.4';
  const h1=document.querySelector('h1'); if(h1) h1.textContent='Sprite Studio Pixel Pipeline v1.4';
  const sub=document.querySelector('.sub'); if(sub) sub.textContent='AIなし / Canvas + localStorageのみ。v1.4: design adaptive cute mode。画像ごとに髪型・服型・袖型まで変えます。';
  const footer=document.querySelector('.footer'); if(footer) footer.textContent='v1.4は design adaptive cute renderer です。固定テンプレから一歩進めて、現在画像の解析結果から髪型・服型・袖型・顔型を分岐させます。';
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',installV14); else installV14();
if(typeof metadata092==='function'){ const oldMeta=metadata092; metadata092=function(){ const m=oldMeta(); m.version=VERSION_V14; m.pixel_sprite_v14={status:state.result?.sprite32V14?.status || 'not_run',renderer:'design_adaptive_cute_v1_4',design:state.result?.sprite32V14?.design || null}; return m; }; }
})();
