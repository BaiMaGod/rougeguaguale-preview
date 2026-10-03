export const SYMBOLS = {
  star: { id: 'S01', name: '星星', icon: '★', base: 10, natural: true },
  bell: { id: 'S02', name: '铃铛', icon: '♬', base: 6, natural: true },
  leaf: { id: 'S03', name: '叶片', icon: '❧', base: 6, natural: true },
  gear: { id: 'S04', name: '齿轮', icon: '⚙', base: 8, natural: true },
  gem: { id: 'S05', name: '宝石', icon: '◆', base: 20, natural: true },
  ink: { id: 'S06', name: '墨团', icon: '●', base: 0, natural: false }
};

export const INITIAL_PLATE = [
  'star', 'star', 'star', 'star',
  'bell', 'bell', 'bell',
  'leaf', 'leaf', 'leaf',
  'gear', 'gear',
  'gem', 'gem',
  'ink', 'ink'
];

export const ROUND_TARGETS = [280, 440, 650, 950, 1350, 1900, 2700, 3800, 5400];

function hashSeed(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function rng() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffledPlate(seed) {
  const rng = mulberry32(hashSeed(String(seed)));
  const result = [...INITIAL_PLATE];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function createTicket(seed = 'demo-1', layoutOverride = null) {
  const layout = layoutOverride ? [...layoutOverride] : shuffledPlate(seed);
  if (layout.length !== 16) throw new Error('Ticket layout must contain 16 cells.');
  return {
    seed: String(seed),
    ticketType: 'T01',
    crafter: 'C01',
    cells: layout.map((symbol, index) => ({ index, symbol, state: 'hidden' })),
    regularRemaining: 8,
    extraRemaining: 2,
    scoutRemaining: 1,
    pressure: 0,
    extraUsed: 0,
    activatedOrder: [],
    status: 'active',
    finalScore: null,
    settled: false
  };
}

export function cloneTicket(ticket) {
  return {
    ...ticket,
    cells: ticket.cells.map(cell => ({ ...cell })),
    activatedOrder: [...ticket.activatedOrder]
  };
}

function assertPlayable(ticket) {
  if (ticket.status !== 'active') throw new Error('Ticket is no longer active.');
  if (ticket.settled) throw new Error('Ticket has already been settled.');
}

export function scoutCell(ticket, index) {
  assertPlayable(ticket);
  const next = cloneTicket(ticket);
  if (next.scoutRemaining <= 0) throw new Error('No scout uses remaining.');
  const cell = next.cells[index];
  if (!cell) throw new Error('Invalid cell index.');
  if (cell.state !== 'hidden') return next;
  cell.state = 'scouted';
  next.scoutRemaining -= 1;
  return next;
}

export function activateCell(ticket, index, { extra = false } = {}) {
  assertPlayable(ticket);
  const next = cloneTicket(ticket);
  const cell = next.cells[index];
  if (!cell) throw new Error('Invalid cell index.');
  if (cell.state === 'active') return next;

  if (extra) {
    if (next.regularRemaining > 0) throw new Error('Extra scratch is only available after regular scratches are exhausted.');
    if (next.extraRemaining <= 0) throw new Error('No extra scratches remaining.');
    next.extraRemaining -= 1;
    next.extraUsed += 1;
    next.pressure += 1;
  } else {
    if (next.regularRemaining <= 0) throw new Error('No regular scratches remaining.');
    next.regularRemaining -= 1;
  }

  cell.state = 'active';
  next.activatedOrder.push(index);

  if (cell.symbol === 'leaf') next.pressure = Math.max(0, next.pressure - 1);
  if (cell.symbol === 'ink') next.pressure += 1;

  if (next.pressure >= 3) {
    next.status = 'accident';
    next.finalScore = calculateScore(next, { accident: true }).score;
  }
  return next;
}

export function rowClues(ticket) {
  const clues = [];
  for (let row = 0; row < 4; row += 1) {
    const counts = new Map();
    for (let col = 0; col < 4; col += 1) {
      const symbol = ticket.cells[row * 4 + col].symbol;
      if (symbol === 'ink') continue;
      counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
    }
    if (counts.size === 0) {
      clues.push({ symbol: null, count: 0, tied: false, label: '无普通图案' });
      continue;
    }
    const entries = [...counts.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return SYMBOLS[a[0]].id.localeCompare(SYMBOLS[b[0]].id);
    });
    const top = entries[0];
    const tied = entries.filter(([, count]) => count === top[1]).length > 1;
    clues.push({ symbol: top[0], count: top[1], tied, label: `${SYMBOLS[top[0]].name} ×${top[1]}${tied ? '（并列）' : ''}` });
  }
  return clues;
}

function activatedIndices(ticket) {
  return ticket.cells.filter(cell => cell.state === 'active').map(cell => cell.index);
}

function validLines(ticket) {
  const lines = [];
  for (let r = 0; r < 4; r += 1) lines.push([r * 4, r * 4 + 1, r * 4 + 2, r * 4 + 3]);
  for (let c = 0; c < 4; c += 1) lines.push([c, c + 4, c + 8, c + 12]);
  return lines.filter(line => line.every(index => {
    const cell = ticket.cells[index];
    return cell.state === 'active' && cell.symbol !== 'ink';
  }));
}

function gearAdjacencyBonus(ticket) {
  let bonus = 0;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for (const cell of ticket.cells) {
    if (cell.state !== 'active' || cell.symbol !== 'gear') continue;
    const row = Math.floor(cell.index / 4);
    const col = cell.index % 4;
    let neighbors = 0;
    for (const [dr, dc] of dirs) {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r > 3 || c < 0 || c > 3) continue;
      const other = ticket.cells[r * 4 + c];
      if (other.state === 'active' && other.symbol === 'gear') neighbors += 1;
    }
    bonus += Math.min(2, neighbors) * 8;
  }
  return bonus;
}

export function calculateScore(ticket, { accident = ticket.status === 'accident' } = {}) {
  const active = activatedIndices(ticket);
  const counts = new Map();
  let symbolBase = 0;
  let bellMultiplier = 0;

  for (const index of active) {
    const symbol = ticket.cells[index].symbol;
    const def = SYMBOLS[symbol];
    symbolBase += def.base;
    if (symbol !== 'ink') counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
    if (symbol === 'bell') bellMultiplier += 0.10;
  }

  const tripleGroups = [...counts.values()].reduce((sum, count) => sum + Math.floor(count / 3), 0);
  const tripleBase = tripleGroups * 20;
  const tripleMultiplier = tripleGroups * 0.20;
  const lines = validLines(ticket);
  const lineBase = lines.length * 24;
  const gearBase = gearAdjacencyBonus(ticket);
  const naturalTypes = [...counts.keys()].filter(key => SYMBOLS[key].natural).length;
  const varietyMultiplier = naturalTypes >= 4 ? 0.25 : 0;
  const crafterBase = counts.get('star') > 0 ? 8 : 0;
  const ticketBase = active.length >= 6 ? 10 : 0;

  const B = symbolBase + gearBase + tripleBase + lineBase + crafterBase + ticketBase;
  const M = Math.max(0.50, 1 + bellMultiplier + tripleMultiplier + varietyMultiplier - ticket.extraUsed * 0.25);
  const X = 1;
  const score = accident ? Math.floor(B * 0.40) : Math.floor(B * M * X + 1e-9);

  return {
    score,
    B,
    M,
    X,
    accident,
    breakdown: {
      activeCount: active.length,
      symbolBase,
      gearBase,
      tripleGroups,
      tripleBase,
      lineCount: lines.length,
      lineBase,
      crafterBase,
      ticketBase,
      bellMultiplier,
      tripleMultiplier,
      varietyMultiplier,
      extraPenalty: ticket.extraUsed * 0.25
    }
  };
}

export function settleTicket(ticket) {
  if (ticket.settled) return cloneTicket(ticket);
  if (ticket.activatedOrder.length === 0) throw new Error('At least one cell must be activated before settling.');
  const next = cloneTicket(ticket);
  const accident = next.status === 'accident';
  next.finalScore = calculateScore(next, { accident }).score;
  next.status = accident ? 'accident' : 'settled';
  next.settled = true;
  return next;
}
