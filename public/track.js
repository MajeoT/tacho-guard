/* TachoGuard: accounting for your time, the easy way.
   One screen, acctAsk, turns rough answers ("about 2 hours of driving, a 15 and a 30 minute break") into log entries in a sensible
   order, with the breaks where the rules want them, and says what the rules make of it. It is used when:
   - you start a shift later than you really started (tkStartAsk: when did you start?),
   - you come back to the app after a while in the middle of a shift (tkAway: what did you do since?),
   - you log a whole shift afterwards (tkQuick).
   Settings: st.rsl = minutes after a planned start to ask if you started (0 off, 30 by default),
             st.awy = minutes away from the app, during a shift, before it asks what you did (0 off, 60 by default). */
const TKSEEN='tachoguard.seen';
const tkSeen=()=>{try{return +localStorage.getItem(TKSEEN)||0}catch(e){return 0}};
const tkMark=()=>{try{localStorage.setItem(TKSEEN,String(Date.now()))}catch(e){}};
const tkRsl=()=>st.rsl===undefined?30:+st.rsl||0,tkAwy=()=>st.awy===undefined?60:+st.awy||0;
const tkF=m=>{m=Math.round(m);const h=Math.floor(m/60),r=m%60;return h?h+'h'+(r?' '+r+'m':''):r+'m'};
const TKN={d:'Driving',w:'Other work',p:'POA',r:'Break'},TKI={d:'🚛',w:'⚒',p:'◪',r:'🛏'};

/* Lay rough amounts over a stretch of time. Breaks first (one break in the advised window, several spread evenly), then the work
   in this order: a little other work to start (checks), driving, POA, then the rest as the main activity (def). */
function tkBuild(from,to,def,amt,brk,tc,pre){const T=to-from,B=brk.reduce((q,x)=>q+x,0)*M,W=T-B;if(W<0)return null;pre=pre||{d0:0,w0:0};
 const job=o=>{if(jobsOn()&&o.t!=='r'){if(st.cj)o.j=st.cj;o.c=o.t==='d'?1:isTc()?1:0}return o};
 /* the work, in order */
 const others=['d','w','p'].filter(k=>k!==def&&amt[k]>0).map(k=>[k,amt[k]*M]),oth=others.reduce((q,x)=>q+x[1],0);if(oth>W+6e4)return null;
 const rest=W-oth;
 /* halves: when one block of driving makes the break impossible to place legally, half of everything goes before the break and half after */
 const mk=half=>{const q=[],lead=def==='w'?Math.min(rest,15*M):0,r=rest-lead,part=(f)=>{others.forEach(([k,l])=>q.push([k,Math.round(l*f/M)*M]));q.push([def,Math.round(r*f/M)*M])};
  if(lead>0)q.push(['w',lead]);if(!half){part(1)}else{const before=q.length;part(.5);const used=q.slice(before).reduce((a,x)=>a+x[1],0);others.forEach(([k,l])=>q.push([k,l-q.slice(before).filter(x=>x[0]===k).reduce((a,x)=>a+x[1],0)]));q.push([def,r-q.slice(before).filter(x=>x[0]===def).reduce((a,x)=>a+x[1],0)]);void used}
  return q.filter(x=>x[1]>0)};
 let seq=mk(false);
 /* where the breaks go, worked out from when the driving and work actually fall (and what was done before this stretch):
    a full break (45, or the 30 that finishes a 15) as late as the 4h 30m driving and 6 hour work limits allow, but early enough
    that what comes after is within them too, and on a change of activity when one is in that window; a 15 before a 30 goes
    halfway to it. Times here are work time from the start of the stretch. */
 const dr=t=>{let c=0,acc=0;for(const[k,l]of seq){if(c>=t)break;const u=Math.min(l,t-c);if(k==='d')acc+=u;c+=l}return acc},Dt=dr(W);
 let bnd=[];const mkB=()=>{bnd=[];let w=0;seq.forEach((x,k)=>{w+=x[1];if(k<seq.length-1)bnd.push(w)})};mkB();
 const tAt=d=>{/* work time when driving reaches d */let c=0,acc=0;for(const[k,l]of seq){if(k==='d'){if(acc+l>=d)return c+(d-acc);acc+=l}c+=l}return Infinity};
 /* the latest work time with no more than lim of driving done: other work after reaching it is fine, the next driving is not */
 const latestD=lim=>{let c=0,acc=0;for(const[k,l]of seq){if(k==='d'){if(acc+l>lim)return c+Math.max(0,lim-acc);acc+=l}c+=l}return W};
 /* the window for the full break (nb = how many breaks in all): no more than 6 hours of work in each stretch, and with tacho driving
    of 4h 30m or more, no more than 4h 30m of driving either side of the full break */
 const win=(full,w0,d0,nb)=>{let hi=Math.min(W,6*H*nb-w0),lo=Math.max(0,W-6*H);if(full&&tc&&d0+Dt>=270*M){hi=Math.min(hi,latestD(270*M-d0));lo=Math.max(lo,Dt-270*M>0?tAt(Dt-270*M):0)}return[lo,hi]};
 const pick=(lo,hi)=>{if(lo>hi)return hi;const mid=(lo+hi)/2,c=bnd.filter(x=>x>=lo&&x<=hi);return c.length?c.reduce((m,x)=>Math.abs(x-mid)<Math.abs(m-mid)?x:m):mid};
 {/* the main break: if it cannot fit with the driving in one block, use halves */const L=brk.length?brk[brk.length-1]:0,full=L>=45||(L>=30&&(brk.length>1||pre.half));
  if(brk.length){const[lo,hi]=win(full,pre.w0,pre.d0,brk.length);if(lo>hi+6e4){seq=mk(true);mkB();/* still too much after the break: move some of the main activity from after it to before it */for(let g=0;g<3;g++){const[l2,h2]=win(full,pre.w0,pre.d0,brk.length);if(l2<=h2+6e4)break;const last=seq.length-1,fi=seq.findIndex((x,k)=>k>0&&x[0]===def&&k<last);if(fi<0||seq[last][0]!==def)break;const mv=Math.min(seq[last][1],Math.ceil((l2-h2)/M)*M);seq[fi][1]+=mv;seq[last][1]-=mv;seq=seq.filter(x=>x[1]>0);mkB()}}}}
 let P=[];/* [work time, length] */
 if(brk.length===1){const full=brk[0]>=45||(brk[0]>=30&&pre.half);const[lo,hi]=win(full,pre.w0,pre.d0,1);P=[[pick(lo,hi),brk[0]]]}
 else if(brk.length>1){const L=brk[brk.length-1],[lo,hi]=win(L>=30,pre.w0,pre.d0,2),p2=pick(lo,hi);/* the 15 only counts as the first part of a driving break once some driving has been done */const d1=tc&&Dt>0&&!pre.d0?Math.min(p2,tAt(1)+M):0;const lo1=Math.max(d1,p2-6*H),hi1=Math.min(p2,6*H-pre.w0);let p1=pick(lo1,hi1);if(p1>=p2||p1<lo1)p1=Math.min(hi1,Math.max(lo1,(lo1+hi1)/2));P=[[p1,brk[0]],[p2,L]];
  for(let i=1;i<brk.length-1;i++)P.splice(i,0,[p2*(i+1)/brk.length,brk[i]])}
 P.sort((a,b)=>a[0]-b[0]);let used=0;const br=P.map(([t,l])=>{const o={at:from+Math.round(t/M)*M+used,len:l*M};used+=l*M;return o});
 const out=[];let c=from,bi=0,q=0,left=seq.length?seq[0][1]:0;
 const put=(a,b,t)=>{if(b-a<M/2)return;const l=out[out.length-1];if(l&&l.t===t&&l.e===a)l.e=b;else out.push(job({s:a,e:b,t}))};
 while(c<to-1&&(q<seq.length||bi<br.length)){const nb=bi<br.length?br[bi].at:Infinity;
  if(c>=nb){put(c,c+br[bi].len,'r');c+=br[bi].len;bi++;continue}
  if(q>=seq.length){c=nb;continue}
  const end=Math.min(c+left,nb,to);put(c,end,seq[q][0]);left-=end-c;c=end;if(left<=1){q++;left=q<seq.length?seq[q][1]:0}}
 return out}

/* What the rules make of a set of entries, merged into the log: problems in the shift, and when the next break is due and why */
function tkJudge(E,from,to,goingOn){const A=all().filter(x=>x.t!=='r'&&(x.e<=from||x.s>=to)).map(x=>Object.assign({},x)).concat(E.filter(x=>x.t!=='r')).sort((a,b)=>a.s-b.s);
 if(!A.length)return{bad:[],next:''};let i=A.length-1;while(i>0&&A[i].s-A[i-1].e<9*H)i--;const S=A.slice(i).filter(x=>x.s<to+1);
 const bad=typeof audRules==='function'?audRules(S).map(r=>r[0]):[];let next='';
 if(goingOn){const tc=isTc();let d=0,p=false,rn=0,tot=0,brkT=0;S.forEach((x,k)=>{if(k){const g=x.s-S[k-1].e;if(g>=45*M||(p&&g>=30*M)){d=0;p=false}else if(g>=15*M&&d>0)p=true;if(g>=15*M){brkT+=g;rn=0}}if(x.t==='d')d+=x.e-x.s;if(x.t!=='p'){rn+=x.e-x.s;tot+=x.e-x.s}});
  const L=[];if(tc&&d>0)L.push([270*M-d,'you reach 4h 30m of driving since your last full break',p?'30 minutes, to finish the 15 you had':'45 minutes, or 15 now and 30 later']);
  L.push([6*H-rn,'you reach 6 hours of work in a row','at least 15 minutes']);L.sort((a,b)=>a[0]-b[0]);const k=L[0];
  next=k[0]<=0?`☕ Take a break now: ${k[1].replace('you reach','you have reached')}. It needs to be ${k[2]}.`:`☕ Next break by <b>${hm(to+k[0])}</b>, because by then ${k[1]}. It needs to be ${k[2]}.`;
  const need=tot>9*H?45:tot>6*H?30:0;if(need&&brkT<need*M)next+=` Over ${need===45?'9':'6'} hours of work you need ${need} minutes of breaks in all; you have had ${Math.round(brkT/M)}.`}
 return{bad,next}}

/* The screen: o = {from, to, def (the main activity, other work if not given), title, lead, ok (button text), done(E), back, quick} */
function acctAsk(o){const tc=isTc(),T=(o.to-o.from)/M,def=o.def||'w';
 /* driving and work since the last full break, up to the start of this stretch, so the breaks it suggests count them */
 const pre=(()=>{const A=all().filter(x=>x.t!=='r'&&x.s<o.from).map(x=>Object.assign({},x,{e:Math.min(x.e,o.from)}));if(!A.length||o.from-A[A.length-1].e>=9*H)return{d0:0,w0:0,half:false};
  let i=A.length-1;while(i>0&&A[i].s-A[i-1].e<9*H)i--;const S=A.slice(i);let d=0,p=false,rn=0;S.forEach((x,k)=>{if(k){const g=x.s-S[k-1].e;if(g>=45*M||(p&&g>=30*M)){d=0;p=false}else if(g>=15*M&&d>0)p=true;if(g>=15*M)rn=0}if(x.t==='d')d+=x.e-x.s;if(x.t!=='p')rn+=x.e-x.s});
  const g=o.from-S[S.length-1].e;if(g>=45*M||(p&&g>=30*M)){d=0;p=false}if(g>=15*M)rn=0;return{d0:d,w0:rn,half:p}})();
 const amt={d:0,w:0,p:0},on={d:false,w:false,p:false,r:false};let brk=[];
 if(o.quick){/* a whole shift: suggest the breaks the law needs, so they only have to be changed if wrong */const w=T;if(w>9*60+45)brk=[45];else if(w>6*60+30)brk=[30];if(brk.length)on.r=true}
 const kinds=[...(tc?['d']:[]),'w','p'].filter(k=>k!==def);
 const chips={d:[15,30,45,60,90,120,180,240],w:[15,30,60,90,120],p:[15,30,60,90,120]},bchips=[[15],[30],[45],[15,30],[60]];
 const draw=()=>{const B=brk.reduce((q,x)=>q+x,0),oth=kinds.reduce((q,k)=>q+(on[k]?amt[k]:0),0),rest=T-(on.r?B:0)-oth,E=rest>=0?tkBuild(o.from,o.to,def,{d:on.d?amt.d:0,w:on.w?amt.w:0,p:on.p?amt.p:0},on.r?brk:[],tc,pre):null,J=E?tkJudge(E,o.from,o.to,!o.quick):null;
  const row=k=>`<div class="acr${on[k]?' on':''}"><label class="fsw" style="margin:0"><span>${TKI[k]} ${k==='w'?'Did you do other work?':k==='d'?'Did you drive?':'Did you have POA (waiting time)?'}</span><span class="swt"><input type="checkbox" data-ak="t:${k}"${on[k]?' checked':''} aria-label="${TKN[k]}"><i></i></span></label>${on[k]?`<div class="fsub">Roughly how long?</div><div class="fchips fsm">${chips[k].filter(m=>m<=T).map(m=>`<button type="button" class="fchip${amt[k]===m?' on':''}" data-ak="a:${k}:${m}">${tkF(m)}</button>`).join('')}</div><div class="fstep"><button type="button" data-ak="s:${k}:-15" aria-label="Less">−</button><span><b>${tkF(amt[k])}</b></span><button type="button" data-ak="s:${k}:15" aria-label="More">+</button></div>`:''}</div>`;
  mo(`<h3>${o.title}</h3><p>${o.lead||''} That is <b>${tkF(T)}</b> to account for, from ${hm(o.from)} to ${hm(o.to)}. Turn on what you did. ${def==='w'?'Anything left over counts as other work, which is how most shifts start.':'Anything left over stays as '+TKN[def].toLowerCase()+'.'}</p><div class="acq">
  ${kinds.map(row).join('')}
  <div class="acr${on.r?' on':''}"><label class="fsw" style="margin:0"><span>🛏 Did you have a break?</span><span class="swt"><input type="checkbox" data-ak="t:r"${on.r?' checked':''} aria-label="Break"><i></i></span></label>${on.r?`<div class="fsub">Which?</div><div class="fchips fsm">${bchips.filter(b=>b.reduce((q,x)=>q+x,0)<T).map(b=>`<button type="button" class="fchip${brk.join('+')===b.join('+')?' on':''}" data-ak="b:${b.join('+')}">${b.map(x=>x+' min').join(' + ')}</button>`).join('')}</div>`:''}</div>
  </div><div class="fsum">${rest<0?`<span class="bad">That adds up to more than ${tkF(T)}. Take some off.</span>`:`${TKI[def]} ${TKN[def]}: <b>${tkF(rest)}</b> (the rest)`}</div>
  ${E?`<div class="note" style="margin-top:8px"><b>How it goes in your log:</b> ${E.map(x=>`${TKI[x.t]} ${hm(x.s)}–${hm(x.e)}`).join(' · ')}<br>The order is a best guess. If you want exact times, change them in Today's Log afterwards.</div>`:''}
  ${J&&J.bad.length?`<div class="wn" style="margin-top:8px"><b>⚠ With these answers:</b> ${J.bad.join('. ')}. If this is what really happened, save it so your record is honest.</div>`:''}
  ${J&&J.next?`<div class="note" style="margin-top:8px">${J.next}</div>`:''}
  <div class="note bad" id="akerr"></div><button class="tg big fpri" data-k="ok"${rest<0?' disabled':''}>${o.ok||'Save'}</button>${o.back?'<button class="tg big" data-k="bk">← Back</button>':''}<button class="tg big" data-k="no">Cancel</button>`);
  mcb={no:o.cancel||undo,bk:o.back,ok:()=>{if(!E){$('akerr').textContent='Those times do not fit. Check the amounts.';return}o.done(E)}}};
 const ev=e=>{const b=e.target.closest('[data-ak]');if(!b||!$('mo').contains(b))return;const[k,a,v]=b.dataset.ak.split(':');
  if(k==='t'){on[a]=b.tagName==='INPUT'?b.checked:!on[a];if(a!=='r'&&on[a]&&!amt[a])amt[a]=Math.min(a==='d'?60:30,Math.floor(T/15)*15)||15;if(a==='r'&&on.r&&!brk.length)brk=T>9*60?[45]:T>6*60?[30]:[15]}
  else if(k==='a')amt[a]=+v;else if(k==='s')amt[a]=Math.max(0,Math.min(T,amt[a]+ +v));else if(k==='b')brk=a.split('+').map(Number);draw()};
 tkEv=ev;draw()}
/* the toggles and chips of acctAsk (the pop-up's own buttons still go through its usual handler) */
let tkEv=null;
document.addEventListener('click',e=>{const b=e.target.closest('[data-ak]');if(tkEv&&b&&b.tagName!=='INPUT'&&!$('mo').hidden)tkEv(e)});
document.addEventListener('change',e=>{if(tkEv&&e.target.closest&&e.target.closest('[data-ak]')&&!$('mo').hidden)tkEv(e)});

/* Put the entries in: everything logged in that stretch is replaced */
function tkPut(E,from,to){clear(from,to,1);E.forEach(x=>st.sessions.push(x));if(st.rs&&from<st.rs)st.rs=from}

/* Starting a shift: when did you really start? */
function tkStartAsk(t,o){const n=Date.now(),A=all(),pe=A.length?A[A.length-1].e:0,ps=o?o.S:0,opts=[];
 if(o&&ps<n-5*M&&ps>=pe)opts.push([ps,`I started at ${hm(ps)}, as planned`]);
 [15,30,60,120].forEach(m=>{const x=n-m*M;if(x>pe)opts.push([x,`${m<60?m+' minutes':m/60+(m===60?' hour':' hours')} ago (${hm(x)})`])});
 mo(`<h3>When Did You Start?</h3><p>${o?`You had <b>${esc(jobC(o.j).n)}</b> planned from <b>${o.s.slice(0,5)}</b>. `:''}If your shift started before now, say when, and TachoGuard asks what you did since, so your hours and breaks count from the right time.</p><button class="tg big fpri" data-k="now">I am starting now (${hm(n)})</button>${opts.map(([x,l],i)=>`<button class="tg big" data-k="o${i}">${l}</button>`).join('')}<div class="tr" style="margin-top:12px"><label>Or I started at<input type="time" id="tkst"></label><button class="tg" data-k="at">Use time</button></div><div class="note bad" id="tkerr"></div><button class="tg big" data-k="no">Cancel</button>`);
 const go=x=>{if(n-x<5*M){begin(t,1);return}
  acctAsk({from:x,to:n,def:'w',title:'Since '+hm(x),lead:`You started at <b>${hm(x)}</b> and are starting ${TKN[t==='x'?'d':t].toLowerCase()} now.`,ok:'Save and start my shift',back:()=>tkStartAsk(t,o),
   done:E=>{begin(t,1);tkPut(E,x,n);st.active=n;st.act=t;save();render();tkMark()}})};
 mcb={no:undo,now:()=>begin(t,1),at:()=>{const v=$('tkst').value;if(!v){$('tkerr').textContent='Enter the time you started.';return}const x=prevT(v,n);
  if(x<pe){$('tkerr').textContent='That is before your last activity ended ('+hm(pe)+'). Pick a later time.';return}if(n-x>16*H){$('tkerr').textContent='That is more than 16 hours ago. Check the time.';return}go(x)}};
 opts.forEach(([x],i)=>mcb['o'+i]=()=>go(x))}

/* Back in the app after a while, in the middle of a shift: was it all what the app has been counting? */
function tkAway(){const prev=tkSeen(),n=Date.now(),thr=tkAwy();tkMark();
 if(!thr||!prev||!st.active||!$('mo').hidden||n-prev<thr*M||n-prev>18*H)return;
 const from=Math.max(prev,st.active),act=st.act==='x'?'d':st.act;if(n-from<thr*M)return;
 mo(`<h3>Welcome Back</h3><p>You last had TachoGuard open at <b>${hm(prev)}</b>, ${tkF((n-prev)/M)} ago. Since ${hm(from)} it has been counting <b>${TKN[act]}</b>.</p><p>Is that what you were doing all that time?</p><button class="tg big fpri" data-k="y">Yes, ${TKN[act].toLowerCase()} the whole time</button><button class="tg big" data-k="nn">No, I did other things too</button><button class="tg big" data-k="no">Ask me later</button>`);
 mcb={no:()=>{try{localStorage.setItem(TKSEEN,String(prev))}catch(e){}moX()},y:moX,nn:()=>acctAsk({from,to:n,def:act,title:'Since '+hm(from),lead:`TachoGuard had you on ${TKN[act].toLowerCase()} since ${hm(from)}.`,ok:'Save',cancel:moX,
  done:E=>{snap=JSON.stringify(st);const a0=st.active,t0=st.act;if(from>a0){st.act=t0;st.sessions.push(rec(a0,from))}st.active=n;st.act=t0;tkPut(E,from,n);save();moX();render();
   flash=`Saved. ${TKN[act]} carries on from now: if you are doing something else now, tap it below. <button class="tg" data-ua="1" style="margin-left:6px">Undo</button>`;usnap=snap;snap=null;setTimeout(()=>{flash='';live()},12000);live()}})}}

/* A whole shift in a few taps */
function tkQuick(){const n=Date.now(),td=sod(n);let day=td;
 const draw=()=>{mo(`<h3>Log a Shift Quickly</h3><p>For a shift you did not log as you went. Say when it started and finished, then what you did.</p><div class="fchips">${[0,1,2].map(k=>{const d=td-k*864e5,dd=sod(d);return `<button type="button" class="fchip${dd===day?' on':''}" data-k="d${k}">${k===0?'Today':k===1?'Yesterday':new Date(dd).toLocaleDateString('en-GB',{weekday:'long'})}</button>`}).join('')}</div><label class="fother">Or another day<input type="date" id="tqd" value="${ymd(day)}"></label><div class="tr" style="margin-top:10px"><label>Started<input type="time" id="tqs"></label><label>Finished<input type="time" id="tqe"></label></div><div class="note bad" id="tqerr"></div><button class="tg big fpri" data-k="ok">Next</button><button class="tg big" data-k="no">Cancel</button>`);
  [0,1,2].forEach(k=>mcb['d'+k]=()=>{day=sod(td-k*864e5);keep()});$('tqd').onchange=e=>{if(e.target.value){day=pdt(e.target.value);keep()}}};
 let sv='',ev='';const keep=()=>{sv=$('tqs').value;ev=$('tqe').value;draw();$('tqs').value=sv;$('tqe').value=ev;mcb.ok=ok;mcb.no=moX};
 const ok=()=>{const a=$('tqs').value,b=$('tqe').value,er=m=>{$('tqerr').textContent=m};if(!a||!b){er('Enter when it started and finished.');return}
  const s=plAt(day,a);let e=plAt(day,b);if(e<=s)e=plAt(nxd(day),b);if(e>n){er('That finishes after now. If you are still working, start your shift on the Today screen instead.');return}if(e-s>18*H){er('That is over 18 hours. Check the times.');return}
  const ov=all().filter(x=>x.t!=='r'&&x.e>s&&x.s<e);
  acctAsk({from:s,to:e,def:'w',quick:true,title:'Your Shift',lead:`${new Date(s).toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'})}, ${hm(s)} to ${hm(e)}.${ov.length?' This replaces what is already logged in that time.':''}`,ok:'Save this shift',back:draw,cancel:moX,
   done:E=>{const sv2=JSON.stringify(st);tkPut(E,s,e);save();moX();render();flash=`Shift saved: ${hm(s)} to ${hm(e)}. <button class="tg" data-ua="1" style="margin-left:6px">Undo</button>`;usnap=sv2;setTimeout(()=>{flash='';live()},12000);live()}})};
 draw();mcb={no:moX,ok};[0,1,2].forEach(k=>mcb['d'+k]=()=>{day=sod(td-k*864e5);keep()})}

/* The next break when no planned shift is giving advice: for the Today card */
function tkNextLine(){if(!st.active||st.act==='r')return '';const n=Date.now(),J=tkJudge([],n,n,true);return J.next}

document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(tkAway,400);else tkMark()});
setInterval(()=>{if(!document.hidden&&$('mo').hidden)tkMark()},30000);
setTimeout(tkAway,1500);
