let userId;
let userName;
let ws;
let reconnectTimer;
let activeConversation;
let conversations = [];
const sentClientIds = new Set();

function init() {
  const saved = localStorage.getItem('relayUser');
  if (saved) {
    const u = JSON.parse(saved);
    userId = u.id;
    userName = u.name;
    startApp();
  } else {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function startApp() {
  document.getElementById('login').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('me').textContent = userName;
  loadConversations();
}

document.getElementById('loginForm').onsubmit = async (e) => {
  e.preventDefault();
  const name = document.getElementById('nick').value.trim();
  if (!name) return;
  const res = await fetch('/api/users/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const u = await res.json();
  userId = u.id;
  userName = u.name;
  localStorage.setItem('relayUser', JSON.stringify(u));
  startApp();
};

document.getElementById('logout').onclick = () => {
  localStorage.removeItem('relayUser');
  if (ws) {
    ws.onclose = null;
    ws.close();
  }
  clearTimeout(reconnectTimer);
  userId = null;
  userName = null;
  activeConversation = null;
  conversations = [];
  document.getElementById('conversations').innerHTML = '';
  document.getElementById('messages').innerHTML = '';
  document.getElementById('title').textContent = 'Pick a conversation';
  clearTyping();
  document.getElementById('nick').value = '';
  showLogin();
};

async function loadConversations() {
  const res = await fetch(`/api/conversations?userId=${userId}`);
  conversations = await res.json();
  renderSidebar();
  connectWs();
}

function renderSidebar() {
  const list = document.getElementById('conversations');
  list.innerHTML = '';
  for (const c of conversations) {
    const li = document.createElement('li');
    if (c.id === activeConversation) li.className = 'active';
    li.innerHTML =
      `<span>${c.title} (${c.messageCount})</span>` + (c.hasUnread ? '<span class="dot">●</span>' : '');
    li.onclick = () => openConversation(c.id, c.title);
    list.appendChild(li);
  }
}

function connectWs() {
  if (ws) {
    ws.onclose = null;
    ws.close();
  }
  ws = new WebSocket(`ws://${location.host}/`);
  ws.onopen = () =>
    ws.send(JSON.stringify({ type: 'subscribe', conversationIds: conversations.map((c) => c.id) }));
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);

    if (msg.type === 'typing') {
      if (msg.conversationId === activeConversation && msg.userId !== userId) {
        showTyping(msg.name, msg.userId);
      }
      return;
    }
    if (msg.type !== 'message') return;
    if (msg.clientId && sentClientIds.has(msg.clientId)) return;
    const c = conversations.find((x) => x.id === msg.conversationId);
    if (c) c.messageCount += 1;
    if (msg.conversationId === activeConversation) {
      clearTyping();
      appendMessage(msg);
      markRead(activeConversation);
    } else if (c) {
      c.hasUnread = true;
    }
    renderSidebar();
  };
  ws.onclose = () => {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectWs, 1000);
  };
}

async function openConversation(id, title) {
  activeConversation = id;
  const c = conversations.find((x) => x.id === id);
  if (c) c.hasUnread = false;
  renderSidebar();

  clearTyping();
  document.getElementById('title').textContent = title;
  const res = await fetch(`/api/messages?conversationId=${id}`);
  const messages = await res.json();
  const pane = document.getElementById('messages');
  pane.innerHTML = '';
  for (const m of messages) appendMessage(m);
  markRead(id);
}

let typingTimer;
function showTyping(name, uid) {
  const el = document.getElementById('typing');
  el.textContent = `${name || '#' + uid} typing…`;
  clearTimeout(typingTimer);
  typingTimer = setTimeout(clearTyping, 3000);
}
function clearTyping() {
  clearTimeout(typingTimer);
  document.getElementById('typing').textContent = '';
}

function markRead(conversationId) {
  fetch(`/api/conversations/${conversationId}/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  }).catch(() => {});
}

function appendMessage(m) {
  const pane = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg';

  const who = m.senderName || '#' + m.senderId;
  div.textContent = `${who}: ${m.body}`;
  pane.appendChild(div);
  pane.scrollTop = pane.scrollHeight;
}

let lastTypingSent = 0;
document.getElementById('text').addEventListener('input', () => {
  if (!activeConversation || !ws || ws.readyState !== WebSocket.OPEN) return;
  const now = Date.now();
  if (now - lastTypingSent < 1500) return;
  lastTypingSent = now;
  ws.send(JSON.stringify({ type: 'typing', conversationId: activeConversation, userId, name: userName }));
});

document.getElementById('composer').onsubmit = async (e) => {
  e.preventDefault();
  const input = document.getElementById('text');
  const body = input.value.trim();
  if (!body || !activeConversation) return;
  input.value = '';

  const clientId = crypto.randomUUID();
  sentClientIds.add(clientId);
  appendMessage({ senderId: userId, senderName: userName, body });
  const c = conversations.find((x) => x.id === activeConversation);
  if (c) c.messageCount += 1;
  renderSidebar();

  await fetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationId: activeConversation, senderId: userId, body, clientId }),
  });
};

document.getElementById('newConv').onclick = async () => {
  const title = prompt('Conversation title?');
  if (!title) return;
  await fetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, participantIds: [userId] }),
  });
  await loadConversations();
};

document.getElementById('searchForm').onsubmit = async (e) => {
  e.preventDefault();
  const q = document.getElementById('search').value.trim();
  if (!q) return;
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  renderResults(q, await res.json());
};

function renderResults(q, results) {
  activeConversation = null;
  document.getElementById('title').textContent = `Search: "${q}"`;
  const pane = document.getElementById('messages');
  pane.innerHTML = '';
  if (!results.length) {
    const empty = document.createElement('div');
    empty.className = 'msg';
    empty.style.color = '#888';
    empty.textContent = 'No results.';
    pane.appendChild(empty);
    return;
  }
  for (const r of results) {
    const div = document.createElement('div');
    div.className = 'result';
    const title = document.createElement('strong');
    title.textContent = r.conversationTitle ?? '#' + r.conversationId;
    const snippet = document.createElement('span');
    snippet.className = 'snippet';
    snippet.textContent = r.body ?? '';
    div.append(title, snippet);
    div.onclick = () => openConversation(r.conversationId, r.conversationTitle ?? '#' + r.conversationId);
    pane.appendChild(div);
  }
}

init();
