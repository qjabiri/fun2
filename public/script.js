const $ = (id) => document.getElementById(id);
const show = (el, on=true) => el.classList[on ? 'remove' : 'add']('hidden');

const auth = { section: $('auth'), email: $('email'), name: $('displayName'), sendLink: $('sendLink'), msg: $('authMsg') };
const dash = { section: $('dash'), logout: $('logout'), gameName: $('gameName'), create: $('createGame'), myGames: $('myGames'), code: $('joinCode'), goJoin: $('goJoin') };
const room = { section: $('room'), title: $('roomTitle'), leave: $('leaveRoom'), roster: $('roster'), start: $('startGame'), inviteBox: $('inviteBox'), inviteEmails: $('inviteEmails'), sendInvites: $('sendInvites'), asker: $('asker'), question: $('question'), submitQ: $('submitQuestion'), response: $('response'), submitR: $('submitResponse'), responses: $('responses'), forceNext: $('forceNext') };

let me, socket, currentCode, myRole;

async function api(path, opts={}) {
  const res = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!res.ok) throw new Error(await res.text());
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

async function refreshMe() {
  try {
    const { user, games } = await api('/me');
    me = user; renderDash(games);
  } catch {
    show(auth.section, true); show(dash.section, false); show(room.section, false);
  }
}

function renderDash(games=[]) {
  show(auth.section, false); show(dash.section, true); show(room.section, false);
  dash.myGames.innerHTML = '';
  for (const g of games) {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `<b>${g.name}</b> <code>${g.code}</code> <span class="tag">${g.role}</span>
      <button data-code="${g.code}" class="go">Open</button>`;
    dash.myGames.appendChild(div);
  }
  dash.myGames.addEventListener('click', (e) => {
    if (e.target.classList.contains('go')) enterRoom(e.target.dataset.code);
  }, { once: true });
}

// Auth
auth.sendLink.onclick = async () => {
  auth.msg.textContent = 'Sending…';
  try {
    await api('/auth/magic-link', { method: 'POST', body: JSON.stringify({ email: auth.email.value, name: auth.name.value }) });
    auth.msg.textContent = 'Check your email for the sign‑in link.';
  } catch (e) { auth.msg.textContent = 'Could not send link.'; }
};

dash.logout.onclick = async () => { await api('/auth/logout', { method: 'POST' }); location.reload(); };

dash.create.onclick = async () => {
  const { code } = await api('/games', { method: 'POST', body: JSON.stringify({ name: dash.gameName.value }) });
  enterRoom(code);
};

dash.goJoin.onclick = async () => { enterRoom(dash.code.value.trim().toUpperCase()); };

room.leave.onclick = () => { currentCode = null; refreshMe(); };

async function enterRoom(code) {
  currentCode = code; myRole = null;
  try {
    // honor invite token in URL if present
    const url = new URL(location.href);
    const inv = url.searchParams.get('inv');
    await api(`/games/${code}/join${inv ? `?inv=${encodeURIComponent(inv)}` : ''}`, { method: 'POST' });
  } catch {}
  show(dash.section, false); show(room.section, true);
  room.title.textContent = `Room • ${code}`;

  if (!socket) socket = io({ withCredentials: true });
  socket.emit('joinGame', { code });

  socket.on('errorMsg', (m) => alert(m));
  socket.on('gameMeta', ({ name, role, asker }) => {
    myRole = role; room.title.textContent = `${name} • ${code}`;
    show(room.start, role === 'owner');
    show(room.inviteBox, role === 'owner');
    updateAsker(asker);
  });

  socket.on('roster', (list) => {
    room.roster.innerHTML = list.map(p => `<li>${p.name} — <b>${p.score}</b> ${p.connected ? '' : '<span class="muted">(left)</span>'}</li>`).join('');
  });

  socket.on('gameStarted', ({ asker }) => updateAsker(asker));

  socket.on('newQuestion', (q) => { room.asker.textContent = `Asker's Question: ${q}`; room.responses.innerHTML=''; });

  socket.on('newResponse', ({ id, text }) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${text}</span>` + (isAsker() ? ` <button data-id="${id}" class="pick">Pick</button>` : '');
    room.responses.appendChild(li);
  });

  socket.on('scores', (scores) => {
    // just refresh roster (scores are embedded there)
  });

  socket.on('newAsker', (asker) => { updateAsker(asker); room.responses.innerHTML=''; room.response.value=''; });

  room.start.onclick = () => socket.emit('startGame');
  room.submitQ.onclick = () => socket.emit('submitQuestion', room.question.value);
  room.submitR.onclick = () => socket.emit('submitResponse', room.response.value);
  room.forceNext.onclick = () => socket.emit('forceNext');

  room.responses.addEventListener('click', (e) => {
    if (e.target.classList.contains('pick')) socket.emit('awardPoints', e.target.dataset.id);
  });

  function isAsker() { return room.asker.dataset.askerId === me?.uid; }
  function updateAsker(a) {
    room.asker.dataset.askerId = a?.id || '';
    room.asker.textContent = `Current Asker: ${a ? a.name : '—'}`;
    const amAsker = a && a.id === me?.uid;
    room.question.disabled = !amAsker;
    room.submitQ.disabled = !amAsker;
    room.response.disabled = amAsker;
    room.submitR.disabled = amAsker;
  }
}

room.sendInvites.onclick = async () => {
  const emails = room.inviteEmails.value.split(',').map(s => s.trim()).filter(Boolean);
  if (!emails.length) return;
  await api(`/games/${currentCode}/invite`, { method: 'POST', body: JSON.stringify({ emails }) });
  room.inviteEmails.value='';
  alert('Invites sent.');
};

// Auto‑boot
refreshMe();
