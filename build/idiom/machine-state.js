import { CARDS, cardDefinition } from './config.js';
import { seededRandom } from './generator.js';
export const MACHINE_LEVELS = [
    { name: '未购入', ms: 8000, capacity: 0, cost: 0n },
    { name: '初级', ms: 8000, capacity: 5, cost: 20n },
    { name: '中级', ms: 4000, capacity: 10, cost: 30n },
    { name: '高级', ms: 2000, capacity: 25, cost: 300n },
    { name: '超级', ms: 800, capacity: 100, cost: 3000n },
];
export function defaultPolicy() { return { cashoutMode: 'steps', steps: 3, target: 500000n, ladderMode: 'random', gates: [0, 0, 0] }; }
export function newMachine() {
    return { level: 0, running: false, queue: [], job: null, autoBuy: false, autoClaim: false, repeatCard: 'T01', policy: defaultPolicy(), reserve: 2n, budget: 20n, limit: 5,
        sessionSpent: 0n, sessionBought: 0, totalSpent: 0n, totalWon: 0n, purchased: 0, processed: 0, investment: 0n, log: [], message: '' };
}
export function allowedMachineCard(id, unlocked) {
    const def = cardDefinition(id);
    if (!def.automationAllowedByDefault)
        throw new Error('一念天堂禁止自动处理，请手动确认风险');
    if (CARDS.indexOf(def) >= unlocked)
        throw new Error('卡种尚未解锁');
    return def.id;
}
export function validatePolicy(p) {
    if (!p || !['steps', 'target'].includes(p.cashoutMode) || !Number.isInteger(p.steps) || p.steps < 1 || p.steps > 6 || typeof p.target !== 'bigint' || p.target <= 0n || p.target.toString().length > 60)
        throw new Error('止盈策略无效');
    if (!['random', 'preset'].includes(p.ladderMode) || !Array.isArray(p.gates) || p.gates.length !== 3 || p.gates.some(g => !Number.isInteger(g) || g < 0 || g > 4))
        throw new Error('天梯策略无效');
    return { ...p, gates: [...p.gates] };
}
/** Only card definition, nonce and a declared policy are visible to this planner. */
export function machineOrder(cardId, nonce, policy) {
    const def = cardDefinition(cardId), rng = seededRandom(nonce + ':machine-choice');
    validatePolicy(policy);
    if (cardId === 'T18')
        throw new Error('一念天堂禁止自动处理');
    if (def.mode === 'ladder')
        return [0, 1, 2].map(row => row * 5 + (policy.ladderMode === 'preset' ? policy.gates[row] : Math.floor(rng() * 5)));
    if (def.mode === 'eye')
        return [Math.floor(rng() * 3)];
    if (def.mode === 'mines') {
        const order = Array.from({ length: 10 }, (_, i) => i);
        for (let i = 9; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
        }
        return order.slice(0, 3);
    }
    return Array.from({ length: def.mode === 'cashout' ? policy.steps : def.cells }, (_, i) => i);
}
const integer = (n) => { if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0)
    throw new Error('机器计数无效'); return n; };
const amount = (n) => { if (typeof n !== 'string' || !/^\d{1,60}$/.test(n))
    throw new Error('机器金额无效'); return BigInt(n); };
function readPolicy(p) { return validatePolicy({ ...p, target: amount(p?.target) }); }
export function restoreMachine(value, active, unlocked, automationUnlocked = false) {
    const m = value;
    if (!m || typeof m.running !== 'boolean' || typeof m.autoBuy !== 'boolean' || typeof m.autoClaim !== 'boolean' || typeof m.message !== 'string' || m.message.length > 200)
        throw new Error('机器存档无效');
    const level = integer(m.level);
    if (level > 4 || (level < 1 || level < 2 && !automationUnlocked) && (m.autoBuy || m.autoClaim))
        throw new Error('机器权限无效');
    if (!Array.isArray(m.queue) || m.queue.length > MACHINE_LEVELS[level].capacity)
        throw new Error('机器队列无效');
    const task = (t) => ({ cardId: allowedMachineCard(t.cardId, unlocked), policy: readPolicy(t.policy) });
    const queue = m.queue.map(task), policy = readPolicy(m.policy), repeatCard = allowedMachineCard(m.repeatCard, unlocked);
    let job = null;
    if (m.job) {
        const j = m.job, parsed = task(j), elapsedMs = integer(j.elapsedMs);
        if (!level || !active || active.settled || j.nonce !== active.nonce || j.cardId !== active.cardId || elapsedMs > MACHINE_LEVELS[level].ms)
            throw new Error('机器票据关联无效');
        const order = machineOrder(j.cardId, j.nonce, parsed.policy);
        if (JSON.stringify(order) !== JSON.stringify(j.order) || active.revealed.some((n, i) => order[i] !== n) || active.choices.some(n => !active.revealed.includes(n)))
            throw new Error('机器选择记录无效');
        if (active.revealed.length > Math.floor(elapsedMs / MACHINE_LEVELS[level].ms * order.length))
            throw new Error('机器进度无效');
        job = { ...parsed, nonce: j.nonce, elapsedMs, order };
    }
    const limit = integer(m.limit);
    if (limit < 1 || limit > 10000)
        throw new Error('连买上限无效');
    const purchased = integer(m.purchased), processed = integer(m.processed), sessionBought = integer(m.sessionBought);
    if (purchased !== processed + (job ? 1 : 0) || sessionBought > limit || sessionBought > purchased)
        throw new Error('机器购票计数无效');
    const reserve = amount(m.reserve), budget = amount(m.budget), sessionSpent = amount(m.sessionSpent), totalSpent = amount(m.totalSpent), totalWon = amount(m.totalWon), investment = amount(m.investment);
    if (investment !== MACHINE_LEVELS.slice(0, level + 1).reduce((sum, l) => sum + l.cost, 0n))
        throw new Error('机器购买记录无效');
    if (!budget || sessionSpent > budget || sessionSpent > totalSpent)
        throw new Error('机器预算无效');
    if (!Array.isArray(m.log) || m.log.length > 50 || new Set(m.log.map(r => r.nonce)).size !== m.log.length)
        throw new Error('机器日志无效');
    const log = m.log.map(r => {
        const cardId = allowedMachineCard(r.cardId, unlocked), cost = amount(r.cost), prize = amount(r.prize);
        if (typeof r.nonce !== 'string' || cost !== cardDefinition(cardId).price || !['won', 'lost'].includes(r.status) || (r.status === 'won') !== (prize > 0n))
            throw new Error('机器结算日志无效');
        return { ...r, cardId, cost, prize };
    });
    if (log.length > processed || log.reduce((s, r) => s + r.cost, 0n) > totalSpent || log.reduce((s, r) => s + r.prize, 0n) > totalWon)
        throw new Error('机器收益无效');
    if (!level && (purchased || processed || queue.length || job || m.running))
        throw new Error('未购买机器');
    return { level, running: false, queue, job, autoBuy: m.autoBuy, autoClaim: m.autoClaim, repeatCard, policy, reserve, budget, limit, sessionSpent, sessionBought, totalSpent, totalWon, purchased, processed, investment, log,
        message: m.running ? '重新打开后已暂停，请继续队列' : m.message };
}
