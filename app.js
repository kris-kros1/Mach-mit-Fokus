// Focus Clash Solid - GitHub Pages + WebRTC/PeerJS
// Robust, low-style visual brain games for tablets.

const $ = (id) => document.getElementById(id);
const screen = $('screen');
const statusEl = $('status');

const state = {
  mode: null,
  peer: null,
  hostId: null,
  conns: [],
  conn: null,
  players: {},
  myId: null,
  myName: '',
  roomCode: '',
  round: null,
  roundIndex: 0,
  scores: {},
  answered: false,
  timer: null,
  timeLeft: 0,
  startedAt: 0,
};

const SYMBOLS = ['●','■','▲','◆','★','✚','☀','☂','☘','⬟','⬢','⬤'];
const COLORS = ['#ef4444','#22c55e','#3b82f6','#f59e0b','#a855f7','#06b6d4'];
const GAMES = ['oddOne', 'memoryGrid', 'goNoGo', 'peripheral', 'shapeMatch'];

function setStatus(t){ statusEl.textContent = t; }
function uid(){ return Math.random().toString(36).slice(2,8).toUpperCase(); }
function peerIdFromCode(code){ return 'focus-solid-' + code.trim().toUpperCase(); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function esc(s){ return String(s||'').replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function shuffle(a){ return [...a].sort(()=>Math.random()-0.5); }

function home(){
  clearTimer();
  screen.innerHTML = `
    <section class="panel center">
      <div class="big">Visuelles Konzentrationsspiel</div>
      <p class="muted">Wenig lesen. Schnell sehen. Genau tippen.</p>
      <div class="row">
        <button onclick="hostSetup()">Spiel hosten</button>
        <button class="secondary" onclick="joinSetup()">Beitreten</button>
      </div>
      <div class="notice">Tipp: Alle Tablets öffnen dieselbe GitHub-Pages-Adresse.</div>
    </section>`;
}

function hostSetup(){
  state.mode='host'; state.roomCode=uid().slice(0,5); state.hostId=peerIdFromCode(state.roomCode);
  state.players = {}; state.scores = {}; state.conns = [];
  screen.innerHTML = `<section class="panel center"><div class="big">Starte Host…</div></section>`;
  state.peer = new Peer(state.hostId, {debug: 1});
  state.peer.on('open', () => {
    state.myId = state.peer.id;
    addPlayer('HOST','Host');
    setStatus('Host aktiv'); renderLobby();
  });
  state.peer.on('connection', conn => {
    conn.on('open', () => {
      state.conns.push(conn);
      conn.on('data', msg => onHostMessage(conn, msg));
      conn.on('close', () => { removeConn(conn); broadcastLobby(); renderLobby(); });
      conn.send({type:'helloHost', code: state.roomCode});
    });
  });
  state.peer.on('error', err => { setStatus('Fehler: ' + err.type); screen.innerHTML = `<section class="panel center"><div class="big">Host-Fehler</div><p>${esc(err.message||err.type)}</p><button onclick="home()">Zurück</button></section>`; });
}

function joinSetup(){
  state.mode='player';
  screen.innerHTML = `
    <section class="panel center">
      <div class="big">Beitreten</div>
      <input id="name" class="input" placeholder="Name" maxlength="12" />
      <input id="code" class="input" placeholder="CODE" maxlength="6" />
      <button onclick="joinGame()">Verbinden</button>
      <p class="muted">Code vom Host eingeben.</p>
    </section>`;
}

function joinGame(){
  const name = ($('name').value || 'Spieler').trim().slice(0,12);
  const code = ($('code').value || '').trim().toUpperCase();
  if(!code) return setStatus('Code fehlt');
  state.myName = name; state.roomCode = code; setStatus('Verbinde…');
  screen.innerHTML = `<section class="panel center"><div class="big">Verbinde…</div><p class="muted">Bitte kurz warten.</p></section>`;
  state.peer = new Peer(null, {debug: 1});
  state.peer.on('open', id => {
    state.myId = id;
    state.conn = state.peer.connect(peerIdFromCode(code), {reliable: true});
    state.conn.on('open', () => state.conn.send({type:'join', id: state.myId, name}));
    state.conn.on('data', onPlayerMessage);
    state.conn.on('close', () => { setStatus('Verbindung weg'); disconnected(); });
  });
  state.peer.on('error', err => { setStatus('Fehler: ' + err.type); screen.innerHTML = `<section class="panel center"><div class="big">Verbindung fehlgeschlagen</div><p class="muted">Code prüfen oder erneut laden.</p><button onclick="home()">Zurück</button></section>`; });
}

function addPlayer(id,name){ state.players[id]={id,name:name||'Spieler'}; if(!state.scores[id]) state.scores[id]=0; }
function removeConn(conn){ state.conns = state.conns.filter(c=>c!==conn); }
function broadcast(msg){ state.conns.forEach(c=>{ try{ if(c.open)c.send(msg); }catch(e){} }); }
function sendToHost(msg){ if(state.conn && state.conn.open) state.conn.send(msg); }
function broadcastLobby(){ broadcast({type:'lobby', players:state.players, scores:state.scores}); }

function onHostMessage(conn,msg){
  if(!msg || !msg.type) return;
  if(msg.type==='join'){
    addPlayer(msg.id, msg.name);
    conn.playerId = msg.id;
    conn.send({type:'joined', id:msg.id, players:state.players, scores:state.scores});
    broadcastLobby(); renderLobby();
  }
  if(msg.type==='answer' && state.round){
    handleAnswer(msg.id, msg.correct, msg.ms);
  }
}
function onPlayerMessage(msg){
  if(!msg || !msg.type) return;
  if(msg.type==='joined' || msg.type==='lobby'){ state.players=msg.players||{}; state.scores=msg.scores||{}; renderPlayerLobby(); setStatus('Verbunden'); }
  if(msg.type==='round'){ state.round=msg.round; state.roundIndex=msg.roundIndex; state.scores=msg.scores||state.scores; renderPlayerRound(msg.round); }
  if(msg.type==='scores'){ state.scores=msg.scores||{}; renderScores(false); }
  if(msg.type==='end'){ state.scores=msg.scores||{}; renderFinal(false); }
}

function renderLobby(){
  const list = Object.values(state.players).map(p=>`<div class="player">${esc(p.name)}</div>`).join('');
  screen.innerHTML = `
    <section class="panel center">
      <div class="muted">Spielcode</div><div class="code">${state.roomCode}</div>
      <p class="muted">Andere Tablets: Beitreten → Code eingeben</p>
      <div class="players">${list}</div>
      <div class="row"><button onclick="startGame()" ${Object.keys(state.players).length<2?'disabled':''}>Start</button><button class="secondary" onclick="home()">Ende</button></div>
    </section>`;
}
function renderPlayerLobby(){
  const list = Object.values(state.players).map(p=>`<div class="player">${esc(p.name)}</div>`).join('');
  screen.innerHTML = `<section class="panel center"><div class="big">Bereit</div><p class="muted">Warte auf Start</p><div class="players">${list}</div></section>`;
}

async function startGame(){
  state.roundIndex=0; Object.keys(state.scores).forEach(id=>state.scores[id]=0);
  await nextRound();
}
async function nextRound(){
  clearTimer();
  if(state.roundIndex>=10){ broadcast({type:'end', scores:state.scores}); renderFinal(true); return; }
  const type = GAMES[state.roundIndex % GAMES.length];
  state.round = makeRound(type, state.roundIndex);
  state.startedAt = Date.now();
  broadcast({type:'round', round:state.round, roundIndex:state.roundIndex+1, scores:state.scores});
  renderHostRound(state.round);
  startRoundTimer(8, () => { renderScores(true); broadcast({type:'scores', scores:state.scores}); setTimeout(()=>{ state.roundIndex++; nextRound(); }, 2200); });
}
function startRoundTimer(sec, done){ state.timeLeft=sec; clearTimer(); state.timer=setInterval(()=>{ state.timeLeft--; updateTimer(); if(state.timeLeft<=0){ clearTimer(); done&&done(); } },1000); updateTimer(); }
function clearTimer(){ if(state.timer) clearInterval(state.timer); state.timer=null; }
function updateTimer(){ const el=$('timer'); if(el) el.textContent=state.timeLeft+'s'; }

function makeRound(type, idx){
  if(type==='oddOne'){
    const base = SYMBOLS[idx%SYMBOLS.length], odd = SYMBOLS[(idx+3)%SYMBOLS.length];
    const count = idx<5?16:25, answer = Math.floor(Math.random()*count);
    return {type, title:'Anders', count, base, odd, answer};
  }
  if(type==='memoryGrid'){
    const count=9, picks=shuffle([...Array(count).keys()]).slice(0, idx<5?3:4);
    return {type, title:'Merken', count, picks, showMs:1800};
  }
  if(type==='goNoGo'){
    const target = {sym:'●', color:'#22c55e'};
    const isGo = Math.random()>.35;
    const shown = isGo ? target : {sym: SYMBOLS[(idx+2)%SYMBOLS.length], color: COLORS[(idx+1)%COLORS.length]};
    return {type, title:'Nur Ziel', target, shown, isGo};
  }
  if(type==='peripheral'){
    const positions=['tl','tr','bl','br'];
    const pos=positions[Math.floor(Math.random()*positions.length)];
    const sym=SYMBOLS[idx%SYMBOLS.length];
    return {type, title:'Außen', pos, sym};
  }
  // shapeMatch
  const target = {sym:SYMBOLS[idx%SYMBOLS.length], color:COLORS[idx%COLORS.length]};
  const choices = shuffle([target, {sym:target.sym,color:COLORS[(idx+1)%COLORS.length]}, {sym:SYMBOLS[(idx+1)%SYMBOLS.length],color:target.color}, {sym:SYMBOLS[(idx+2)%SYMBOLS.length],color:COLORS[(idx+2)%COLORS.length]}]);
  return {type:'shapeMatch', title:'Gleich', target, choices, answer: choices.findIndex(c=>c.sym===target.sym && c.color===target.color)};
}

function top(round){ return `<div class="topbar"><div class="pill">${state.roundIndex||''}/10</div><div class="pill">${esc(round.title)}</div><div id="timer" class="pill">8s</div></div>`; }
function renderHostRound(round){ screen.innerHTML = `<section class="panel">${top(round)}<div class="gamearea"><div class="big muted">Spiel läuft…</div></div></section>`; updateTimer(); }
function renderPlayerRound(round){ state.answered=false; screen.innerHTML = `<section class="panel">${top(round)}<div class="gamearea">${roundHTML(round)}</div></section>`; updateTimer(); if(round.type==='memoryGrid') setupMemory(round); }
function roundHTML(r){
  if(r.type==='oddOne'){
    const size = Math.sqrt(r.count); let html=`<div class="grid" style="grid-template-columns:repeat(${size},1fr)">`;
    for(let i=0;i<r.count;i++) html += `<div class="cell tap" onclick="answer(${i===r.answer}, this)">${i===r.answer?r.odd:r.base}</div>`;
    return html+'</div>';
  }
  if(r.type==='memoryGrid'){
    let html=`<div class="grid" id="memgrid" style="grid-template-columns:repeat(3,1fr)">`;
    for(let i=0;i<9;i++) html += `<div class="cell" data-i="${i}"></div>`;
    return html+'</div>';
  }
  if(r.type==='goNoGo'){
    return `<div class="targetCard"><div class="muted">Tippe nur bei</div><div class="target"><span style="color:${r.target.color}">${r.target.sym}</span></div><div class="target flash" onclick="answer(${r.isGo}, this)"><span style="color:${r.shown.color}">${r.shown.sym}</span></div><button class="secondary" onclick="answer(${!r.isGo}, this)">Nicht tippen</button></div>`;
  }
  if(r.type==='peripheral'){
    const map={tl:'left:12%;top:12%',tr:'right:12%;top:12%',bl:'left:12%;bottom:12%',br:'right:12%;bottom:12%'};
    return `<div class="fixation"></div><div class="peripheral" style="${map[r.pos]}" onclick="answer(true,this)">${r.sym}</div>`;
  }
  if(r.type==='shapeMatch'){
    let html=`<div class="targetCard"><div class="target"><span style="color:${r.target.color}">${r.target.sym}</span></div><div class="choices">`;
    r.choices.forEach((c,i)=> html+=`<div class="choice" onclick="answer(${i===r.answer}, this)"><span style="color:${c.color}">${c.sym}</span></div>`);
    return html+'</div></div>';
  }
}
async function setupMemory(r){
  const cells=[...document.querySelectorAll('#memgrid .cell')];
  r.picks.forEach(i=>cells[i].classList.add('correct'));
  await sleep(r.showMs);
  cells.forEach(c=>{ c.classList.remove('correct'); c.classList.add('tap'); c.onclick=()=>memoryTap(c, r); });
  state.memoryPicked=[];
}
function memoryTap(cell,r){
  if(state.answered) return;
  const i=Number(cell.dataset.i); if(state.memoryPicked.includes(i)) return;
  state.memoryPicked.push(i); cell.classList.add('correct');
  if(state.memoryPicked.length===r.picks.length){
    const ok = r.picks.every(x=>state.memoryPicked.includes(x)); answer(ok, cell);
  }
}
function answer(correct, el){
  if(state.answered) return; state.answered=true;
  const ms = Math.max(0, Date.now() - (state.startedAt || Date.now()));
  if(el) el.classList.add(correct?'correct':'wrong');
  sendToHost({type:'answer', id:state.myId, correct, ms});
  setStatus(correct?'Richtig':'Falsch');
}
function handleAnswer(id, correct, ms){
  if(!state.round || !state.players[id]) return;
  if(correct){ const bonus = Math.max(0, 800 - Math.floor(ms/10)); state.scores[id]=(state.scores[id]||0)+100+bonus; }
  else { state.scores[id]=Math.max(0,(state.scores[id]||0)-50); }
}
function renderScores(isHost){
  const rows=Object.entries(state.scores).sort((a,b)=>b[1]-a[1]).map(([id,sc],i)=>`<div class="score"><span>${i+1}. ${esc(state.players[id]?.name||id)}</span><b>${sc}</b></div>`).join('');
  screen.innerHTML=`<section class="panel center"><div class="big">Punkte</div><div class="scorelist">${rows}</div></section>`;
}
function renderFinal(isHost){
  clearTimer();
  const rows=Object.entries(state.scores).sort((a,b)=>b[1]-a[1]).map(([id,sc],i)=>`<div class="score"><span>${i+1}. ${esc(state.players[id]?.name||id)}</span><b>${sc}</b></div>`).join('');
  screen.innerHTML=`<section class="panel center"><div class="big">Fertig</div><div class="scorelist">${rows}</div><div class="row"><button onclick="home()">Neu</button></div></section>`;
}
function disconnected(){ screen.innerHTML=`<section class="panel center"><div class="big">Getrennt</div><p class="muted">Seite neu laden oder erneut beitreten.</p><button onclick="home()">Zurück</button></section>`; }

window.hostSetup=hostSetup; window.joinSetup=joinSetup; window.joinGame=joinGame; window.startGame=startGame; window.answer=answer; window.home=home;
home();
