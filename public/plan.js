/* TachoGuard shift planner.
   Plans live in st.plan (one-off shifts), st.pat (weekly repeating patterns), st.plx (pattern days removed),
   st.pls (status of an occurrence: 'done' or 'skip'). Past days use what was actually logged. */
const PL={m:null,cache:null};
const pdt=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d).getTime()};
const tmin=s=>{const[h,m]=String(s||'0:0').split(':').map(Number);return(h||0)*60+(m||0)};
const plId=()=>'p'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
const dlong=t=>new Date(t).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
const ordW=v=>(v||1)===1?'every week':v===2?'every other week':'every '+(['','','','third','fourth','fifth','sixth'][v]||v+'th')+' week';
const hmx=(t,base)=>hm(t)+(sod(t)>sod(base)?' (+1)':'');

function plOcc(from,to){const out=[],X=new Set(st.plx||[]),S=st.pls||{};
 (st.plan||[]).forEach(p=>{const s=pdt(p.d)+tmin(p.s)*M;let e=pdt(p.d)+tmin(p.e)*M;if(e<=s)e=nxd(pdt(p.d))+tmin(p.e)*M;if(e>from&&s<to)out.push(Object.assign({},p,{S:s,E:e,oid:p.id,st:S[p.id]}))});
 (st.pat||[]).forEach(r=>{let d=Math.max(pdt(r.from),sod(from-864e5));const end=Math.min(to,r.to?nxd(pdt(r.to)):to);
  for(;d<end;d=nxd(d)){const wd=(new Date(d).getDay()+6)%7;if(!r.days.includes(wd))continue;if((r.ev||1)>1&&Math.round((wkS(d)-wkS(pdt(r.from)))/(7*864e5))%r.ev!==0)continue;const ds=ymd(d),oid=r.id+'|'+ds;if(X.has(oid))continue;
   const s=d+tmin(r.s)*M;let e=d+tmin(r.e)*M;if(e<=s)e=nxd(d)+tmin(r.e)*M;if(e>from&&s<to)out.push({id:oid,pat:r.id,d:ds,j:r.j,s:r.s,e:r.e,br:r.br,bp:r.bp,dr:r.dr,rv:r.rv,S:s,E:e,oid,st:S[oid]})}});
 /* rotas: several different weeks that roll round. from is the Monday of week 1 */
 (st.rota||[]).forEach(r=>{const W=(r.weeks||[]).length;if(!W)return;const f=pdt(r.from);let d=Math.max(f,r.on?pdt(r.on):Math.max(f,pdt(PL_ROTA0)),sod(from-864e5));const end=Math.min(to,r.to?nxd(pdt(r.to)):to);
  for(;d<end;d=nxd(d)){const wi=((Math.round((wkS(d)-wkS(f))/(7*864e5))%W)+W)%W,wd=(new Date(d).getDay()+6)%7;if(!r.weeks[wi].includes(wd))continue;const ds=ymd(d),oid=r.id+'|'+ds;if(X.has(oid))continue;
   const s=d+tmin(r.s)*M;let e=d+tmin(r.e)*M;if(e<=s)e=nxd(d)+tmin(r.e)*M;if(e>from&&s<to)out.push({id:oid,pat:r.id,rot:1,wk:wi+1,d:ds,j:r.j,s:r.s,e:r.e,br:r.br,bp:r.bp,dr:r.dr,rv:r.rv,S:s,E:e,oid,st:S[oid]})}});
 return out.sort((a,b)=>a.S-b.S)}

/* Spans: logged activity (not rest) plus planned shifts that have not happened yet. */
function plSpans(extra,skipId){const n=Date.now(),sp=[];
 /* the checks only look back to the start of the working time period and the fortnight before this week, so older logs are left out (much faster with a year of records) */
 const cut=Math.min(refMinS(n),wkS(n)-21*864e5);
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
  pl.forEach(x=>{if(x.tc&&x.dv>=270*M&&x.br<45)add(x,'a','4h 30m or more of driving needs at least 45 minutes of breaks (one 45, or 15 then 30). You have '+(x.br||0)+' min planned.');else if(x.w>9*H&&x.br<45)add(x,'a','Over 9 hours of work needs at least 45 minutes of breaks in total (you have '+(x.br||0)+' min planned).');else if(x.w>6*H&&x.br<30)add(x,'a','Over 6 hours of work needs at least a 30 minute break (you have '+(x.br||0)+' min planned).')});
  /* driving per shift */
  if(c.dv>10*H)pl.forEach(x=>add(x,'r','Driving of '+fmt(c.dv)+' is over the 10 hour daily maximum.'));
  else if(c.dv>9*H)pl.forEach(x=>add(x,'a','Driving over 9 hours uses one of your two 10 hour days this week.'));
  /* the driving break advice is shown with each planned shift (plBrk) */
  c.ext=c.dv>9*H});
 /* weekly totals: working time 60h, driving 56h, fortnight 90h, 10h days */
 const W={};const wk=(t)=>wkS(t);sp.forEach(x=>{let a=x.s;while(a<x.e){const w0=wk(a),w1=nwk(w0),b=Math.min(x.e,w1),f=(b-a)/(x.e-x.s||1);const o=W[w0]=W[w0]||{w:0,d:0,sp:[],ext:0};o.w+=x.w*f;o.d+=x.dv*f;o.sp.push(x);a=b}});
 SH.forEach(c=>{if(c.ext){const o=W[wk(c.s)];if(o)o.ext++}});
 Object.keys(W).map(Number).sort((a,b)=>a-b).forEach(k=>{const o=W[k],pr=W[k-7*864e5]||W[wkS(k-3*864e5)];
  if(o.w>60*H)o.sp.forEach(x=>add(x,'r','Working time in the week of '+dlong(k)+' would be '+fmt(o.w)+', over the 60 hour weekly maximum.'));
  if(o.d>56*H)o.sp.forEach(x=>add(x,'r','Driving in the week of '+dlong(k)+' would be '+fmt(o.d)+', over 56 hours.'));
  if(pr&&o.d+pr.d>90*H)o.sp.forEach(x=>add(x,'r','Driving over this week and last would be '+fmt(o.d+pr.d)+', over the 90 hour fortnight limit.'));
  if(o.ext>2)o.sp.forEach(x=>{if(x.dv>9*H)add(x,'r','More than two 10 hour driving days in the week of '+dlong(k)+'.')})});
 /* 48h average over each company's reference period, with planned hours. All your hours count in every period. */
 const RG=refGroups();RG.forEach(g=>{const per={},who=RG.length>1&&g.names.length?' ('+g.names.map(esc).join(', ')+')':'';sp.forEach(x=>{if(x.log)return;const P=refP(x.s,g.rp),k=P.s;(per[k]=per[k]||{P,sp:[]}).sp.push(x)});
 Object.values(per).forEach(({P,sp:ps})=>{let tot=0;sp.forEach(x=>{tot+=x.w*Math.max(0,Math.min(x.e,P.e)-Math.max(x.s,P.s))/((x.e-x.s)||1)});
  const b=st.rpb&&st.rpb.p===P.s?st.rpb:null;if(b){const span=Math.max(0,(b.to-P.s)/(7*864e5)),lw=Math.min(span,(b.lv||0)/5);tot+=(b.avg||0)*H*Math.max(0,span-lw)+lvH(b.lv||0)}tot+=lvIn(b?Math.max(P.s,b.to):P.s,P.e);
  const C=Math.max(1,Math.round((P.e-P.s)/(7*864e5)));if(tot>48*H*C)ps.forEach(x=>add(x,'a','With your planned shifts, the average for the period '+dlong(P.s)+' to '+dlong(P.e-864e5)+who+' would be '+fmt(tot/C)+' a week, over 48 hours.'))})});
 return I}

const LVO={r:3,a:2,i:1},worst=L=>(L||[]).reduce((m,x)=>Math.max(m,LVO[x.lv]||0),0);

/* What could you work on a free day? */
function plFree(d,base,baseI){const n=Date.now(),D0=Math.max(d,n),D1=nxd(d);if(D1<=n)return null;
 const prev=base.filter(x=>x.s<D1).reduce((m,x)=>Math.max(m,x.e),0),nxt=base.filter(x=>x.s>=Math.max(D0,prev)).reduce((m,x)=>Math.min(m,x.s),Infinity);
 if(base.some(x=>x.s<D1&&x.e>D0))return null;
 const ea=Math.max(D0,prev?prev+11*H:D0),laR=nxt===Infinity?Infinity:nxt-11*H,la=Math.min(laR,ea+15*H);
 if(ea>=D1)return{lv:3,ea,la,txt:'No start time today leaves an 11 hour rest after your last shift.',R:[]};
 const win=Math.min(la,D1+15*H)-ea;if(win<4*H)return{lv:3,ea,la,txt:win>0?'Only '+fmt(win)+' between the rests you need around your other shifts.':'No room between the rests you need around your other shifts.',R:[]};
 const s0=ea<d+4*H&&la-(d+4*H)>=8*H?d+4*H:ea,tj=jobs().find(j=>j.tc!==false)||jobs()[0];
 const test=(a,e)=>{const tc=tj.tc!==false,bm=e-a>9*H||tc&&e-a>5*H?45:30,w=e-a-bm*M,hyp={s:a,e,w,dv:tc?Math.min(w,9*H):0,tc,br:bm,id:'hyp'};
  const I=plCheck(base.concat([hyp]).sort((x,y)=>x.s-y.s)),R=[];
  I.forEach((L,k)=>{L.forEach(x=>{if(x.lv==='i')return;if(k==='hyp')R.push(x);else if(!(baseI.get(k)||[]).some(y=>y.t===x.t)){const o=base.find(z=>z.id===k);R.push({lv:x.lv,t:'Knock-on for your '+(o&&o.o?esc(jobC(o.o.j).n)+' shift on '+dlong(o.s):'next shift')+': '+x.t})}})});
  return{s0:a,e0:e,R,lv:Math.max(1,worst(R))}};
 /* A day is only marked unavailable if no sensible shift fits. Try the longest (up to 12h) first, then shorter ones and one that finishes by midnight, so a long test shift running into the night does not make the whole day look closed. */
 const full=test(s0,Math.min(s0+12*H,la));if(full.lv===1)return{lv:1,ea,la:laR,s0,e0:full.e0,R:full.R,txt:''};
 const C=[];[10,8,6,4].forEach(h=>{const e=Math.min(s0+h*H,la);if(e-s0>=4*H)C.push([s0,e])});if(D1-s0>=4*H&&D1<full.e0)C.push([s0,Math.min(D1,la)]);
 let best=full;for(const [a,e] of C){const r=test(a,e);if(r.lv<best.lv||(r.lv===best.lv&&r.e0-r.s0>best.e0-best.s0&&best!==full))best=r;if(best.lv===1)break}
 if(best===full){if(full.lv===3&&C.length){const sh=C.reduce((m,c)=>c[1]-c[0]<m[1]-m[0]?c:m),r=test(sh[0],sh[1]);if(r.lv===3)return{lv:3,ea,la:laR,s0:r.s0,e0:r.e0,R:r.R,txt:'Even a short '+fmt(r.e0-r.s0).replace(/ 00m$/,'')+' shift from '+plHm(r.s0)+' to '+hmx(r.e0,d)+' would break a rule:',cut:1}}
  return{lv:best.lv,ea,la:laR,s0:best.s0,e0:best.e0,R:best.R,txt:''}}
 /* Work out the real latest finish for a shift starting at s0 (to 5 minutes), and say why it stops there in plain words */
 let lo=best.e0,hi=full.e0,bad=full;while(hi-lo>5*M){const mid=lo+Math.round((hi-lo)/10/M)*5*M,r=test(s0,mid);if(r.lv<=best.lv)lo=mid;else{hi=mid;bad=r}}
 const okR=lo===best.e0?best:test(s0,lo),why=bad.R.filter(x=>(LVO[x.lv]||0)>(best.lv>1?best.lv:1)).map(x=>x.t),br=lo-s0>9*H||tj.tc!==false&&lo-s0>5*H?45:30;
 const night=why.some(t=>/00:00 and 04:00/.test(t)),lim=`Starting at ${plHm(s0)}, you can work until <b>${hmx(lo,d)}</b> at the latest (${fmt(lo-s0-br*M).replace(/ 00m$/,'')} of work plus a ${br} minute break).`;
 const txt=lim+' '+(night?'Working after midnight counts as night work, and on a shift with night work your working time is limited to 10 hours.':'Working any longer would break this rule: '+why[0]);
 return{lv:okR.lv,ea,la:laR,s0,e0:lo,R:okR.R,txt,cut:1}}

/* Where your NEXT weekly rest can start, from what you have logged plus your plan: the first gap that is long enough for a full 45h rest, and
   the first gap long enough for a reduced 24h rest. Only gaps between one activity and the next count (the time before your first shift since
   your last rest is that rest, not a new one). Nothing after that is shown, because it changes as shifts are added. */
const plHm=t=>hm(t).slice(0,5);
/* Time off of 24 hours or more between your shifts, logged and planned. These are drawn on the calendar as your weekly rests:
   full (45 hours or more) in green, reduced (24 to 45 hours) in amber. Resting now with nothing planned: drawn up to now. */
function plOffs(sp){const n=Date.now(),L=sp.slice().sort((a,b)=>a.s-b.s),O=[];let cur=null;
 L.forEach(x=>{if(cur!==null&&x.s-cur>=24*H&&!(st.active&&cur>=n-6e4))O.push({s:cur,e:x.s,len:x.s-cur,full:x.s-cur>=45*H});cur=cur===null?x.e:Math.max(cur,x.e)});
 if(cur!==null&&!st.active&&n-cur>=24*H)O.push({s:cur,e:n,len:n-cur,full:n-cur>=45*H,open:1});
 return O}
const plHrs=t=>Math.round(t/H)+' hours';
/* Reduced weekly rests and where your plan makes them up. Each reduced weekly rest (24 to 45 hours) owes the hours up to 45,
   taken in one block attached to another rest of 9 hours or more, by the end of the third week after the week it was in.
   The owed ones you have logged (wrInfo) and the reduced ones in your plan are matched, oldest first, to the first gap in the
   plan long enough to carry them: a weekly rest that is that much longer than it needs to be, or a daily rest of 9 hours plus. */
function plComp(sp,OFF){const n=Date.now(),I=typeof wrInfo==='function'?wrInfo():null,L=sp.slice().sort((a,b)=>a.s-b.s),G=[];let cur=null;
 L.forEach(x=>{if(cur!==null&&x.s>cur)G.push({s:cur,e:x.s,len:x.s-cur});cur=cur===null?x.e:Math.max(cur,x.e)});
 if(cur!==null)G.push({s:cur,e:Infinity,len:Infinity,open:1});
 const O=[];((I&&I.C)||[]).forEach(c=>O.push({s:c.r.s,e:c.r.e,len:c.r.len,owed:c.owed,dl:c.dl,log:1}));
 /* which time off in the plan has to be a weekly rest: one has to start within 6 days of the last one ending, and a rest of
    24 to 45 hours is only a reduced weekly rest if no full one starts in time after it (otherwise it is just a long daily rest) */
 let le=I&&I.anc!==null?I.lastEnd:null;const B=OFF.filter(b=>le===null||b.s>=le-6e4),WR=[];
 B.forEach((b,i)=>{if(le!==null&&b.s<le-6e4)return;const by=(le===null?b.s:le)+144*H;
  if(!b.full&&!b.open&&B.slice(i+1).some(h=>(h.full||h.open)&&h.s<=by))return;le=b.e;WR.push(b);
  if(b.full||b.open||b.e<=n||O.some(o=>Math.abs(o.e-b.e)<H))return;O.push({s:b.s,e:b.e,len:b.len,owed:45*H-b.len,dl:add7(wkS(b.s),4)})});
 O.sort((a,b)=>a.e-b.e);
 /* a rest of 24 hours or more counts as a weekly rest, so it has to be a full 45 hours plus what is owed; a shorter one is a
    daily rest of 9 hours plus what is owed. One long rest can carry more than one lot (g.x is what it already carries). */
 const base=g=>g.len>=24*H||g.len===Infinity?45*H:9*H,room=g=>g.len===Infinity?Infinity:g.len-base(g)-(g.x||0);
 O.forEach(o=>{const ok=g=>g.s>=o.e-6e4&&g.e>n&&g.s<o.dl,g=G.find(g=>ok(g)&&room(g)>=o.owed&&g.s+base(g)+(g.x||0)+o.owed<=o.dl+6e4);
  if(g){o.pay=g;o.at=g.s+base(g)+(g.x||0);g.x=(g.x||0)+o.owed}
  else{/* the rest that would need the fewest extra hours */const c=G.filter(g=>ok(g)&&g.len>=9*H).map(g=>({g,more:o.owed-room(g)})).sort((a,b)=>a.more-b.more)[0];o.near=c||null}});
 O.wr=WR;O.from=I&&I.anc!==null?I.lastEnd:null;return O}
const plCompTxt=(o,short)=>{const f=fmt(o.owed).replace(/ 00m$/,''),by=new Date(o.dl-6e4).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
 if(o.pay)return short?`↺ ${f} owed: made up from ${dmy(o.pay.s)}`:`You owe ${f} for it. Your plan makes it up on your rest from ${dmy(o.pay.s)}${o.pay.e===Infinity?', with nothing planned after':' to '+dmy(o.pay.e)+' ('+plHrs(o.pay.len)+')'}, before the ${by} deadline.`;
 return short?`↺ ${f} owed: not made up by ${by}`:`You owe ${f} for it, to be made up by the end of ${by}. Your plan does not have a rest long enough for it yet`+(o.near?`: the rest from ${dmy(o.near.g.s)} would need ${fmt(o.near.more).replace(/ 00m$/,'')} more.`:'.')};

/* Your next weekly rest, from the calendar's time off: the 6 days count from the end of the rest you are on now (or your last
   weekly rest), and after a reduced one the next has to be a full 45 hours. f is the first time off in your plan that is long enough. */
function plNext(sp,OFF){const n=Date.now(),I=typeof wrInfo==='function'?wrInfo():null;if(!I||I.anc===null)return null;
 const now=OFF.find(b=>b.s<=n&&(b.e>n||b.open))||null;if(now&&now.open)return{now};
 const ls=now?now.e:I.lastEnd,full45=now?!now.full:!!I.full45,due=ls+144*H,need=(full45?45:24)*H,lastE=sp.reduce((m,x)=>Math.max(m,x.e),0);
 const C=OFF.filter(b=>!b.open&&b.s>=ls).concat(lastE>n&&lastE>=ls?[{s:lastE,e:Infinity,len:Infinity,full:true,open:1}]:[]).sort((a,b)=>a.s-b.s);
 const f=C.find(b=>b.s<=due&&b.len>=need)||null,short=f?null:C.find(b=>b.s<=due&&b.len>=24*H)||null;
 return{now,ls,due,full45,f,short,miss:!f}}
/* The summary above the calendar, in plain sentences */
function plSummary(NX){if(!NX)return '';const n=Date.now(),now=NX.now,L=[];
 if(now)L.push(`<div>🛏 <b>You are off now</b>, since ${dmy(now.s)}. `+(now.open?`Nothing is planned yet. So far that is ${plHrs(now.len)}${now.full?', long enough for a full weekly rest.':'.'}`:`You are back at work ${dmy(now.e)}, so that is ${plHrs(now.len)} off: `+(now.full?'a full weekly rest.':`a reduced weekly rest (under 45 hours), so you owe ${plHrs(45*H-now.len)}, made up in one go within 3 weeks.`))+`</div>`);
 if(NX.ls){const f=NX.f,sh=NX.short,top=now?'margin-top:6px':'';
  if(f)L.push(`<div style="${top}">✓ <b>Next weekly rest:</b> your plan has you off from ${dmy(f.s)}${f.open?', with nothing planned after that':` until ${dmy(f.e)} (${plHrs(f.len)})`}. `+(f.full?'That is a full weekly rest.':`That is under 45 hours, so it is a reduced weekly rest and you would owe ${plHrs(45*H-f.len)}.`)+`</div>`);
  else if(sh)L.push(`<div class="bad" style="${top}">⚠ <b>Next weekly rest:</b> after a reduced one it has to be a full 45 hours, but your plan only has ${plHrs(sh.len)} off from ${dmy(sh.s)}. Move or remove a shift so you get 45 hours off by ${dmy(NX.due)}.</div>`);
  else if(NX.due>n)L.push(`<div class="bad" style="${top}">⚠ <b>Weekly rest needed:</b> it must start by ${dmy(NX.due)}, 6 days after ${now?'you go back to work':'your last weekly rest ended'}, but your plan does not leave ${NX.full45?'45':'24'} hours off before then. Move or remove a shift.</div>`);
  else L.push(`<div class="bad" style="${top}">⚠ <b>Weekly rest overdue:</b> it had to start by ${dmy(NX.due)}. Take your weekly rest now.</div>`)}
 return L.length?`<div class="bx note" style="margin:0 0 10px;color:var(--tx)">${L.join('')}</div>`:''}
/* What a day's time off means, in the day pop-up */
function plOffNote(d,OFF,NX,CP){let t='';CP=CP||[];OFF.filter(b=>b.s<nxd(d)&&b.e>d).forEach(b=>{const cp=CP.find(c=>Math.abs(c.e-b.e)<H),daily=!b.full&&!b.open&&CP.wr&&b.e>Date.now()&&!CP.wr.includes(b)&&!cp;
  if(daily){t+=`<div class="bx" style="margin-top:8px;border-left:4px solid var(--ok)"><div class="lbl">Long Rest</div><div class="note">Off from ${dmy(b.s)} until ${dmy(b.e)}: ${plHrs(b.len)}. It does not have to count as a weekly rest, because a full weekly rest in your plan starts in time after it, so nothing is owed for it.</div></div>`;return}
  t+=`<div class="bx" style="margin-top:8px;border-left:4px solid var(--${b.full?'ok':'warn'})"><div class="lbl">${b.full?'Weekly Rest':'Reduced Weekly Rest'}</div><div class="note">`+(b.open?`Off since ${dmy(b.s)}, with nothing planned yet: ${plHrs(b.len)} so far.`:`Off from ${dmy(b.s)} until ${dmy(b.e)}: ${plHrs(b.len)}.`)+' '+(b.full?'That is long enough for a full weekly rest (45 hours or more).':'That is 24 to 45 hours, so it counts as a reduced weekly rest and you would owe the hours up to 45, made up in one go within 3 weeks.'+(cp?' '+plCompTxt(cp):''))+`</div></div>`});
 CP.filter(c=>c.pay&&c.pay.s<nxd(d)&&c.pay.s>=d).forEach(c=>{t+=`<div class="bx" style="margin-top:8px;border-left:4px solid var(--ok)"><div class="lbl">Making Up Owed Rest</div><div class="note">Your rest from ${dmy(c.pay.s)} carries the ${fmt(c.owed).replace(/ 00m$/,'')} you owe from the reduced weekly rest of ${dmy(c.s)}. Keep ${plHrs((c.at-c.pay.s)+c.owed)} clear from the end of your shift, in one block.</div></div>`});
 if(NX&&NX.miss&&NX.due>Date.now()&&sod(NX.due)===d)t+=`<div class="bx" style="margin-top:8px;border-left:4px solid var(--bad)"><div class="lbl">Weekly Rest Needed By ${plHm(NX.due)}</div><div class="note">That is six 24 hour periods after ${NX.now?'you go back to work':'your last weekly rest ended'}. Your plan does not leave ${NX.full45?'45':'24'} hours off before then, so move or remove a shift.</div></div>`;
 return t}
function plMonth(){if(!PL.m){const t=new Date(sod(Date.now()));t.setDate(1);PL.m=t.getTime()}return PL.m}
/* What a day means for you, in one word and a reason: Working (a planned shift), Available (you could work, and when) or Rest
   (the rules mean you cannot work). Free days are checked with a test shift by plFree. */
function plRestWhy(fr){const t=(fr.txt||'')+' '+(fr.R||[]).filter(x=>x.lv==='r').map(x=>x.t).join(' ');
 return /weekly rest/i.test(t)?'needed for your weekly rest':/60 hour/.test(t)?'your 60 hour week is used up':/56 hour|90 hour|fortnight/i.test(t)?'your driving hours are used up':/48 hour/.test(t)?'your 48 hour average is used up':/night/i.test(t)?'night work limit':/rest|11 hour/i.test(t)?'you need your daily rest':'the rest rules'}
/* What working a free day would cost you, from the warnings on the test shift (and knock-ons for your other shifts) */
function plWarnWhy(fr){const t=(fr.R||[]).filter(x=>x.lv==='a').map(x=>x.t).join(' ');
 return /reduced weekly rest/i.test(t)?'it cuts your weekly rest to under 45 hours':/reduced (9 hour )?daily rest|reduced daily rest/i.test(t)?'you would only get a reduced daily rest':/48 hours/.test(t)?'your 48 hour average would go over':/10 hour/.test(t)?'it uses one of your two 10 hour driving days':'tap to see why'}
function plStat(d,C){const n=C.n,D1=nxd(d),past=D1<=n,td=d===sod(n),os=C.occ.filter(o=>sod(o.S)===d&&o.st!=='skip'&&!(o.st==='done'||o.E<=n)),o2=C.T[d],logged=o2?o2.d+o2.w:0,S={d,D1,past,td,os,logged,sub:[]};
 if(os.length){S.k='work';S.txt=os.map(o=>{const j=jobC(o.j),w=worst(C.I.get(o.oid));return `Working ${o.rv?'about ':''}${o.s.slice(0,5)}–${o.e.slice(0,5)}${multi()?' · '+esc(j.n):''}${w>=3?' <b class="bad">· breaks a rule</b>':w===2?' <b class="warn">· see details</b>':''}`}).join('<br>')}
 else if(past)S.k=logged?'did':'off',S.txt=logged?'Worked '+fmt(logged).replace(' 00m',''):'Not working';
 else if(td&&st.active){S.k='work';S.txt='Working now'}
 else{const fr=plFree(d,C.sp,C.I);S.fr=fr;
  if(!fr){S.k=logged?'did':'off';S.txt=logged?'Worked '+fmt(logged).replace(' 00m','')+' today':'Not working'}
  else if(fr.lv===3){S.k='rest';S.txt='Rest: '+plRestWhy(fr)}
  else{const from=td&&fr.ea<=n+6e4?'now':fr.ea>d+15*M?plHm(fr.ea):'',ut=fr.cut?fr.e0:fr.la!==Infinity&&fr.la<=D1?fr.la:0,until=ut?hmx(ut,d):'';
   S.k=fr.lv===2?'warn':'ok';S.txt='Available '+(from==='now'?(until?'now until '+until:'now'):from&&until?from+' to '+until:from?'from '+from:until?'until '+until:'all day')+(fr.lv===2?', but '+plWarnWhy(fr):'');
   /* the whole stretch you are free in, not just this day: from 11 hours after your last shift (or now) to 11 hours before the next */
   const D0=Math.max(d,n),pe=C.sp.filter(x=>x.e<=D0).reduce((m,x)=>Math.max(m,x.e),0),nx=C.sp.filter(x=>x.s>=D0).reduce((m,x)=>Math.min(m,x.s),Infinity),ws=Math.max(n,pe?pe+11*H:n),we=nx===Infinity?Infinity:nx-11*H;
   const fw=t=>t<=n+6e4?'now':sod(t)===d?plHm(t):new Date(t).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})+' '+plHm(t);
   if(ws<d||we>D1)S.sub.push(['mut','Free from '+fw(ws)+(we===Infinity?', with nothing planned after':' until '+fw(we))])}}
 if(C.NX&&C.NX.miss&&C.NX.due>n&&sod(C.NX.due)===d)S.sub.push(['bad',`⚠ Your weekly rest must start by ${plHm(C.NX.due)}`]);
 (C.CP||[]).forEach(c=>{if(!c.log&&sod(c.s)===d)S.sub.push([c.pay?'warn':'bad','Reduced weekly rest. '+plCompTxt(c,1).slice(2)]);if(c.pay&&sod(c.pay.s)===d)S.sub.push(['ok',`↺ Making up ${fmt(c.owed).replace(/ 00m$/,'')} from your reduced rest of ${new Date(c.s).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}: keep ${plHrs(c.at-c.pay.s+c.owed)} clear from ${plHm(c.pay.s)}`])});
 S.band=C.OFF.find(b=>b.s<=d&&b.e>=D1);/* a long rest that does not have to be a weekly rest is not marked as one */if(S.band&&!S.band.full&&!S.band.open&&S.band.e>n&&C.CP&&C.CP.wr&&!C.CP.wr.includes(S.band)&&!C.CP.some(c=>Math.abs(c.e-S.band.e)<H))S.band=null;return S}
const plIco={work:'⚒',ok:'✓',warn:'⚠',rest:'✕',did:'✔',off:'–'};
/* Rotas made before they had a start date (25 October 2026, the day rotas came in) start on that day, not on the Monday
   of their week 1, which could be in the past. */
const PL_ROTA0='2026-10-25';
/* what kind of planned shift this is, in words */
const plKind=o=>o.rot?'Rota, week '+o.wk:o.pat?'Repeating shift':'Single shift';
/* The + Add button: everything you can add, and the ways to change several shifts at once */
function plAddMenu(){const nR=(st.pat||[]).length+(st.rota||[]).length;
 mo(`<h3>Add to Your Plan</h3>
 <button class="tg big fpri pam" data-k="one"><b>A single shift</b><small>One day, one job</small></button>
 <button class="tg big pam" data-k="rep"><b>A repeating shift</b><small>The same days every week, or every 2 or 3 weeks</small></button>
 <button class="tg big pam" data-k="rota"><b>A rota</b><small>Weeks that differ, for example week 1 Mon to Thu, then week 2 Wed to Sat</small></button>
 <div class="flb" style="margin:16px 0 0">Change your plan</div>
 <button class="tg big" data-k="list">Your repeats and rotas${nR?' ('+nR+')':''}</button>
 <button class="tg big" data-k="sel">Remove several shifts</button>
 <button class="tg big" data-k="no">Close</button>`);
 mcb={no:moX,one:()=>plForm({d:ymd(Date.now())}),rep:()=>plPatForm(null),rota:()=>plRotaForm(null),list:()=>plPatList(),sel:()=>{moX();PL.v='list';PL.sel=new Set();plRender();const e=$('plc');if(e)e.scrollIntoView({block:'start'})}}}
function plRender(){const el=$('plc');if(!el)return;const n=Date.now(),v=PL.v||(PL.v=(()=>{try{return localStorage.getItem('tg.plv')||'list'}catch(e){return 'list'}})());
 const m0=plMonth(),md=new Date(m0),gs=v==='list'?sod(n):wkS(m0),me=new Date(md.getFullYear(),md.getMonth()+1,1).getTime(),ge=v==='list'?sod(n)+(PL.ln||14)*864e5:nwk(wkS(me-864e5));
 const sp=plSpans(),I=plCheck(sp),occ=plOcc(gs,Math.max(ge,gs+50*864e5)),OFF=plOffs(sp),NX=plNext(sp,OFF),T=typeof dayTot==='function'?dayTot():{},C={n,sp,I,occ,OFF,NX,T,CP:plComp(sp,OFF)};
 let h=`<div class="pls ptabs" role="tablist" aria-label="Plan view"><button class="pl${v==='list'?' on':''}" role="tab" data-pv="list" aria-selected="${v==='list'}">Days</button><button class="pl${v==='month'?' on':''}" role="tab" data-pv="month" aria-selected="${v==='month'}">Month</button></div>`+(typeof oweBanner==='function'?oweBanner(wrInfo()):'')+plSummary(NX)+C.CP.filter(c=>c.log).map(c=>`<div class="note bplan" style="margin:0 0 10px">↺ <b>Owed rest:</b> ${plCompTxt(c)}</div>`).join('')+(PL.sel?'':'<button class="pfab" data-pa="1" aria-label="Add shifts, repeats or rotas"><span aria-hidden="true">+</span> Add</button>');
 if(v==='list'){h+=(PL.sel?'<p class="note" style="margin:0 0 8px"><b>Tick the shifts you want to remove</b>, then tap Remove. Each shift says if it is a single shift, a repeat or a rota day.</p>':'')+'<div class="pdl">';
  for(let d=sod(n);d<ge;d=nxd(d)){const S=plStat(d,C),dt=new Date(d),k=S.k;
   const dd=`<span class="pdd"><b>${S.td?'Today':dt.toLocaleDateString('en-GB',{weekday:'short'})}</b><span>${dt.getDate()} ${dt.toLocaleDateString('en-GB',{month:'short'})}</span></span>`;
   if(PL.sel){h+=`<div class="pdr psr${S.os.length?'':' pdx0'}">${dd}<span class="pdb">${S.os.length?S.os.map(o=>{const on=PL.sel.has(o.oid);return `<button type="button" class="psh${on?' on':''}" data-psd="${o.oid}" aria-pressed="${on}" style="--jc:${JCOL[jobI(jobC(o.j).id)]}"><span class="pdc${on?' on':''}" aria-hidden="true">${on?'✓':''}</span><span><b>${esc(jobC(o.j).n)} ${o.s.slice(0,5)}–${o.e.slice(0,5)}</b><small>${plKind(o)}</small></span></button>`}).join(''):`<span class="pds ${k}">${plIco[k]} ${S.txt}</span>`}</span></div>`;continue}
   h+=`<button class="pdr${S.td?' pdt':''}${S.band?' pdo'+(S.band.full?'':' pdo2'):''}" data-pd="${d}"${S.os[0]?` style="border-left-color:${JCOL[jobI(jobC(S.os[0].j).id)]}"`:''}>${dd}<span class="pdb"><span class="pds ${k}">${plIco[k]} ${S.txt}</span>${S.sub.map(x=>`<span class="pdx ${x[0]}">${x[1]}</span>`).join('')}</span><span class="pda" aria-hidden="true">›</span></button>`}
  h+=`</div>${PL.sel?`<div class="pselbar"><span><b>${PL.sel.size}</b> ticked</span><button class="tg" data-psall="1">Tick all</button><button class="tg fdel" data-psdel="1"${PL.sel.size?'':' disabled'}>Remove</button><button class="tg" data-psel="1">Cancel</button></div>`:''}<button class="tg big" data-pl="1" style="margin-top:8px">Show 14 more days</button><p class="note" style="margin-top:6px">Green days are part of a weekly rest in your plan (amber if it is a reduced one). Tap a day for its details, to add a shift or to see what you could work. Earlier days are in Month.</p>`}
 else{h+=`<div class="tr" style="margin:0 0 8px;gap:6px"><button class="tg" data-pm="-1" aria-label="Previous month">‹</button><b style="flex:1;text-align:center;font-size:17px">${md.toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</b><button class="tg" data-pm="1" aria-label="Next month">›</button></div>`;
  h+='<div class="plg">'+['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<div class="plh">${x}</div>`).join('');
  /* the time you started on each past day, from your log */const FS={};all().forEach(x=>{if(x.t==='r')return;const k=sod(x.s);if(!(k in FS)||x.s<FS[k])FS[k]=x.s});
  for(let d=gs;d<ge;d=nxd(d)){if(d<m0){h+='<div class="pld plb" aria-hidden="true"></div>';continue}
   const S=plStat(d,C),inM=new Date(d).getMonth()===md.getMonth(),k=S.k;
   const chips=k==='work'&&S.os.length?S.os.map(o=>{const w=worst(I.get(o.oid));return `<div class="plk${o.rv?' plrv':''}" style="border-left-color:${JCOL[jobI(jobC(o.j).id)]}"><b>${o.s.slice(0,5)}</b><small>–${o.e.slice(0,5)}${w>=2?`<i class="${w>=3?'bad':'warn'}">!</i>`:''}</small></div>`}).join(''):k==='did'?`<div class="plk pll">${FS[d]?`<b>${hm(FS[d])}</b>`:''}<small>${fmt(S.logged).replace(' 00m','')}</small></div>`:k==='ok'||k==='warn'?`<div class="pkw"><b class="pki">${k==='ok'?'✓':'⚠'}</b><span class="pkl">Available</span><span class="pkf">${S.fr&&S.fr.ea>d+15*M?(S.td&&S.fr.ea<=n+6e4?'now':`<span class="pkl">from </span>${plHm(S.fr.ea)}`):''}</span></div>`:k==='rest'?'<div class="pkw"><b class="pki">✕</b><span class="pkl">Rest</span><span class="pkf"></span></div>':k==='work'?'<div class="pkw"><b class="pki">⚒</b><span class="pkl">Working</span><span class="pkf"></span></div>':'';
   const due=(S.sub.find(x=>x[0]==='bad'&&/must start/.test(x[1]))?`<div class="plr bad">Rest due <span>${plHm(NX.due)}</span></div>`:'')+C.CP.map(c=>!c.log&&sod(c.s)===d?`<div class="plr ${c.pay?'warn':'bad'}">↺ −${Math.round(c.owed/H)}h</div>`:c.pay&&sod(c.pay.s)===d?`<div class="plr ok">↺ +${Math.round(c.owed/H)}h</div>`:'').join(''),rs='',re='';
   h+=`<button class="pld pk-${k}${inM?'':' plo'}${S.td?' plt':''}${S.past?' plp':''}" data-pd="${d}"${k==='work'&&S.os[0]?` style="border-left:4px solid ${JCOL[jobI(jobC(S.os[0].j).id)]}"`:''} aria-label="${new Date(d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}: ${S.txt.replace(/<[^>]+>/g,'')}"><span class="pln">${new Date(d).getDate()}</span>${re}${k==="work"?chips+rs+due:due+rs+chips}</button>`}
  h+='</div>'+'<div class="bx plkey" style="margin-top:10px"><div class="lbl" style="margin-bottom:4px">Key</div>'+
   '<div><span class="ki"><span class="pkey pk-work" style="border-left:4px solid #3b82f6">09:00</span></span>Working: when your planned shift starts and finishes, in the job\'s colour. A dashed line means the times vary. A red ! means it breaks a rule</div>'+
   '<div><span class="ki"><span class="pkey pk-ok">✓</span></span>Available: nothing planned and you could work. A time under it (04:00) is the earliest you can start, after the rest you need from your last shift</div>'+
   '<div><span class="ki"><span class="pkey pk-warn">⚠</span></span>Available, but working would mean a reduced daily or weekly rest</div>'+
   '<div><span class="ki"><span class="pkey pk-rest">✕</span></span>Rest: the rules mean you cannot work this day</div>'+
   '<div><span class="ki"><span class="pkey pk-did">07:00</span></span>A past day: the time you started and the hours you worked</div>'+
   '<div><span class="ki"><span class="plr warn" style="margin:0">↺ −9h</span></span>A reduced weekly rest starts: the hours you owe for it</div>'+
   '<div><span class="ki"><span class="plr ok" style="margin:0">↺ +9h</span></span>The rest in your plan that makes those hours up. Tap the day to see how long to keep clear</div>'+
   '<div><span class="ki"><span class="plr bad" style="margin:0">Rest due</span></span>Your weekly rest has to start by this time, and your plan does not leave room for it</div><div class="note" style="margin-top:4px">Tap a day for details.</div></div>'}
 set(el,h)}

function plDay(d){const n=Date.now(),sp=plSpans(),I=plCheck(sp),OFF=plOffs(sp),NX=plNext(sp,OFF),occ=plOcc(d,nxd(d)).filter(o=>sod(o.S)===d),T=typeof dayTot==='function'?dayTot():{},o2=T[d],past=nxd(d)<=n;
 const fr=!past&&!occ.filter(o=>o.st!=='skip').length&&!(o2&&o2.d+o2.w)?plFree(d,sp,I):null;
 const isz=L=>(L||[]).map(x=>`<div class="note ${x.lv==='r'?'bad':x.lv==='a'?'warn':''}" style="margin-top:4px">${x.lv==='r'?'✕ ':x.lv==='a'?'⚠ ':'ℹ '}${x.t}</div>`).join('');
 let h=`<h3>${new Date(d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</h3>`;
 if(o2&&o2.d+o2.w)h+=`<div class="item"><div class="lbl">Logged</div><div class="lbl">${fmt(o2.d)} driving, ${fmt(o2.w)} work</div></div>`;
 occ.forEach(o=>{const j=jobC(o.j),stx=o.st==='skip'?' · not worked':o.st==='done'||o.E<=n?' · past':'';
  h+=`<div class="bx" style="margin-top:8px;border-left:4px solid ${JCOL[jobI(j.id)]}"><div class="row"><span class="lbl">${esc(j.n)}${j.tc===false?' (no tacho)':''}${o.rot?' · rota week '+o.wk:o.pat?' · repeats '+ordW(((st.pat||[]).find(r=>r.id===o.pat)||{}).ev):''}${stx}</span><span class="lbl">${o.s.slice(0,5)}–${o.e.slice(0,5)}</span></div><div class="note">${o.br?o.br+' min break'+(o.bp?' (paid)':'')+'. ':''}${j.tc!==false&&o.dr?o.dr+'h driving expected. ':''}Working time about ${fmt(o.E-o.S-(o.br||0)*M)}.</div>${o.E>n&&o.st!=='skip'&&o.st!=='done'?'<div class="note" style="margin-top:4px">☕ '+plBrk(o.S,o.E,o.br||0,o.dr||0,j.tc!==false)+'</div>':''}${o.st==='skip'||o.st==='done'||o.E<=n?'':isz(I.get(o.oid))}<div class="tr" style="margin:8px 0 0;gap:6px;flex-wrap:wrap"><button class="tg" data-k="e:${o.oid}">Edit${o.pat?' this day':''}</button>${o.pat?`<button class="tg" data-k="es:${o.pat}">${o.rot?'Edit rota':'Edit repeat'}</button>`:''}<button class="tg" data-k="x:${o.oid}">Remove${o.pat?' this day':''}</button>${o.pat?`<button class="tg" data-k="xf:${o.oid}">Remove this and later</button>`:''}</div></div>`});
 if(fr){h+=`<div class="bx" style="margin-top:8px"><div class="lbl"><span class="pldot ${['','ok','warn','bad'][fr.lv]}"></span> ${fr.lv===3?'Rest: '+plRestWhy(fr):fr.lv===2?'Available, with a short daily rest':'Available'}</div>${fr.lv<3||fr.la>fr.ea?`<div class="note">Earliest start <b>${hm(fr.ea)}</b>, latest finish <b>${fr.la===Infinity?'no limit from other shifts':hmx(fr.la,d)}</b>, based on 11 hour rests around your other shifts${fr.ea<d+4*H?'. Starting before 04:00 counts as night work (10 hour limit)':''}.</div>`:''}${fr.txt?`<div class="note">${fr.txt}</div>`:''}${fr.lv<3&&!fr.cut?(fr.lv===1&&!fr.R.length?'<div class="note ok" style="margin-top:4px">✓ '+(/^(8|11|18)h/.test(fmt(fr.e0-fr.s0))?'An ':'A ')+fmt(fr.e0-fr.s0).replace(/ 00m$/,'')+' shift from '+hm(fr.s0)+' to '+hmx(fr.e0,d)+' breaks no rules.</div>':'<div class="note" style="margin-top:4px">'+(/^(8|11|18)h/.test(fmt(fr.e0-fr.s0))?'An ':'A ')+fmt(fr.e0-fr.s0).replace(/ 00m$/,'')+' shift from '+hm(fr.s0)+' to '+hmx(fr.e0,d)+':</div>'):''}${isz(fr.R)}</div>`}
 h+=plOffNote(d,OFF,NX,plComp(sp,OFF));
 h+=`<button class="tg big" data-k="add" style="margin-top:12px">Add shift</button><button class="tg big" data-k="rp">Repeating shift starting this day</button><button class="tg big" data-k="cw">Copy this week to next week</button><button class="tg big" data-k="no">Close</button>`;
 mo(h);mcb={no:moX,add:()=>plForm({d:ymd(d)}),cw:()=>plCopyWeek(d),rp:()=>plPatForm(null,ymd(d))};
 occ.forEach(o=>{mcb['e:'+o.oid]=()=>plForm(o.pat?{d:o.d,j:o.j,s:o.s,e:o.e,br:o.br,bp:o.bp,dr:o.dr,rv:o.rv,fromPat:o.oid}:(st.plan||[]).find(p=>p.id===o.oid));
  if(o.pat)mcb['es:'+o.pat]=()=>o.rot?plRotaForm((st.rota||[]).find(r=>r.id===o.pat)):plPatForm((st.pat||[]).find(r=>r.id===o.pat));
  if(o.pat)mcb['xf:'+o.oid]=()=>{mo(`<h3>Remove This and Later?</h3><p>This removes ${esc(jobC(o.j).n)} on ${dlong(o.S)} and every later shift of this ${o.rot?'rota':'repeat'}. Shifts before it stay.</p><button class="tg big fdel" data-k="ok">Remove this and later</button><button class="tg big" data-k="no">Cancel</button>`);mcb={no:()=>plDay(d),ok:()=>{const sn=plSnap();plCutFrom(o.pat,o.d);save();plRender();moX();plUndo(sn,'Removed this and every later shift of the '+(o.rot?'rota':'repeat')+'.')}}};
  mcb['x:'+o.oid]=()=>{const sn=plSnap();plHide(o);save();plRender();plDay(d);plUndo(sn,'Removed '+esc(jobC(o.j).n)+' on '+dlong(o.S)+'.')}})}

/* When the breaks in a planned shift have to be taken: never more than 6 hours of work in a row (RTWTR), and for tacho driving a 45 minute break by 4h 30m of driving (561/2006 art 7). */
/* When to take a break so that one break covers the rest of the shift, and taking it too early does not leave a second one
   due. From a point in a shift: w0 work and d0 driving since the last full break, R work and Dr driving still to do (driving
   taken as spread evenly through the work). t is the work done before the break: no more than 6 hours of work either side of it
   (Working Time Regulations) and no more than 4h 30m of driving either side (561/2006 art 7). lw and hw say which rule sets
   the earliest (lo) and latest (hi) time. null means no break is needed. */
function plWin(w0,d0,R,Dr){const dv=Dr>0&&d0+Dr>=270*M,r=R>0?Dr/R:0;
 if(w0+R<=6*H&&!dv)return null;
 let lo=0,hi=R,lw='',hw='';
 if(R-6*H>lo){lo=R-6*H;lw='w'}if(6*H-w0<hi){hi=6*H-w0;hw='w'}
 if(dv&&r>0){const x=R-270*M/r,y=(270*M-d0)/r;if(x>lo){lo=x;lw='d'}if(y<hi){hi=y;hw='d'}}
 lo=Math.max(0,lo);return{lo,hi,lw,hw,ok:lo<=hi+6e4}}
const plR5=(t,up)=>(up?Math.ceil:Math.floor)(t/(5*M))*5*M;
const plWhy=k=>k==='dn'?'4h 30m of driving if you keep driving':k==='d'?'4h 30m of driving':'6 hours of work';
function plBrk(S,E,br,dr,tc){br=br||0;const w=E-S-br*M,dv=tc?(dr||0)*H:0,need=Math.max(w>9*H?45:w>6*H?30:0,dv>=270*M?45:0),X=plWin(0,0,w,dv);
 if(!X)return br?'No break is needed by law for this shift, so take yours when it suits you.':'No break is needed by law for up to 6 hours of work and under 4h 30m of driving.';
 const len=Math.max(br,need),pre=br<need?`This shift needs at least ${need} minutes of breaks, so add more. `:'';
 if(X.ok){let a=S+plR5(X.lo,1),b=S+plR5(X.hi);if(b<a){a=S+Math.ceil(X.lo/M)*M;b=Math.max(a,S+Math.floor(X.hi/M)*M)}const any=X.lo<5*M,mid=S+Math.round((X.lo+X.hi)/2/(15*M))*15*M;
  let t=pre+(any?`Take your ${len} minute break by <b>${plHm(b)}</b>`:`Take your ${len} minute break between <b>${plHm(a)}</b> and <b>${plHm(b)}</b>`)+(b-a>=60*M?`, ideally around <b>${plHm(mid)}</b>`:'')+'.';
  if(!any)t+=` <b>Not before ${plHm(a)}</b>: you would still have more than ${plWhy(X.lw)} left after it, and need a second break.`;
  if(X.hw)t+=` Not after ${plHm(b)}, which is ${plWhy(X.hw)}${X.hw==='w'?' in a row':''}.`;
  if(dv>=270*M&&len>=45)t+=` To split it, take 15 minutes first and then the 30 (or more) ${any?'by '+plHm(b):'between '+plHm(a)+' and '+plHm(b)}. Only the 30 starts your driving time again.`;
  return t}
 /* one break cannot cover it: two breaks, the second set by the driving rule if there is one */
 const r=dv>=270*M&&w>0?dv/w:0,lo2=Math.max(w-6*H,r?w-270*M/r:0),hi2=Math.min(w,r?270*M/r:w),t2=Math.min(hi2,Math.max(lo2,w*2/3)),t1=Math.min(6*H,Math.max(t2-6*H,t2/2));
 if(lo2>hi2||t2-t1>6*H+6e4||len<30){/* two breaks are not enough either: as many as it takes, each as late as the rules allow */
  const G=plGreedy(w,dv);if(!G)return pre+'This shift has more driving than the daily limit allows. Shorten it.';
  const tot=G.reduce((q,x)=>q+x.len,0),need3=Math.max(need,tot),out=[];G.forEach(x=>{const at=S+x.t+out.reduce((q,y)=>q+y.len*M,0);out.push({at,len:x.len,d:x.d})});
  return (br<need3?`This shift needs at least ${need3} minutes of breaks, so add more. `:'')+`This shift needs ${G.length} breaks: ${out.map((x,i)=>`<b>${x.len} minutes by ${plHm(x.at)}</b>${x.d?' (driving break)':''}`).join(', then ')}. Each one goes as late as the rules allow, so taking one earlier can mean an extra break later.${dv?' This takes your driving as spread evenly through the shift, so check your tacho for the 4h 30m.':''}`}
 const b1=dv>=270*M?15:Math.max(15,Math.floor(len/2/5)*5),b2=len-b1;
 return pre+`One ${len} minute break cannot cover this shift: with ${fmt(w).replace(/ 00m$/,'')} of work${dv?' and '+fmt(dv).replace(/ 00m$/,'')+' of driving':''}, whenever you took it there would be too long a stretch before or after. Split it: about <b>${b1} minutes around ${plHm(S+plR5(t1))}</b>, then <b>${b2} minutes around ${plHm(S+plR5(t2)+b1*M)}</b>.${dv>=270*M?' The second part must be 30 minutes or more.':''}`}
/* Breaks placed one at a time, each as late as allowed: no more than 6 hours of work and 4h 30m of driving (driving spread
   evenly) since the last break. A driving break is 45 minutes and starts the 4h 30m again; a working time break is 15. Work
   time in t, rounded down to the minute. null when the planned driving is over the 10 hour daily limit. */
function plGreedy(w,dv){const r=w>0?dv/w:0,G=[];let t=0,d=0;if(dv>10*H)return null;
 for(let k=0;k<6;k++){const wl=t+6*H,dl=r>0?t+(270*M-d)/r:Infinity;if(w<=wl&&(r===0||d+r*(w-t)<=270*M+6e4))break;
  let bt=Math.min(wl,dl);const b1=Math.floor(bt/M)*M;if(b1>t)bt=b1;if(dl<=wl+6e4){G.push({t:bt,len:45,d:1});d=0}else{G.push({t:bt,len:15});d+=r*(bt-t)}t=bt}
 const need=w>9*H?45:w>6*H?30:0;let tot=G.reduce((q,x)=>q+x.len,0);if(tot<need&&G.length)G[G.length-1].len+=need-tot;return G}
/* The same advice live, during a shift you planned: worked out again on every tick from the real start, the work and driving
   since your last break, the breaks already taken and the driving still planned, so it follows the day as it goes.
   q: n now, E finish, mv (times vary: the finish moved with your real start), br planned break minutes, tk break time taken
   so far (each part 15 minutes or more), tot work so far, w0 and d0 work and driving since the last break, Dr driving still to
   do, half (the 15 minute part of a split driving break is done). */
function plLive(q){const{n,E,mv,br,tk,tot,w0,d0,Dr,half,drv}=q,tkm=Math.round(tk/M);
 const f=mv?`a finish at about <b>${plHm(E)}</b> (your planned length from when you started)`:`your planned finish at <b>${plHm(E)}</b>`;
 /* the working time total: 30 minutes for over 6 hours of work, 45 for over 9, counting every break of 15 minutes or more */
 const R0=E-n-Math.max(0,br-tkm)*M,needW=tot+R0>9*H?45:tot+R0>6*H?30:0,dv=Dr>0&&d0+Dr>=270*M,needD=dv?(half?30:45):0,
  rem=Math.max(0,needW-tkm,needD,Math.min(br-tkm,br)),R=E-n-rem*M;if(R<15*M&&!rem)return '';
 const had=tkm?`You have had ${tkm} min of breaks. `:'',
  more=rem?`You need <b>${rem} more minutes</b>${half&&dv?' in one go (the 30 minute part of your driving break)':''} before ${f}. `:'';
 const X=plWin(w0,d0,Math.max(0,R),Dr);
 /* driving right now: if you keep going, 4h 30m comes sooner than the plan's spread-out driving says */
 if(X&&drv&&dv&&270*M-d0<X.hi){X.hi=Math.max(0,270*M-d0);X.hw='dn';X.ok=X.lo<=X.hi+6e4}
 if(!X)return rem?`☕ ${had}${more}Take ${rem>=15?'it in one go of at least 15 minutes':'it'} by <b>${plHm(E-rem*M)}</b>.`:(tkm||w0>30*M||d0>0)?`☕ ${had}You do not need another break before ${f}.`:'';
 if(!X.ok){const t1=n+plR5(Math.max(0,X.hi)),l1=rem||15,X2=plWin(0,0,Math.max(0,R-X.hi),Math.max(0,Dr-(270*M-d0)));
  let t=`☕ ${had}${X.hw==='dn'?`If you keep driving you reach 4h 30m at <b>${plHm(t1)}</b>, so take your ${l1} minute break by then.`:`Take a ${l1} minute break by <b>${plHm(t1)}</b>.`}`;
  if(X2&&X2.ok){const a2=t1+l1*M+plR5(X2.lo,1),b2=Math.max(a2,t1+l1*M+plR5(X2.hi));t+=` After it you will still have more than 6 hours of work before ${f}, so take one more break of at least 15 minutes between <b>${plHm(a2)}</b> and <b>${plHm(b2)}</b>.`}
  else t+=` You will need more breaks after that before ${f}.`;return t}
 let a=n+plR5(X.lo,1),b=n+plR5(X.hi);if(b<a){a=n+Math.ceil(X.lo/M)*M;b=Math.max(a,n+Math.floor(X.hi/M)*M)}const len=rem||(tkm?15:br||30),lead=more?more+'T':tkm&&!rem?`Your breaks add up to enough, but you cannot work more than 6 hours in a row, so you need one more break of at least 15 minutes before ${f}. T`:`For ${f}: t`;
 if(X.lo<5*M)return `☕ ${had}${lead}ake your ${len} minute break by <b>${plHm(b)}</b>${X.hw?`, when you reach ${plWhy(X.hw)}${X.hw==='w'?' in a row':X.hw==='d'?' since your last break':''}`:''}. One break then lasts you to the end.`;
 return `☕ ${had}${lead}ake your ${len} minute break between <b>${plHm(a)}</b> and <b>${plHm(b)}</b>. <b>Not before ${plHm(a)}</b>, or you would still have more than ${plWhy(X.lw)} left and need another one.${X.hw?` Not after ${plHm(b)}, when you reach ${plWhy(X.hw)}${X.hw==='w'?' in a row':X.hw==='d'?' since your last break':''}.`:''}`}
/* One line for the Today card before a planned shift starts: the shift and when its break goes. */
function plHeroPlan(o){const j=jobC(o.j),tc=j.tc!==false,w=o.E-o.S-(o.br||0)*M,dv=tc?(o.dr||0)*H:0,X=plWin(0,0,w,dv);
 let t=`<b>${o.rv?'About ':''}${o.s.slice(0,5)}–${o.e.slice(0,5)}</b> ${esc(j.n)}`;
 if(!X)t+='. No break needed by law.';
 else if(X.ok){const a=o.S+plR5(X.lo,1),b=Math.max(a,o.S+plR5(X.hi)),need=Math.max(w>9*H?45:w>6*H?30:15,dv>=270*M?45:0);t+=`. ☕ ${Math.max(o.br||0,need)} min break ${X.lo<5*M?'by <b>'+plHm(b)+'</b>':'between <b>'+plHm(a)+'</b> and <b>'+plHm(b)+'</b>'}${X.lo>=5*M?', not before '+plHm(a):''}.`}
 else t+='. ☕ It needs two breaks: see the Plan for when.';
 return t}
/* Where the break goes when a planned shift is logged afterwards: in the middle of the advised window, so the log keeps the rules. */
function plBrkAt(S,E,br,dr,tc){const w=E-S-br*M,X=plWin(0,0,w,tc?(dr||0)*H:0);if(X&&X.ok)return S+Math.min(X.hi,Math.max(X.lo,plR5((X.lo+X.hi)/2)));return S+Math.max(0,w/2)}
/* The breaks to log for a planned shift: one in the advised window, or as many as the shift needs, each as late as allowed */
function plBrkList(S,E,br,dr,tc){br=br||0;const w=E-S-br*M,dv=tc?(dr||0)*H:0,X=plWin(0,0,w,dv);if(!br)return [];
 if(!X||X.ok)return [{at:plBrkAt(S,E,br,dr,tc),len:br*M}];
 const G=plGreedy(w,dv);if(!G||!G.length)return [{at:plBrkAt(S,E,br,dr,tc),len:br*M}];const tot=G.reduce((q,x)=>q+x.len,0);if(br>tot)G[G.length-1].len+=br-tot;
 let used=0;return G.map(x=>{const at=S+x.t+used;used+=x.len*M;return{at,len:x.len*M}})}
/* The shift form: chips you tap instead of dropdowns. The values live in the same inputs as before (hidden where a chip row
   sets them), so plRead and both forms keep working. plFsync marks the chosen chips and writes the length line. */
function plPresets(){const C={};(st.plan||[]).concat(st.pat||[],st.rota||[]).forEach(x=>{if(x.s&&x.e){const k=x.s.slice(0,5)+'-'+x.e.slice(0,5);C[k]=(C[k]||0)+1}});
 const L=Object.keys(C).sort((a,b)=>C[b]-C[a]).slice(0,4);return L.length?L:['09:00-17:00','07:00-15:00']}
function plFields(p){const J=jobs(),jj=p.j||st.cj||J[0].id,br=p.br===undefined?30:p.br;
 return `<div class="fsec"><div class="flb">Job</div><div class="fchips">${J.map(x=>`<button type="button" class="fchip fjob" data-fk="j:${x.id}" style="--jc:${JCOL[jobI(x.id)]}"><i></i>${esc(x.n)}${x.tc===false?'<small>no tacho</small>':''}</button>`).join('')}</div><input type="hidden" id="pfj" value="${jj}"></div>
 <div class="fsec"><div class="flb">Time</div><div class="ftimes"><label class="ftime"><span>Start</span><input type="time" id="pfs" value="${p.s||'09:00'}"></label><span class="farr" aria-hidden="true">→</span><label class="ftime"><span>Finish</span><input type="time" id="pfe" value="${p.e||'17:00'}"></label></div>
 <div class="fsub">Your usual times</div><div class="fchips fsm">${plPresets().map(t=>`<button type="button" class="fchip" data-fk="t:${t}">${t.replace('-','–')}</button>`).join('')}</div>
 <div class="fsub">Or set the length from the start time</div><div class="fchips fsm">${[4,6,8,9,10,12].map(h=>`<button type="button" class="fchip" data-fk="L:${h}">+${h}h</button>`).join('')}</div><div class="fsum" id="pfsum"></div>
 <label class="fsw"><span>Times vary<small>Your start and finish change from day to day. These times are used as a rough guide, and the app asks what you really worked at the end.</small></span><span class="swt"><input type="checkbox" id="pfrv"${p.rv?' checked':''}><i></i></span></label></div>
 <div class="fsec"><div class="flb">Break</div><div class="fchips">${[0,15,30,45,60,90].map(v=>`<button type="button" class="fchip" data-fk="b:${v}">${v?v+' min':'None'}</button>`).join('')}</div><input type="hidden" id="pfb" value="${br}"><div class="note warn" id="pfbn" hidden>4h 30m or more of driving needs at least 45 minutes of breaks (one 45, or 15 then 30).</div>
 <label class="fsw"><span>Paid break<small>For your own records. Paid or not, a break never counts as work.</small></span><span class="swt"><input type="checkbox" id="pfbp"${p.bp?' checked':''}><i></i></span></label></div>
 <div class="fsec" id="pfdw"><div class="flb">Driving expected</div><div class="fstep"><button type="button" data-fk="d:-0.5" aria-label="Less driving">−</button><input type="number" id="pfd" min="0" max="15" step="0.5" value="${p.dr===undefined?(jobC(jj).tc!==false?4.5:''):p.dr}" placeholder="0" aria-label="Driving expected, in hours"><span>hours</span><button type="button" data-fk="d:0.5" aria-label="More driving">+</button></div><div class="note">Counts towards your tacho driving limits.</div></div>`}
/* What a shift needs, from what is picked: breaks (how long, why, when) and the rest before and after it. ok, warn or bad each. */
function plReq(s0,e0,q,tc,sp){const L=[],work=e0-s0-q.br*M,dv=tc?q.dr*H:0,W=work>9*H?45:work>6*H?30:0,Dn=dv>=270*M?45:0,need=Math.max(W,Dn),why=[];
 if(W)why.push(fmt(work).replace(/ 00m$/,'')+' of work'+(W===45?' (over 9 hours)':' (over 6 hours)'));if(Dn)why.push(fmt(q.dr*H).replace(/ 00m$/,'')+' of driving (4h 30m or more)');
 L.push(need?[q.br>=need?'ok':'bad',`<b>Breaks:</b> at least ${need} minutes, for ${why.join(' and ')}. You have ${q.br||0} min${q.br>=need?'.':', so add more.'}`]:['ok','<b>Breaks:</b> none needed by law (up to 6 hours of work and under 4h 30m of driving).']);
 if(need||q.br)L.push(['mut','<b>When:</b> '+plBrk(s0,e0,q.br,q.dr,tc)]);
 const pe=sp.filter(x=>x.id!=='new'&&x.e<=s0).reduce((m,x)=>Math.max(m,x.e),0),ns=sp.filter(x=>x.id!=='new'&&x.s>=e0).reduce((m,x)=>Math.min(m,x.s),Infinity);
 if(pe){const g=s0-pe;L.push([g>=11*H?'ok':g>=9*H?'warn':'bad',`<b>Rest before:</b> ${fmt(g)} since your last shift ended ${dmy(pe)}. You need 11 hours${g>=11*H?'.':g>=9*H?' (9 is allowed up to 3 times between weekly rests).':', or at least 9 as a reduced rest.'}`])}
 if(ns!==Infinity){const g=ns-e0;L.push([g>=11*H?'ok':g>=9*H?'warn':'bad',`<b>Rest after:</b> ${fmt(g)} before your next shift ${dmy(ns)}. You need 11 hours${g>=11*H?'.':g>=9*H?' (9 is allowed up to 3 times between weekly rests).':', or at least 9 as a reduced rest.'}`])}
 return L.map(x=>`<div class="freq ${x[0]}"><b class="fi">${x[0]==='ok'?'✓':x[0]==='warn'?'⚠':x[0]==='bad'?'✕':'☕'}</b><span>${x[1]}</span></div>`).join('')}
/* After a shift or repeat is saved: if it lands on top of another planned shift (a rolling rota can do this), ask which one
   to work on those days, so two shifts never clash. snap holds the plan before the change, for go back. */
function plClash(id,snap,done,back){const n=Date.now(),O=plOcc(sod(n),n+400*864e5),me=o=>o.pat===id||o.oid===id,mine=O.filter(me),C=[];
 mine.forEach(a=>O.forEach(b=>{if(me(b))return;if(a.S<b.E&&b.S<a.E)C.push([a,b])}));
 if(!C.length)return done();
 const nm=o=>`${dlong(o.S)}: ${esc(jobC(o.j).n)} ${o.s.slice(0,5)}–${o.e.slice(0,5)} <small>(${plKind(o).toLowerCase()})</small>`,uniq=L=>[...new Map(L.map(o=>[o.oid,o])).values()].sort((a,b)=>a.S-b.S),
  lst=L=>'<div class="note" style="margin:4px 0 0">'+L.slice(0,6).map(nm).join('<br>')+(L.length>6?'<br>and '+(L.length-6)+' more':'')+'</div>',
  old=uniq(C.map(c=>c[1])),nw=uniq(C.map(c=>c[0])),one=old.filter(o=>!o.pat).length;
 mo(`<h3>Shifts Clash</h3><p>This lands on top of ${old.length} shift${old.length>1?'s':''} already in your plan. Only one can stay on those days.</p>
 <div class="bx" style="margin-top:8px"><div class="lbl">Already planned</div>${lst(old)}</div>
 ${one?`<p class="note warn" style="margin-top:8px">⚠ ${one} of these ${one>1?'are single shifts you added':'is a single shift you added'}. Keeping the new one removes ${one>1?'them':'it'}.</p>`:''}
 <button class="tg big fpri" data-k="od">Keep the ones already planned<small style="display:block;font-weight:400;opacity:.85">The new one is left off those ${nw.length} day${nw.length>1?'s':''}</small></button><button class="tg big" data-k="nw">Keep the new one<small style="display:block;font-weight:400;opacity:.85">Removes the ${old.length} shift${old.length>1?'s':''} listed above</small></button><button class="tg big" data-k="bk">Go back and change it</button>`);
 mcb={nw:()=>{old.forEach(o=>plHide(o,id));done();plUndo(snap,`Removed ${old.length} clashing shift${old.length>1?'s':''}.`)},od:()=>{nw.forEach(o=>{const w=C.find(c=>c[0].oid===o.oid)[1];plHide(o,w.pat||w.oid)});done()},bk:()=>{plRest(snap);back()}}}
const plSnap=()=>JSON.stringify({pat:st.pat||[],plan:st.plan||[],plx:st.plx||[],rota:st.rota||[],plxc:st.plxc||{}});
function plRest(j){const s=JSON.parse(j);['pat','plan','plx','rota','plxc'].forEach(k=>{if(s[k]!==undefined)st[k]=s[k]})}
/* Take one planned shift off the plan. A repeat or rota day is hidden; if it was hidden because something else won a clash,
   that is remembered (plxc), so the day comes back if the winner is removed later. */
function plHide(o,win){if(o.pat){if(!(st.plx||[]).includes(o.oid))st.plx=(st.plx||[]).concat(o.oid);if(win){st.plxc=Object.assign({},st.plxc);st.plxc[o.oid]=win}else if(st.plxc&&st.plxc[o.oid]){st.plxc=Object.assign({},st.plxc);delete st.plxc[o.oid]}}
 else{st.plan=(st.plan||[]).filter(x=>x.id!==o.oid);plUnhide(o.oid)}}
/* Bring back days that were only hidden because the shift or repeat wid won a clash (from a date onwards) */
function plUnhide(wid,from){const C=st.plxc||{},back=Object.keys(C).filter(k=>C[k]===wid&&(!from||k.split('|')[1]>=from));if(!back.length)return;
 const B=new Set(back);st.plx=(st.plx||[]).filter(k=>!B.has(k));st.plxc=Object.assign({},C);back.forEach(k=>delete st.plxc[k])}
/* After anything is removed: a bar with Undo for 15 seconds */
let plUT=0;function plUndo(snap,msg){let el=$('plu');if(!el){el=document.createElement('div');el.id='plu';el.setAttribute('role','status');document.body.appendChild(el)}
 el.innerHTML=`<span>${msg}</span><button class="tg" type="button">Undo</button>`;el.hidden=false;clearTimeout(plUT);plUT=setTimeout(()=>{el.hidden=true},15000);
 el.querySelector('button').onclick=()=>{plRest(snap);save();plRender();el.hidden=true;if(!$('mo').hidden)moX()}}
function plFsync(){const w=$('mo');if(!w||!$('pfs'))return;const on=(k,v)=>w.querySelectorAll(`[data-fk^="${k}:"]`).forEach(b=>b.classList.toggle('on',b.dataset.fk===k+':'+v));
 {const tc=jobC($('pfj').value).tc!==false,dv=tc?parseFloat(($('pfd')||{}).value)||0:0,need=dv>=4.5?45:0;if(need&&+$('pfb').value<need)$('pfb').value=need;
  w.querySelectorAll('[data-fk^="b:"]').forEach(b=>{const v=+b.dataset.fk.slice(2);b.disabled=v<need;b.classList.toggle('foff',v<need)});if($('pfbn'))$('pfbn').hidden=!need}
 on('j',$('pfj').value);on('b',$('pfb').value);if($('pft')){const t=$('pft');on('u',t.dataset.u||(t.value?'d':'0'))}on('t',$('pfs').value+'-'+$('pfe').value);if($('pfr'))on('r',$('pfr').value);if($('pfdt'))on('dt',$('pfdt').value);
 const s=tmin($('pfs').value),e=tmin($('pfe').value),sm=$('pfsum');if(!isNaN(s)&&!isNaN(e)){let L0=e-s;if(L0<=0)L0+=1440;on('L',L0%60?'x':String(L0/60))}if(sm){if(isNaN(s)||isNaN(e)||s===e){sm.textContent='';return}let L=e-s;if(L<=0)L+=1440;const wk=Math.max(0,L-(+$('pfb').value||0));
  sm.innerHTML=`<b>${fmt(L*M).replace(/ 00m$/,'')}</b> shift · <b>${fmt(wk*M).replace(/ 00m$/,'')}</b> of work${e<=s?' · <span class="warn">finishes the next day</span>':''}`}}
document.addEventListener('click',e=>{const b=e.target.closest('#mo [data-fk]');if(!b)return;const[k,v]=b.dataset.fk.split(/:(.*)/s);
 if(k==='j'){$('pfj').value=v;plDrv();/* a tacho job starts with the usual 4h 30m of driving */if(jobC(v).tc!==false&&!(parseFloat($('pfd').value)>0))$('pfd').value=4.5}else if(k==='t'){const[a,c]=v.split('-');$('pfs').value=a;$('pfe').value=c}else if(k==='b')$('pfb').value=v;else if(k==='r')$('pfr').value=v;else if(k==='dt')$('pfdt').value=v;
 else if(k==='L'){const s=tmin($('pfs').value);if(!isNaN(s)){const e=(s+ +v*60)%1440;$('pfe').value=String(Math.floor(e/60)).padStart(2,'0')+':'+String(e%60).padStart(2,'0')}}
 else if(k==='u'){const t=$('pft'),w=$('pftw');if(v==='0'){t.value='';w.hidden=true}else if(v==='d'){w.hidden=false;t.focus&&t.focus()}else{const f=$('pff').value?pdt($('pff').value):sod(Date.now());t.value=ymd(f+(+v-1)*864e5);w.hidden=false}t.dataset.u=v}
 else if(k==='d'){const x=$('pfd');x.value=Math.max(0,Math.min(15,(parseFloat(x.value)||0)+ +v))}
 plFsync();b.dispatchEvent(new Event('input',{bubbles:true}))});
document.addEventListener('input',e=>{if(e.target.closest&&e.target.closest('#mo')&&$('pfs'))plFsync()});
/* a job without a tachograph has no driving to plan, so hide that box */
function plDrv(){const w=$('pfdw'),j=$('pfj');if(w&&j)w.hidden=jobC(j.value).tc===false}
function plRead(){return{j:$('pfj').value,s:$('pfs').value,e:$('pfe').value,br:+$('pfb').value,bp:$('pfbp')&&$('pfbp').checked?1:0,rv:$('pfrv')&&$('pfrv').checked?1:0,dr:jobC($('pfj').value).tc===false?0:parseFloat($('pfd').value)||0}}
function plForm(p){p=p||{};const isNew=!p.id&&!p.fromPat;const t0=sod(Date.now()),d0=p.d||ymd(t0),days=[];for(let k=0;k<7;k++)days.push(ymd(t0+k*864e5));
 const dchip=x=>{const t=pdt(x),dt=new Date(t);return `<button type="button" class="fchip fday" data-fk="dt:${x}"><b>${t===t0?'Today':dt.toLocaleDateString('en-GB',{weekday:'short'})}</b><span>${dt.getDate()} ${dt.toLocaleDateString('en-GB',{month:'short'})}</span></button>`};
 mo(`<h3>${isNew?'Add Shift':'Edit Shift'}</h3><div class="fform"><div class="fsec"><div class="flb">Day</div><div class="fchips fdays">${(days.includes(d0)?days:[d0].concat(days)).map(dchip).join('')}</div><label class="fother">Another date<input type="date" id="pfdt" value="${d0}"></label></div>${plFields(p)}
 <div class="fsec"><div class="flb">Repeat</div><div class="fchips">${[['0','Just this day'],['1','Every week'],['2','Every 2 weeks'],['3','Every 3 weeks'],['4','Every 4 weeks']].map(x=>`<button type="button" class="fchip" data-fk="r:${x[0]}">${x[1]}</button>`).join('')}</div><input type="hidden" id="pfr" value="0"></div>
 <div class="fsec fchk"><div class="flb">Rules check</div><div id="pfiss"><div class="note">Checking…</div></div></div><div class="note bad" id="pferr"></div></div>
 <button class="tg big fpri" data-k="ok">${isNew?'Add shift':'Save changes'}</button>${isNew?'':`<button class="tg big fdel" data-k="del">${p.fromPat?'Remove this day':'Remove shift'}</button>`}<button class="tg big" data-k="no">Cancel</button>${isNew?'<button class="flink" data-k="rpl">Repeating shifts and rotas</button>':''}`);plDrv();plFsync();
 const build=()=>{const v=plRead(),d=$('pfdt').value;if(!d||!v.s||!v.e){$('pferr').textContent='Enter the date, start and finish.';return null}if(v.s===v.e){$('pferr').textContent='Start and finish cannot be the same.';return null}$('pferr').textContent='';return Object.assign({id:p.id||plId(),d},v)};
 const show=q=>{const s0=pdt(q.d)+tmin(q.s)*M;let e0=pdt(q.d)+tmin(q.e)*M;if(e0<=s0)e0=nxd(pdt(q.d))+tmin(q.e)*M;const j=jobC(q.j),tc=j.tc!==false,w=Math.max(0,e0-s0-q.br*M);
  const sk=p.id||p.fromPat,sp=plSpans({s:s0,e:e0,w,dv:tc?Math.min(w,q.dr*H):0,tc,br:q.br,id:'new'},sk),I=plCheck(sp),I0=plCheck(plSpans(null,sk)),L=(I.get('new')||[]).slice();
  I.forEach((A,k)=>{if(k==='new')return;const o=sp.find(x=>x.id===k);A.forEach(x=>{if(x.lv!=='i'&&!(I0.get(k)||[]).some(y=>y.t===x.t))L.push({lv:x.lv,t:'Knock-on for your '+(o&&o.o?esc(jobC(o.o.j).n)+' shift on '+dlong(o.s):'other shift')+': '+x.t})})});
  $('pfiss').innerHTML=L.length?L.map(x=>`<div class="note ${x.lv==='r'?'bad':x.lv==='a'?'warn':''}" style="margin-top:4px">${x.lv==='r'?'✕ ':x.lv==='a'?'⚠ ':'ℹ '}${x.t}</div>`).join(''):'';$('pfiss').innerHTML=plReq(s0,e0,q,tc,sp)+(L.length?'<div class="flb" style="margin-top:8px">Problems</div>'+$('pfiss').innerHTML:'<div class="freq ok"><b class="fi">✓</b><span><b>No rules broken</b> by this shift.</span></div>');return L};
 let lt=0;const live=()=>{clearTimeout(lt);lt=setTimeout(()=>{if(!$('pfiss'))return;const v=plRead(),d=$('pfdt').value;if(d&&v.s&&v.e&&v.s!==v.e)show(Object.assign({id:p.id||plId(),d},v));else $('pfiss').innerHTML='<div class="note">Enter a start and finish to check.</div>'},250)};
 $('mo').querySelector('.fform').addEventListener('input',live);$('mo').querySelector('.fform').addEventListener('change',live);live();
 mcb={no:()=>{moX();if(p.d)plDay(pdt(p.d))},rpl:()=>plPatList(),del:()=>{if(p.fromPat)st.plx=(st.plx||[]).concat(p.fromPat);else st.plan=(st.plan||[]).filter(x=>x.id!==p.id);save();plRender();moX();if(p.d)plDay(pdt(p.d))},ok:()=>{const q=build();if(!q)return;const snap=plSnap();let cid=q.id;
  if(+$('pfr').value){const wd=(new Date(pdt(q.d)).getDay()+6)%7;cid=plId();st.pat=(st.pat||[]).concat({id:cid,j:q.j,days:[wd],s:q.s,e:q.e,br:q.br,bp:q.bp,dr:q.dr,rv:q.rv,from:q.d,ev:+$('pfr').value});if(!isNew)st.plan=(st.plan||[]).filter(x=>x.id!==p.id);if(p.fromPat){st.plx=(st.plx||[]).concat(p.fromPat);/* the new repeat replaces the old one from this day on, so the two do not both appear */const pid=p.fromPat.split('|')[0];st.pat=(st.pat||[]).map(r=>r.id===pid&&!(r.to&&pdt(r.to)<pdt(q.d))?Object.assign({},r,{to:ymd(pdt(q.d)-864e5)}):r)}}
  else{if(p.fromPat)st.plx=(st.plx||[]).concat(p.fromPat);st.plan=(st.plan||[]).filter(x=>x.id!==q.id).concat(q)}
  plClash(cid,snap,()=>{save();plRender();plDay(pdt(q.d))},()=>plForm(p))}}}
/* Repeating shifts as a calendar: the days your repeats fall on are filled in each job's colour. Tap a day to edit its repeat
   (or start a new one from that day), or tap a repeat underneath. */
function plPatList(m){const R=st.pat||[],D=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],t0=sod(Date.now());if(m==null){const t=new Date(t0);t.setDate(1);m=t.getTime()}
 const md=new Date(m),gs=wkS(m),me=new Date(md.getFullYear(),md.getMonth()+1,1).getTime(),ge=nwk(wkS(me-864e5)),occ=plOcc(gs,ge).filter(o=>o.pat),byD={};
 occ.forEach(o=>{const k=sod(o.S);(byD[k]=byD[k]||[]).push(o)});let g='';
 for(let d=gs;d<ge;d=nxd(d)){const L=byD[d]||[],c=L[0]?JCOL[jobI(jobC(L[0].j).id)]:'',inM=new Date(d).getMonth()===md.getMonth();
  g+=`<button type="button" class="prc${inM?'':' plo'}${d===t0?' plt':''}${L.length?' on':''}" data-k="pd:${d}"${c?` style="--jc:${c}"`:''}><span class="pln">${new Date(d).getDate()}</span>${L.map(o=>`<span class="prt">${o.s.slice(0,5)}<small>–${o.e.slice(0,5)}</small></span>`).join('')}</button>`}
 mo(`<h3>Repeats and Rotas</h3><p class="note" style="margin-top:-4px">Coloured days are your repeating shifts and rotas. Tap one to change it, or tap an empty day to start a new repeat from there.</p>
 <div class="tr" style="margin:6px 0 8px;gap:6px"><button class="tg" data-k="pm:-1" aria-label="Previous month">‹</button><b style="flex:1;text-align:center;font-size:16px">${md.toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</b><button class="tg" data-k="pm:1" aria-label="Next month">›</button></div>
 <div class="plg">${D.map(x=>`<div class="plh">${x}</div>`).join('')}${g}</div>
 ${(st.rota||[]).length?`<div class="flb" style="margin:14px 0 6px">Your rotas</div><div class="fchips">${st.rota.map(r=>{const j=jobC(r.j),old=r.to&&pdt(r.to)<t0;return `<button type="button" class="fchip fjob frep${old?' foff':''}" data-k="ro:${r.id}" style="--jc:${JCOL[jobI(j.id)]}"><i></i><span><b>${esc(j.n)} · ${r.weeks.length} week rota</b><small>${r.weeks.map((w,i)=>'Week '+(i+1)+': '+(w.length?w.slice().sort().map(x=>D[x]).join(', '):'off')).join(' · ')} · ${r.s}–${r.e}${r.on&&pdt(r.on)>t0?' · starts '+new Date(pdt(r.on)).toLocaleDateString('en-GB',{day:'numeric',month:'short'}):''}${r.to?(pdt(r.to)<t0?' · ended ':' · until ')+new Date(pdt(r.to)).toLocaleDateString('en-GB',{day:'numeric',month:'short'}):''}</small></span></button>`}).join('')}</div>`:''}${R.length?`<div class="flb" style="margin:14px 0 6px">Your repeats</div><div class="fchips">${R.map(r=>{const j=jobC(r.j),old=r.to&&pdt(r.to)<t0;return `<button type="button" class="fchip fjob frep${old?' foff':''}" data-k="ed:${r.id}" style="--jc:${JCOL[jobI(j.id)]}"><i></i><span><b>${esc(j.n)}</b><small>${r.days.map(i=>D[i]).join(', ')} · ${r.s}–${r.e} · ${ordW(r.ev)}${r.to?' · until '+new Date(pdt(r.to)).toLocaleDateString('en-GB',{day:'numeric',month:'short'}):''}</small></span></button>`}).join('')}</div>`:'<p class="note" style="margin-top:10px">No repeating shifts yet.</p>'}
 <button class="tg big fpri" data-k="rota" style="margin-top:14px">Add a rota (weeks that differ)</button><button class="tg big" data-k="new">Add a repeating shift (same every week)</button><button class="tg big" data-k="no">Close</button>`);
 mcb={no:moX,new:()=>plPatForm(null),'pm:-1':()=>{const x=new Date(m);x.setMonth(x.getMonth()-1);plPatList(x.getTime())},'pm:1':()=>{const x=new Date(m);x.setMonth(x.getMonth()+1);plPatList(x.getTime())}};
 R.forEach(r=>mcb['ed:'+r.id]=()=>plPatForm(r));(st.rota||[]).forEach(r=>mcb['ro:'+r.id]=()=>plRotaForm(r));mcb.rota=()=>plRotaForm(null);
 for(let d=gs;d<ge;d=nxd(d)){const L=byD[d]||[];mcb['pd:'+d]=()=>{const ids=[...new Set(L.map(o=>o.pat))],RO=st.rota||[],ed=id=>{const ro=RO.find(r=>r.id===id);return ro?plRotaForm(ro):plPatForm(R.find(r=>r.id===id))};if(!ids.length)return plPatForm(null,ymd(d));if(ids.length===1)return ed(ids[0]);
  mo(`<h3>Which Repeat?</h3>${ids.map(id=>{const r=R.find(x=>x.id===id)||RO.find(x=>x.id===id),j=jobC(r.j);return `<button class="tg big" data-k="w:${id}">${esc(j.n)} ${r.s}–${r.e}${r.weeks?' (rota)':''}</button>`}).join('')}<button class="tg big" data-k="no">Back</button>`);mcb={no:()=>plPatList(m)};ids.forEach(id=>mcb['w:'+id]=()=>ed(id))}}}
/* A rota: 2 to 6 weeks that each have their own days, rolling round. You say which week this week is; the times, break and
   driving are the same for every rota day, and any single day can still be changed from the calendar. */
function plRotaForm(r0){const isNew=!r0,D=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],t0=sod(Date.now()),wk=7*864e5,
  on0=r0?(r0.on||r0.from):ymd(t0),rel=(on,f,W)=>((Math.round((wkS(pdt(on))-wkS(pdt(f)))/wk)%W)+W)%W+1;
 let weeks=r0?r0.weeks.map(w=>w.slice()):[[],[],[]],on=on0,cur=r0?rel(on0,r0.from,r0.weeks.length):1,v=r0||{};
 const nm1=nwk(wkS(t0)),dshort=d=>new Date(d).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
 const draw=()=>{const keep=$('pfs')&&$('rofm')?Object.assign(plRead(),{to:$('pft').value}):null;if(keep&&$('pff').value)on=$('pff').value;v=keep?Object.assign({},v,keep):v;const W=weeks.length;if(cur>W)cur=1;
  const sw=wkS(pdt(on)),pv=[0,1,2,3].map(k=>{const ws=sw+k*wk,wi=(cur-1+k)%W;return `<div>${ws===wkS(t0)?'This week':'w/c '+new Date(ws).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}: <b>Week ${wi+1}</b> · ${weeks[wi].length?weeks[wi].slice().sort().filter(x=>k||ws+x*864e5>=pdt(on)).map(x=>D[x]).join(', ')||'no shifts left that week':'no shifts'}</div>`}).join('');
  mo(`<h3>${isNew?'Add a Rota':'Edit Rota'}</h3><p class="note" style="margin-top:-4px">For weeks that change, for example week 1 Mon to Thu, week 2 Wed to Sat, week 3 Mon, Tue, Thu and Fri. It rolls round from week 1 again after the last week.</p><div class="fform" id="rofm">
  <div class="fsec"><div class="flb">Weeks in the rota</div><div class="fchips">${[2,3,4,5,6].map(n=>`<button type="button" class="fchip${n===W?' on':''}" data-k="w:${n}">${n} weeks</button>`).join('')}</div></div>
  <div class="fsec"><div class="flb">Days you work</div><div class="rgrid"><span></span>${D.map(x=>`<span class="rgh">${x[0]}${x[1]}</span>`).join('')}${weeks.map((w,i)=>`<span class="rgl">Week ${i+1}</span>${D.map((x,di)=>`<button type="button" class="rgc${w.includes(di)?' on':''}" data-k="t:${i}:${di}" aria-pressed="${w.includes(di)}" aria-label="Week ${i+1} ${x}">${w.includes(di)?'✓':''}</button>`).join('')}`).join('')}</div></div>
  <div class="fsec"><div class="flb">Starts on</div><div class="fchips fsm">${[[ymd(t0),'Today'],[ymd(nm1),dshort(nm1)],[ymd(nwk(nm1)),dshort(nwk(nm1))]].map(x=>`<button type="button" class="fchip${x[0]===on?' on':''}" data-k="o:${x[0]}">${x[1]}</button>`).join('')}</div><label class="fother">Or pick a date<input type="date" id="pff" value="${on}"></label><div class="note" style="margin-top:4px">Nothing from this rota is added before this date.</div></div>
  <div class="fsec"><div class="flb">${sw===wkS(t0)?'This week':'The week starting '+dshort(sw)} is</div><div class="fchips">${weeks.map((w,i)=>`<button type="button" class="fchip${i+1===cur?' on':''}" data-k="c:${i+1}">Week ${i+1}</button>`).join('')}</div><div class="fsum">${pv}</div></div>
  ${plFields(v)}
  <div class="fsec"><div class="flb">How long</div><div class="fchips">${[['0','Forever'],['28','4 weeks'],['91','3 months'],['182','6 months'],['365','1 year'],['d','Until a date']].map(x=>`<button type="button" class="fchip" data-fk="u:${x[0]}">${x[1]}</button>`).join('')}</div><label class="fother" id="pftw"${v.to?'':' hidden'}>Last day<input type="date" id="pft" value="${v.to||''}"></label></div>
  ${isNew?'':plHidSec(r0.id)}<div class="note bad" id="pferr"></div></div><button class="tg big fpri" data-k="ok">${isNew?'Add rota':'Save rota'}</button>${isNew?'':'<button class="tg big fdel" data-k="del">Remove this rota</button>'}<button class="tg big" data-k="no">Cancel</button>`);plDrv();plFsync();
  $('pff').onchange=()=>{if($('pff').value)draw()};
  mcb={no:plPatList,del:()=>plRotaDel(r0),ok:()=>{const q=plRead(),st0=$('pff').value,t=$('pft').value;if(!weeks.some(w=>w.length)){$('pferr').textContent='Tick at least one day.';return}if(!q.s||!q.e||q.s===q.e){$('pferr').textContent='Enter a start and finish.';return}
    if(!st0){$('pferr').textContent='Pick the date the rota starts.';return}if(t&&pdt(t)<pdt(st0)){$('pferr').textContent='The last day is before the rota starts.';return}
    const o={id:r0?r0.id:plId(),j:q.j,s:q.s,e:q.e,br:q.br,bp:q.bp,dr:q.dr,rv:q.rv,weeks:weeks.map(w=>w.slice().sort()),from:ymd(wkS(pdt(st0))-(cur-1)*wk),on:st0,made:r0&&r0.made||Date.now()};if(t)o.to=t;
    const snap=plSnap();st.rota=(st.rota||[]).filter(x=>x.id!==o.id).concat(o);plClash(o.id,snap,()=>{save();plRender();plPatList()},()=>plRotaForm(r0))}};
  if(!isNew)plHidCb(r0.id,draw);
  [ymd(t0),ymd(nm1),ymd(nwk(nm1))].forEach(x=>mcb['o:'+x]=()=>{on=x;$('pff').value=x;draw()});
  [2,3,4,5,6].forEach(n=>mcb['w:'+n]=()=>{while(weeks.length<n)weeks.push([]);weeks=weeks.slice(0,n);draw()});
  weeks.forEach((w,i)=>{D.forEach((x,di)=>mcb['t:'+i+':'+di]=()=>{weeks[i]=weeks[i].includes(di)?weeks[i].filter(y=>y!==di):weeks[i].concat(di);draw()});mcb['c:'+(i+1)]=()=>{cur=i+1;draw()}})};draw()}
/* Days taken out of a repeat or rota (removed one by one, or left off in a clash), with a way to bring them back */
function plHidSec(id){const t0=ymd(Date.now()),L=(st.plx||[]).filter(k=>k.startsWith(id+'|')&&k.split('|')[1]>=t0).sort();if(!L.length)return '';
 return `<div class="fsec"><div class="flb">Days taken out (${L.length})</div><div class="note" style="margin-bottom:6px">These days were removed from this one, or left off because another shift won a clash. Tap a day to bring it back.</div><div class="fchips fsm">${L.slice(0,24).map(k=>`<button type="button" class="fchip" data-k="hb:${k}">${new Date(pdt(k.split('|')[1])).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})} ↺</button>`).join('')}</div>${L.length>1?'<button type="button" class="tg" data-k="hball" style="margin-top:8px">Bring them all back</button>':''}</div>`}
function plHidCb(id,redraw){const t0=ymd(Date.now()),L=(st.plx||[]).filter(k=>k.startsWith(id+'|')&&k.split('|')[1]>=t0),un=K=>{const B=new Set(K);st.plx=(st.plx||[]).filter(k=>!B.has(k));if(st.plxc){st.plxc=Object.assign({},st.plxc);K.forEach(k=>delete st.plxc[k])}save();plRender();redraw()};
 L.forEach(k=>mcb['hb:'+k]=()=>un([k]));mcb.hball=()=>un(L)}
/* Remove a repeat's or rota's shifts from a day onwards (the ones before it stay) */
function plCutFrom(pid,day){const to=ymd(pdt(day)-864e5),f=x=>x.id===pid?Object.assign({},x,{to:x.to&&pdt(x.to)<pdt(to)?x.to:to}):x,gone=x=>!(x.id===pid&&pdt(x.to||'9999-01-01')<pdt(x.on||x.from));
 st.pat=(st.pat||[]).map(f).filter(gone);st.rota=(st.rota||[]).map(f).filter(gone);plUnhide(pid,day)}
/* Remove a list of planned shifts: one-offs are deleted, repeat and rota days are hidden for that day only */
function plDrop(L){L.forEach(o=>plHide(o))}
function plSelDel(){const n=Date.now(),O=plOcc(sod(n)-864e5,n+400*864e5).filter(o=>PL.sel.has(o.oid)),reps=[...new Set(O.filter(o=>o.pat).map(o=>o.pat))];if(!O.length)return;
 const one=O.filter(o=>!o.pat).length,ro=O.filter(o=>o.rot).length,rp=O.length-one-ro,parts=[one&&pl(one,'single shift'),rp&&pl(rp,'repeating shift day'),ro&&pl(ro,'rota day')].filter(Boolean);
 mo(`<h3>Remove ${O.length} Shift${O.length>1?'s':''}?</h3><p>${parts.join(', ')}.</p><p class="note">${O.slice(0,8).map(o=>dlong(o.S)+': '+esc(jobC(o.j).n)+' '+o.s.slice(0,5)+'–'+o.e.slice(0,5)+' <small>('+plKind(o).toLowerCase()+')</small>').join('<br>')}${O.length>8?'<br>and '+(O.length-8)+' more':''}</p><button class="tg big fdel" data-k="ok">Remove ${O.length>1?'these '+O.length+' shifts':'this shift'}</button>${reps.length?`<button class="tg big" data-k="fw">Remove these and every later shift of ${reps.length>1?'their repeats and rotas':'its '+(O.find(o=>o.pat).rot?'rota':'repeat')}<small style="display:block;font-weight:400;opacity:.85">Single shifts you added are only removed if you ticked them</small></button>`:''}<button class="tg big" data-k="no">Cancel</button>`);
 const fin=m=>{PL.sel=null;save();moX();plRender();plUndo(sn,m)},sn=plSnap();
 mcb={no:moX,ok:()=>{plDrop(O);fin('Removed '+pl(O.length,'shift')+'.')},fw:()=>{reps.forEach(id=>{const first=O.filter(o=>o.pat===id).sort((a,b)=>a.S-b.S)[0];plCutFrom(id,first.d)});plDrop(O.filter(o=>!o.pat));fin('Removed the ticked shifts and every later one.')}}}
const pl=(n,w)=>n+' '+w+(n===1?'':'s');
function plRotaDel(r){if(!r)return plPatList();const t0=sod(Date.now()),sn=plSnap();
 mo(`<h3>Remove Rota?</h3><p class="note" style="margin-top:-4px">Past planned shifts are only a record of what was planned. Your logged hours are never changed.</p><button class="tg big" data-k="f">Stop it from today<small style="display:block;font-weight:400;opacity:.8">Keeps the past ones</small></button><button class="tg big fdel" data-k="all">Remove all of it</button><button class="tg big" data-k="no">Cancel</button>`);
 mcb={no:()=>plRotaForm(r),f:()=>{const to=ymd(t0-864e5);st.rota=(st.rota||[]).map(x=>x.id===r.id?Object.assign({},x,{to}):x);if(pdt(to)<pdt(r.on||r.from))st.rota=st.rota.filter(x=>x.id!==r.id);plUnhide(r.id,ymd(t0));save();plRender();plPatList();plUndo(sn,'Rota stopped from today.')},
  all:()=>{st.rota=(st.rota||[]).filter(x=>x.id!==r.id);st.plx=(st.plx||[]).filter(x=>!x.startsWith(r.id+'|'));plUnhide(r.id);save();plRender();plPatList();plUndo(sn,'Rota removed.')}}}
/* removing a repeat keeps the shifts that have already passed, unless you say how far back to remove them */
function plPatDel(r){const t0=sod(Date.now()),sn=plSnap();
 const drop=()=>{st.pat=(st.pat||[]).filter(x=>x.id!==r.id);st.plx=(st.plx||[]).filter(x=>!x.startsWith(r.id+'|'));plUnhide(r.id);save();plRender();plPatList();plUndo(sn,'Repeat removed.')};
 const cut=days=>{const to=ymd(t0-days*864e5-864e5);if(pdt(to)<pdt(r.from)){drop();return}st.pat=(st.pat||[]).map(x=>x.id===r.id?Object.assign({},x,{to:r.to&&pdt(r.to)<pdt(to)?r.to:to}):x);plUnhide(r.id,ymd(pdt(to)+864e5));save();plRender();plPatList();plUndo(sn,'Repeat stopped.')};
 mo(`<h3>Remove Repeat?</h3><p class="note" style="margin-top:-4px">Past planned shifts are only a record of what was planned. Your logged hours are never changed.</p>
 <button class="tg big" data-k="f">Stop it from today<small style="display:block;font-weight:400;opacity:.8">Keeps the past ones, removes today and later</small></button>
 <div class="bx" style="margin:8px 0"><label style="margin:0">Stop it from a date<input type="date" id="pdx" value="${ymd(t0+7*864e5)}"></label><button class="tg big" data-k="dt" style="margin-top:8px">Stop from this date</button></div>
 <button class="tg big" data-k="past">Remove only the past ones<small style="display:block;font-weight:400;opacity:.8">Keeps today and every shift after</small></button>
 <button class="tg big fdel" data-k="all">Remove all of it, past and future</button><button class="tg big" data-k="no">Cancel</button>`);
 mcb={no:()=>plPatForm(r),f:()=>cut(0),dt:()=>{const v=$('pdx').value;if(!v)return;const k=Math.round((t0-pdt(v))/864e5);cut(k)},
  past:()=>{if(r.to&&pdt(r.to)<t0){drop();return}/* hide each past day rather than moving the start, so every other week stays on the same weeks */
   const ids=plOcc(pdt(r.from),t0).filter(o=>o.pat===r.id).map(o=>o.oid),X=new Set(st.plx||[]);st.plx=(st.plx||[]).concat(ids.filter(x=>!X.has(x)));save();plRender();plPatList();plUndo(sn,'Past shifts of the repeat removed.')},
  all:()=>{mo('<h3>Remove All?</h3><p>This removes every shift in this repeat, including the ones in the past.</p><button class="tg big fdel" data-k="ok">Yes, remove them all</button><button class="tg big" data-k="no">Go back</button>');mcb={no:()=>plPatDel(r),ok:drop}}}}
function plPatForm(r,hint){const isNew=!r;r=r||{days:hint?[(new Date(pdt(hint)).getDay()+6)%7]:[],from:hint||''};const D=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];let days=r.days.slice();
 const draw=()=>{const keep=$('pfs')?Object.assign(plRead(),{from:$('pff').value,to:$('pft').value,ev:$('pfev')?+$('pfev').value:r.ev}):null,v=keep||r,v0=v;
  mo(`<h3>${isNew?'Add repeating shift':'Edit repeating shift'}</h3><label>Repeat<select id="pfev">${[1,2,3,4,5,6].map(v=>`<option value="${v}"${v===(+(v0.ev||r.ev||1))?' selected':''}>${ordW(v).replace(/^e/,'E')}</option>`).join('')}</select></label><div class="lbl">On These Days</div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin:6px 0 10px">${D.map((x,i)=>`<button class="tg" data-k="d${i}" style="padding:8px 0;${days.includes(i)?'background:var(--acc);border-color:var(--acc);color:var(--onacc);font-weight:700':''}">${x}</button>`).join('')}</div>${plFields(v)}<div class="fsec" style="margin-top:12px"><label style="margin:0">First shift on<input type="date" id="pff" value="${v.from||''}"></label><div class="flb" style="margin-top:6px">How long</div><div class="fchips">${[['0','Forever'],['28','4 weeks'],['91','3 months'],['182','6 months'],['365','1 year'],['d','Until a date']].map(x=>`<button type="button" class="fchip" data-fk="u:${x[0]}">${x[1]}</button>`).join('')}</div><label class="fother" id="pftw"${v.to?'':' hidden'}>Last day<input type="date" id="pft" value="${v.to||''}"></label></div><div class="note" style="margin:-2px 0 6px">Nothing is added before the first shift date. For every other week (or more), that date's week is week 1.</div>${isNew?'':plHidSec(r.id)}<div class="note bad" id="pferr"></div><button class="tg big fpri" data-k="ok">Save</button>${isNew?'':'<button class="tg big fdel" data-k="del">Delete this repeating shift</button>'}<button class="tg big" data-k="no">Cancel</button>`);plDrv();plFsync();
  mcb={no:plPatList,ok:()=>{const q=plRead(),f=$('pff').value,t=$('pft').value;if(!days.length){$('pferr').textContent='Pick at least one day.';return}if(!q.s||!q.e||!f){$('pferr').textContent='Enter the start, finish and the date of the first shift.';return}{const fw=(new Date(pdt(f)).getDay()+6)%7;if(!days.includes(fw)){$('pferr').textContent='The first shift date is a '+new Date(pdt(f)).toLocaleDateString('en-GB',{weekday:'long'})+', but that day is not ticked. Tick it or pick a different date.';return}}
    const o={id:r.id||plId(),j:q.j,days:days.slice().sort(),s:q.s,e:q.e,br:q.br,bp:q.bp,dr:q.dr,rv:q.rv,from:f,ev:+$('pfev').value||1,made:r.made||Date.now()};if(t)o.to=t;const snap=plSnap();st.pat=(st.pat||[]).filter(x=>x.id!==o.id).concat(o);plClash(o.id,snap,()=>{save();plRender();plPatList()},()=>plPatForm(r))},
   del:()=>plPatDel(r)};if(!isNew)plHidCb(r.id,draw);
  D.forEach((x,i)=>mcb['d'+i]=()=>{days=days.includes(i)?days.filter(y=>y!==i):days.concat(i);draw()});
  $('pff').onchange=e=>{if(e.target.value){const fw=(new Date(pdt(e.target.value)).getDay()+6)%7;if(!days.includes(fw)){days=days.concat(fw);draw()}}}};draw()}
function plCopyWeek(d){const w0=wkS(d),w1=nwk(w0),add=[];(st.plan||[]).forEach(p=>{const t=pdt(p.d);if(t>=w0&&t<w1){const q=Object.assign({},p,{id:plId(),d:ymd(add7(t,1))});if(!(st.plan||[]).some(x=>x.d===q.d&&x.s===q.s&&x.j===q.j))add.push(q)}});
 st.plan=(st.plan||[]).concat(add);save();plRender();
 mo(`<h3>Week Copied</h3><p>${add.length?add.length+' shift'+(add.length>1?'s':'')+' copied to the week of '+dlong(w1)+'.':'There were no one-off shifts to copy in this week.'} Repeating shifts already carry on by themselves.</p><button class="tg big" data-k="go">Show next week</button><button class="tg big" data-k="no">Close</button>`);
 mcb={no:moX,go:()=>{moX();const t=new Date(w1);t.setDate(1);PL.m=t.getTime();plRender()}}}

/* Plan versus what happened */
function plPending(){const n=Date.now(),out=[],L=all(),src=o=>o.pat?(st.rota||[]).concat(st.pat||[]).find(r=>r.id===o.pat):null;plOcc(n-14*864e5,n+864e5).forEach(o=>{if(o.st)return;
  /* never ask about a day from before the repeat or rota was added */const r=src(o);if(r&&r.made&&o.E<r.made)return;
  const lg=L.some(x=>x.e>o.S-H&&x.s<o.E+H);
  if(lg){if(o.S<n){st.pls=Object.assign({},st.pls,{[o.oid]:'done'});out.dirty=1}return}
  if(o.E<=n)out.push({o,k:'end'});else if(!o.rv&&o.S+60*M<=n&&!st.active)out.push({o,k:'late'})});
 if(out.dirty){delete out.dirty;save()}return out}
function plBanner(){const el=$('plb');if(!el)return;const P=plPending();
 set(el,P.slice(0,2).map(({o,k})=>{const j=jobC(o.j);return `<div class="wkb wn" style="cursor:default"><b>${k==='end'?'Planned shift: what happened?':'Planned shift not started'}</b><span>${esc(j.n)} ${dlong(o.S)} ${o.rv?'about ':''}${o.s.slice(0,5)}–${o.e.slice(0,5)}. ${k==='end'?'Nothing was logged for it.':'It was due to start at '+o.s.slice(0,5)+'.'}</span><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${k==='end'?`<button class="tg" data-pbk="as:${o.oid}" style="flex:1 1 0;white-space:normal">Worked as planned</button><button class="tg" data-pbk="df:${o.oid}" style="flex:1 1 0;white-space:normal">Different times</button>`:`<button class="tg" data-pbk="go:${o.oid}" style="flex:1 1 0;white-space:normal">Start this shift</button>`}<button class="tg" data-pbk="sk:${o.oid}" style="flex:1 1 0;white-space:normal">Didn't work</button></div></div>`}).join(''))}
/* Log a planned shift afterwards, as Other work with its breaks cut out. bk is the breaks you took ({at, len}), else the
   planned break goes in the middle of the advised window. */
function plLog(o,s,e,bk){const j=jobC(o.j),tc=j.tc!==false,mk=(a,b)=>{if(b>a){const x={s:a,e:b,t:'w'};if(jobsOn()){x.j=j.id;x.c=tc?1:0}clear(a,b,1);st.sessions.push(x)}};
 if(!bk)bk=(o.br||0)*M<e-s?plBrkList(s,e,o.br||0,o.dr,tc):[];
 let c=s;bk.filter(x=>x.len>0&&x.at>=s&&x.at+x.len<=e).sort((x,y)=>x.at-y.at).forEach(x=>{if(x.at>=c){mk(c,x.at);c=x.at+x.len}});mk(c,e);
 st.pls=Object.assign({},st.pls,{[o.oid]:'done'})}
function plAct(k,oid){const o=plOcc(Date.now()-15*864e5,Date.now()+2*864e5).find(x=>x.oid===oid);if(!o)return;
 if(k==='sk'){st.pls=Object.assign({},st.pls,{[oid]:'skip'});save();render();return}
 if(k==='as'){plLog(o,o.S,o.E);save();render();flash='Logged '+esc(jobC(o.j).n)+' '+o.s.slice(0,5)+'–'+o.e.slice(0,5)+' as Other work. Edit it in the log to split out any driving.';setTimeout(()=>{flash='';live()},9000);return}
 if(k==='go'){if(jobsOn()){st.cj=o.j;st.tm=jobC(o.j).tc!==false;st.tmt=Date.now()}save();setAct('w');return}
 if(k==='df'){const d0=sod(o.S),ba=plBrkAt(o.S,o.E,o.br||0,o.dr,jobC(o.j).tc!==false);
  mo(`<h3>Work Done</h3><p>${esc(jobC(o.j).n)}, planned ${dlong(o.S)} ${o.s.slice(0,5)}–${o.e.slice(0,5)}.</p><div class="tr"><label>Started<input type="time" id="pas" value="${o.s.slice(0,5)}"></label><label>Finished<input type="time" id="pae" value="${o.e.slice(0,5)}"></label></div>
  <div class="lbl" style="margin-top:6px">Breaks you took</div><div class="note" style="margin-bottom:4px">When each one started and how long it was. Leave the second one empty if you took one break.</div>
  ${[0,1].map(i=>`<div class="tr"><label>Break ${i+1} started<input type="time" id="pba${i}" value="${i?'':hm(ba)}"></label><label>Minutes<input type="number" id="pbm${i}" min="0" max="180" value="${i?'':o.br||0}"></label></div>`).join('')}
  <div class="note bad" id="paerr"></div><button class="tg big" data-k="ok">Log it</button><button class="tg big" data-k="no">Cancel</button>`);
  mcb={no:moX,ok:()=>{const a=$('pas').value,b=$('pae').value;if(!a||!b){$('paerr').textContent='Enter both times.';return}const s=d0+tmin(a)*M;let e=d0+tmin(b)*M;if(e<=s)e=nxd(d0)+tmin(b)*M;if(e>Date.now()){$('paerr').textContent='The finish is in the future.';return}
   const bk=[];for(const i of [0,1]){const t=$('pba'+i).value,m=+$('pbm'+i).value||0;if(!t||!m)continue;let at=d0+tmin(t)*M;if(at<s)at+=864e5;if(at<s||at+m*M>e){$('paerr').textContent='Break '+(i+1)+' is not inside the shift.';return}bk.push({at,len:m*M})}
   plLog(o,s,e,bk);save();moX();render()}}}}

/* A planned shift whose start time has passed, that has not ended, with nothing logged for it yet. */
function plDue(){const n=Date.now(),L=all();
 return plOcc(n-20*H,n+1).filter(o=>!o.st&&o.S<=n-5*M&&o.E>n&&!L.some(x=>x.e>o.S-H&&x.s<o.E)).sort((a,b)=>b.S-a.S)[0]||null}
/* a planned shift starting within the next half hour (or already started), used to pick the job when a shift is started early */
function plNear(){const n=Date.now(),L=all();return plOcc(n-20*H,n+31*M).filter(o=>!o.st&&o.S<=n+30*M&&o.E>n&&!L.some(x=>x.e>o.S-H&&x.s<o.E)).sort((a,b)=>Math.abs(a.S-n)-Math.abs(b.S-n))[0]||null}
/* Starting a shift late against the plan: ask whether it really started at the planned time. */
function plStartAsk(o,t){const n=Date.now(),j=jobC(o.j),A=all(),pe=A.length?A[A.length-1].e:0,ps=o.s.slice(0,5);
 mo(`<h3>Start Time</h3><p>You had <b>${esc(j.n)}</b> planned from <b>${ps}</b> to ${o.e.slice(0,5)} today. If you started at ${ps}, start the shift from then so your hours and breaks count from the right time.</p><button class="tg big" data-k="pl" style="font-weight:700">I started at ${ps}, as planned</button><button class="tg big" data-k="now">I am starting now (${hm(n)})</button><div class="tr" style="margin-top:12px"><label>Or I started at<input type="time" id="pst"></label><button class="tg" data-k="at">Use time</button></div><div class="note bad" id="psterr"></div><button class="tg big" data-k="no">Cancel</button>`);
 const go=x=>plCatch(x,t,()=>plStartAsk(o,t)),err=m=>{$('psterr').textContent=m};
 mcb={no:undo,now:()=>begin(t,1),pl:()=>go(Math.max(o.S,pe)),at:()=>{const v=$('pst').value;if(!v){err('Enter the time you started.');return}
  let x=prevT(v,n);
  if(x<=pe){err('That is before your last activity ended ('+hm(pe)+'). Pick a later time.');return}if(n-x>16*H){err('That is more than 16 hours ago. Check the time.');return}go(x)}}}

document.addEventListener('change',e=>{if(e.target.id==='pfj')plDrv()});
/* After picking a start time in the past: add the driving, POA and breaks you have already had since then, then start the shift.
   Tacho jobs can add driving, POA and breaks. No-tacho jobs only have breaks to add. */
function plCatch(x,t,back){const n=Date.now(),tc=isTc(),types=tc?[['d','Driving'],['p','POA'],['r','Break']]:[['r','Break']],E=[],ic={d:'🚛',p:'◪',r:'🛏'},nm={d:'Driving',p:'POA',r:'Break'};
 const mk=(a,b,ty)=>{const o={s:a,e:b,t:ty};if(jobsOn()&&ty!=='r'){if(st.cj)o.j=st.cj;o.c=ty==='d'?1:ty==='x'?0:isTc()?1:0}return o};
 const list=()=>{const cur=E.reduce((m,y)=>Math.max(m,y.e),x);
  mo(`<h3>Since ${hm(x)}</h3><p>You are starting from <b>${hm(x)}</b>. ${tc?'Add any driving, POA or breaks you have already had since then':'Add any breaks you have already had since then'}, so your hours and breaks are right. You can skip this if there is nothing to add.</p>${E.length?E.map((y,i)=>`<div class="item"><div><div class="lbl">${ic[y.t]} ${nm[y.t]}</div><div class="note">${hm(y.s)} to ${hm(y.e)} (${fmt(y.e-y.s)})</div></div><button class="del" data-k="rm${i}">Remove</button></div>`).join(''):''}<div class="tr" style="gap:6px;flex-wrap:wrap;margin:10px 0">${types.map(([k,l])=>`<button class="tg" data-k="a${k}" style="flex:1 1 0">+ ${l}</button>`).join('')}</div><button class="tg big" data-k="go" style="font-weight:700">${E.length?'Done, start my shift':'Nothing to add, start my shift'}</button><button class="tg big" data-k="bk">← Back</button>`);
  mcb={bk:back,go:()=>{
    bd=x;begin(t,1);if(!E.length)return;
    /* the running activity was started at x: split it around what was added */
    E.sort((p,q)=>p.s-q.s);let c=x;
    E.forEach(y=>{if(y.s>c)st.sessions.push(mk(c,y.s,t));clear(y.s,y.e,1);st.sessions.push(mk(y.s,y.e,y.t));c=y.e});
    st.active=c;st.ad=0;st.as=null;st.act=t;save();render()}};
  E.forEach((y,i)=>mcb['rm'+i]=()=>{E.splice(i,1);list()});
  types.forEach(([k])=>mcb['a'+k]=()=>form(k,cur))};
 const form=(k,cur)=>{const e0=Math.min(n,cur+(k==='r'?30:60)*M);
  mo(`<h3>Add ${nm[k]}</h3><p class="note">Between ${hm(x)} and now.</p><div class="tr"><label>Started<input type="time" id="cs1" value="${hm(cur)}"></label><label>Finished<input type="time" id="cs2" value="${hm(e0)}"></label></div><div class="note bad" id="cserr"></div><button class="tg big" data-k="ok">Add it</button><button class="tg big" data-k="no">Cancel</button>`);
  mcb={no:list,ok:()=>{const a=$('cs1').value,b=$('cs2').value,E2=$('cserr');if(!a||!b){E2.textContent='Enter both times.';return}
   const s0=atT(a,x-60000),e1=atT(b,s0+1);
   if(s0<x){E2.textContent='That is before you started ('+hm(x)+').';return}if(e1>n){E2.textContent='That finishes after now.';return}if(!(e1>s0)){E2.textContent='The finish must be after the start.';return}
   if(E.some(y=>s0<y.e&&e1>y.s)){E2.textContent='That overlaps something you already added.';return}
   E.push({s:s0,e:e1,t:k});list()}}};
 list()}

/* Wire up */
document.addEventListener('click',e=>{const b=e.target.closest('[data-pbk]');if(b){const[k,oid]=b.dataset.pbk.split(/:(.*)/s);plAct(k,oid)}});
$('plc').addEventListener('click',e=>{const t=e.target.closest('[data-pm],[data-pa],[data-pp],[data-pd],[data-pv],[data-pl],[data-psel],[data-psd],[data-psall],[data-psdel]');if(!t)return;const d=t.dataset;
 if(d.psel){PL.sel=PL.sel?null:new Set();plRender();return}
 if(d.psd){const ids=d.psd.split(','),all=ids.every(x=>PL.sel.has(x));ids.forEach(x=>all?PL.sel.delete(x):PL.sel.add(x));plRender();return}
 if(d.psall){plOcc(sod(Date.now()),sod(Date.now())+(PL.ln||14)*864e5).filter(o=>o.st!=='skip'&&o.st!=='done'&&o.E>Date.now()).forEach(o=>PL.sel.add(o.oid));plRender();return}
 if(d.psdel){plSelDel();return}
 if(d.pv){PL.v=d.pv;PL.sel=null;try{localStorage.setItem('tg.plv',d.pv)}catch(x){}plRender();return}if(d.pl){PL.ln=(PL.ln||14)+14;plRender();return}
 if(d.pm!==undefined){if(d.pm==='0')PL.m=null;else{const m=new Date(plMonth());m.setMonth(m.getMonth()+ +d.pm);PL.m=m.getTime()}plRender()}
 else if(d.pa)plAddMenu();else if(d.pp)plPatList();else if(d.pd)plDay(+d.pd)});
$('plc').addEventListener('click',e=>{if(e.target.closest('[data-owe]'))wrDetail()});
if(typeof KEEP!=='undefined')['plan','pat','plx','pls','rota'].forEach(k=>{if(!KEEP.includes(k))KEEP.push(k)});
