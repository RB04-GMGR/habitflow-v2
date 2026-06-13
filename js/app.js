import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ── FIREBASE CONFIG ─────────────────────────────────────────────
// 🔴 REMPLACE CES VALEURS PAR CELLES DE TON PROJET FIREBASE sportkit-sn
const firebaseConfig = {
  apiKey: "VOTRE_API_KEY",
  authDomain: "VOTRE_AUTH_DOMAIN",
  projectId: "VOTRE_PROJECT_ID",
  storageBucket: "VOTRE_STORAGE_BUCKET",
  messagingSenderId: "VOTRE_SENDER_ID",
  appId: "VOTRE_APP_ID"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ── DEFAULT HABITS ──────────────────────────────────────────────
const DEFAULT_HABITS = [
  { id:'lever',        name:'Lever à 05h30',                       time:'05:30',          cat:'corps'  },
  { id:'priere-matin', name:'Prière + rituel matinal',              time:'05:30 – 06:15',  cat:'spirit' },
  { id:'entretien',    name:'Entretien corps (douche, soins)',       time:'06:15 – 07:00',  cat:'corps'  },
  { id:'menage-mat',   name:'Tâches ménagères matinales',           time:'07:00 – 07:45',  cat:'menage' },
  { id:'etudes1',      name:'Études — bloc 1',                      time:'08:00 – 10:00',  cat:'etudes' },
  { id:'etudes2',      name:'Études — bloc 2 (data / BDD)',         time:'10:15 – 12:00',  cat:'etudes' },
  { id:'sportkit',     name:'SportKit SN — développement',          time:'13:30 – 16:00',  cat:'dev'    },
  { id:'revisions',    name:'Révisions / projets scolaires',        time:'16:00 – 17:00',  cat:'etudes' },
  { id:'sport',        name:'Sport — MMA / Boxe',                   time:'17:00 – 20:00',  cat:'sport'  },
  { id:'rangement',    name:'Rangement chambre',                    time:'17:30 – 18:30',  cat:'menage' },
  { id:'priere-soir',  name:'Prière du soir + planification J+1',   time:'20:30 – 21:00',  cat:'spirit' },
  { id:'coucher',      name:'Coucher avant 21h30',                  time:'21:30',          cat:'perso'  },
];

const CAT_META = {
  spirit:{ label:'Spirituel', pill:'pill-spirit', color:'#a78bfa' },
  corps: { label:'Corps',     pill:'pill-corps',  color:'#34d399' },
  etudes:{ label:'Études',    pill:'pill-etudes', color:'#60a5fa' },
  dev:   { label:'Dev',       pill:'pill-dev',    color:'#fb7185' },
  sport: { label:'Sport',     pill:'pill-sport',  color:'#f87171' },
  menage:{ label:'Ménage',    pill:'pill-menage', color:'#fbbf24' },
  perso: { label:'Perso',     pill:'pill-perso',  color:'#6ee7b7' },
};

const MOTTOS = ['Discipline = liberté','Ceinture noire mindset','Un jour à la fois','Tu avances !','Régularité > intensité','Bien joué !','Continue comme ça 💪'];

// ── STATE ───────────────────────────────────────────────────────
let currentUser = null;
let habits = [];
let logs   = {};
let weeklyFocus = '';
let viewMonth = new Date().getMonth();
let viewYear  = new Date().getFullYear();
let editingHabitId = null;
let unsubLogs = null;
let unsubHabits = null;

const TODAY = new Date();

// ── HELPERS ─────────────────────────────────────────────────────
function dkey(y,m,d){ return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }
function todayKey(){ return dkey(TODAY.getFullYear(),TODAY.getMonth(),TODAY.getDate()); }
function getDayLog(y,m,d){ const k=dkey(y,m,d); return logs[k]||{}; }

function completionRate(y,m,d){
  const log=getDayLog(y,m,d);
  if(!habits.length || Object.keys(log).length===0) return null;
  return Math.round((habits.filter(h=>log[h.id]).length/habits.length)*100);
}

function calcStreak(){
  let s=0; const d=new Date(TODAY);
  while(s<365){ const r=completionRate(d.getFullYear(),d.getMonth(),d.getDate()); if(r===null||r<50)break; s++; d.setDate(d.getDate()-1); }
  return s;
}
function calcBestStreak(){
  const keys=Object.keys(logs).sort(); let best=0,cur=0;
  keys.forEach(k=>{ const [y,m,dd]=k.split('-').map(Number); const r=completionRate(y,m,dd); r!==null&&r>=50?(cur++,best=Math.max(best,cur)):cur=0; });
  return best;
}
function calcMonthAvg(y,m){
  const dim=new Date(y,m+1,0).getDate(); let tot=0,cnt=0;
  for(let d=1;d<=dim;d++){ if(new Date(y,m,d)>TODAY)break; const r=completionRate(y,m,d); if(r!==null){tot+=r;cnt++;} }
  return cnt>0?Math.round(tot/cnt):0;
}
function countPerfect(y,m){
  const dim=new Date(y,m+1,0).getDate(); let c=0;
  for(let d=1;d<=dim;d++){ if(completionRate(y,m,d)===100)c++; }
  return c;
}
function isPastTime(timeStr){
  const now=new Date();
  const end=timeStr.includes('–')?timeStr.split('–')[1].trim():timeStr.trim();
  const parts=end.split(/[h:]/);
  if(parts.length<2)return false;
  const cut=new Date(now.getFullYear(),now.getMonth(),now.getDate(),parseInt(parts[0]),parseInt(parts[1])||0);
  return now>cut;
}
function isLate(habit){
  // becomes red 4h after scheduled time
  const now=new Date();
  const start=habit.time.split('–')[0].trim().split(/[h:]/);
  if(start.length<2)return false;
  const scheduled=new Date(now.getFullYear(),now.getMonth(),now.getDate(),parseInt(start[0]),(parseInt(start[1])||0));
  const cutoff=new Date(scheduled.getTime()+4*60*60*1000);
  return now>cutoff;
}

// ── FIRESTORE REFS ──────────────────────────────────────────────
function userDoc(){ return doc(db,'users',currentUser.uid); }
function habitsDoc(){ return doc(db,'habits',currentUser.uid); }
function logsDoc(year,month){ return doc(db,'logs',`${currentUser.uid}_${year}_${month}`); }

// ── AUTH ────────────────────────────────────────────────────────
window.loginUser = async function(){
  const email=document.getElementById('login-email').value.trim();
  const pass=document.getElementById('login-pass').value;
  const err=document.getElementById('login-error');
  err.textContent='';
  try{
    await signInWithEmailAndPassword(auth,email,pass);
  }catch(e){
    err.textContent=e.code==='auth/invalid-credential'?'Email ou mot de passe incorrect':e.message;
  }
};

window.registerUser = async function(){
  const name=document.getElementById('reg-name').value.trim();
  const email=document.getElementById('reg-email').value.trim();
  const pass=document.getElementById('reg-pass').value;
  const err=document.getElementById('reg-error');
  err.textContent='';
  if(!name){err.textContent='Entre ton prénom';return;}
  try{
    const cred=await createUserWithEmailAndPassword(auth,email,pass);
    await updateProfile(cred.user,{displayName:name});
    await setDoc(userDoc()/* uses cred.user */,{name,email,createdAt:new Date().toISOString()});
  }catch(e){
    err.textContent=e.code==='auth/email-already-in-use'?'Cet email est déjà utilisé':e.message;
  }
};

window.logoutUser = async function(){
  if(unsubLogs)unsubLogs();
  if(unsubHabits)unsubHabits();
  await signOut(auth);
};

window.showRegister=()=>{ document.getElementById('auth-login').classList.remove('active'); document.getElementById('auth-register').classList.add('active'); };
window.showLogin=()=>{ document.getElementById('auth-register').classList.remove('active'); document.getElementById('auth-login').classList.add('active'); };

// ── AUTH STATE ──────────────────────────────────────────────────
onAuthStateChanged(auth, async user=>{
  if(user){
    currentUser=user;
    document.getElementById('auth-screen').style.display='none';
    document.getElementById('app').classList.remove('hidden');
    const av=user.displayName?user.displayName[0].toUpperCase():'?';
    document.getElementById('user-avatar').textContent=av;
    document.getElementById('settings-avatar').textContent=av;
    document.getElementById('settings-name').textContent=user.displayName||'';
    document.getElementById('settings-email').textContent=user.email||'';
    loadTheme();
    await loadHabitsFromDB();
    await loadLogsFromDB();
    renderAll();
  } else {
    currentUser=null;
    document.getElementById('auth-screen').style.display='flex';
    document.getElementById('app').classList.add('hidden');
  }
});

// ── LOAD DATA ───────────────────────────────────────────────────
async function loadHabitsFromDB(){
  const ref=habitsDoc();
  const snap=await getDoc(ref);
  if(snap.exists()){ habits=snap.data().list||DEFAULT_HABITS; }
  else { habits=JSON.parse(JSON.stringify(DEFAULT_HABITS)); await saveHabitsToDB(); }
  // weekly focus
  const ud=await getDoc(userDoc());
  if(ud.exists()){ weeklyFocus=ud.data().weeklyFocus||''; }
}

async function loadLogsFromDB(){
  const y=TODAY.getFullYear(), m=TODAY.getMonth();
  // load current month + previous month
  for(const [ly,lm] of [[y,m],[y,m-1<0?11:m-1]]){
    const ref=logsDoc(ly,lm<0?11:lm);
    const snap=await getDoc(ref);
    if(snap.exists()){ Object.assign(logs,snap.data().days||{}); }
  }
}

async function saveHabitsToDB(){
  if(!currentUser)return;
  await setDoc(habitsDoc(),{list:habits});
}

async function saveLogToDB(dateKey){
  if(!currentUser)return;
  const [y,m]=dateKey.split('-').map(Number);
  const ref=logsDoc(y,m);
  const existing={}; existing[`days.${dateKey}`]=logs[dateKey]||{};
  try{ await updateDoc(ref,existing); }
  catch(e){ await setDoc(ref,{days:{[dateKey]:logs[dateKey]||{}}}); }
}

// ── TOGGLE HABIT ────────────────────────────────────────────────
window.toggleHabit = async function(id){
  const k=todayKey();
  if(!logs[k])logs[k]={};
  logs[k][id]=!logs[k][id];
  await saveLogToDB(k);
  if(logs[k][id]) showToast(MOTTOS[Math.floor(Math.random()*MOTTOS.length)]);
  renderToday();
  renderWeekGrid();
  renderStats();
};

// ── WEEKLY FOCUS ────────────────────────────────────────────────
window.editWeeklyFocus = function(){
  openModal('Focus de la semaine','Quel est ton objectif principal cette semaine ?', async()=>{
    const val=document.getElementById('modal-input').value.trim();
    if(val){ weeklyFocus=val; await updateDoc(userDoc(),{weeklyFocus:val}); document.getElementById('weekly-focus-display').textContent=val; }
    closeModal();
  }, true, weeklyFocus);
};

// ── HABIT CRUD ──────────────────────────────────────────────────
window.submitHabit = async function(){
  const name=document.getElementById('f-name').value.trim();
  const time=document.getElementById('f-time').value.trim()||'Toute la journée';
  const cat=document.getElementById('f-cat').value;
  if(!name){showToast('Entre un nom');return;}
  if(editingHabitId){
    const idx=habits.findIndex(h=>h.id===editingHabitId);
    if(idx>=0) habits[idx]={...habits[idx],name,time,cat};
    showToast('Habitude modifiée ✓');
  } else {
    habits.push({id:'custom-'+Date.now(),name,time,cat});
    showToast('Habitude ajoutée ✓');
  }
  await saveHabitsToDB();
  cancelEdit();
  renderSettingsHabits();
  renderToday();
  renderWeekGrid();
};

window.editHabit = function(id){
  const h=habits.find(x=>x.id===id);
  if(!h)return;
  editingHabitId=id;
  document.getElementById('f-name').value=h.name;
  document.getElementById('f-time').value=h.time;
  document.getElementById('f-cat').value=h.cat;
  document.getElementById('form-submit-btn').textContent='Modifier';
  document.getElementById('form-cancel-btn').classList.remove('hidden');
  document.getElementById('habit-form').scrollIntoView({behavior:'smooth'});
};

window.cancelEdit = function(){
  editingHabitId=null;
  document.getElementById('f-name').value='';
  document.getElementById('f-time').value='';
  document.getElementById('form-submit-btn').textContent='Ajouter';
  document.getElementById('form-cancel-btn').classList.add('hidden');
};

window.deleteHabit = function(id){
  const h=habits.find(x=>x.id===id);
  openModal('Supprimer', `Supprimer "${h?.name}" ?`, async()=>{
    habits=habits.filter(x=>x.id!==id);
    await saveHabitsToDB();
    renderSettingsHabits();
    renderToday();
    closeModal();
    showToast('Supprimée');
  });
};

// ── THEME ───────────────────────────────────────────────────────
window.setTheme = function(name,btn){
  document.documentElement.setAttribute('data-theme',name);
  localStorage.setItem('hf2_theme',name);
  document.querySelectorAll('.theme-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  showToast('Thème appliqué 🎨');
};
function loadTheme(){
  const t=localStorage.getItem('hf2_theme')||'rose';
  document.documentElement.setAttribute('data-theme',t);
  const btn=document.querySelector(`[data-theme="${t}"].theme-btn`);
  if(btn){ document.querySelectorAll('.theme-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); }
}

// ── RENDER ALL ──────────────────────────────────────────────────
function renderAll(){
  renderWeekHeader();
  renderWeekGrid();
  renderCalendar();
  renderStats();
  renderProgBars();
  renderToday();
  renderSettingsHabits();
  document.getElementById('weekly-focus-display').textContent=weeklyFocus||'Clique pour définir...';
}

// ── WEEK HEADER ─────────────────────────────────────────────────
function renderWeekHeader(){
  const monday=getMonday(TODAY);
  const sunday=new Date(monday); sunday.setDate(monday.getDate()+6);
  const fmt={day:'numeric',month:'short'};
  document.getElementById('week-range').textContent=
    `${monday.toLocaleDateString('fr-FR',fmt)} – ${sunday.toLocaleDateString('fr-FR',fmt)}`;
}
function getMonday(d){ const day=d.getDay(); const diff=d.getDate()-(day===0?6:day-1); return new Date(d.getFullYear(),d.getMonth(),diff); }

// ── WEEK GRID ────────────────────────────────────────────────────
function renderWeekGrid(){
  const monday=getMonday(TODAY);
  const grid=document.getElementById('week-grid');
  grid.innerHTML='';
  const days=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
  for(let i=0;i<7;i++){
    const dt=new Date(monday); dt.setDate(monday.getDate()+i);
    const isToday=dt.toDateString()===TODAY.toDateString();
    const isFuture=dt>TODAY;
    const log=getDayLog(dt.getFullYear(),dt.getMonth(),dt.getDate());
    const done=habits.filter(h=>log[h.id]).length;
    const pct=habits.length>0?Math.round((done/habits.length)*100):0;
    const circ=113; const offset=circ-(circ*pct/100);

    // ring color
    const ringColor=pct>=100?'#34d399':pct>=75?'#84cc16':pct>=50?'#fbbf24':'#f87171';

    const card=document.createElement('div');
    card.className='week-day-card'+(isToday?' is-today':'');
    card.innerHTML=`
      <div class="wdc-name">${days[i]}</div>
      <div class="wdc-date">${dt.getDate()}</div>
      <div class="wdc-ring">
        <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
          <circle cx="24" cy="24" r="18" class="wdc-ring-bg"/>
          <circle cx="24" cy="24" r="18" class="wdc-ring-fg"
            style="stroke:${isFuture?'var(--bg3)':ringColor};stroke-dashoffset:${isFuture?circ:offset}"/>
        </svg>
        <div class="wdc-pct">${isFuture?'–':pct+'%'}</div>
      </div>
      <div class="wdc-habits">
        ${habits.slice(0,4).map(h=>{
          const isDone=!!log[h.id];
          const isMissed=!isDone&&!isFuture&&isPastTime(h.time);
          return `<div class="wdc-habit-dot">
            <div class="${isDone?'dot-done':isMissed?'dot-miss':'dot-todo'}"></div>
            <span>${h.name.slice(0,12)}</span>
          </div>`;
        }).join('')}
      </div>
    `;
    grid.appendChild(card);
  }
}

// ── TODAY VIEW ───────────────────────────────────────────────────
function renderToday(){
  const log=getDayLog(TODAY.getFullYear(),TODAY.getMonth(),TODAY.getDate());
  const done=habits.filter(h=>log[h.id]).length;
  const pct=habits.length>0?Math.round((done/habits.length)*100):0;
  const circ=201.06; const offset=circ-(circ*pct/100);
  const ringColor=pct>=100?'#34d399':pct>=75?'#84cc16':pct>=50?'#fbbf24':pct>0?'#f87171':'var(--acc1)';
  document.getElementById('ring-fg').style.stroke=ringColor;
  document.getElementById('ring-fg').style.strokeDashoffset=offset;
  document.getElementById('ring-pct').textContent=pct+'%';

  const dayStr=TODAY.toLocaleDateString('fr-FR',{weekday:'long'});
  const dtStr=TODAY.toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});
  document.getElementById('today-dayname').textContent=dayStr.charAt(0).toUpperCase()+dayStr.slice(1);
  document.getElementById('today-datestr').textContent=dtStr;

  const streak=calcStreak();
  const banner=document.getElementById('streak-banner');
  if(streak>=3){ banner.className='streak-banner show'; banner.innerHTML=`⚡ ${streak} jours de streak — tu es en feu !`; }
  else banner.className='streak-banner';

  const cats=[...new Set(habits.map(h=>h.cat))];
  const container=document.getElementById('today-habits');
  container.innerHTML='';
  cats.forEach(cat=>{
    const catHabits=habits.filter(h=>h.cat===cat);
    const group=document.createElement('div');
    group.className='cat-group';
    const lbl=document.createElement('div');
    lbl.className='cat-group-lbl';
    lbl.textContent=CAT_META[cat]?.label||cat;
    group.appendChild(lbl);
    catHabits.forEach(h=>{
      const isDone=!!log[h.id];
      const isMissed=!isDone&&(isLate(h)||isPastTime(h.time));
      const item=document.createElement('div');
      item.className='habit-item'+(isDone?' done':isMissed?' missed':'');
      item.setAttribute('role','checkbox');
      item.setAttribute('aria-checked',isDone);
      item.setAttribute('tabindex','0');
      item.onclick=()=>toggleHabit(h.id);
      item.onkeydown=e=>{ if(e.key==='Enter'||e.key===' ')toggleHabit(h.id); };
      const check=isDone
        ?`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
        :isMissed
        ?`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
        :'';
      const pill=CAT_META[cat]?.pill||'pill-perso';
      const catLbl=CAT_META[cat]?.label||cat;
      item.innerHTML=`
        <div class="habit-check">${check}</div>
        <div class="habit-info">
          <div class="habit-name">${h.name}</div>
          <div class="habit-time">${h.time}</div>
        </div>
        <span class="habit-pill ${pill}">${catLbl}</span>
      `;
      group.appendChild(item);
    });
    container.appendChild(group);
  });
}

// ── CALENDAR ─────────────────────────────────────────────────────
function renderCalendar(){
  const lbl=new Date(viewYear,viewMonth,1).toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  document.getElementById('cal-month').textContent=lbl.charAt(0).toUpperCase()+lbl.slice(1);
  const heads=document.getElementById('cal-heads');
  heads.innerHTML=['L','M','M','J','V','S','D'].map(d=>`<div class="cal-head">${d}</div>`).join('');
  const grid=document.getElementById('cal-grid');
  grid.innerHTML='';
  let first=new Date(viewYear,viewMonth,1).getDay();
  first=first===0?6:first-1;
  for(let i=0;i<first;i++){ const e=document.createElement('div'); e.className='cal-day empty'; grid.appendChild(e); }
  const dim=new Date(viewYear,viewMonth+1,0).getDate();
  for(let d=1;d<=dim;d++){
    const dt=new Date(viewYear,viewMonth,d);
    const isToday=dt.toDateString()===TODAY.toDateString();
    const isFuture=dt>TODAY;
    const el=document.createElement('div');
    el.textContent=d;
    if(isFuture){ el.className='cal-day future'; }
    else {
      const r=completionRate(viewYear,viewMonth,d);
      let cls='cal-day';
      if(isToday)cls+=' today';
      if(r===100)cls+=' perfect';
      else if(r!==null&&r>=75)cls+=' good';
      else if(r!==null&&r>=50)cls+=' partial';
      else if(r!==null)cls+=' bad';
      el.className=cls;
    }
    grid.appendChild(el);
  }
}
window.changeMonth=function(dir){ viewMonth+=dir; if(viewMonth>11){viewMonth=0;viewYear++;} if(viewMonth<0){viewMonth=11;viewYear--;} renderCalendar(); };

// ── STATS ─────────────────────────────────────────────────────────
function renderStats(){
  document.getElementById('s-streak').textContent=calcStreak();
  document.getElementById('s-best').textContent=calcBestStreak();
  document.getElementById('s-month').textContent=calcMonthAvg(TODAY.getFullYear(),TODAY.getMonth())+'%';
  document.getElementById('s-perfect').textContent=countPerfect(TODAY.getFullYear(),TODAY.getMonth());
}

// ── PROGRESS BARS ─────────────────────────────────────────────────
function renderProgBars(){
  const cats=[...new Set(habits.map(h=>h.cat))];
  const y=TODAY.getFullYear(), m=TODAY.getMonth();
  const dim=new Date(y,m+1,0).getDate();
  const container=document.getElementById('prog-bars');
  container.innerHTML='';
  cats.forEach(cat=>{
    const ch=habits.filter(h=>h.cat===cat);
    let tot=0,cnt=0;
    for(let d=1;d<=dim;d++){
      if(new Date(y,m,d)>TODAY)break;
      const log=getDayLog(y,m,d);
      tot+=Math.round((ch.filter(h=>log[h.id]).length/ch.length)*100);
      cnt++;
    }
    const avg=cnt>0?Math.round(tot/cnt):0;
    const color=CAT_META[cat]?.color||'#888';
    const label=CAT_META[cat]?.label||cat;
    const row=document.createElement('div');
    row.className='prog-row';
    row.innerHTML=`
      <div class="prog-hdr"><span class="prog-name">${label}</span><span class="prog-val">${avg}%</span></div>
      <div class="prog-track"><div class="prog-fill" style="width:${avg}%;background:${color};"></div></div>
    `;
    container.appendChild(row);
  });
}

// ── SETTINGS HABITS ───────────────────────────────────────────────
function renderSettingsHabits(){
  const list=document.getElementById('settings-habits');
  list.innerHTML='';
  habits.forEach((h,idx)=>{
    const item=document.createElement('div');
    item.className='settings-habit-item';
    const pill=CAT_META[h.cat]?.pill||'pill-perso';
    const catLbl=CAT_META[h.cat]?.label||h.cat;
    item.innerHTML=`
      <div class="shi-info">
        <div class="shi-name">${h.name}</div>
        <div class="shi-time">${h.time}</div>
      </div>
      <span class="habit-pill ${pill}">${catLbl}</span>
      <div class="shi-actions">
        <button class="ha-btn edit" onclick="editHabit('${h.id}')" title="Modifier">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="ha-btn del" onclick="deleteHabit('${h.id}')" title="Supprimer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div>
    `;
    list.appendChild(item);
  });
}

// ── VIEW SWITCHING ────────────────────────────────────────────────
window.switchView = function(name){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('view-'+name).classList.add('active');
  document.querySelector(`[data-view="${name}"]`).classList.add('active');
  window.scrollTo(0,0);
  if(name==='dashboard'){renderWeekGrid();renderCalendar();renderStats();renderProgBars();}
  if(name==='today')renderToday();
  if(name==='settings')renderSettingsHabits();
};

// ── RESET TODAY ───────────────────────────────────────────────────
window.confirmResetToday = function(){
  openModal('Réinitialiser','Effacer toutes les cases d\'aujourd\'hui ?',async()=>{
    logs[todayKey()]={};
    await saveLogToDB(todayKey());
    renderToday();renderWeekGrid();renderStats();closeModal();
  });
};

// ── EXPORT ────────────────────────────────────────────────────────
window.exportData = function(){
  const data={habits,logs,exportedAt:new Date().toISOString()};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=`habitflow-${new Date().toISOString().slice(0,10)}.json`;
  a.click(); URL.revokeObjectURL(url);
  showToast('Données exportées');
};

window.confirmClearAll = function(){
  openModal('Effacer tout','Cette action est irréversible. Toutes tes données seront perdues.',async()=>{
    logs={};
    habits=JSON.parse(JSON.stringify(DEFAULT_HABITS));
    await saveHabitsToDB();
    renderAll();closeModal();showToast('Données effacées');
  });
};

// ── MODAL ─────────────────────────────────────────────────────────
function openModal(title,msg,onOk,withInput=false,inputVal=''){
  document.getElementById('modal-title').textContent=title;
  document.getElementById('modal-body').textContent=msg;
  const iw=document.getElementById('modal-input-wrap');
  if(withInput){ iw.style.display='block'; document.getElementById('modal-input').value=inputVal; }
  else iw.style.display='none';
  document.getElementById('modal-bg').classList.add('open');
  document.getElementById('modal-ok').onclick=onOk;
}
window.closeModal=function(){ document.getElementById('modal-bg').classList.remove('open'); };

// ── TOAST ─────────────────────────────────────────────────────────
let toastTimer=null;
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),2200);
}
window.showToast=showToast;

// ── AUTO REFRESH MISSED ───────────────────────────────────────────
setInterval(()=>{
  const log=getDayLog(TODAY.getFullYear(),TODAY.getMonth(),TODAY.getDate());
  if(habits.some(h=>!log[h.id]&&(isLate(h)||isPastTime(h.time)))) renderToday();
},60000);
