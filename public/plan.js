/* TachoGuard shift planner.
   Plans live in st.plan (one-off shifts), st.pat (weekly repeating patterns), st.plx (pattern days removed),
   st.pls (status of an occurrence: 'done' or 'skip'). Past days use what was actually logged. */
const PL={m:null,cache:null};
const pdt=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d).getTime()};
const tmin=s=>{const[h,m]=String(s||'0:0').split(':').map(Number);return(h||0)*60+(m||0)};
const plId=()=>'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const dlong=t=>new Date(t).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
const ordW=v=>(v||1)===1?'every week':v===2?'every other week':'every '+(['','','','third','fourth','fifth','sixth'][v]||v+'th')+' week';
const ct=t=>{t=String(t).slice(0,5);return t.endsWith(':00')?String(+t.slice(0,2)):String(+t.slice(0,2))+':'+t.slice(3)};
const hmx=(t,base)=>hm(t)+(sod(t)>sod(base)?' (+1)':'');

function plOcc(from,to){const out=[],X=new Set(st.plx||[]),S=st.pls||{};
 (st.plan||[]).forEach(p=>{const s=pdt(p.d)+tmin(p.s)*M;let e=pdt(p.d)+tmin(p.e)*M;if(e<=s)e=nxd(pdt(p.d))+tmin(p.e)*M;if(e>from&&s<to)out.push(Object.assign({},p,{S:s,E:e,oid:p.id,st:S[p.id]}))});
 (st.pat||[]).forEach(r=>{let d=Math.max(pdt(r.from),sod(from-864e5));const end=Math.min(to,r.to?nxd(pdt(r.to)):to);
  for(;d<end;d=nxd(d)){const wd=(new Date(d).getDay()+6)%7;if(!r.days.includes(wd))continue;if((r.ev||1)>1&&Math.round((wkS(d)-wkS(pdt(r.from)))/(7*864e5))%r.ev!==0)continue;const ds=ymd(d),oid=r.id+'|'+ds;if(X.has(oid))continue;
   const s=d+tmin(r.s)*M;let e=d+tmin(r.e)*M;if(e<=s)e=nxd(d)+tmin(r.e)*M;if(e>from&&s<to)out.push({id:oid,pat:r.id,d:ds,j:r.j,s:r.s,e:r.e,br:r.br,dr:r.dr,S:s,E:e,oid,st:S[oid]})}});
 return out.sort((a,b)=>a.S-b.S)}

/* Spans: logged activity (not rest) plus planned shifts that have not happened yet. */
function plSpans(extra,skipId){const n=Date.now(),sp=[];
 /* the checks only look back to the start of the working time period and the fortnight before this week, so older logs are left out (much faster with a year of records) */
 const cut=Math.min(refP(n).s,wkS(n)-21*864e5);
 all().forEach(x=>{if(x.t==='r'||x.e<cut)return;sp.push({s:x.s,e:Math.min(x.e,n),w:x.t==='p'?0:x.e-x.s,dv:x.t==='d'?Math.min(x.e,n)-x.s:0,tc:x.t==='d'||onCard(x),log:1})});
 const lastLog=sp.length?Math.max(...sp.map(x=>x.e)):0;
 plOcc(n-14*864e5,n+400*864e5).forEach(o=>{if(o.oid===skipId||o.st==='skip'||o.st==='done')return;if(o.E<=n)return;
  const s=Math.max(o.S,o.S<n?Math.max(n,lastLog):o.S);if(o.E<=s)return;const j=jobC(o.j),tc=j.tc!==false,w=Math.max(0,o.E-s-(o.br||0)*M);
  sp.push({s,e:o.E,w,dv:tc?Math.min(w,(o.dr||0)*H):0,tc,br:o.br||0,id:o.oid,o})});
 if(extra)sp.push(extra);
 return sp.sort((a,b)=>a.s-b.s)}

/* Rule check over the whole timeline. Returns {issues: Map spanKey -> [{lv,t}]} for planned spans. */
function plCheck(sp){const I=new Map(),add=(x,lv,t)=>{if(x.log)return;const k=x.id||'x';if(!I.has(k))I.set(k,[]);const L=I.get(k);if(!L.some(y=>y.t===t))L.push({lv,t})};
 if(!sp.length)return I;
 /* group into shifts: a gap of 9h or more ends a shift */
 const SH=[];sp.forEach((x,i)=>{if(!i||x.s-sp[i-1].e>=9*H)SH.push({s:x.s,e:x.e,w:0,dv:0,sp:[],gap:i?x.s-sp[i-1].e:Infinity});const c=SH[SH.length-1];c.e=Math.max(c.e,x.e);c.w+=x.w;c.dv+=x.dv;c.sp.push(x)});
 /* weekly rest anchor */
 const WI=typeof wrInfo==='function'?wrInfo():null;let lastWE=WI&&WI.anc!==null&&WI.lastEnd?WI.lastEnd:null,prevRed=WI&&WI.anc!==null?!!WI.full45:false,redD=0;
 if(lastWE===null)lastWE=SH[0].s;
 SH.forEach((c,ci)=>{const pl=c.sp.filter(x=>!x.log),first=c.sp[0];
  /* rest before this shift */
  const regAhead=dl=>{for(let k=ci+1;k<SH.length;k++){const gs2=SH[k].s-SH[k].gap;if(gs2>dl)return false;if(SH[k].gap>=45*H)return true}return SH[SH.length-1].e<=dl};
  if(ci&&c.gap>=24*H&&!(c.gap<45*H&&regAhead(lastWE+144*H))){const len=c.gap,gs=c.s-len;
   if(gs>lastWE+144*H)c.sp.forEach(x=>add(x,'r','Your weekly rest had to start by '+dlong(lastWE+144*H)+' '+hm(lastWE+144*H)+' (6 days after the last one), but it starts later.'));
   if(len<45*H){if(prevRed)add(first,'r','The rest before this shift is only '+fmt(len)+'. After a reduced weekly rest, the next one must be a full 45 hours.');
    else add(first,'a','The rest before this shift ('+fmt(len)+') is a reduced weekly rest. You must pay back '+fmt(45*H-len)+' by the end of '+dlong(add7(wkS(gs),4)-6e4)+'.');
    prevRed=true}else prevRed=false;
   lastWE=c.s;redD=0}
  else if(ci&&c.gap<11*H){redD++;add(first,redD>3?'r':'a',redD>3?'This is your '+redD+'th reduced daily rest ('+fmt(c.gap)+') since your weekly rest. Only 3 are allowed.':'Only '+fmt(c.gap)+' rest before this shift: a reduced daily rest ('+redD+' of 3 since your weekly rest).')}
  /* 6 day rule: work running past the weekly rest deadline */
  if(c.e>lastWE+144*H)c.sp.forEach(x=>{if(x.e>lastWE+144*H)add(x,'r','Your weekly rest must start by '+dlong(lastWE+144*H)+' '+hm(lastWE+144*H)+' (6 days after your last one). This shift runs past it.')});
  /* daily rest inside 24h of shift start */
  const len=c.e-c.s;if(len>15*H)pl.forEach(x=>add(x,'r','This shift spreads over '+fmt(len)+' from '+hm(c.s)+'. You need at least a 9 hour rest within 24 hours, so a shift can spread over 15 hours at most.'));
  else if(len>13*H)pl.forEach(x=>add(x,'a','This shift spreads over '+fmt(len)+'. That only leaves room for a reduced 9 hour daily rest.'));
  /* night work: any work between 00:00 and 04:00 limits work to 10h */
  const night=c.sp.some(x=>{for(let d=sod(x.s);d<x.e;d=nxd(d)){if(x.s<d+4*H&&x.e>d)return true}return false});
  if(night&&c.w>10*H)pl.forEach(x=>add(x,'r','Part of this shift is between 00:00 and 04:00, so working time is limited to 10 hours (this has '+fmt(c.w)+'). Only a workforce or collective agreement can extend it.'));
  else if(night)pl.forEach(x=>add(x,'i','Night work (00:00 to 04:00): working time is limited to 10 hours in 24 hours.'));
  /* working time breaks */
  pl.forEach(x=>{if(x.w>9*H&&x.br<45)add(x,'a','Over 9 hours of work needs at least 45 minutes of breaks in total (you have '+(x.br||0)+' min planned).');else if(x.w>6*H&&x.br<30)add(x,'a','Over 6 hours of work needs at least a 30 minute break (you have '+(x.br||0)+' min planned).')});
  /* driving per shift */
  if(c.dv>10*H)pl.forEach(x=>add(x,'r','Driving of '+fmt(c.dv)+' is over the 10 hour daily maximum.'));
  else if(c.dv>9*H)pl.forEach(x=>add(x,'a','Driving over 9 hours uses one of your two 10 hour days this week.'));
  pl.forEach(x=>{if(x.dv>270*M)add(x,'i','Plan a 45 minute break (or 15 then 30) by 4h 30m of driving.')});
  c.ext=c.dv>9*H});
 /* weekly totals: working time 60h, driving 56h, fortnight 90h, 10h days */
 const W={};const wk=(t)=>wkS(t);sp.forEach(x=>{let a=x.s;while(a<x.e){const w0=wk(a),w1=nwk(w0),b=Math.min(x.e,w1),f=(b-a)/(x.e-x.s||1);const o=W[w0]=W[w0]||{w:0,d:0,sp:[],ext:0};o.w+=x.w*f;o.d+=x.dv*f;o.sp.push(x);a=b}});
 SH.forEach(c=>{if(c.ext){const o=W[wk(c.s)];if(o)o.ext++}});
 Object.keys(W).map(Number).sort((a,b)=>a-b).forEach(k=>{const o=W[k],pr=W[k-7*864e5]||W[wkS(k-3*864e5)];
  if(o.w>60*H)o.sp.forEach(x=>add(x,'r','Working time in the week of '+dlong(k)+' would be '+fmt(o.w)+', over the 60 hour weekly maximum.'));
  if(o.d>56*H)o.sp.forEach(x=>add(x,'r','Driving in the week of '+dlong(k)+' would be '+fmt(o.d)+', over 56 hours.'));
  if(pr&&o.d+pr.d>90*H)o.sp.forEach(x=>add(x,'r','Driving over this week and last would be '+fmt(o.d+pr.d)+', over the 90 hour fortnight limit.'));
  if(o.ext>2)o.sp.forEach(x=>{if(x.dv>9*H)add(x,'r','More than two 10 hour driving days in the week of '+dlong(k)+'.')})});
 /* 48h average over the reference period, with planned hours */
 const per={};sp.forEach(x=>{if(x.log)return;const P=refP(x.s),k=P.s;(per[k]=per[k]||{P,sp:[]}).sp.push(x)});
 Object.values(per).forEach(({P,sp:ps})=>{let tot=0;sp.forEach(x=>{tot+=x.w*Math.max(0,Math.min(x.e,P.e)-Math.max(x.s,P.s))/((x.e-x.s)||1)});
  const b=st.rpb&&st.rpb.p===P.s?st.rpb:null;if(b){const span=Math.max(0,(b.to-P.s)/(7*864e5)),lw=Math.min(span,(b.lv||0)/5);tot+=(b.avg||0)*H*Math.max(0,span-lw)+(b.lv||0)*8*H}
  const C=Math.max(1,Math.round((P.e-P.s)/(7*864e5)));if(tot>48*H*C)ps.forEach(x=>add(x,'a','With your planned shifts, the average for the period '+dlong(P.s)+' to '+dlong(P.e-864e5)+' would be '+fmt(tot/C)+' a week, over 48 hours.'))});
 return I}

const LVO={r:3,a:2,i:1},worst=L=>(L||[]).reduce((m,x)=>Math.max(m,LVO[x.lv]||0),0);

/* What could you work on a free day? */
function plFree(d,base,baseI){const n=Date.now(),D0=Math.max(d,n),D1=nxd(d);if(D1<=n)return null;
 const prev=base.filter(x=>x.s<D1).reduce((m,x)=>Math.max(m,x.e),0),nxt=base.filter(x=>x.s>=Math.max(D0,prev)).reduce((m,x)=>Math.min(m,x.s),Infinity);
 if(base.some(x=>x.s<D1&&x.e>D0))return null;
 const ea=Math.max(D0,prev?prev+11*H:D0),laR=nxt===Infinity?Infinity:nxt-11*H,la=Math.min(laR,ea+15*H);
 if(ea>=D1)return{lv:3,ea,la,txt:'No start time today leaves an 11 hour rest after your last shift.',R:[]};
 const win=Math.min(la,D1+15*H)-ea;if(win<4*H)return{lv:3,ea,la,txt:win>0?'Only '+fmt(win)+' between the rests you need around your other shifts.':'No room between the rests you need around your other shifts.',R:[]};
 const s0=ea<d+4*H&&la-(d+4*H)>=8*H?d+4*H:ea,e0=Math.min(s0+12*H,la),tj=jobs().find(j=>j.tc!==false)||jobs()[0],w=e0-s0-(e0-s0>9*H?45:30)*M;
 const hyp={s:s0,e:e0,w,dv:Math.min(w,9*H),tc:tj.tc!==false,br:e0-s0>9*H?45:30,id:'hyp'};
 const I=plCheck(base.concat([hyp]).sort((a,b)=>a.s-b.s)),R=[];
 I.forEach((L,k)=>{L.forEach(x=>{if(x.lv==='i')return;if(k==='hyp')R.push(x);else if(!(baseI.get(k)||[]).some(y=>y.t===x.t)){const o=base.find(z=>z.id===k);R.push({lv:x.lv,t:'Knock-on for your '+(o&&o.o?esc(jobC(o.o.j).n)+' shift on '+dlong(o.s):'next shift')+': '+x.t})}})});
 return{lv:Math.max(1,worst(R)),ea,la:laR,s0,e0,R,txt:''}}

/* Where your next weekly rests are likely to fall, from what you have logged plus your plan. Each one is the first gap of 24 hours or more
   that starts before the 6 day deadline (a full 45h gap is preferred over a shorter one, as in the weekly rest card). */
function plRests(sp){const I=typeof wrInfo==='function'?wrInfo():null;if(!I||I.anc===null||I.inWr)return[];
 const L=sp.slice().sort((a,b)=>a.s-b.s).filter(x=>x.e>I.lastEnd),G=[];let cur=null;
 /* only gaps between one activity and the next count: the time before your first shift since your last rest is that rest, not a new one */
 L.forEach(x=>{if(cur!==null&&x.s>cur)G.push({s:cur,e:x.s,len:x.s-cur});cur=cur===null?x.e:Math.max(cur,x.e)});
 G.push({s:cur===null?Math.max(Date.now(),I.lastEnd):cur,e:Infinity,len:Infinity,open:1});
 const out=[];let le=I.lastEnd;
 for(let k=0;k<8;k++){const due=le+144*H,ok=G.filter(g=>g.s>=le&&g.s<=due&&g.len>=24*H),g=ok.find(g=>g.len>=45*H)||ok[0];
  if(!g){out.push({miss:1,due});break}
  out.push({s:g.s,e:g.e,len:g.len,full:g.len>=45*H,open:!!g.open,due});if(g.open)break;le=g.e}
 return out}
function plRestTag(d,WR){const f=WR[0],r=WR.find(x=>!x.miss&&x.s<nxd(d)&&x.e>d);let t='';
 if(r)t+=`<div class="plr ${r.full?'ok':'warn'}">Rest</div>`;
 if(f&&sod(f.due)===d)t+=`<div class="plr ${f.miss?'bad':'mut'}">⚑ ${hm(f.due).slice(0,5)}</div>`;
 return t}
function plRestNote(d,WR){const f=WR[0],r=WR.find(x=>!x.miss&&x.s<nxd(d)&&x.e>d);let t='';
 if(r)t+=`<div class="bx" style="margin-top:8px;border-left:4px solid var(--${r.full?'ok':'warn'})"><div class="lbl">Weekly rest</div><div class="note">${r.open?'From '+dmy(r.s)+', with nothing planned after that':dmy(r.s)+' to '+dmy(r.e)+' ('+fmt(r.len)+')'}. ${r.full?'A full weekly rest (45h or more).':'Only a reduced rest. You would owe '+fmt(45*H-r.len)+', paid back in one block within 3 weeks.'}</div></div>`;
 if(f&&sod(f.due)===d)t+=`<div class="bx" style="margin-top:8px;border-left:4px solid var(--${f.miss?'bad':'mut'})"><div class="lbl">⚑ Weekly rest must start by ${hm(f.due)}</div><div class="note">${f.miss?'Nothing in your plan leaves a gap of 24 hours or more before this. Free up time or move a shift.':'That is six 24 hour periods after your last weekly rest ended.'}</div></div>`;
 return t}
function plMonth(){if(!PL.m){const t=new Date(sod(Date.now()));t.setDate(1);PL.m=t.getTime()}return PL.m}
function plRender(){const el=$('plc');if(!el)return;const m0=plMonth(),md=new Date(m0),n=Date.now();
 const gs=wkS(m0),me=new Date(md.getFullYear(),md.getMonth()+1,1).getTime(),ge=nwk(wkS(me-864e5));
 const sp=plSpans(),I=plCheck(sp),occ=plOcc(gs,ge),WR=plRests(sp),T=typeof dayTot==='function'?dayTot():{};
 let h=(typeof oweBanner==='function'?oweBanner(wrInfo()):'')+`<div class="tr" style="margin:0 0 8px"><button class="tg" data-pm="-1" aria-label="Previous month">‹</button><b style="flex:1;text-align:center;font-size:17px">${md.toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</b><button class="tg" data-pm="1" aria-label="Next month">›</button></div><div class="tr" style="margin:0 0 10px;gap:6px;flex-wrap:wrap"><button class="tg" data-pm="0">This month</button><button class="tg" data-pa="1">Add shift</button><button class="tg" data-pp="1">Repeating shifts</button></div>`;
 h+='<div class="plg">'+['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<div class="plh">${x}</div>`).join('');
 let shown=0;const wk0=wkS(n);
 for(let d=gs;d<ge||(shown<42&&ge>n);d=nxd(d)){if((new Date(d).getDay()+6)%7===0&&d<wk0){let any=false;for(let q=d,k=0;k<7;k++,q=nxd(q)){const t=T[q];if((t&&t.d+t.w)||occ.some(o=>sod(o.S)===q&&o.st!=='skip')){any=true;break}}if(!any){d=add7(d,1)-864e5;d=sod(d);continue}}shown++;const inM=new Date(d).getMonth()===md.getMonth(),past=nxd(d)<=n,td=d===sod(n),os=occ.filter(o=>sod(o.S)===d&&o.st!=='skip'&&!(o.st==='done'||o.E<=n)),o2=T[d],logged=o2?o2.d+o2.w:0;
  let lv=0;os.forEach(o=>{lv=Math.max(lv,worst(I.get(o.oid)))});
  let fr=null;if(!past&&!os.length&&!logged)fr=plFree(d,sp,I);
  const dot=fr?['','ok','warn','bad'][fr.lv]:'',chips=os.map(o=>{const j=jobC(o.j);return `<div class="plk" style="border-left-color:${JCOL[jobI(j.id)]}">${ct(o.s)}–${ct(o.e)}${lv?`<i class="${['','','warn','bad'][worst(I.get(o.oid))]||''}">${worst(I.get(o.oid))>=2?'!':''}</i>`:''}</div>`}).join('');
  const rtag=plRestTag(d,WR);
  h+=`<button class="pld${inM?'':' plo'}${td?' plt':''}${past?' plp':''}" data-pd="${d}"><span class="pln">${new Date(d).getDate()}</span>${chips}${rtag}${logged&&(past||td)?`<div class="plk pll">${fmt(logged).replace(' 00m','')}</div>`:''}${fr?`<span class="pldot ${dot}"></span><span class="plw">${fr.lv<3?hm(fr.ea).slice(0,2)+(fr.la===Infinity||fr.la>nxd(d)+4*H?'+':'–'+hm(fr.la).slice(0,2)+(fr.la>nxd(d)?'¹':'')):''}</span>`:''}</button>`}
 h+='</div>'+(shown?'':'<p class="note" style="text-align:center;margin:12px 0">Nothing was logged or planned in this month.</p>')+'<div class="bx plkey" style="margin-top:10px"><div class="lbl" style="margin-bottom:4px">Key</div><div><span class="ki"><span class="pldot ok"></span></span>Free, fine to work</div><div><span class="ki"><span class="pldot warn"></span></span>Free, only with a reduced rest</div><div><span class="ki"><span class="pldot bad"></span></span>Not allowed (rest rules)</div><div><span class="ki"><span style="display:inline-block;width:14px;height:10px;border-left:3px solid var(--mut);background:var(--bg)"></span></span>Planned shift, in the job\'s colour</div><div><span class="ki"><b class="bad">!</b></span>Planned shift breaks a rule</div><div><span class="ki"><span class="plr ok" style="margin:0">Rest</span></span>Predicted weekly rest, 45h or more</div><div><span class="ki"><span class="plr warn" style="margin:0">Rest</span></span>Predicted reduced rest (24 to 45h): you would owe the rest</div><div><span class="ki"><span class="plr mut" style="margin:0">⚑</span></span>Latest time your weekly rest can start (the time is shown). Red means nothing in your plan covers it</div><div><span class="ki"><span class="plw">04–22</span></span>Earliest start to latest finish</div><div><span class="ki"><span class="plw">04+</span></span>No latest finish from your other shifts</div><div><span class="ki"><span class="plw">¹</span></span>Finish is the next morning</div><div class="note" style="margin-top:4px">Tap a day for details.</div></div>';
 set(el,h)}

function plDay(d){const n=Date.now(),sp=plSpans(),I=plCheck(sp),WR=plRests(sp),occ=plOcc(d,nxd(d)).filter(o=>sod(o.S)===d),T=typeof dayTot==='function'?dayTot():{},o2=T[d],past=nxd(d)<=n;
 const fr=!past&&!occ.filter(o=>o.st!=='skip').length&&!(o2&&o2.d+o2.w)?plFree(d,sp,I):null;
 const isz=L=>(L||[]).map(x=>`<div class="note ${x.lv==='r'?'bad':x.lv==='a'?'warn':''}" style="margin-top:4px">${x.lv==='r'?'✕ ':x.lv==='a'?'⚠ ':'ℹ '}${x.t}</div>`).join('');
 let h=`<h3>${new Date(d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</h3>`;
 if(o2&&o2.d+o2.w)h+=`<div class="item"><div class="lbl">Logged</div><div class="lbl">${fmt(o2.d)} driving, ${fmt(o2.w)} work</div></div>`;
 occ.forEach(o=>{const j=jobC(o.j),stx=o.st==='skip'?' · not worked':o.st==='done'||o.E<=n?' · past':'';
  h+=`<div class="bx" style="margin-top:8px;border-left:4px solid ${JCOL[jobI(j.id)]}"><div class="row"><span class="lbl">${esc(j.n)}${j.tc===false?' (no tacho)':''}${o.pat?' · repeats '+ordW(((st.pat||[]).find(r=>r.id===o.pat)||{}).ev):''}${stx}</span><span class="lbl">${o.s.slice(0,5)}–${o.e.slice(0,5)}</span></div><div class="note">${o.br?o.br+' min unpaid break. ':''}${j.tc!==false&&o.dr?o.dr+'h driving expected. ':''}Working time about ${fmt(o.E-o.S-(o.br||0)*M)}.</div>${o.st==='skip'||o.st==='done'||o.E<=n?'':isz(I.get(o.oid))}<div class="tr" style="margin:8px 0 0;gap:6px;flex-wrap:wrap"><button class="tg" data-k="e:${o.oid}">Edit${o.pat?' this day':''}</button>${o.pat?`<button class="tg" data-k="es:${o.pat}">Edit repeat</button>`:''}<button class="tg" data-k="x:${o.oid}">Remove${o.pat?' this day':''}</button></div></div>`});
 if(fr){h+=`<div class="bx" style="margin-top:8px"><div class="lbl"><span class="pldot ${['','ok','warn','bad'][fr.lv]}"></span> ${fr.lv===3?'Not available':fr.lv===2?'Available with a reduced rest':'Free to work'}</div>${fr.lv<3||fr.la>fr.ea?`<div class="note">Earliest start <b>${hm(fr.ea)}</b>, latest finish <b>${fr.la===Infinity?'no limit from other shifts':hmx(fr.la,d)}</b>, based on 11 hour rests around your other shifts${fr.ea<d+4*H?'. Starting before 04:00 counts as night work (10 hour limit)':''}.</div>`:''}${fr.txt?`<div class="note">${fr.txt}</div>`:''}${fr.lv<3?'<div class="note" style="margin-top:4px">Checked as a 12 hour shift from '+hm(fr.s0)+' to '+hmx(fr.e0,d)+':</div>':''}${isz(fr.R)||(fr.lv===1?'<div class="note ok">✓ No rules broken.</div>':'')}</div>`}
 h+=plRestNote(d,WR);
 h+=`<button class="tg big" data-k="add" style="margin-top:12px">Add shift</button><button class="tg big" data-k="rp">Repeating shift starting this day</button><button class="tg big" data-k="cw">Copy this week to next week</button><button class="tg big" data-k="no">Close</button>`;
 mo(h);mcb={no:moX,add:()=>plForm({d:ymd(d)}),cw:()=>plCopyWeek(d),rp:()=>plPatForm(null,ymd(d))};
 occ.forEach(o=>{mcb['e:'+o.oid]=()=>plForm(o.pat?{d:o.d,j:o.j,s:o.s,e:o.e,br:o.br,dr:o.dr,fromPat:o.oid}:(st.plan||[]).find(p=>p.id===o.oid));
  if(o.pat)mcb['es:'+o.pat]=()=>plPatForm((st.pat||[]).find(r=>r.id===o.pat));
  mcb['x:'+o.oid]=()=>{if(o.pat)st.plx=(st.plx||[]).concat(o.oid);else st.plan=(st.plan||[]).filter(p=>p.id!==o.oid);save();plRender();plDay(d)}})}

function plJobSel(j){const J=jobs();return `<label>Job<select id="pfj">${J.map((x,i)=>`<option value="${x.id}"${x.id===(j||st.cj||J[0].id)?' selected':''}>${esc(x.n)}${x.tc===false?' (no tacho)':''}</option>`).join('')}</select></label>`}
function plFields(p){return `${plJobSel(p.j)}<div class="tr"><label>Start<input type="time" id="pfs" value="${p.s||'09:00'}"></label><label>Finish<input type="time" id="pfe" value="${p.e||'17:00'}"></label></div><div class="tr"><label>Unpaid break (min)<select id="pfb">${[0,15,30,45,60,90].map(v=>`<option${v===(p.br===undefined?30:p.br)?' selected':''}>${v}</option>`).join('')}</select></label><label id="pfdw">Driving expected (hours)<input type="number" id="pfd" min="0" max="15" step="0.5" value="${p.dr===undefined?'':p.dr}" placeholder="0"></label></div><p class="note">Driving only counts towards the tacho limits for a job that uses a tachograph. A finish earlier than the start means the shift ends the next day.</p>`}
/* a job without a tachograph has no driving to plan, so hide that box */
function plDrv(){const w=$('pfdw'),j=$('pfj');if(w&&j)w.hidden=jobC(j.value).tc===false}
function plRead(){return{j:$('pfj').value,s:$('pfs').value,e:$('pfe').value,br:+$('pfb').value,dr:jobC($('pfj').value).tc===false?0:parseFloat($('pfd').value)||0}}
function plForm(p){p=p||{};const isNew=!p.id;
 mo(`<h3>${isNew?'Add shift':'Edit shift'}</h3><label>Date<input type="date" id="pfdt" value="${p.d||ymd(Date.now())}"></label>${plFields(p)}<label>Repeat this shift<select id="pfr"><option value="0">Just this day</option><option value="1">Every week on this day</option><option value="2">Every other week</option><option value="3">Every third week</option><option value="4">Every fourth week</option></select></label><div class="note bad" id="pferr"></div><div id="pfiss"></div><button class="tg big" data-k="ok">Save</button><button class="tg big" data-k="chk">Check without saving</button><button class="tg big" data-k="no">Cancel</button>`);plDrv();
 const build=()=>{const v=plRead(),d=$('pfdt').value;if(!d||!v.s||!v.e){$('pferr').textContent='Enter the date, start and finish.';return null}if(v.s===v.e){$('pferr').textContent='Start and finish cannot be the same.';return null}$('pferr').textContent='';return Object.assign({id:p.id||plId(),d},v)};
 const show=q=>{const s0=pdt(q.d)+tmin(q.s)*M;let e0=pdt(q.d)+tmin(q.e)*M;if(e0<=s0)e0=nxd(pdt(q.d))+tmin(q.e)*M;const j=jobC(q.j),tc=j.tc!==false,w=Math.max(0,e0-s0-q.br*M);
  const sk=p.id||p.fromPat,sp=plSpans({s:s0,e:e0,w,dv:tc?Math.min(w,q.dr*H):0,tc,br:q.br,id:'new'},sk),I=plCheck(sp),I0=plCheck(plSpans(null,sk)),L=(I.get('new')||[]).slice();
  I.forEach((A,k)=>{if(k==='new')return;const o=sp.find(x=>x.id===k);A.forEach(x=>{if(x.lv!=='i'&&!(I0.get(k)||[]).some(y=>y.t===x.t))L.push({lv:x.lv,t:'Knock-on for your '+(o&&o.o?esc(jobC(o.o.j).n)+' shift on '+dlong(o.s):'other shift')+': '+x.t})})});
  $('pfiss').innerHTML=L.length?L.map(x=>`<div class="note ${x.lv==='r'?'bad':x.lv==='a'?'warn':''}" style="margin-top:4px">${x.lv==='r'?'✕ ':x.lv==='a'?'⚠ ':'ℹ '}${x.t}</div>`).join(''):'<div class="note ok">✓ No rules broken.</div>';return L};
 mcb={no:()=>{moX();if(p.d)plDay(pdt(p.d))},chk:()=>{const q=build();if(q)show(q)},ok:()=>{const q=build();if(!q)return;
  if(+$('pfr').value){const wd=(new Date(pdt(q.d)).getDay()+6)%7;st.pat=(st.pat||[]).concat({id:plId(),j:q.j,days:[wd],s:q.s,e:q.e,br:q.br,dr:q.dr,from:q.d,ev:+$('pfr').value});if(!isNew)st.plan=(st.plan||[]).filter(x=>x.id!==p.id);if(p.fromPat)st.plx=(st.plx||[]).concat(p.fromPat)}
  else{if(p.fromPat)st.plx=(st.plx||[]).concat(p.fromPat);st.plan=(st.plan||[]).filter(x=>x.id!==q.id).concat(q)}
  save();plRender();plDay(pdt(q.d))}}}
function plPatList(){const R=st.pat||[],D=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
 mo(`<h3>Repeating shifts</h3><p class="note">Shifts that repeat every week, every other week or less often, for example St Peter's every Tue, Wed and Thu 09:00 to 17:00. You can still change or remove a single day from the calendar.</p>${R.length?R.map(r=>{const j=jobC(r.j);return `<div class="bx" style="margin-top:8px;border-left:4px solid ${JCOL[jobI(j.id)]}"><div class="lbl">${esc(j.n)} · ${r.days.map(i=>D[i]).join(', ')} · ${ordW(r.ev)}</div><div class="note">${r.s}–${r.e}${r.br?', '+r.br+' min unpaid break':''}. From ${dlong(pdt(r.from))}${r.to?' until '+dlong(pdt(r.to)):''}.</div><div class="tr" style="margin:8px 0 0"><button class="tg" data-k="ed:${r.id}">Edit</button></div></div>`}).join(''):'<p class="note">None yet.</p>'}<button class="tg big" data-k="new" style="margin-top:12px">Add repeating shift</button><button class="tg big" data-k="no">Close</button>`);
 mcb={no:moX,new:()=>plPatForm(null)};R.forEach(r=>mcb['ed:'+r.id]=()=>plPatForm(r))}
function plPatForm(r,hint){const isNew=!r;r=r||{days:hint?[(new Date(pdt(hint)).getDay()+6)%7]:[],from:hint||''};const D=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];let days=r.days.slice();
 const draw=()=>{const keep=$('pfs')?Object.assign(plRead(),{from:$('pff').value,to:$('pft').value,ev:$('pfev')?+$('pfev').value:r.ev}):null,v=keep||r,v0=v;
  mo(`<h3>${isNew?'Add repeating shift':'Edit repeating shift'}</h3><label>Repeat<select id="pfev">${[1,2,3,4,5,6].map(v=>`<option value="${v}"${v===(+(v0.ev||r.ev||1))?' selected':''}>${ordW(v).replace(/^e/,'E')}</option>`).join('')}</select></label><div class="lbl">On these days</div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin:6px 0 10px">${D.map((x,i)=>`<button class="tg" data-k="d${i}" style="padding:8px 0;${days.includes(i)?'background:var(--acc);border-color:var(--acc);color:var(--onacc);font-weight:700':''}">${x}</button>`).join('')}</div>${plFields(v)}<div class="tr"><label>First shift on<input type="date" id="pff" value="${v.from||''}"></label><label>Until (optional)<input type="date" id="pft" value="${v.to||''}"></label></div><div class="note" style="margin:-2px 0 6px">Nothing is added before the first shift date. For every other week (or more), that date's week is week 1.</div><div class="note bad" id="pferr"></div><button class="tg big" data-k="ok">Save</button>${isNew?'':'<button class="tg big" data-k="del">Delete this repeating shift</button>'}<button class="tg big" data-k="no">Cancel</button>`);plDrv();
  mcb={no:plPatList,ok:()=>{const q=plRead(),f=$('pff').value,t=$('pft').value;if(!days.length){$('pferr').textContent='Pick at least one day.';return}if(!q.s||!q.e||!f){$('pferr').textContent='Enter the start, finish and the date of the first shift.';return}{const fw=(new Date(pdt(f)).getDay()+6)%7;if(!days.includes(fw)){$('pferr').textContent='The first shift date is a '+new Date(pdt(f)).toLocaleDateString('en-GB',{weekday:'long'})+', but that day is not ticked. Tick it or pick a different date.';return}}
    const o={id:r.id||plId(),j:q.j,days:days.slice().sort(),s:q.s,e:q.e,br:q.br,dr:q.dr,from:f,ev:+$('pfev').value||1};if(t)o.to=t;st.pat=(st.pat||[]).filter(x=>x.id!==o.id).concat(o);save();plRender();plPatList()},
   del:()=>{st.pat=(st.pat||[]).filter(x=>x.id!==r.id);st.plx=(st.plx||[]).filter(x=>!x.startsWith(r.id+'|'));save();plRender();plPatList()}};
  D.forEach((x,i)=>mcb['d'+i]=()=>{days=days.includes(i)?days.filter(y=>y!==i):days.concat(i);draw()});
  $('pff').onchange=e=>{if(e.target.value){const fw=(new Date(pdt(e.target.value)).getDay()+6)%7;if(!days.includes(fw)){days=days.concat(fw);draw()}}}};draw()}
function plCopyWeek(d){const w0=wkS(d),w1=nwk(w0),add=[];(st.plan||[]).forEach(p=>{const t=pdt(p.d);if(t>=w0&&t<w1){const q=Object.assign({},p,{id:plId(),d:ymd(add7(t,1))});if(!(st.plan||[]).some(x=>x.d===q.d&&x.s===q.s&&x.j===q.j))add.push(q)}});
 st.plan=(st.plan||[]).concat(add);save();plRender();
 mo(`<h3>Week copied</h3><p>${add.length?add.length+' shift'+(add.length>1?'s':'')+' copied to the week of '+dlong(w1)+'.':'There were no one-off shifts to copy in this week.'} Repeating shifts already carry on by themselves.</p><button class="tg big" data-k="go">Show next week</button><button class="tg big" data-k="no">Close</button>`);
 mcb={no:moX,go:()=>{moX();const t=new Date(w1);t.setDate(1);PL.m=t.getTime();plRender()}}}

/* Plan versus what happened */
function plPending(){const n=Date.now(),out=[],L=all();plOcc(n-14*864e5,n+864e5).forEach(o=>{if(o.st)return;
  const lg=L.some(x=>x.e>o.S-H&&x.s<o.E+H);
  if(lg){if(o.S<n){st.pls=Object.assign({},st.pls,{[o.oid]:'done'});out.dirty=1}return}
  if(o.E<=n)out.push({o,k:'end'});else if(o.S+60*M<=n&&!st.active)out.push({o,k:'late'})});
 if(out.dirty){delete out.dirty;save()}return out}
function plBanner(){const el=$('plb');if(!el)return;const P=plPending();
 set(el,P.slice(0,2).map(({o,k})=>{const j=jobC(o.j);return `<div class="wkb wn" style="cursor:default"><b>${k==='end'?'Planned shift: what happened?':'Planned shift not started'}</b><span>${esc(j.n)} ${dlong(o.S)} ${o.s.slice(0,5)}–${o.e.slice(0,5)}. ${k==='end'?'Nothing was logged for it.':'It was due to start at '+o.s.slice(0,5)+'.'}</span><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${k==='end'?`<button class="tg" data-pbk="as:${o.oid}" style="flex:1 1 0;white-space:normal">Worked as planned</button><button class="tg" data-pbk="df:${o.oid}" style="flex:1 1 0;white-space:normal">Different times</button>`:`<button class="tg" data-pbk="go:${o.oid}" style="flex:1 1 0;white-space:normal">Start this shift</button>`}<button class="tg" data-pbk="sk:${o.oid}" style="flex:1 1 0;white-space:normal">Didn't work</button></div></div>`}).join(''))}
function plLog(o,s,e){const br=(o.br||0)*M,mid=s+Math.max(0,(e-s-br)/2),j=jobC(o.j),tc=j.tc!==false,mk=(a,b)=>{if(b>a){const x={s:a,e:b,t:'w'};if(jobsOn()){x.j=j.id;x.c=tc?1:0}clear(a,b,1);st.sessions.push(x)}};
 if(br>0&&e-s>br){mk(s,mid);mk(mid+br,e)}else mk(s,e);st.pls=Object.assign({},st.pls,{[o.oid]:'done'})}
function plAct(k,oid){const o=plOcc(Date.now()-15*864e5,Date.now()+2*864e5).find(x=>x.oid===oid);if(!o)return;
 if(k==='sk'){st.pls=Object.assign({},st.pls,{[oid]:'skip'});save();render();return}
 if(k==='as'){plLog(o,o.S,o.E);save();render();flash='Logged '+esc(jobC(o.j).n)+' '+o.s.slice(0,5)+'–'+o.e.slice(0,5)+' as Other work. Edit it in the log to split out any driving.';setTimeout(()=>{flash='';live()},9000);return}
 if(k==='go'){if(jobsOn()){st.cj=o.j;st.tm=jobC(o.j).tc!==false;st.tmt=Date.now()}save();setAct('w');return}
 if(k==='df'){mo(`<h3>What did you work?</h3><p>${esc(jobC(o.j).n)}, planned ${dlong(o.S)} ${o.s.slice(0,5)}–${o.e.slice(0,5)}.</p><div class="tr"><label>Started<input type="time" id="pas" value="${o.s.slice(0,5)}"></label><label>Finished<input type="time" id="pae" value="${o.e.slice(0,5)}"></label></div><label>Unpaid break (min)<input type="number" id="pab" min="0" max="180" value="${o.br||0}"></label><div class="note bad" id="paerr"></div><button class="tg big" data-k="ok">Log it</button><button class="tg big" data-k="no">Cancel</button>`);
  mcb={no:moX,ok:()=>{const a=$('pas').value,b=$('pae').value;if(!a||!b){$('paerr').textContent='Enter both times.';return}const d=sod(o.S);const s=d+tmin(a)*M;let e=d+tmin(b)*M;if(e<=s)e=nxd(d)+tmin(b)*M;if(e>Date.now()){$('paerr').textContent='The finish is in the future.';return}
   plLog(Object.assign({},o,{br:+$('pab').value||0}),s,e);save();moX();render()}}}}

/* A planned shift whose start time has passed, that has not ended, with nothing logged for it yet. */
function plDue(){const n=Date.now(),L=all();
 return plOcc(n-20*H,n+1).filter(o=>!o.st&&o.S<=n-5*M&&o.E>n&&!L.some(x=>x.e>o.S-H&&x.s<o.E)).sort((a,b)=>b.S-a.S)[0]||null}
/* Starting a shift late against the plan: ask whether it really started at the planned time. */
function plStartAsk(o,t){const n=Date.now(),j=jobC(o.j),A=all(),pe=A.length?A[A.length-1].e:0,ps=o.s.slice(0,5);
 mo(`<h3>When did you start?</h3><p>You had <b>${esc(j.n)}</b> planned from <b>${ps}</b> to ${o.e.slice(0,5)} today. If you started at ${ps}, start the shift from then so your hours and breaks count from the right time.</p><button class="tg big" data-k="pl" style="font-weight:700">I started at ${ps}, as planned</button><button class="tg big" data-k="now">I am starting now (${hm(n)})</button><div class="tr" style="margin-top:12px"><label>Or I started at<input type="time" id="pst"></label><button class="tg" data-k="at">Use time</button></div><div class="note bad" id="psterr"></div><button class="tg big" data-k="no">Cancel</button>`);
 const go=x=>{bd=x;begin(t,1)},err=m=>{$('psterr').textContent=m};
 mcb={no:undo,now:()=>begin(t,1),pl:()=>go(Math.max(o.S,pe)),at:()=>{const v=$('pst').value;if(!v){err('Enter the time you started.');return}
  const[h,m]=v.split(':').map(Number),q=new Date(n);q.setHours(h,m,0,0);let x=q.getTime();if(x>n)x-=864e5;
  if(x<=pe){err('That is before your last activity ended ('+hm(pe)+'). Pick a later time.');return}if(n-x>16*H){err('That is more than 16 hours ago. Check the time.');return}go(x)}}}

document.addEventListener('change',e=>{if(e.target.id==='pfj')plDrv()});
/* Wire up */
document.addEventListener('click',e=>{const b=e.target.closest('[data-pbk]');if(b){const[k,oid]=b.dataset.pbk.split(/:(.*)/s);plAct(k,oid)}});
$('plc').addEventListener('click',e=>{const t=e.target.closest('[data-pm],[data-pa],[data-pp],[data-pd]');if(!t)return;const d=t.dataset;
 if(d.pm!==undefined){if(d.pm==='0')PL.m=null;else{const m=new Date(plMonth());m.setMonth(m.getMonth()+ +d.pm);PL.m=m.getTime()}plRender()}
 else if(d.pa)plForm({d:ymd(Date.now())});else if(d.pp)plPatList();else if(d.pd)plDay(+d.pd)});
$('plc').addEventListener('click',e=>{if(e.target.closest('[data-owe]'))wrDetail()});
if(typeof KEEP!=='undefined')['plan','pat','plx','pls'].forEach(k=>{if(!KEEP.includes(k))KEEP.push(k)});
