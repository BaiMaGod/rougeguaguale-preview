import { SYMBOLS, ROUND_TARGETS, createTicket, scoutCell, activateCell, calculateScore, settleTicket, rowClues } from './rules.js';

const $ = (selector) => document.querySelector(selector);
const board = $('#board');
const clues = $('#clues');
const logEl = $('#log');
const modal = $('#modal');

const state = {
  runSeed: new URLSearchParams(location.search).get('seed') || `foil-${Math.floor(Date.now() / 1000)}`,
  round: 0,
  bank: 0,
  ticketNumber: 1,
  ticket: null,
  scoutMode: false,
  extraMode: false,
  committed: false
};

function newTicket() {
  state.ticket = createTicket(`${state.runSeed}:r${state.round + 1}:t${state.ticketNumber}`);
  state.scoutMode = false;
  state.extraMode = false;
  state.committed = false;
  addLog(`第 ${state.ticketNumber} 张票已印好。先看线索，再决定刮哪里。`);
  render();
}

function resetRun() {
  state.round = 0;
  state.bank = 0;
  state.ticketNumber = 1;
  state.runSeed = `foil-${Math.floor(Date.now() / 1000)}`;
  history.replaceState(null, '', `${location.pathname}?seed=${encodeURIComponent(state.runSeed)}`);
  logEl.innerHTML = '';
  newTicket();
}

function addLog(text, tone = '') {
  const item = document.createElement('div');
  item.className = `log-item ${tone}`;
  item.textContent = text;
  logEl.prepend(item);
}

function cellClick(index) {
  if (state.ticket.settled || state.committed) return;
  try {
    if (state.scoutMode) {
      const before = state.ticket.scoutRemaining;
      state.ticket = scoutCell(state.ticket, index);
      if (state.ticket.scoutRemaining < before) addLog(`显影：${coord(index)} 是 ${SYMBOLS[state.ticket.cells[index].symbol].name}。`);
      state.scoutMode = false;
    } else {
      const isExtra = state.extraMode;
      state.ticket = activateCell(state.ticket, index, { extra: isExtra });
      state.extraMode = false;
      const symbol = SYMBOLS[state.ticket.cells[index].symbol].name;
      addLog(`${isExtra ? '冒刮' : '刮开'} ${coord(index)}：${symbol}。压力 ${state.ticket.pressure}/3。`, state.ticket.status === 'accident' ? 'danger' : '');
      if (state.ticket.status === 'accident') {
        state.ticket = settleTicket(state.ticket);
        commitScore(true);
      }
    }
  } catch (error) {
    addLog(error.message, 'danger');
  }
  render();
}

function coord(index) {
  return `${String.fromCharCode(65 + (index % 4))}${Math.floor(index / 4) + 1}`;
}

function commitScore(accident = false) {
  if (state.committed) return;
  if (!state.ticket.settled) state.ticket = settleTicket(state.ticket);
  const gained = state.ticket.finalScore;
  state.bank += gained;
  state.committed = true;
  addLog(`${accident ? '印刷事故' : '收手结算'}：${gained} 分已存入灯箱。`, accident ? 'danger' : 'good');

  if (state.bank >= ROUND_TARGETS[state.round]) {
    showResult(true, gained);
  } else if (state.ticketNumber >= 3) {
    showResult(false, gained);
  }
}

function nextTicket() {
  if (!state.committed) return;
  if (state.bank >= ROUND_TARGETS[state.round]) return;
  if (state.ticketNumber >= 3) return;
  state.ticketNumber += 1;
  newTicket();
}

function showResult(success, gained) {
  const target = ROUND_TARGETS[state.round];
  const body = success
    ? `<h2>灯亭点亮！</h2><p>本轮累计 <strong>${state.bank}</strong> / ${target}，本张贡献 ${gained} 分。</p><p class="muted">第一阶段原型先做到单轮闭环。下一步会接入轮后奖励、印版改造与商店。</p>`
    : `<h2>本轮未达标</h2><p>三张票累计 <strong>${state.bank}</strong> / ${target}。</p><p class="muted">失败不会隐藏原因：回看右侧计分拆解，调整刮开位置和收手时机。</p>`;
  modal.innerHTML = `<div class="modal-card">${body}<button id="again">再开一局</button></div>`;
  modal.classList.remove('hidden');
  $('#again').addEventListener('click', () => {
    modal.classList.add('hidden');
    resetRun();
  });
}

function renderBoard() {
  board.innerHTML = '';
  state.ticket.cells.forEach((cell, index) => {
    const button = document.createElement('button');
    const def = SYMBOLS[cell.symbol];
    button.className = `scratch-cell ${cell.state}`;
    button.setAttribute('aria-label', `${coord(index)} ${cell.state === 'hidden' ? '未刮开' : def.name}`);
    button.disabled = state.ticket.settled || state.committed;
    button.innerHTML = `
      <span class="coord">${coord(index)}</span>
      <span class="foil">LUCK<br><small>SCRATCH</small></span>
      <span class="symbol-icon">${def.icon}</span>
      <span class="symbol-name">${def.name}</span>
    `;
    button.addEventListener('click', () => cellClick(index));
    board.appendChild(button);
  });
}

function renderClues() {
  const rows = rowClues(state.ticket);
  clues.innerHTML = rows.map((clue, i) => `<div><b>${i + 1} 行</b><span>${clue.label}</span></div>`).join('');
}

function renderScore() {
  const score = calculateScore(state.ticket);
  $('#preview').textContent = score.score;
  $('#baseScore').textContent = score.B;
  $('#multiplier').textContent = score.M.toFixed(2);
  $('#breakdown').innerHTML = [
    ['符号基础', score.breakdown.symbolBase],
    ['齿轮邻接', score.breakdown.gearBase],
    [`三响 ×${score.breakdown.tripleGroups}`, score.breakdown.tripleBase],
    [`连线 ×${score.breakdown.lineCount}`, score.breakdown.lineBase],
    ['工匠加分', score.breakdown.crafterBase],
    ['街角经典', score.breakdown.ticketBase],
    ['铃铛倍率', `+${score.breakdown.bellMultiplier.toFixed(2)}`],
    ['三响倍率', `+${score.breakdown.tripleMultiplier.toFixed(2)}`],
    ['杂彩倍率', `+${score.breakdown.varietyMultiplier.toFixed(2)}`],
    ['冒刮代价', `-${score.breakdown.extraPenalty.toFixed(2)}`]
  ].map(([label, value]) => `<div><span>${label}</span><b>${value}</b></div>`).join('');
}

function render() {
  const target = ROUND_TARGETS[state.round];
  $('#target').textContent = target;
  $('#bank').textContent = state.bank;
  $('#ticketCount').textContent = `${state.ticketNumber}/3`;
  $('#seed').textContent = state.runSeed;
  $('#regular').textContent = state.ticket.regularRemaining;
  $('#extra').textContent = state.ticket.extraRemaining;
  $('#pressure').textContent = `${state.ticket.pressure}/3`;
  $('#scout').textContent = state.ticket.scoutRemaining;
  $('#pressureBar').style.setProperty('--p', `${Math.min(100, state.ticket.pressure / 3 * 100)}%`);

  $('#scoutBtn').classList.toggle('active', state.scoutMode);
  $('#scoutBtn').disabled = state.ticket.scoutRemaining <= 0 || state.ticket.settled || state.committed;
  $('#extraBtn').classList.toggle('active', state.extraMode);
  $('#extraBtn').disabled = state.ticket.regularRemaining > 0 || state.ticket.extraRemaining <= 0 || state.ticket.settled || state.committed;
  $('#settleBtn').disabled = state.ticket.activatedOrder.length === 0 || state.ticket.settled || state.committed;
  $('#nextBtn').classList.toggle('hidden', !state.committed || state.bank >= target || state.ticketNumber >= 3);

  renderBoard();
  renderClues();
  renderScore();
}

$('#scoutBtn').addEventListener('click', () => {
  state.scoutMode = !state.scoutMode;
  state.extraMode = false;
  render();
});

$('#extraBtn').addEventListener('click', () => {
  state.extraMode = !state.extraMode;
  state.scoutMode = false;
  render();
});

$('#settleBtn').addEventListener('click', () => {
  try {
    state.ticket = settleTicket(state.ticket);
    commitScore(false);
  } catch (error) {
    addLog(error.message, 'danger');
  }
  render();
});

$('#nextBtn').addEventListener('click', nextTicket);
$('#restartBtn').addEventListener('click', resetRun);

newTicket();
