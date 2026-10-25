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
   const s=d+tmin(r.s)*M;let e=d+tmin(r.e)*M;if(e<=s)e=nxd(d)+tmin(r.e)*M;if(e>from&&s<to)out.push({id:oid,pat:r.id,d:ds,j:r.j,s:r.s,e:r.e,br:r.br,bp:r.bp,dr:r.dr,rv:r.rv,S:s,E:e,oid,st:S[oid]})}});
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
 const test=(a,e)=>{const w=e-a-(e-a>9*H?45:30)*M,hyp={s:a,e,w,dv:Math.min(w,9*H),tc:tj.tc!==false,br:e-a>9*H?45:30,id:'hyp'};
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
 const okR=lo===best.e0?best:test(s0,lo),why=bad.R.filter(x=>(LVO[x.lv]||0)>(best.lv>1?best.lv:1)).map(x=>x.t),br=lo-s0>9*H?45:30;
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
function plOffNote(d,OFF,NX){let t='';OFF.filter(b=>b.s<nxd(d)&&b.e>d).forEach(b=>{
  t+=`<div class="bx" style="margin-top:8px;border-left:4px solid var(--${b.full?'ok':'warn'})"><div class="lbl">${b.full?'Weekly Rest':'Reduced Weekly Rest'}</div><div class="note">`+(b.open?`Off since ${dmy(b.s)}, with nothing planned yet: ${plHrs(b.len)} so far.`:`Off from ${dmy(b.s)} until ${dmy(b.e)}: ${plHrs(b.len)}.`)+' '+(b.full?'That is long enough for a full weekly rest (45 hours or more).':'That is 24 to 45 hours, so it counts as a reduced weekly rest and you would owe the hours up to 45, made up in one go within 3 weeks.')+`</div></div>`});
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
 S.band=C.OFF.find(b=>b.s<=d&&b.e>=D1);return S}
const plIco={work:'⚒',ok:'✓',warn:'⚠',rest:'✕',did:'✔',off:'–'};
function plRender(){const el=$('plc');if(!el)return;const n=Date.now(),v=PL.v||(PL.v=(()=>{try{return localStorage.getItem('tg.plv')||'list'}catch(e){return 'list'}})());
 const m0=plMonth(),md=new Date(m0),gs=v==='list'?sod(n):wkS(m0),me=new Date(md.getFullYear(),md.getMonth()+1,1).getTime(),ge=v==='list'?sod(n)+(PL.ln||14)*864e5:nwk(wkS(me-864e5));
 const sp=plSpans(),I=plCheck(sp),occ=plOcc(gs,Math.max(ge,gs+50*864e5)),OFF=plOffs(sp),NX=plNext(sp,OFF),T=typeof dayTot==='function'?dayTot():{},C={n,sp,I,occ,OFF,NX,T};
 let h=(typeof oweBanner==='function'?oweBanner(wrInfo()):'')+plSummary(NX)+`<div class="tr" style="margin:0 0 10px;gap:6px"><div class="seg" role="group" aria-label="View"><button class="tg${v==='list'?' on':''}" data-pv="list" aria-pressed="${v==='list'}">Days</button><button class="tg${v==='month'?' on':''}" data-pv="month" aria-pressed="${v==='month'}">Month</button></div><button class="tg" data-pa="1" style="flex:1">Add shift</button></div>`;
 if(v==='list'){h+='<div class="pdl">';
  for(let d=sod(n);d<ge;d=nxd(d)){const S=plStat(d,C),dt=new Date(d),k=S.k;
   h+=`<button class="pdr${S.td?' pdt':''}${S.band?' pdo'+(S.band.full?'':' pdo2'):''}" data-pd="${d}"${S.os[0]?` style="border-left-color:${JCOL[jobI(jobC(S.os[0].j).id)]}"`:''}><span class="pdd"><b>${S.td?'Today':dt.toLocaleDateString('en-GB',{weekday:'short'})}</b><span>${dt.getDate()} ${dt.toLocaleDateString('en-GB',{month:'short'})}</span></span><span class="pdb"><span class="pds ${k}">${plIco[k]} ${S.txt}</span>${S.sub.map(x=>`<span class="pdx ${x[0]}">${x[1]}</span>`).join('')}</span><span class="pda" aria-hidden="true">›</span></button>`}
  h+=`</div><button class="tg big" data-pl="1" style="margin-top:8px">Show 14 more days</button><p class="note" style="margin-top:6px">Green days are part of a weekly rest in your plan (amber if it is a reduced one). Tap a day for its details, to add a shift or to see what you could work. Earlier days are in Month.</p>`}
 else{h+=`<div class="tr" style="margin:0 0 8px;gap:6px"><button class="tg" data-pm="-1" aria-label="Previous month">‹</button><b style="flex:1;text-align:center;font-size:17px">${md.toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</b><button class="tg" data-pm="1" aria-label="Next month">›</button><button class="tg" data-pm="0">This month</button></div>`;
  h+='<div class="plg">'+['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<div class="plh">${x}</div>`).join('');
  let shown=0;const wk0=wkS(n);
  for(let d=gs;d<ge||(shown<42&&ge>n);d=nxd(d)){if((new Date(d).getDay()+6)%7===0&&d<wk0){let any=false;for(let q=d,k=0;k<7;k++,q=nxd(q)){const t=T[q];if((t&&t.d+t.w)||occ.some(o=>sod(o.S)===q&&o.st!=='skip')){any=true;break}}if(!any){d=add7(d,1)-864e5;d=sod(d);continue}}shown++;
   const S=plStat(d,C),inM=new Date(d).getMonth()===md.getMonth(),k=S.k;
   const chips=k==='work'&&S.os.length?S.os.map(o=>{const w=worst(I.get(o.oid));return `<div class="plk" style="border-left-color:${JCOL[jobI(jobC(o.j).id)]}">${o.rv?'≈':''}${ct(o.s)}–${ct(o.e)}${w>=2?`<i class="${w>=3?'bad':'warn'}">!</i>`:''}</div>`}).join(''):k==='did'?`<div class="plk pll">${fmt(S.logged).replace(' 00m','')}</div>`:k==='ok'||k==='warn'?`<div class="pkw"><b class="pki">${k==='ok'?'✓':'⚠'}</b><span class="pkl">Available</span>${S.fr&&S.fr.ea>d+15*M?`<span class="pkf">${S.td&&S.fr.ea<=n+6e4?'now':`<span class="pkl">from </span>${plHm(S.fr.ea)}`}</span>`:''}</div>`:k==='rest'?'<div class="pkw"><b class="pki">✕</b><span class="pkl">Rest</span></div>':k==='work'?'<div class="pkw"><b class="pki">⚒</b><span class="pkl">Working</span></div>':'';
   const due=S.sub.find(x=>x[0]==='bad')?`<div class="plr bad">Rest due <span>${plHm(NX.due)}</span></div>`:'',rs='',re='';
   h+=`<button class="pld pk-${k}${inM?'':' plo'}${S.td?' plt':''}${S.past?' plp':''}" data-pd="${d}"${k==='work'&&S.os[0]?` style="border-left:4px solid ${JCOL[jobI(jobC(S.os[0].j).id)]}"`:''} aria-label="${new Date(d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}: ${S.txt.replace(/<[^>]+>/g,'')}"><span class="pln">${new Date(d).getDate()}</span>${re}${chips}${rs}${due}</button>`}
  h+='</div>'+(shown?'':'<p class="note" style="text-align:center;margin:12px 0">Nothing was logged or planned in this month.</p>')+'<div class="bx plkey" style="margin-top:10px"><div class="lbl" style="margin-bottom:4px">Key</div>'+
   '<div><span class="ki"><span class="pkey pk-work" style="border-left:4px solid #3b82f6">9–17</span></span>Working: your planned shift, in the job\'s colour. A red ! means it breaks a rule</div>'+
   '<div><span class="ki"><span class="pkey pk-ok">✓</span></span>Available: nothing planned and you could work. A time under it (04:00) is the earliest you can start, after the rest you need from your last shift</div>'+
   '<div><span class="ki"><span class="pkey pk-warn">⚠</span></span>Available, but working would mean a reduced daily or weekly rest</div>'+
   '<div><span class="ki"><span class="pkey pk-rest">✕</span></span>Rest: the rules mean you cannot work this day</div>'+
   '<div><span class="ki"><span class="pkey pk-did">7h</span></span>A past day, with the hours you worked</div>'+
   '<div><span class="ki"><span class="plr bad" style="margin:0">Rest due</span></span>Your weekly rest has to start by this time, and your plan does not leave room for it</div><div class="note" style="margin-top:4px">Tap a day for details.</div></div>'}
 set(el,h)}

function plDay(d){const n=Date.now(),sp=plSpans(),I=plCheck(sp),OFF=plOffs(sp),NX=plNext(sp,OFF),occ=plOcc(d,nxd(d)).filter(o=>sod(o.S)===d),T=typeof dayTot==='function'?dayTot():{},o2=T[d],past=nxd(d)<=n;
 const fr=!past&&!occ.filter(o=>o.st!=='skip').length&&!(o2&&o2.d+o2.w)?plFree(d,sp,I):null;
 const isz=L=>(L||[]).map(x=>`<div class="note ${x.lv==='r'?'bad':x.lv==='a'?'warn':''}" style="margin-top:4px">${x.lv==='r'?'✕ ':x.lv==='a'?'⚠ ':'ℹ '}${x.t}</div>`).join('');
 let h=`<h3>${new Date(d).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</h3>`;
 if(o2&&o2.d+o2.w)h+=`<div class="item"><div class="lbl">Logged</div><div class="lbl">${fmt(o2.d)} driving, ${fmt(o2.w)} work</div></div>`;
 occ.forEach(o=>{const j=jobC(o.j),stx=o.st==='skip'?' · not worked':o.st==='done'||o.E<=n?' · past':'';
  h+=`<div class="bx" style="margin-top:8px;border-left:4px solid ${JCOL[jobI(j.id)]}"><div class="row"><span class="lbl">${esc(j.n)}${j.tc===false?' (no tacho)':''}${o.pat?' · repeats '+ordW(((st.pat||[]).find(r=>r.id===o.pat)||{}).ev):''}${stx}</span><span class="lbl">${o.s.slice(0,5)}–${o.e.slice(0,5)}</span></div><div class="note">${o.br?o.br+' min break'+(o.bp?' (paid)':'')+'. ':''}${j.tc!==false&&o.dr?o.dr+'h driving expected. ':''}Working time about ${fmt(o.E-o.S-(o.br||0)*M)}.</div>${o.E>n&&o.st!=='skip'&&o.st!=='done'?'<div class="note" style="margin-top:4px">☕ '+plBrk(o.S,o.E,o.br||0,o.dr||0,j.tc!==false)+'</div>':''}${o.st==='skip'||o.st==='done'||o.E<=n?'':isz(I.get(o.oid))}<div class="tr" style="margin:8px 0 0;gap:6px;flex-wrap:wrap"><button class="tg" data-k="e:${o.oid}">Edit${o.pat?' this day':''}</button>${o.pat?`<button class="tg" data-k="es:${o.pat}">Edit repeat</button>`:''}<button class="tg" data-k="x:${o.oid}">Remove${o.pat?' this day':''}</button></div></div>`});
 if(fr){h+=`<div class="bx" style="margin-top:8px"><div class="lbl"><span class="pldot ${['','ok','warn','bad'][fr.lv]}"></span> ${fr.lv===3?'Rest: '+plRestWhy(fr):fr.lv===2?'Available, with a short daily rest':'Available'}</div>${fr.lv<3||fr.la>fr.ea?`<div class="note">Earliest start <b>${hm(fr.ea)}</b>, latest finish <b>${fr.la===Infinity?'no limit from other shifts':hmx(fr.la,d)}</b>, based on 11 hour rests around your other shifts${fr.ea<d+4*H?'. Starting before 04:00 counts as night work (10 hour limit)':''}.</div>`:''}${fr.txt?`<div class="note">${fr.txt}</div>`:''}${fr.lv<3&&!fr.cut?(fr.lv===1&&!fr.R.length?'<div class="note ok" style="margin-top:4px">✓ '+(/^(8|11|18)h/.test(fmt(fr.e0-fr.s0))?'An ':'A ')+fmt(fr.e0-fr.s0).replace(/ 00m$/,'')+' shift from '+hm(fr.s0)+' to '+hmx(fr.e0,d)+' breaks no rules.</div>':'<div class="note" style="margin-top:4px">'+(/^(8|11|18)h/.test(fmt(fr.e0-fr.s0))?'An ':'A ')+fmt(fr.e0-fr.s0).replace(/ 00m$/,'')+' shift from '+hm(fr.s0)+' to '+hmx(fr.e0,d)+':</div>'):''}${isz(fr.R)}</div>`}
 h+=plOffNote(d,OFF,NX);
 h+=`<button class="tg big" data-k="add" style="margin-top:12px">Add shift</button><button class="tg big" data-k="rp">Repeating shift starting this day</button><button class="tg big" data-k="cw">Copy this week to next week</button><button class="tg big" data-k="no">Close</button>`;
 mo(h);mcb={no:moX,add:()=>plForm({d:ymd(d)}),cw:()=>plCopyWeek(d),rp:()=>plPatForm(null,ymd(d))};
 occ.forEach(o=>{mcb['e:'+o.oid]=()=>plForm(o.pat?{d:o.d,j:o.j,s:o.s,e:o.e,br:o.br,bp:o.bp,dr:o.dr,rv:o.rv,fromPat:o.oid}:(st.plan||[]).find(p=>p.id===o.oid));
  if(o.pat)mcb['es:'+o.pat]=()=>plPatForm((st.pat||[]).find(r=>r.id===o.pat));
  mcb['x:'+o.oid]=()=>{if(o.pat)st.plx=(st.plx||[]).concat(o.oid);else st.plan=(st.plan||[]).filter(p=>p.id!==o.oid);save();plRender();plDay(d)}})}

/* When the breaks in a planned shift have to be taken: never more than 6 hours of work in a row (RTWTR), and for tacho driving a 45 minute break by 4h 30m of driving (561/2006 art 7). */
function plBrk(S,E,br,dr,tc){const w=E-S-(br||0)*M,need=w>9*H?45:w>6*H?30:0,L=[];
 if(need){const b=S+6*H,a=Math.max(S,E-(br||need)*M-6*H);
  if(br>=need&&a<=b)L.push(`Take your ${br} minute break between <b>${plHm(a)}</b> and <b>${plHm(b)}</b>, so you never work more than 6 hours in a row.`);
  else if(br>=need)L.push(`One break is not enough: you can only work 6 hours in a row, so split your ${br} minutes into breaks of at least 15 minutes, the first by <b>${plHm(b)}</b>.`);
  else L.push(`This shift needs at least ${need} minutes of breaks, the first by <b>${plHm(b)}</b> so you never work more than 6 hours in a row.`)}
 else L.push('No break is needed by law for up to 6 hours of work.');
 if(tc&&dr>=4.5)L.push(`Driving: a 45 minute break (or 15 then 30) by 4h 30m of driving${E-S>270*M?`, so by <b>${plHm(S+270*M)}</b> if you drive from the start`:''}. One break can count for both rules.`);
 return L.join(' ')}
/* The shift form: chips you tap instead of dropdowns. The values live in the same inputs as before (hidden where a chip row
   sets them), so plRead and both forms keep working. plFsync marks the chosen chips and writes the length line. */
function plPresets(){const C={};(st.plan||[]).concat(st.pat||[]).forEach(x=>{if(x.s&&x.e){const k=x.s.slice(0,5)+'-'+x.e.slice(0,5);C[k]=(C[k]||0)+1}});
 const L=Object.keys(C).sort((a,b)=>C[b]-C[a]).slice(0,4);return L.length?L:['09:00-17:00','07:00-15:00']}
function plFields(p){const J=jobs(),jj=p.j||st.cj||J[0].id,br=p.br===undefined?30:p.br;
 return `<div class="fsec"><div class="flb">Job</div><div class="fchips">${J.map(x=>`<button type="button" class="fchip fjob" data-fk="j:${x.id}" style="--jc:${JCOL[jobI(x.id)]}"><i></i>${esc(x.n)}${x.tc===false?'<small>no tacho</small>':''}</button>`).join('')}</div><input type="hidden" id="pfj" value="${jj}"></div>
 <div class="fsec"><div class="flb">Time</div><div class="ftimes"><label class="ftime"><span>Start</span><input type="time" id="pfs" value="${p.s||'09:00'}"></label><span class="farr" aria-hidden="true">→</span><label class="ftime"><span>Finish</span><input type="time" id="pfe" value="${p.e||'17:00'}"></label></div>
 <div class="fsub">Your usual times</div><div class="fchips fsm">${plPresets().map(t=>`<button type="button" class="fchip" data-fk="t:${t}">${t.replace('-','–')}</button>`).join('')}</div>
 <div class="fsub">Or set the length from the start time</div><div class="fchips fsm">${[4,6,8,9,10,12].map(h=>`<button type="button" class="fchip" data-fk="L:${h}">+${h}h</button>`).join('')}</div><div class="fsum" id="pfsum"></div>
 <label class="fsw"><span>Times vary<small>Your start and finish change from day to day. These times are used as a rough guide, and the app asks what you really worked at the end.</small></span><span class="swt"><input type="checkbox" id="pfrv"${p.rv?' checked':''}><i></i></span></label></div>
 <div class="fsec"><div class="flb">Break</div><div class="fchips">${[0,15,30,45,60,90].map(v=>`<button type="button" class="fchip" data-fk="b:${v}">${v?v+' min':'None'}</button>`).join('')}</div><input type="hidden" id="pfb" value="${br}"><div class="note warn" id="pfbn" hidden>4h 30m or more of driving needs at least 45 minutes of breaks (one 45, or 15 then 30).</div>
 <label class="fsw"><span>Paid break<small>For your own records. Paid or not, a break never counts as work.</small></span><span class="swt"><input type="checkbox" id="pfbp"${p.bp?' checked':''}><i></i></span></label></div>
 <div class="fsec" id="pfdw"><div class="flb">Driving expected</div><div class="fstep"><button type="button" data-fk="d:-0.5" aria-label="Less driving">−</button><input type="number" id="pfd" min="0" max="15" step="0.5" value="${p.dr===undefined?'':p.dr}" placeholder="0" aria-label="Driving expected, in hours"><span>hours</span><button type="button" data-fk="d:0.5" aria-label="More driving">+</button></div><div class="note">Counts towards your tacho driving limits.</div></div>`}
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
 const ds=[...new Set(C.map(c=>sod(c[0].S)))],nm=o=>esc(jobC(o.j).n)+' '+o.s.slice(0,5)+'–'+o.e.slice(0,5),A=C[0][0],B=C[0][1];
 mo(`<h3>Shifts Clash</h3><p>This lands on top of another planned shift on <b>${ds.length} day${ds.length>1?'s':''}</b>: ${ds.slice(0,4).map(d=>dlong(d)).join(' · ')}${ds.length>4?' and more':''}.</p><p class="note">For example ${dlong(A.S)}: <b>${nm(A)}</b> (new) and <b>${nm(B)}</b> (already planned). Which do you want to keep on those days?</p>
 <button class="tg big fpri" data-k="nw">Keep the new one</button><button class="tg big" data-k="od">Keep the one already planned</button><button class="tg big" data-k="bk">Go back and change it</button>`);
 const drop=o=>{if(o.pat){if(!(st.plx||[]).includes(o.oid))st.plx=(st.plx||[]).concat(o.oid)}else st.plan=(st.plan||[]).filter(x=>x.id!==o.oid)};
 mcb={nw:()=>{C.forEach(c=>drop(c[1]));done()},od:()=>{C.forEach(c=>drop(c[0]));done()},bk:()=>{const s=JSON.parse(snap);st.pat=s.pat;st.plan=s.plan;st.plx=s.plx;back()}}}
const plSnap=()=>JSON.stringify({pat:st.pat||[],plan:st.plan||[],plx:st.plx||[]});
function plFsync(){const w=$('mo');if(!w||!$('pfs'))return;const on=(k,v)=>w.querySelectorAll(`[data-fk^="${k}:"]`).forEach(b=>b.classList.toggle('on',b.dataset.fk===k+':'+v));
 {const tc=jobC($('pfj').value).tc!==false,dv=tc?parseFloat(($('pfd')||{}).value)||0:0,need=dv>=4.5?45:0;if(need&&+$('pfb').value<need)$('pfb').value=need;
  w.querySelectorAll('[data-fk^="b:"]').forEach(b=>{const v=+b.dataset.fk.slice(2);b.disabled=v<need;b.classList.toggle('foff',v<need)});if($('pfbn'))$('pfbn').hidden=!need}
 on('j',$('pfj').value);on('b',$('pfb').value);if($('pft')){const t=$('pft');on('u',t.dataset.u||(t.value?'d':'0'))}on('t',$('pfs').value+'-'+$('pfe').value);if($('pfr'))on('r',$('pfr').value);if($('pfdt'))on('dt',$('pfdt').value);
 const s=tmin($('pfs').value),e=tmin($('pfe').value),sm=$('pfsum');if(!isNaN(s)&&!isNaN(e)){let L0=e-s;if(L0<=0)L0+=1440;on('L',L0%60?'x':String(L0/60))}if(sm){if(isNaN(s)||isNaN(e)||s===e){sm.textContent='';return}let L=e-s;if(L<=0)L+=1440;const wk=Math.max(0,L-(+$('pfb').value||0));
  sm.innerHTML=`<b>${fmt(L*M).replace(/ 00m$/,'')}</b> shift · <b>${fmt(wk*M).replace(/ 00m$/,'')}</b> of work${e<=s?' · <span class="warn">finishes the next day</span>':''}`}}
document.addEventListener('click',e=>{const b=e.target.closest('#mo [data-fk]');if(!b)return;const[k,v]=b.dataset.fk.split(/:(.*)/s);
 if(k==='j'){$('pfj').value=v;plDrv()}else if(k==='t'){const[a,c]=v.split('-');$('pfs').value=a;$('pfe').value=c}else if(k==='b')$('pfb').value=v;else if(k==='r')$('pfr').value=v;else if(k==='dt')$('pfdt').value=v;
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
 <button class="tg big fpri" data-k="ok">${isNew?'Add shift':'Save changes'}</button>${isNew?'':`<button class="tg big fdel" data-k="del">${p.fromPat?'Remove this day':'Remove shift'}</button>`}<button class="tg big" data-k="no">Cancel</button>${isNew?'<button class="flink" data-k="rpl">Set up or remove repeating shifts</button>':''}`);plDrv();plFsync();
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
  g+=`<button type="button" class="prc${inM?'':' plo'}${d===t0?' plt':''}${L.length?' on':''}" data-k="pd:${d}"${c?` style="--jc:${c}"`:''}><span class="pln">${new Date(d).getDate()}</span>${L.map(o=>`<span class="prt">${ct(o.s)}–${ct(o.e)}</span>`).join('')}</button>`}
 mo(`<h3>Repeating Shifts</h3><p class="note" style="margin-top:-4px">Coloured days are your repeating shifts. Tap one to change it, or tap an empty day to start a new repeat from there.</p>
 <div class="tr" style="margin:6px 0 8px;gap:6px"><button class="tg" data-k="pm:-1" aria-label="Previous month">‹</button><b style="flex:1;text-align:center;font-size:16px">${md.toLocaleDateString('en-GB',{month:'long',year:'numeric'})}</b><button class="tg" data-k="pm:1" aria-label="Next month">›</button></div>
 <div class="plg">${D.map(x=>`<div class="plh">${x}</div>`).join('')}${g}</div>
 ${R.length?`<div class="flb" style="margin:14px 0 6px">Your repeats</div><div class="fchips">${R.map(r=>{const j=jobC(r.j),old=r.to&&pdt(r.to)<t0;return `<button type="button" class="fchip fjob frep${old?' foff':''}" data-k="ed:${r.id}" style="--jc:${JCOL[jobI(j.id)]}"><i></i><span><b>${esc(j.n)}</b><small>${r.days.map(i=>D[i]).join(', ')} · ${r.s}–${r.e} · ${ordW(r.ev)}${r.to?' · until '+new Date(pdt(r.to)).toLocaleDateString('en-GB',{day:'numeric',month:'short'}):''}</small></span></button>`}).join('')}</div>`:'<p class="note" style="margin-top:10px">No repeating shifts yet.</p>'}
 <button class="tg big fpri" data-k="new" style="margin-top:14px">Add repeating shift</button><button class="tg big" data-k="no">Close</button>`);
 mcb={no:moX,new:()=>plPatForm(null),'pm:-1':()=>{const x=new Date(m);x.setMonth(x.getMonth()-1);plPatList(x.getTime())},'pm:1':()=>{const x=new Date(m);x.setMonth(x.getMonth()+1);plPatList(x.getTime())}};
 R.forEach(r=>mcb['ed:'+r.id]=()=>plPatForm(r));
 for(let d=gs;d<ge;d=nxd(d)){const L=byD[d]||[];mcb['pd:'+d]=()=>{const ids=[...new Set(L.map(o=>o.pat))];if(!ids.length)return plPatForm(null,ymd(d));if(ids.length===1)return plPatForm(R.find(r=>r.id===ids[0]));
  mo(`<h3>Which Repeat?</h3>${ids.map(id=>{const r=R.find(x=>x.id===id),j=jobC(r.j);return `<button class="tg big" data-k="w:${id}">${esc(j.n)} ${r.s}–${r.e}</button>`}).join('')}<button class="tg big" data-k="no">Back</button>`);mcb={no:()=>plPatList(m)};ids.forEach(id=>mcb['w:'+id]=()=>plPatForm(R.find(r=>r.id===id)))}}}
/* removing a repeat keeps the shifts that have already passed, unless you say how far back to remove them */
function plPatDel(r){const t0=sod(Date.now());
 const drop=()=>{st.pat=(st.pat||[]).filter(x=>x.id!==r.id);st.plx=(st.plx||[]).filter(x=>!x.startsWith(r.id+'|'));save();plRender();plPatList()};
 const cut=days=>{const to=ymd(t0-days*864e5-864e5);if(pdt(to)<pdt(r.from)){drop();return}st.pat=(st.pat||[]).map(x=>x.id===r.id?Object.assign({},x,{to:r.to&&pdt(r.to)<pdt(to)?r.to:to}):x);save();plRender();plPatList()};
 mo(`<h3>Remove Repeat?</h3><p class="note" style="margin-top:-4px">Past planned shifts are only a record of what was planned. Your logged hours are never changed.</p>
 <button class="tg big" data-k="f">Stop it from today<small style="display:block;font-weight:400;opacity:.8">Keeps the past ones, removes today and later</small></button>
 <div class="bx" style="margin:8px 0"><label style="margin:0">Stop it from a date<input type="date" id="pdx" value="${ymd(t0+7*864e5)}"></label><button class="tg big" data-k="dt" style="margin-top:8px">Stop from this date</button></div>
 <button class="tg big" data-k="past">Remove only the past ones<small style="display:block;font-weight:400;opacity:.8">Keeps today and every shift after</small></button>
 <button class="tg big fdel" data-k="all">Remove all of it, past and future</button><button class="tg big" data-k="no">Cancel</button>`);
 mcb={no:()=>plPatForm(r),f:()=>cut(0),dt:()=>{const v=$('pdx').value;if(!v)return;const k=Math.round((t0-pdt(v))/864e5);cut(k)},
  past:()=>{if(r.to&&pdt(r.to)<t0){drop();return}/* hide each past day rather than moving the start, so every other week stays on the same weeks */
   const ids=plOcc(pdt(r.from),t0).filter(o=>o.pat===r.id).map(o=>o.oid),X=new Set(st.plx||[]);st.plx=(st.plx||[]).concat(ids.filter(x=>!X.has(x)));save();plRender();plPatList()},
  all:()=>{mo('<h3>Remove All?</h3><p>This removes every shift in this repeat, including the ones in the past.</p><button class="tg big fdel" data-k="ok">Yes, remove them all</button><button class="tg big" data-k="no">Go back</button>');mcb={no:()=>plPatDel(r),ok:drop}}}}
function plPatForm(r,hint){const isNew=!r;r=r||{days:hint?[(new Date(pdt(hint)).getDay()+6)%7]:[],from:hint||''};const D=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];let days=r.days.slice();
 const draw=()=>{const keep=$('pfs')?Object.assign(plRead(),{from:$('pff').value,to:$('pft').value,ev:$('pfev')?+$('pfev').value:r.ev}):null,v=keep||r,v0=v;
  mo(`<h3>${isNew?'Add repeating shift':'Edit repeating shift'}</h3><label>Repeat<select id="pfev">${[1,2,3,4,5,6].map(v=>`<option value="${v}"${v===(+(v0.ev||r.ev||1))?' selected':''}>${ordW(v).replace(/^e/,'E')}</option>`).join('')}</select></label><div class="lbl">On These Days</div><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin:6px 0 10px">${D.map((x,i)=>`<button class="tg" data-k="d${i}" style="padding:8px 0;${days.includes(i)?'background:var(--acc);border-color:var(--acc);color:var(--onacc);font-weight:700':''}">${x}</button>`).join('')}</div>${plFields(v)}<div class="fsec" style="margin-top:12px"><label style="margin:0">First shift on<input type="date" id="pff" value="${v.from||''}"></label><div class="flb" style="margin-top:6px">How long</div><div class="fchips">${[['0','Forever'],['28','4 weeks'],['91','3 months'],['182','6 months'],['365','1 year'],['d','Until a date']].map(x=>`<button type="button" class="fchip" data-fk="u:${x[0]}">${x[1]}</button>`).join('')}</div><label class="fother" id="pftw"${v.to?'':' hidden'}>Last day<input type="date" id="pft" value="${v.to||''}"></label></div><div class="note" style="margin:-2px 0 6px">Nothing is added before the first shift date. For every other week (or more), that date's week is week 1.</div><div class="note bad" id="pferr"></div><button class="tg big fpri" data-k="ok">Save</button>${isNew?'':'<button class="tg big fdel" data-k="del">Delete this repeating shift</button>'}<button class="tg big" data-k="no">Cancel</button>`);plDrv();plFsync();
  mcb={no:plPatList,ok:()=>{const q=plRead(),f=$('pff').value,t=$('pft').value;if(!days.length){$('pferr').textContent='Pick at least one day.';return}if(!q.s||!q.e||!f){$('pferr').textContent='Enter the start, finish and the date of the first shift.';return}{const fw=(new Date(pdt(f)).getDay()+6)%7;if(!days.includes(fw)){$('pferr').textContent='The first shift date is a '+new Date(pdt(f)).toLocaleDateString('en-GB',{weekday:'long'})+', but that day is not ticked. Tick it or pick a different date.';return}}
    const o={id:r.id||plId(),j:q.j,days:days.slice().sort(),s:q.s,e:q.e,br:q.br,bp:q.bp,dr:q.dr,rv:q.rv,from:f,ev:+$('pfev').value||1};if(t)o.to=t;const snap=plSnap();st.pat=(st.pat||[]).filter(x=>x.id!==o.id).concat(o);plClash(o.id,snap,()=>{save();plRender();plPatList()},()=>plPatForm(r))},
   del:()=>plPatDel(r)};
  D.forEach((x,i)=>mcb['d'+i]=()=>{days=days.includes(i)?days.filter(y=>y!==i):days.concat(i);draw()});
  $('pff').onchange=e=>{if(e.target.value){const fw=(new Date(pdt(e.target.value)).getDay()+6)%7;if(!days.includes(fw)){days=days.concat(fw);draw()}}}};draw()}
function plCopyWeek(d){const w0=wkS(d),w1=nwk(w0),add=[];(st.plan||[]).forEach(p=>{const t=pdt(p.d);if(t>=w0&&t<w1){const q=Object.assign({},p,{id:plId(),d:ymd(add7(t,1))});if(!(st.plan||[]).some(x=>x.d===q.d&&x.s===q.s&&x.j===q.j))add.push(q)}});
 st.plan=(st.plan||[]).concat(add);save();plRender();
 mo(`<h3>Week Copied</h3><p>${add.length?add.length+' shift'+(add.length>1?'s':'')+' copied to the week of '+dlong(w1)+'.':'There were no one-off shifts to copy in this week.'} Repeating shifts already carry on by themselves.</p><button class="tg big" data-k="go">Show next week</button><button class="tg big" data-k="no">Close</button>`);
 mcb={no:moX,go:()=>{moX();const t=new Date(w1);t.setDate(1);PL.m=t.getTime();plRender()}}}

/* Plan versus what happened */
function plPending(){const n=Date.now(),out=[],L=all();plOcc(n-14*864e5,n+864e5).forEach(o=>{if(o.st)return;
  const lg=L.some(x=>x.e>o.S-H&&x.s<o.E+H);
  if(lg){if(o.S<n){st.pls=Object.assign({},st.pls,{[o.oid]:'done'});out.dirty=1}return}
  if(o.E<=n)out.push({o,k:'end'});else if(!o.rv&&o.S+60*M<=n&&!st.active)out.push({o,k:'late'})});
 if(out.dirty){delete out.dirty;save()}return out}
function plBanner(){const el=$('plb');if(!el)return;const P=plPending();
 set(el,P.slice(0,2).map(({o,k})=>{const j=jobC(o.j);return `<div class="wkb wn" style="cursor:default"><b>${k==='end'?'Planned shift: what happened?':'Planned shift not started'}</b><span>${esc(j.n)} ${dlong(o.S)} ${o.rv?'about ':''}${o.s.slice(0,5)}–${o.e.slice(0,5)}. ${k==='end'?'Nothing was logged for it.':'It was due to start at '+o.s.slice(0,5)+'.'}</span><div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${k==='end'?`<button class="tg" data-pbk="as:${o.oid}" style="flex:1 1 0;white-space:normal">Worked as planned</button><button class="tg" data-pbk="df:${o.oid}" style="flex:1 1 0;white-space:normal">Different times</button>`:`<button class="tg" data-pbk="go:${o.oid}" style="flex:1 1 0;white-space:normal">Start this shift</button>`}<button class="tg" data-pbk="sk:${o.oid}" style="flex:1 1 0;white-space:normal">Didn't work</button></div></div>`}).join(''))}
function plLog(o,s,e){const br=(o.br||0)*M,mid=s+Math.max(0,(e-s-br)/2),j=jobC(o.j),tc=j.tc!==false,mk=(a,b)=>{if(b>a){const x={s:a,e:b,t:'w'};if(jobsOn()){x.j=j.id;x.c=tc?1:0}clear(a,b,1);st.sessions.push(x)}};
 if(br>0&&e-s>br){mk(s,mid);mk(mid+br,e)}else mk(s,e);st.pls=Object.assign({},st.pls,{[o.oid]:'done'})}
function plAct(k,oid){const o=plOcc(Date.now()-15*864e5,Date.now()+2*864e5).find(x=>x.oid===oid);if(!o)return;
 if(k==='sk'){st.pls=Object.assign({},st.pls,{[oid]:'skip'});save();render();return}
 if(k==='as'){plLog(o,o.S,o.E);save();render();flash='Logged '+esc(jobC(o.j).n)+' '+o.s.slice(0,5)+'–'+o.e.slice(0,5)+' as Other work. Edit it in the log to split out any driving.';setTimeout(()=>{flash='';live()},9000);return}
 if(k==='go'){if(jobsOn()){st.cj=o.j;st.tm=jobC(o.j).tc!==false;st.tmt=Date.now()}save();setAct('w');return}
 if(k==='df'){mo(`<h3>Work Done</h3><p>${esc(jobC(o.j).n)}, planned ${dlong(o.S)} ${o.s.slice(0,5)}–${o.e.slice(0,5)}.</p><div class="tr"><label>Started<input type="time" id="pas" value="${o.s.slice(0,5)}"></label><label>Finished<input type="time" id="pae" value="${o.e.slice(0,5)}"></label></div><label>Break (min)<input type="number" id="pab" min="0" max="180" value="${o.br||0}"></label><div class="note bad" id="paerr"></div><button class="tg big" data-k="ok">Log it</button><button class="tg big" data-k="no">Cancel</button>`);
  mcb={no:moX,ok:()=>{const a=$('pas').value,b=$('pae').value;if(!a||!b){$('paerr').textContent='Enter both times.';return}const d=sod(o.S);const s=d+tmin(a)*M;let e=d+tmin(b)*M;if(e<=s)e=nxd(d)+tmin(b)*M;if(e>Date.now()){$('paerr').textContent='The finish is in the future.';return}
   plLog(Object.assign({},o,{br:+$('pab').value||0}),s,e);save();moX();render()}}}}

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
$('plc').addEventListener('click',e=>{const t=e.target.closest('[data-pm],[data-pa],[data-pp],[data-pd],[data-pv],[data-pl]');if(!t)return;const d=t.dataset;
 if(d.pv){PL.v=d.pv;try{localStorage.setItem('tg.plv',d.pv)}catch(x){}plRender();return}if(d.pl){PL.ln=(PL.ln||14)+14;plRender();return}
 if(d.pm!==undefined){if(d.pm==='0')PL.m=null;else{const m=new Date(plMonth());m.setMonth(m.getMonth()+ +d.pm);PL.m=m.getTime()}plRender()}
 else if(d.pa)plForm({d:ymd(Date.now())});else if(d.pp)plPatList();else if(d.pd)plDay(+d.pd)});
$('plc').addEventListener('click',e=>{if(e.target.closest('[data-owe]'))wrDetail()});
if(typeof KEEP!=='undefined')['plan','pat','plx','pls'].forEach(k=>{if(!KEEP.includes(k))KEEP.push(k)});
