// ===== v1.5 patch: silhouette-driven renderer =====
(function(){
'use strict';
const VERSION_V15='1.5-silhouette-driven-renderer';
function qs5(id){ return typeof qs==='function' ? qs(id) : document.getElementById(id); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function px(data,x,y,rgba){ if(x<0||y<0||x>=32||y>=32)return; const i=(y*32+x)*4; data[i]=rgba[0]; data[i+1]=rgba[1]; data[i+2]=rgba[2]; data[i+3]=rgba[3] ?? 255; }
function blend(data,x,y,rgba,a=.7){ if(x<0||y<0||x>=32||y>=32)return; const i=(y*32+x)*4; const aa=clamp(a,0,1); data[i]=Math.round(data[i]*(1-aa)+rgba[0]*aa); data[i+1]=Math.round(data[i+1]*(1-aa)+rgba[1]*aa); data[i+2]=Math.round(data[i+2]*(1-aa)+rgba[2]*aa); data[i+3]=Math.max(data[i+3],rgba[3] ?? 255); }
function rect(data,x,y,w,h,rgba){ for(let yy=y;yy<y+h;yy++) for(let xx=x;xx<x+w;xx++) px(data,xx,yy,rgba); }
function ellipse(data,cx,cy,rx,ry,rgba){ for(let y=Math.floor(cy-ry);y<=Math.ceil(cy+ry);y++) for(let x=Math.floor(cx-rx);x<=Math.ceil(cx+rx);x++){ const dx=(x-cx)/Math.max(1,rx), dy=(y-cy)/Math.max(1,ry); if(dx*dx+dy*dy<=1) px(data,x,y,rgba); } }
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
function labelToGroup(label){
  if(['front_hair','side_hair_left','side_hair_right','back_hair','hair_highlight','hair_shadow','hair_accessory','hair_ornament','hair','hair_soft','hair_tip'].includes(label)) return 'hair';
  if(['face','eyes','ears','neck','chest_skin','skin','skin_candidate'].includes(label)) return 'face';
  if(['upper_cloth','lower_cloth','torso_core','pelvis','collar','cloth','sheer','transparent_cloth','cloth_detail','cloth_shadow','cloth_highlight'].includes(label)) return 'body';
  if(['sleeve_left','sleeve_right','transparent_cloth','sheer','sheer_soft'].includes(label)) return 'sleeve';
  if(['hands','hand_candidate','arms_skin','left_arm','right_arm'].includes(label)) return 'arm_hand';
  if(['left_leg','right_leg','leg','legs'].includes(label)) return 'leg';
  if(['shoe','shoes','left_foot','right_foot','shoe_ornament'].includes(label)) return 'shoe';
  if(['cloth_ornament','body_ornament','ornament','ornament_detail','ornament_candidate','necklace','belt'].includes(label)) return 'ornament';
  return 'ignore';
}
function ensureGroupSummary(res){
  if(res?.gameGroupsV10 && !res.sprite32V10?.groups){
    try{
      res.sprite32V10=res.sprite32V10||{}; res.sprite32V10.groups={};
      for(const [k,g] of Object.entries(res.gameGroupsV10)){
        res.sprite32V10.groups[k]={label:g.label,area:g.area,parts:g.parts?.length||0,color:'#'+(g.color||[0,0,0]).map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('')};
      }
    }catch(e){}
  }
}
function getCharBbox(res){
  const w=res?.imgData?.width||state.w||1, h=res?.imgData?.height||state.h||1;
  const b=res?.pre?.bbox||res?.lines?.bbox||{minx:0,miny:0,maxx:w-1,maxy:h-1,w,h};
  return {minx:b.minx??0,miny:b.miny??0,maxx:b.maxx??((b.minx??0)+(b.w??w)-1),maxy:b.maxy??((b.miny??0)+(b.h??h)-1),w:b.w??((b.maxx??w-1)-(b.minx??0)+1),h:b.h??((b.maxy??h-1)-(b.miny??0)+1)};
}
function buildPointGroups(res){
  const img=res.imgData||{width:state.w||1,height:state.h||1};
  const groups={};
  ['hair','face','body','sleeve','arm_hand','leg','shoe','ornament','ignore'].forEach(g=>groups[g]={name:g,points:[],minx:1e9,miny:1e9,maxx:-1,maxy:-1,area:0});
  for(const r of (res.candidates||[])){
    let g=labelToGroup(r.label||'unknown');
    if(g==='ignore') continue;
    if(r.pixelAction0914==='omit' && !['hair','face','body','leg','shoe'].includes(g)) continue;
    const bucket=groups[g];
    let added=0;
    if(Array.isArray(r.pixels) && r.pixels.length){
      const step=Math.max(1,Math.ceil(r.pixels.length/5000));
      for(let i=0;i<r.pixels.length;i+=step){
        const p=r.pixels[i], x=p%img.width, y=(p/img.width)|0;
        bucket.points.push([x,y]); added++;
        if(x<bucket.minx)bucket.minx=x; if(y<bucket.miny)bucket.miny=y; if(x>bucket.maxx)bucket.maxx=x; if(y>bucket.maxy)bucket.maxy=y;
      }
    }else{
      const minx=r.minx??0,miny=r.miny??0,maxx=r.maxx??(minx+(r.w??0)-1),maxy=r.maxy??(miny+(r.h??0)-1);
      const sx=Math.max(1,Math.ceil((maxx-minx+1)/24)), sy=Math.max(1,Math.ceil((maxy-miny+1)/24));
      for(let y=miny;y<=maxy;y+=sy)for(let x=minx;x<=maxx;x+=sx){
        bucket.points.push([x,y]); added++;
        if(x<bucket.minx)bucket.minx=x; if(y<bucket.miny)bucket.miny=y; if(x>bucket.maxx)bucket.maxx=x; if(y>bucket.maxy)bucket.maxy=y;
      }
    }
    bucket.area += r.area || added;
  }
  for(const g of Object.values(groups)){
    if(!g.points.length){ g.minx=0;g.miny=0;g.maxx=0;g.maxy=0;g.w=0;g.h=0; }
    else { g.w=g.maxx-g.minx+1; g.h=g.maxy-g.miny+1; g.cx=(g.minx+g.maxx)/2; g.cy=(g.miny+g.maxy)/2; }
  }
  return groups;
}
function palette(res){
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
function inferDesign(res,pg){
  const bb=getCharBbox(res), hair=pg.hair, body=pg.body, sleeve=pg.sleeve, leg=pg.leg, ornament=pg.ornament, face=pg.face;
  const hairHeightRatio=hair.h/Math.max(1,bb.h), hairWidthRatio=hair.w/Math.max(1,bb.w);
  const bodyLegRatio=body.area/Math.max(1,leg.area);
  let hairStyle='medium';
  if(hairHeightRatio>.42 && hairWidthRatio>.52) hairStyle='long_volume';
  else if(hairHeightRatio>.38) hairStyle='long_straight';
  else if(hairHeightRatio>.24) hairStyle='medium';
  else hairStyle='bob';
  let outfit='bodysuit';
  const sleeveRatio=sleeve.area/Math.max(1,body.area);
  if(sleeveRatio>.28 && bodyLegRatio>1.4) outfit='robe';
  else if(bodyLegRatio>2.5) outfit='dress';
  else if(bodyLegRatio>1.45) outfit='skirt';
  let sleeveType='none';
  if(sleeveRatio>.35) sleeveType='drape';
  else if(sleeveRatio>.16) sleeveType='long';
  else if(sleeveRatio>.04) sleeveType='short';
  const hasEars=(res.candidates||[]).some(r=>r.label==='ears') || hairWidthRatio>.50 && face.area>200;
  const ornamentLevel=ornament.area>120?'high':(ornament.area>20?'low':'none');
  const faceShape=face.area>2800?'round':'oval';
  const eyeMood=outfit==='robe'?'gentle':(hairStyle==='bob'?'round':'normal');
  return {hairStyle,outfit,sleeveType,hasEars,ornamentLevel,faceShape,eyeMood,metrics:{hairHeightRatio:+hairHeightRatio.toFixed(3),hairWidthRatio:+hairWidthRatio.toFixed(3),bodyLegRatio:+bodyLegRatio.toFixed(3),sleeveRatio:+sleeveRatio.toFixed(3),areas:{hair:hair.area,body:body.area,sleeve:sleeve.area,leg:leg.area,face:face.area,ornament:ornament.area}}};
}
function makeProfile(group, top, bottom, center=16, minHalf=1, maxHalf=13, expand=1.0){
  const H=bottom-top+1, rows=Array.from({length:H},()=>({min:999,max:-999,count:0}));
  if(!group.points.length || !group.h) return null;
  const targetW=clamp(Math.round((group.w/Math.max(1,group.h))*H*expand),minHalf*2,maxHalf*2);
  const sx=targetW/Math.max(1,group.w), sy=H/Math.max(1,group.h);
  for(const [x,y] of group.points){
    const yy=clamp(Math.round(top+(y-group.miny)*sy),top,bottom);
    const xx=clamp(Math.round(center+(x-group.cx)*sx),0,31);
    const r=rows[yy-top]; if(xx<r.min)r.min=xx; if(xx>r.max)r.max=xx; r.count++;
  }
  // interpolate empty rows
  for(let i=0;i<rows.length;i++){
    if(rows[i].count) continue;
    let a=i-1,b=i+1; while(a>=0&&!rows[a].count)a--; while(b<rows.length&&!rows[b].count)b++;
    if(a>=0&&b<rows.length){ rows[i].min=Math.round((rows[a].min+rows[b].min)/2); rows[i].max=Math.round((rows[a].max+rows[b].max)/2); rows[i].count=1; }
    else if(a>=0){ rows[i].min=rows[a].min; rows[i].max=rows[a].max; rows[i].count=1; }
    else if(b<rows.length){ rows[i].min=rows[b].min; rows[i].max=rows[b].max; rows[i].count=1; }
  }
  // smooth jagged ranges
  for(let i=1;i<rows.length-1;i++){
    if(!rows[i].count) continue;
    rows[i].min=Math.round((rows[i-1].min+rows[i].min+rows[i+1].min)/3);
    rows[i].max=Math.round((rows[i-1].max+rows[i].max+rows[i+1].max)/3);
  }
  return {top,bottom,rows,targetW};
}
function drawProfile(data,prof,col,alpha=1,edgeCol=null){
  if(!prof) return;
  for(let i=0;i<prof.rows.length;i++){
    const r=prof.rows[i]; if(!r.count)continue;
    const y=prof.top+i, min=clamp(r.min,0,31), max=clamp(r.max,0,31);
    for(let x=min;x<=max;x++) alpha>=1?px(data,x,y,col):blend(data,x,y,col,alpha);
    if(edgeCol){ px(data,min,y,edgeCol); px(data,max,y,edgeCol); }
  }
}
function profHalfAt(prof,y,fallback=4){
  if(!prof || y<prof.top || y>prof.bottom) return fallback;
  const r=prof.rows[y-prof.top]; if(!r||!r.count) return fallback;
  return Math.max(1,Math.round((r.max-r.min+1)/2));
}
function drawSourceSilhouetteSprite(res){
  ensureGroupSummary(res);
  const pg=buildPointGroups(res), design=inferDesign(res,pg), p=palette(res);
  const id=new ImageData(32,32), d=id.data; for(let i=0;i<d.length;i+=4){d[i]=0;d[i+1]=0;d[i+2]=0;d[i+3]=0;}
  const hairBottom={bob:14,medium:21,long_straight:26,long_volume:26}[design.hairStyle]||21;
  const hairProf=makeProfile(pg.hair,2,hairBottom,16,4,design.hairStyle==='long_volume'?13:11,design.hairStyle==='bob'?1.35:1.1);
  const sleeveProf=makeProfile(pg.sleeve,14,design.sleeveType==='drape'?25:22,16,2,14,1.35);
  const bodyBottom={bodysuit:22,skirt:24,dress:25,robe:25}[design.outfit]||22;
  const bodyProf=makeProfile(pg.body,14,bodyBottom,16,3,design.outfit==='bodysuit'?7:10,1.0);
  const legTop=design.outfit==='bodysuit'?22:(design.outfit==='skirt'?24:25);
  const legProf=makeProfile(pg.leg,legTop,29,16,1,5,0.55);
  const shoeProf=makeProfile(pg.shoe,29,30,16,2,5,1.0);

  // Layer 1: source-driven silhouettes
  drawProfile(d,hairProf,p.hairMid,1,p.hairDark);
  // bring hair highlights into upper rows
  if(hairProf){ for(let y=hairProf.top;y<=Math.min(hairProf.top+6,hairProf.bottom);y++){ const half=profHalfAt(hairProf,y,5); for(let x=16-half+2;x<=16+half-2;x+=3) blend(d,x,y,p.hairLight,.65); } }
  if(sleeveProf && design.sleeveType!=='none') drawProfile(d,sleeveProf,p.sleeve,.84,p.sleeveLight);
  if(legProf) drawProfile(d,legProf,p.leg,1,dark(p.leg,.25));
  if(bodyProf) drawProfile(d,bodyProf,p.body,1,p.bodyDark);
  if(shoeProf) drawProfile(d,shoeProf,p.shoe,1,p.gold);

  // Layer 2: cute readability anchors. These do not erase silhouette, only stabilize face/readability.
  if(design.hasEars){ tri(d,[9,9],[6,10],[9,11],p.skin); tri(d,[23,9],[26,10],[23,11],p.skin); px(d,7,10,p.skinLight); px(d,25,10,p.skinLight); }
  if(design.faceShape==='round'){ ellipse(d,16,9.4,4.7,4.3,p.skin); ellipse(d,16,8.8,4.0,2.8,p.skinLight); }
  else { ellipse(d,16,9.2,4.2,4.5,p.skin); ellipse(d,16,8.6,3.6,3.0,p.skinLight); }
  px(d,13,12,p.blush); px(d,19,12,p.blush);
  // bangs over face, source-driven width
  const bangHalf=hairProf?clamp(profHalfAt(hairProf,5,5),4,7):5;
  rect(d,16-bangHalf,3,bangHalf*2,2,p.hairLight);
  for(let x=16-bangHalf;x<=16+bangHalf-1;x+=2) px(d,x,5,(x%4===0)?p.hairDark:p.hairMid);
  px(d,13,9,p.eyeDark); px(d,14,9,p.eyeDark); px(d,18,9,p.eyeDark); px(d,19,9,p.eyeDark);
  px(d,14,10,p.eyeMid); px(d,18,10,p.eyeMid); px(d,14,9,p.eyeHi); px(d,19,9,p.eyeHi);
  px(d,15,12,mix(p.skin,[190,90,110,255],.38)); px(d,16,12,mix(p.skin,[190,90,110,255],.42));
  px(d,15,13,p.skin); px(d,16,13,p.skinLight); px(d,17,13,p.skin);
  if(design.ornamentLevel!=='none'){ px(d,16,13,p.gold); px(d,16,15,p.goldLight); px(d,15,17,p.gold); px(d,17,17,p.gold); if(design.ornamentLevel==='high'){px(d,14,18,p.goldLight);px(d,18,18,p.goldLight);px(d,16,20,p.gold);} }
  // Hands at sleeve/body endpoints
  if(design.sleeveType!=='none'){ px(d,9,21,p.skinLight); px(d,10,21,p.skin); px(d,22,21,p.skin); px(d,23,21,p.skinLight); }
  else { px(d,10,20,p.skin); px(d,22,20,p.skin); }
  // Shoes fallback/readability
  if(!shoeProf){ rect(d,13,29,3,2,p.shoe); rect(d,17,29,3,2,p.shoe); }
  if(design.ornamentLevel!=='none'){ px(d,14,29,p.gold); px(d,18,29,p.gold); }
  for(let x=11;x<=21;x++) blend(d,x,31,p.shadow,.8);
  outline(d,p.outline);
  res.sprite32V15={imageData:id,status:'ok',renderer:'silhouette_driven_v1_5',design,profiles:{hair:!!hairProf,sleeve:!!sleeveProf,body:!!bodyProf,leg:!!legProf,shoe:!!shoeProf},note:'uses source group silhouette profiles projected into 32x32 zones, so shape should differ per image'};
  res.sprite32V14=res.sprite32V15; res.sprite32V13=res.sprite32V15; res.sprite32V12=res.sprite32V15; res.sprite32V11=res.sprite32V15; res.sprite32V10=res.sprite32V10||{}; res.sprite32V10.imageData=id; res.sprite32V10.status='ok-silhouette-v1.5';
  return id;
}
function canvasV15(){ const id=state.result?.sprite32V15?.imageData || drawSourceSilhouetteSprite(state.result); const c=document.createElement('canvas'); c.width=32; c.height=32; c.getContext('2d').putImageData(id,0,0); return c; }
function saveLink(dataUrl,name,label){ try{ const a=document.createElement('a'); a.href=dataUrl; a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>a.remove(),400); }catch(e){} const log=qs5('pixelLog')||qs5('log'); if(log){ let box=document.getElementById('saveLinksV15'); if(!box){ box=document.createElement('div'); box.id='saveLinksV15'; box.style.marginTop='10px'; log.parentNode.appendChild(box); } const a=document.createElement('a'); a.href=dataUrl; a.download=name; a.target='_blank'; a.rel='noopener'; a.textContent=label||name; a.style.display='inline-block'; a.style.margin='6px 8px 0 0'; a.style.padding='8px 10px'; a.style.border='1px solid #58a6ff'; a.style.borderRadius='10px'; a.style.color='#58a6ff'; box.prepend(a); } }
function saveSprite32V15(){ if(!state.result){ alert('先に解析してください。'); return; } saveLink(canvasV15().toDataURL('image/png'),'sprite_front_32_v1_5_silhouette.png','画像を開く/保存 sprite_front_32_v1_5_silhouette.png'); }
function projectV15(){ const res=state.result; if(!res)return {version:VERSION_V15,status:'no_result'}; if(!res.sprite32V15)drawSourceSilhouetteSprite(res); return {version:VERSION_V15,type:'game_sprite_32_silhouette_driven',output:{sprite:'sprite_front_32_v1_5_silhouette.png',size:{w:32,h:32}},renderer:'silhouette_driven_v1_5',design:res.sprite32V15.design,profiles:res.sprite32V15.profiles,goal:'source image silhouette changes hair/body/sleeve/leg shape, not only color'}; }
function saveProjectV15(){ if(!state.result){ alert('先に解析してください。'); return; } saveLink('data:application/json;charset=utf-8,'+encodeURIComponent(JSON.stringify(projectV15(),null,2)),'sprite_pixel_project_v1_5_silhouette.json','JSONを開く/保存 sprite_pixel_project_v1_5_silhouette.json'); }
function drawV15(){
  if(!state.result)return;
  const id=drawSourceSilhouetteSprite(state.result);
  const c32=qs5('cSprite32'), prev=qs5('cSpritePreview'), st=qs5('spriteStatus'), log=qs5('pixelLog');
  if(c32){ fit(c32,32,32); const ctx=c32.getContext('2d'); ctx.clearRect(0,0,32,32); ctx.putImageData(id,0,0); }
  if(prev){ fit(prev,320,320); const ctx=prev.getContext('2d'); ctx.imageSmoothingEnabled=false; ctx.fillStyle='#0b111b'; ctx.fillRect(0,0,320,320); ctx.strokeStyle='rgba(255,255,255,.08)'; for(let i=0;i<=32;i++){ctx.beginPath();ctx.moveTo(i*10,0);ctx.lineTo(i*10,320);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i*10);ctx.lineTo(320,i*10);ctx.stroke();} const t=document.createElement('canvas'); t.width=32; t.height=32; t.getContext('2d').putImageData(id,0,0); ctx.drawImage(t,0,0,320,320); }
  if(st) st.textContent='v1.5 silhouette ready';
  if(log){ const s=state.result.sprite32V15||{}, d=s.design||{}, pr=s.profiles||{}; log.textContent=`Sprite v1.5\nstatus=ok\nrenderer=silhouette_driven_v1_5\n\n形状判定:\n- hairStyle=${d.hairStyle}\n- outfit=${d.outfit}\n- sleeveType=${d.sleeveType}\n- faceShape=${d.faceShape}\n- ornament=${d.ornamentLevel}\n\nシルエット使用:\n- hair=${!!pr.hair}\n- sleeve=${!!pr.sleeve}\n- body=${!!pr.body}\n- leg=${!!pr.leg}\n- shoe=${!!pr.shoe}\n\n改善内容:\n- 色/面積だけでなく、各部位のソース輪郭を32x32用ゾーンへ再投影\n- 髪、袖、服、脚、靴の外形が画像ごとに変化\n- 顔/目は可愛さ維持のためテンプレ補正\n\n保存: 32x32 PNG保存 / ドット絵JSON保存`; }
}
function installV15(){
  const b1=qs5('saveSprite32'); if(b1)b1.onclick=saveSprite32V15;
  const b2=qs5('savePixelProject'); if(b2)b2.onclick=saveProjectV15;
  const oldAnalyze=(typeof analyze==='function')?analyze:null;
  async function analyzeV15(){ if(oldAnalyze)await oldAnalyze(); try{ if(state.result)drawV15(); }catch(e){console.warn('v1.5 draw failed',e);} }
  analyze=analyzeV15; window.analyzeV15=analyzeV15; window.renderSprite32V15=drawSourceSilhouetteSprite;
  const run=qs5('run'); if(run)run.onclick=analyzeV15;
  ['adjFace','adjShoulder','adjWaist','adjCrotch','adjAnkle'].forEach(id=>{ const el=qs5(id); if(el)el.oninput=()=>{state.lineAdjust={face:+(qs5('adjFace')?.value||0),shoulder:+(qs5('adjShoulder')?.value||0),waist:+(qs5('adjWaist')?.value||0),crotch:+(qs5('adjCrotch')?.value||0),ankle:+(qs5('adjAnkle')?.value||0)}; analyzeV15();};});
  document.title='Sprite Studio Pixel Pipeline v1.5';
  const h1=document.querySelector('h1'); if(h1)h1.textContent='Sprite Studio Pixel Pipeline v1.5';
  const sub=document.querySelector('.sub'); if(sub)sub.textContent='AIなし / Canvas + localStorageのみ。v1.5: silhouette-driven。部位の輪郭形状を32x32へ再投影します。';
  const footer=document.querySelector('.footer'); if(footer)footer.textContent='v1.5は silhouette-driven renderer です。固定テンプレではなく、髪・袖・服・脚・靴の入力シルエットをゲーム用32x32へ再構成します。';
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installV15); else installV15();
if(typeof metadata092==='function'){ const oldMeta=metadata092; metadata092=function(){ const m=oldMeta(); m.version=VERSION_V15; m.pixel_sprite_v15={status:state.result?.sprite32V15?.status||'not_run',renderer:'silhouette_driven_v1_5',design:state.result?.sprite32V15?.design||null,profiles:state.result?.sprite32V15?.profiles||null}; return m; }; }
})();
