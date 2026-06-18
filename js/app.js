import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// 🔴 REMPLACE PAR TA CONFIG FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyClmXYGE3KKjizshLekRw4F8ej3n4de-ks",
  authDomain: "habitflow-v2-91bf8.firebaseapp.com",
  projectId: "habitflow-v2-91bf8",
  storageBucket: "habitflow-v2-91bf8.firebasestorage.app",
  messagingSenderId: "763190948843",
  appId: "1:763190948843:web:90c2cfb169165ba78b9fae"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── CAT META ────────────────────────────────────────────────────
const CAT = {
  spirit:{ label:'Spirituel', color:'#a78bfa' },
  corps: { label:'Corps',     color:'#34d399' },
  etudes:{ label:'Études',    color:'#60a5fa' },
  dev:   { label:'Dev',       color:'#fb7185' },
  sport: { label:'Sport',     color:'#f87171' },
  menage:{ label:'Ménage',    color:'#fbbf24' },
  perso: { label:'Perso',     color:'#6ee7b7' },
};
function getCat(c){ return CAT[c] || { label: c ? c.charAt(0).toUpperCase()+c.slice(1) : '—', color:'#94a3b8' }; }

const THEMES = [
  { id:'rose',        label:'Rose',         sw:'linear-gradient(135deg,#ec4899,#a855f7)' },
  { id:'girl',        label:'I\'m just a girl 🎀', sw:'linear-gradient(135deg,#ff4d8d,#ffb3d1)' },
  { id:'light-blue',  label:'Bleu clair',   sw:'linear-gradient(135deg,#3b82f6,#6366f1)' },
  { id:'light-purple',label:'Violet clair', sw:'linear-gradient(135deg,#8b5cf6,#a855f7)' },
  { id:'light-green', label:'Vert clair',   sw:'linear-gradient(135deg,#10b981,#34d399)' },
  { id:'light-mint',  label:'Menthe',       sw:'linear-gradient(135deg,#06b6d4,#22d3ee)' },
  { id:'light-peach', label:'Pêche',        sw:'linear-gradient(135deg,#f97316,#fb923c)' },
  { id:'dark',        label:'Dark Blue',    sw:'linear-gradient(135deg,#6366f1,#0ea5e9)' },
  { id:'dark-purple', label:'Dark Violet',  sw:'linear-gradient(135deg,#a855f7,#f472b6)' },
  { id:'dark-ocean',  label:'Dark Océan',   sw:'linear-gradient(135deg,#06b6d4,#3b82f6)' },
];

const MOTTOS = ['Discipline = liberté 🔥','Ceinture noire mindset 🥋','Un jour à la fois ✨','Tu avances 💪','Régularité > intensité','Bien joué ! ✅','Good job Roxy 🎀'];

// ── STATE ────────────────────────────────────────────────────────
let user = null;
let habits = [];
let logs = {};
let tasks = {};
let weeklyFocus = '';
let viewMonth = new Date().getMonth();
let viewYear  = new Date().getFullYear();
let editId = null;
let dragSrcIdx = null;

const TODAY = new Date();

// ── DATE HELPERS ─────────────────────────────────────────────────
function dk(y,m,d){ return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function todayDk(){ return dk(TODAY.getFullYear(),TODAY.getMonth(),TODAY.getDate()); }
function getLog(y,m,d){ return logs[dk(y,m,d)] || {}; }
function getMonday(dt){
  const d = new Date(dt);
  const day = d.getDay();
  d.setDate(d.getDate() - (day===0?6:day-1));
  d.setHours(0,0,0,0);
  return d;
}
function weekDates(){
  const mon = getMonday(TODAY);
  return Array.from({length:7}, (_,i) => { const d = new Date(mon); d.setDate(mon.getDate()+i); return d; });
}
function isPastTime(t){
  const now = new Date();
  const s = t.includes('–') ? t.split('–')[1].trim() : t.trim();
  const p = s.split(/[h:]/);
  if(p.length < 2) return false;
  return now > new Date(now.getFullYear(),now.getMonth(),now.getDate(),+p[0],+p[1]||0);
}
function isLate(h){
  const now = new Date();
  const s = h.time.split('–')[0].trim().split(/[h:]/);
  if(s.length < 2) return false;
  const sched = new Date(now.getFullYear(),now.getMonth(),now.getDate(),+s[0],+s[1]||0);
  return now > new Date(sched.getTime() + 4*3600000);
}

// ── COMPLETION ───────────────────────────────────────────────────
function rate(y,m,d){
  const log = getLog(y,m,d);
  if(!habits.length || !Object.keys(log).length) return null;
  return Math.round(habits.filter(h=>log[h.id]).length / habits.length * 100);
}
function streak(){
  let s=0, d=new Date(TODAY);
  while(s<365){ const r=rate(d.getFullYear(),d.getMonth(),d.getDate()); if(r===null||r<50)break; s++; d.setDate(d.getDate()-1); }
  return s;
}
function bestStreak(){
  const keys=Object.keys(logs).sort(); let best=0,cur=0;
  keys.forEach(k=>{ const [y,m,dd]=k.split('-').map(Number); const r=rate(y,m,dd); r!==null&&r>=50?(cur++,best=Math.max(best,cur)):cur=0; });
  return best;
}
function monthAvg(y,m){
  const dim=new Date(y,m+1,0).getDate(); let tot=0,cnt=0;
  for(let d=1;d<=dim;d++){ if(new Date(y,m,d)>TODAY)break; const r=rate(y,m,d); if(r!==null){tot+=r;cnt++;} }
  return cnt?Math.round(tot/cnt):0;
}
function perfectDays(y,m){
  const dim=new Date(y,m+1,0).getDate(); let c=0;
  for(let d=1;d<=dim;d++) if(rate(y,m,d)===100)c++;
  return c;
}

// ── FIREBASE REFS ────────────────────────────────────────────────
function uDoc(){ return doc(db,'users',user.uid); }
function hDoc(){ return doc(db,'habits',user.uid); }
function lDoc(y,m){ return doc(db,'logs',`${user.uid}_${y}_${m}`); }
function tDoc(dateKey){ return doc(db,'tasks2',`${user.uid}_${dateKey}`); }

// ── AUTH ─────────────────────────────────────────────────────────
window.doLogin = async function(){
  const email = $('l-email').value.trim();
  const pass  = $('l-pass').value;
  const err   = $('l-err');
  err.textContent = '';
  try{ await signInWithEmailAndPassword(auth,email,pass); }
  catch(e){ err.textContent = e.code==='auth/invalid-credential'?'Email ou mot de passe incorrect':e.message; }
};
window.doRegister = async function(){
  const name  = $('r-name').value.trim();
  const email = $('r-email').value.trim();
  const pass  = $('r-pass').value;
  const err   = $('r-err');
  err.textContent = '';
  if(!name){ err.textContent='Entre ton prénom'; return; }
  try{
    const c = await createUserWithEmailAndPassword(auth,email,pass);
    await updateProfile(c.user,{displayName:name});
    await setDoc(doc(db,'users',c.user.uid),{name,email,createdAt:new Date().toISOString()});
  }catch(e){ err.textContent = e.code==='auth/email-already-in-use'?'Email déjà utilisé':e.message; }
};
window.doLogout = async ()=>{ await signOut(auth); };
window.showReg  = ()=>{ $('form-login').classList.remove('active'); $('form-reg').classList.add('active'); };
window.showLogin= ()=>{ $('form-reg').classList.remove('active'); $('form-login').classList.add('active'); };

onAuthStateChanged(auth, async u=>{
  if(u){
    user = u;
    $('auth-screen').style.display = 'none';
    $('app').classList.remove('hidden');
    const av = u.displayName ? u.displayName[0].toUpperCase() : '?';
    $('nav-avatar').textContent = av;
    $('acc-av').textContent     = av;
    $('acc-name').textContent   = u.displayName || '';
    $('acc-email').textContent  = u.email || '';
    loadTheme();
    buildThemeGrid();
    await loadAll();
    renderAll();
  } else {
    user = null;
    $('auth-screen').style.display = 'flex';
    $('app').classList.add('hidden');
  }
});

// ── LOAD ─────────────────────────────────────────────────────────
async function loadAll(){
  // Auto-reset lundi : si dernière session était une semaine précédente, on ne touche à rien
  // (les logs sont par date donc le reset est automatique — on s'assure juste que le localStorage
  // ne garde pas une semaine morte)
  const lastVisit = localStorage.getItem('hf_last_visit');
  const todayStr = todayDk();
  const monStr = dk(getMonday(TODAY).getFullYear(), getMonday(TODAY).getMonth(), getMonday(TODAY).getDate());
  if(lastVisit && lastVisit < monStr){
    // Nouvelle semaine : on peut notifier l'user
    setTimeout(()=>toast('🗓 Nouvelle semaine — nouvelle chance !'), 1500);
  }
  localStorage.setItem('hf_last_visit', todayStr);
  // habits
  const hs = await getDoc(hDoc());
  habits = hs.exists() ? (hs.data().list||[]) : [];
  // weekly focus
  const ud = await getDoc(uDoc());
  if(ud.exists()) weeklyFocus = ud.data().weeklyFocus||'';
  // logs (this month + last)
  const y=TODAY.getFullYear(), m=TODAY.getMonth();
  for(const [ly,lm] of [[y,m],[y,m-1<0?11:m-1]]){
    const s = await getDoc(lDoc(ly,lm<0?11:lm));
    if(s.exists()) Object.assign(logs, s.data().days||{});
  }
  // tasks (this week)
  for(const dt of weekDates()){
    const key = dk(dt.getFullYear(),dt.getMonth(),dt.getDate());
    try{
      const s = await getDoc(tDoc(key));
      tasks[key] = s.exists() ? (s.data().list||[]) : [];
    }catch{ tasks[key]=[]; }
  }
}

async function saveHabits(){ if(user) await setDoc(hDoc(),{list:habits}); }
async function saveLog(dateKey){
  if(!user) return;
  const [y,m] = dateKey.split('-').map(Number);
  const ref = lDoc(y,m);
  try{ await updateDoc(ref,{[`days.${dateKey}`]:logs[dateKey]||{}}); }
  catch{ await setDoc(ref,{days:{[dateKey]:logs[dateKey]||{}}}); }
}
async function saveTasks(dateKey){
  if(!user) return;
  await setDoc(tDoc(dateKey),{list:tasks[dateKey]||[]});
}

// ── TOGGLE HABIT ─────────────────────────────────────────────────
window.toggleHabit = async function(id){
  const k = todayDk();
  if(!logs[k]) logs[k]={};
  logs[k][id] = !logs[k][id];
  await saveLog(k);
  if(logs[k][id]) toast(MOTTOS[Math.floor(Math.random()*MOTTOS.length)]);
  renderToday(); renderMatrix(); renderDayCards(); renderStats();
};

window.toggleHabitDay = async function(id,y,m,d){
  const k = dk(y,m,d);
  if(!logs[k]) logs[k]={};
  logs[k][id] = !logs[k][id];
  await saveLog(k);
  if(logs[k][id]) toast(MOTTOS[Math.floor(Math.random()*MOTTOS.length)]);
  renderMatrix(); renderDayCards(); renderStats();
  if(k===todayDk()) renderToday();
};

// ── TASKS ────────────────────────────────────────────────────────
window.addTask = async function(dateKey){
  const inp = $('task-inp-'+dateKey);
  if(!inp) return;
  const name = inp.value.trim();
  if(!name) return;
  if(!tasks[dateKey]) tasks[dateKey]=[];
  tasks[dateKey].push({id:'t'+Date.now(),name,done:false});
  await saveTasks(dateKey);
  inp.value='';
  renderDayCards();
};
window.toggleTask = async function(dateKey,id){
  const t = (tasks[dateKey]||[]).find(x=>x.id===id);
  if(t){ t.done=!t.done; await saveTasks(dateKey); renderDayCards(); }
};
window.deleteTask = async function(dateKey,id){
  tasks[dateKey]=(tasks[dateKey]||[]).filter(x=>x.id!==id);
  await saveTasks(dateKey); renderDayCards();
};

// ── HABIT CRUD ───────────────────────────────────────────────────
window.submitHabit = async function(){
  const name = $('f-name').value.trim();
  const time = $('f-time').value.trim() || 'Toute la journée';
  let cat    = $('f-cat').value;
  if(cat==='custom'){ const cv=$('f-cat-custom').value.trim(); cat=cv||'perso'; }
  if(!cat) cat='perso';
  if(!name){ toast('Entre un nom'); return; }
  if(editId){
    const i = habits.findIndex(h=>h.id===editId);
    if(i>=0) habits[i]={...habits[i],name,time,cat};
    toast('Habitude modifiée ✓');
  } else {
    habits.push({id:'h'+Date.now(),name,time,cat});
    toast('Habitude ajoutée ✓');
  }
  await saveHabits();
  cancelEdit();
  renderSettingsHabits(); renderMatrix(); renderToday(); renderDayCards();
};

window.editHabit = function(id){
  const h = habits.find(x=>x.id===id);
  if(!h) return;
  editId=id;
  $('f-name').value=h.name;
  $('f-time').value=h.time;
  $('f-cat').value=CAT[h.cat]?h.cat:'custom';
  if(!CAT[h.cat]){ $('f-cat-custom').value=h.cat; $('f-cat-custom').classList.remove('hidden'); }
  $('f-submit').textContent='Modifier';
  $('f-cancel').classList.remove('hidden');
  $('form-section-label').textContent='Modifier l\'habitude';
  $('habit-form').scrollIntoView({behavior:'smooth'});
};

window.cancelEdit = function(){
  editId=null;
  $('f-name').value=''; $('f-time').value=''; $('f-cat').value='';
  $('f-cat-custom').classList.add('hidden'); $('f-cat-custom').value='';
  $('f-submit').textContent='Ajouter';
  $('f-cancel').classList.add('hidden');
  $('form-section-label').textContent='Ajouter une habitude';
};

window.deleteHabit = function(id){
  const h=habits.find(x=>x.id===id);
  openModal('Supprimer',`Supprimer "${h?.name}" ?`, async()=>{
    habits=habits.filter(x=>x.id!==id);
    await saveHabits();
    renderSettingsHabits(); renderMatrix(); renderToday(); closeModal();
    toast('Supprimée');
  });
};

window.onCatChange = function(){
  const v = $('f-cat').value;
  $('f-cat-custom').classList.toggle('hidden', v!=='custom');
};

// ── WEEKLY FOCUS ─────────────────────────────────────────────────
window.editFocus = function(){
  openModal('Focus de la semaine','Ton objectif principal cette semaine ?', async()=>{
    const val=$('modal-inp').value.trim();
    if(val){
      weeklyFocus=val;
      await updateDoc(uDoc(),{weeklyFocus:val});
      $('wf-text').textContent=val;
    }
    closeModal();
  }, true, weeklyFocus);
};

// ── THEME ────────────────────────────────────────────────────────
window.setTheme = function(id,btn){
  document.documentElement.setAttribute('data-theme',id);
  localStorage.setItem('hf3_theme',id);
  document.querySelectorAll('.tbtn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  toast('Thème appliqué 🎨');
};
function loadTheme(){
  const t=localStorage.getItem('hf3_theme')||'rose';
  document.documentElement.setAttribute('data-theme',t);
}
function buildThemeGrid(){
  const g=$('theme-grid'); g.innerHTML='';
  const cur=localStorage.getItem('hf3_theme')||'rose';
  THEMES.forEach(th=>{
    const b=document.createElement('button');
    b.className='tbtn'+(th.id===cur?' active':'');
    b.setAttribute('data-theme',th.id);
    b.onclick=()=>setTheme(th.id,b);
    b.innerHTML=`<span class="tsw" style="background:${th.sw}"></span>${th.label}`;
    g.appendChild(b);
  });
}

// ── DRAG & DROP (habits reorder) ─────────────────────────────────
function setupDrag(el,idx){
  el.draggable=true;
  el.addEventListener('dragstart',()=>{ dragSrcIdx=idx; el.style.opacity='.4'; });
  el.addEventListener('dragend',()=>{ el.style.opacity='1'; dragSrcIdx=null; document.querySelectorAll('.settings-habit-item').forEach(e=>e.classList.remove('drag-over')); });
  el.addEventListener('dragover',e=>{ e.preventDefault(); el.classList.add('drag-over'); });
  el.addEventListener('dragleave',()=>el.classList.remove('drag-over'));
  el.addEventListener('drop',async()=>{
    el.classList.remove('drag-over');
    if(dragSrcIdx===null||dragSrcIdx===idx) return;
    const moved=habits.splice(dragSrcIdx,1)[0];
    habits.splice(idx,0,moved);
    await saveHabits();
    renderSettingsHabits(); renderMatrix(); renderToday();
  });
}

// ── RENDER ───────────────────────────────────────────────────────
function renderAll(){
  renderTrackerTopbar();
  renderMatrix();
  renderDayCards();
  renderToday();
  renderStats();
  renderCalendar();
  renderProgBars();
  renderSettingsHabits();
  $('wf-text').textContent=weeklyFocus||'Définir le focus...';
}

function renderTrackerTopbar(){
  const mon=getMonday(TODAY);
  const sun=new Date(mon); sun.setDate(mon.getDate()+6);
  const f={day:'numeric',month:'short'};
  $('tracker-week-label').textContent=`${mon.toLocaleDateString('fr-FR',f)} – ${sun.toLocaleDateString('fr-FR',f)}`;
}

// MATRIX
function renderMatrix(){
  const days=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  const dates=weekDates();

  // Header
  const headRow=$('matrix-head-row');
  headRow.innerHTML='<th class="col-habit">Habitude</th>';
  dates.forEach((dt,i)=>{
    const isT=dt.toDateString()===TODAY.toDateString();
    const th=document.createElement('th');
    th.textContent=days[i];
    th.style.minWidth='38px';
    if(isT){
  th.style.background='rgba(0,0,0,0.18)';
  th.style.fontWeight='800';
}
    headRow.appendChild(th);
  });
  const progTh=document.createElement('th');
  progTh.className='col-prog'; progTh.textContent='Progress';
  headRow.appendChild(progTh);

  const tbody=$('matrix-body');
  tbody.innerHTML='';

  if(!habits.length){
    const tr=document.createElement('tr');
    tr.innerHTML=`<td colspan="9" style="text-align:center;padding:20px;font-size:13px;color:var(--text2);">Aucune habitude — ajoute-en dans Paramètres</td>`;
    tbody.appendChild(tr); return;
  }

  habits.forEach(h=>{
    const tr=document.createElement('tr');
    let doneCount=0;

    const cells=dates.map((dt)=>{
      const log=getLog(dt.getFullYear(),dt.getMonth(),dt.getDate());
      const isDone=!!log[h.id];
      const isT=dt.toDateString()===TODAY.toDateString();
      // Rouge si jour passé (pas aujourd'hui) et pas coché
      const isPast=dt<TODAY && !isT;
      const isFuture=dt>TODAY;

      if(isDone) doneCount++;

      let cls='mcb';
      if(isDone) cls+=' done';
      else if(isFuture) cls+=' future';
      else if(isPast) cls+=' missed';   // rouge automatique si jour passé non coché
      else if(isT) cls+=' today-col';

      const y=dt.getFullYear(),m=dt.getMonth(),d=dt.getDate();
      const click=!isFuture?`onclick="toggleHabitDay('${h.id}',${y},${m},${d})"`:'' ;
      const icon=isDone
        ?`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
        :isPast&&!isFuture
        ?`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
        :'';
      return `<td><div class="${cls}" ${click}>${icon}</div></td>`;
    }).join('');

    // Progress sur 7
    const pct=Math.round(doneCount/7*100);
    const p100=doneCount===7;
    const barColor=pct>=100?'var(--ok)':pct>=75?'#84cc16':pct>=50?'var(--warn)':doneCount>0?'var(--acc)':'var(--border2)';

    const progCell=`<td class="td-prog">
      <div class="prog-cell">
        <div class="prog-cell-track">
          <div class="prog-cell-fill" style="width:${pct}%;background:${barColor};"></div>
        </div>
        <span class="prog-cell-pct ${p100?'p100':''}">${p100?'🏆':doneCount>0?pct+'%':''}</span>
      </div>
    </td>`;

    tr.innerHTML=`<td class="td-name">${h.name}</td>${cells}${progCell}`;
    tbody.appendChild(tr);
  });
}

// DAY CARDS
function renderDayCards(){
  const dates=weekDates();
  const names=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
  const grid=$('day-cards'); grid.innerHTML='';

  dates.forEach((dt,i)=>{
    const isT=dt.toDateString()===TODAY.toDateString();
    const isFuture=dt>TODAY;
    const log=getLog(dt.getFullYear(),dt.getMonth(),dt.getDate());
    const done=habits.filter(h=>log[h.id]).length;
    const pct=habits.length?Math.round(done/habits.length*100):0;
    const circ=138; const offset=circ-(circ*pct/100);
    const col=pct>=100?'var(--ok)':pct>=75?'#84cc16':pct>=50?'var(--warn)':'var(--err)';
    const dateStr=dt.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});
    const key=dk(dt.getFullYear(),dt.getMonth(),dt.getDate());
    const dayTasks=tasks[key]||[];

    const card=document.createElement('div');
    card.className='day-card'+(isT?' today':'');

    const taskHTML=dayTasks.map(t=>`
      <div class="dc-task ${t.done?'done':''}">
        <div class="dc-tcb ${t.done?'done':''}" onclick="toggleTask('${key}','${t.id}')">
          ${t.done?'<svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>':''}
        </div>
        <span class="dc-tname">${t.name}</span>
        <button class="dc-tdel" onclick="deleteTask('${key}','${t.id}')">✕</button>
      </div>`).join('');

    card.innerHTML=`
      <div class="dc-head">
        <div class="dc-name">${names[i]}</div>
        <div class="dc-date">${dateStr}</div>
      </div>
      <div class="dc-ring">
        <svg viewBox="0 0 52 52" xmlns="http://www.w3.org/2000/svg">
          <circle cx="26" cy="26" r="22" class="dc-rbg"/>
          <circle cx="26" cy="26" r="22" class="dc-rfg" style="stroke:${isFuture?'var(--bg3)':col};stroke-dashoffset:${isFuture?circ:offset}"/>
        </svg>
        <div class="dc-rpct">${isFuture?'–':pct+'%'}</div>
      </div>
      <div class="dc-tasks">
        ${taskHTML||'<div style="font-size:10px;color:var(--text3);padding:3px 0;">Aucune tâche</div>'}
        <div class="dc-add">
          <input type="text" id="task-inp-${key}" placeholder="Ajouter..." onkeydown="if(event.key==='Enter')addTask('${key}')"/>
          <button onclick="addTask('${key}')">+</button>
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

// TODAY
function renderToday(){
  const log=getLog(TODAY.getFullYear(),TODAY.getMonth(),TODAY.getDate());
  const done=habits.filter(h=>log[h.id]).length;
  const pct=habits.length?Math.round(done/habits.length*100):0;
  const circ=175.9; const offset=circ-(circ*pct/100);
  const col=pct>=100?'var(--ok)':pct>=75?'#84cc16':pct>=50?'var(--warn)':pct>0?'var(--err)':'var(--acc)';
  $('ring-fg').style.stroke=col;
  $('ring-fg').style.strokeDashoffset=offset;
  $('ring-pct').textContent=pct+'%';

  const day=TODAY.toLocaleDateString('fr-FR',{weekday:'long'});
  $('today-day').textContent=day.charAt(0).toUpperCase()+day.slice(1);
  $('today-date').textContent=TODAY.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});

  const s=streak();
  const bar=$('streak-bar');
  if(s>=3){ bar.className='streak-bar show'; bar.innerHTML=`⚡ ${s} jours de streak — en feu !`; }
  else bar.className='streak-bar';

  const cats=[...new Set(habits.map(h=>h.cat))];
  const list=$('today-list'); list.innerHTML='';
  cats.forEach(cat=>{
    const ch=habits.filter(h=>h.cat===cat);
    ch.forEach(h=>{
      const isDone=!!log[h.id];
      const isMissed=!isDone&&(isLate(h)||isPastTime(h.time));
      const row=document.createElement('div');
      row.className='habit-row'+(isDone?' done':isMissed?' missed':'');
      row.setAttribute('role','checkbox'); row.setAttribute('aria-checked',isDone); row.setAttribute('tabindex','0');
      row.onclick=()=>toggleHabit(h.id);
      row.onkeydown=e=>{ if(e.key==='Enter'||e.key===' ')toggleHabit(h.id); };
      const icon=isDone
        ?'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
        :isMissed
        ?'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
        :'';
      row.innerHTML=`
        <div class="hrow-cb">${icon}</div>
        <div class="hrow-info">
          <div class="hrow-name">${h.name}</div>
          <div class="hrow-time">${h.time}</div>
        </div>
        <span class="hrow-pill">${getCat(cat).label}</span>`;
      list.appendChild(row);
    });
  });
}

// STATS
function renderStats(){
  $('st-streak').textContent=streak();
  $('st-best').textContent=bestStreak();
  $('st-month').textContent=monthAvg(TODAY.getFullYear(),TODAY.getMonth())+'%';
  $('st-perfect').textContent=perfectDays(TODAY.getFullYear(),TODAY.getMonth());
}

// CALENDAR
function renderCalendar(){
  const lbl=new Date(viewYear,viewMonth,1).toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  $('cal-title').textContent=lbl.charAt(0).toUpperCase()+lbl.slice(1);
  $('cal-heads').innerHTML=['L','M','M','J','V','S','D'].map(d=>`<div class="ch">${d}</div>`).join('');
  const grid=$('cal-grid'); grid.innerHTML='';
  let first=new Date(viewYear,viewMonth,1).getDay();
  first=first===0?6:first-1;
  for(let i=0;i<first;i++){ const e=document.createElement('div'); e.className='cd empty'; grid.appendChild(e); }
  const dim=new Date(viewYear,viewMonth+1,0).getDate();
  for(let d=1;d<=dim;d++){
    const dt=new Date(viewYear,viewMonth,d);
    const el=document.createElement('div'); el.textContent=d;
    const isT=dt.toDateString()===TODAY.toDateString();
    const isFut=dt>TODAY;
    if(isFut){ el.className='cd future'; }
    else{
      const r=rate(viewYear,viewMonth,d);
      let c='cd'; if(isT)c+=' today';
      if(r===100)c+=' perfect'; else if(r!==null&&r>=75)c+=' good'; else if(r!==null&&r>=50)c+=' partial'; else if(r!==null)c+=' bad';
      el.className=c;
    }
    grid.appendChild(el);
  }
}
window.changeMonth=function(dir){ viewMonth+=dir; if(viewMonth>11){viewMonth=0;viewYear++;} if(viewMonth<0){viewMonth=11;viewYear--;} renderCalendar(); };

// PROG BARS
function renderProgBars(){
  const cats=[...new Set(habits.map(h=>h.cat))];
  const y=TODAY.getFullYear(),m=TODAY.getMonth();
  const dim=new Date(y,m+1,0).getDate();
  const container=$('prog-bars'); container.innerHTML='';
  cats.forEach(cat=>{
    const ch=habits.filter(h=>h.cat===cat);
    let tot=0,cnt=0;
    for(let d=1;d<=dim;d++){
      if(new Date(y,m,d)>TODAY) break;
      const log=getLog(y,m,d);
      tot+=Math.round(ch.filter(h=>log[h.id]).length/ch.length*100); cnt++;
    }
    const avg=cnt?Math.round(tot/cnt):0;
    const {label,color}=getCat(cat);
    const row=document.createElement('div'); row.className='prog-row';
    row.innerHTML=`<div class="prog-top"><span>${label}</span><span>${avg}%</span></div><div class="prog-track"><div class="prog-fill" style="width:${avg}%;background:${color};"></div></div>`;
    container.appendChild(row);
  });
}

// SETTINGS HABITS
function renderSettingsHabits(){
  const list=$('habit-list-settings'); list.innerHTML='';
  habits.forEach((h,i)=>{
    const item=document.createElement('div'); item.className='settings-habit-item';
    item.innerHTML=`
      <div class="shi-drag">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="9" y1="6" x2="15" y2="6"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="18" x2="15" y2="18"/></svg>
      </div>
      <div class="shi-info">
        <div class="shi-name">${h.name}</div>
        <div class="shi-time">${h.time} · ${getCat(h.cat).label}</div>
      </div>
      <div class="shi-btns">
        <button class="shi-btn edit" onclick="editHabit('${h.id}')" title="Modifier">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="shi-btn del" onclick="deleteHabit('${h.id}')" title="Supprimer">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div>`;
    setupDrag(item,i);
    list.appendChild(item);
  });
}

// VIEW SWITCH
window.goView = function(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.ntab').forEach(t=>t.classList.remove('active'));
  $('view-'+name).classList.add('active');
  document.querySelector(`[data-view="${name}"]`).classList.add('active');
  window.scrollTo(0,0);
};

// RESET TODAY
window.confirmReset = function(){
  openModal('Réinitialiser','Effacer toutes les cases d\'aujourd\'hui ?', async()=>{
    logs[todayDk()]={};
    await saveLog(todayDk());
    renderToday(); renderMatrix(); renderDayCards(); renderStats(); closeModal();
  });
};

// EXPORT
window.exportData = function(){
  const blob=new Blob([JSON.stringify({habits,logs,tasks,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`habitflow-${new Date().toISOString().slice(0,10)}.json`; a.click();
  toast('Données exportées');
};

window.confirmClearAll = function(){
  openModal('Tout effacer','Action irréversible — toutes tes données seront perdues.', async()=>{
    logs={}; tasks={}; habits=[];
    await saveHabits(); renderAll(); closeModal(); toast('Données effacées');
  });
};

// MODAL
function openModal(title,msg,onOk,withInp=false,val=''){
  $('modal-title').textContent=title;
  $('modal-msg').textContent=msg;
  const inp=$('modal-inp');
  inp.style.display=withInp?'block':'none';
  if(withInp) inp.value=val;
  $('modal-bg').classList.remove('hidden');
  $('modal-ok').onclick=onOk;
}
window.closeModal=function(){ $('modal-bg').classList.add('hidden'); };
$('modal-bg').onclick=function(e){ if(e.target===$('modal-bg')) closeModal(); };

// TOAST
let toastT=null;
function toast(msg){
  const t=$('toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove('show'),2300);
}
window.toast=toast;

// HELPER
function $(id){ return document.getElementById(id); }

// AUTO-REFRESH MISSED
setInterval(()=>{
  const log=getLog(TODAY.getFullYear(),TODAY.getMonth(),TODAY.getDate());
  if(habits.some(h=>!log[h.id]&&(isLate(h)||isPastTime(h.time)))) renderToday();
},60000);