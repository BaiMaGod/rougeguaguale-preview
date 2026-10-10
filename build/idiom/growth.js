import { CARDS, cardDefinition, BASE_WIN_CHANCE, AMOUNT_POOL, LEDGER_POOL, CASHOUT_SAFETY, CASHOUT_REWARDS, DRAGON_EYE_TICKET_CHANCE, DESTINY_POOL } from './config.js';
export const GROWTH_VERSION = 'v3.1-growth-draft-1';
export const TECHS = ['luck', 'jackpot', 'bonus', 'scratch'];
export const COSTS = [1, 2, 3, 4, 6, 8, 10, 12, 15, 20];
export const TECH_INFO = {
    luck: { name: '福运 · 幸运值', description: '普通奖池中奖权重 +5%/级' },
    jackpot: { name: '爆运 · 大奖爆率', description: '一五一十、一本万利高档权重 +10%/级' },
    bonus: { name: '财运 · 奖金增益', description: '普通奖金 +10%/级；四张终极心愿卡保持固定头奖' },
    scratch: { name: '巧手 · 刮擦效率', description: '真实刮擦面积 +15%/级，所有卡生效' },
};
export const zeroLevels = () => ({ luck: 0, jackpot: 0, bonus: 0, scratch: 0 });
export const newProgression = () => ({ points: 0, earned: 0, levels: zeroLevels(), claimed: [] });
export function readLevels(value) {
    if (!value || typeof value !== 'object' || Object.keys(value).length !== 4)
        throw new Error('永久科技数据无效');
    const levels = value;
    for (const tech of TECHS)
        if (!Number.isInteger(levels[tech]) || levels[tech] < 0 || levels[tech] > 10)
            throw new Error('永久科技等级无效');
    return { ...levels };
}
export function upgradeProgression(p, tech) {
    if (!TECHS.includes(tech))
        throw new Error('未知科技');
    const level = p.levels[tech];
    if (level >= 10)
        throw new Error('此科技已满级');
    const cost = COSTS[level];
    if (p.points < cost)
        throw new Error('福运点不足，先完成首次里程碑');
    return { ...p, points: p.points - cost, levels: { ...p.levels, [tech]: level + 1 } };
}
const WEALTH = [100n, 1000n, 10000n, 100000n, 1000000n, 10000000n, 100000000n, 1000000000n, 10000000000n, 100000000000n, 1000000000000n];
const WEALTH_POINTS = [1, 2, 3, 5, 8, 12, 16, 20, 25, 32, 40];
export const MILESTONES = Object.freeze([
    ...CARDS.flatMap((c, i) => [{ id: 'unlock:' + c.id, points: i === 0 ? 1 : 3, label: '解锁 ' + c.name },
        { id: 'win:' + c.id, points: 2, label: '首次中奖 ' + c.name }, { id: 'jackpot:' + c.id, points: 5, label: '首次头奖 ' + c.name }]),
    ...WEALTH.map((value, i) => ({ id: 'wealth:' + value, points: WEALTH_POINTS[i], label: '最高现金 ' + value + '元' })),
]);
export function awardMilestones(p, unlocked, peak, stats) {
    const eligible = new Set();
    CARDS.forEach((c, i) => {
        if (i < unlocked)
            eligible.add('unlock:' + c.id);
        if (stats[c.id]?.won > 0)
            eligible.add('win:' + c.id);
        if ((stats[c.id]?.best ?? 0n) >= c.headlinePrize)
            eligible.add('jackpot:' + c.id);
    });
    WEALTH.forEach(v => { if (peak >= v)
        eligible.add('wealth:' + v); });
    const claimed = new Set(p.claimed);
    let gain = 0;
    for (const m of MILESTONES)
        if (eligible.has(m.id) && !claimed.has(m.id)) {
            claimed.add(m.id);
            gain += m.points;
        }
    return gain ? { ...p, points: p.points + gain, earned: p.earned + gain, claimed: [...claimed] } : p;
}
export function restoreProgression(value) {
    const p = value;
    if (!p || !Array.isArray(p.claimed) || new Set(p.claimed).size !== p.claimed.length)
        throw new Error('福运里程碑无效');
    const levels = readLevels(p.levels);
    let earned = 0;
    for (const id of p.claimed) {
        const m = MILESTONES.find(m => m.id === id);
        if (!m)
            throw new Error('未知福运里程碑');
        earned += m.points;
    }
    const rebirthEarned = p.rebirthEarned ?? 0;
    if (!Number.isSafeInteger(rebirthEarned) || rebirthEarned < 0)
        throw new Error('转生福运点无效');
    earned += rebirthEarned;
    const spent = TECHS.reduce((sum, t) => sum + COSTS.slice(0, levels[t]).reduce((a, b) => a + b, 0), 0);
    if (p.earned !== earned || !Number.isSafeInteger(p.points) || p.points < 0 || p.points !== earned - spent)
        throw new Error('福运点余额无效');
    return { points: p.points, earned, levels, claimed: [...p.claimed], ...(p.rebirthEarned !== undefined ? { rebirthEarned } : {}) };
}
export function addRebirthPoints(p, gain) {
    if (!Number.isSafeInteger(gain) || gain < 1 || !Number.isSafeInteger(p.earned + gain))
        throw new Error('转生奖励无效');
    return { ...p, points: p.points + gain, earned: p.earned + gain, rebirthEarned: (p.rebirthEarned ?? 0) + gain };
}
const modelCache = new Map();
function weightedChance(p, m) { return p * m / (1 - p + p * m); }
function modelAt(id, l, factor) {
    const luck = 1 + .05 * l.luck * factor, jackpot = 1 + .10 * l.jackpot * factor;
    let winChance = weightedChance(BASE_WIN_CHANCE[id] ?? 0, luck), tiers = [], safety = [];
    const def = cardDefinition(id), bonusBps = Number(id.slice(1)) >= 15 ? 10000 : 10000 + Math.floor(1000 * l.bonus * factor);
    let baseRtp = winChance * Number(def.headlinePrize) / Number(def.price);
    if (id === 'T01' || id === 'T14') {
        const pool = id === 'T01' ? AMOUNT_POOL : LEDGER_POOL, total = pool.reduce((s, t) => s + t.chance, 0);
        winChance = weightedChance(total, luck);
        const weights = pool.map((t, i) => t.chance * (i === pool.length - 1 ? jackpot : 1)), sum = weights.reduce((a, b) => a + b, 0);
        tiers = weights.map(w => w / sum);
        baseRtp = winChance * pool.reduce((s, t, i) => s + tiers[i] * Number(t.prize), 0) / Number(def.price);
    }
    if (id === 'T09')
        baseRtp = (6 / 10) * (5 / 9) * (4 / 8) * 5;
    if (id === 'T11') {
        safety = CASHOUT_SAFETY.map(p => weightedChance(p, luck));
        baseRtp = Math.max(...safety.map((_, i) => safety.slice(0, i + 1).reduce((s, p) => s * p, 1) * Number(CASHOUT_REWARDS.slice(0, i + 1).reduce((s, p) => s + p, 0n)) / Number(def.price)));
    }
    if (id === 'T13') {
        winChance = weightedChance(DRAGON_EYE_TICKET_CHANCE, luck);
        baseRtp = winChance / 3 * 10;
    }
    if (id === 'T17')
        baseRtp = .2 ** 3 * 100;
    if (id === 'T18')
        baseRtp = DESTINY_POOL.heaven * 100;
    return { factor, winChance, tiers, safety, bonusBps, rtp: baseRtp * bonusBps / 10000 };
}
/** Scale all applicable money/probability gains together; never reduce base luck.
 * Every blind cashout policy and every card retain <=98% theoretical cash RTP.
 * Choice boards and T18's devil probability are deliberately untouched. */
export function growthModel(id, levels) {
    readLevels(levels);
    cardDefinition(id);
    const key = id + ':' + TECHS.map(t => levels[t]).join(',');
    const cached = modelCache.get(key);
    if (cached)
        return cached;
    // Release the available RTP headroom gradually. Mid and max upgrades remain
    // distinct instead of every early upgrade immediately hitting the final cap.
    const applicable = [];
    if (BASE_WIN_CHANCE[id] !== undefined || ['T01', 'T11', 'T13', 'T14'].includes(id))
        applicable.push('luck');
    if (['T01', 'T14'].includes(id))
        applicable.push('jackpot');
    if (Number(id.slice(1)) < 15)
        applicable.push('bonus');
    const base = modelAt(id, zeroLevels(), 0).rtp;
    const progress = applicable.length ? applicable.reduce((s, t) => s + levels[t], 0) / (10 * applicable.length) : 0;
    const limit = base + (.98 - base) * progress;
    const full = modelAt(id, levels, 1);
    if (full.rtp <= limit) {
        modelCache.set(key, full);
        return full;
    }
    let low = 0, high = 1;
    for (let i = 0; i < 40; i++) {
        const mid = (low + high) / 2;
        if (modelAt(id, levels, mid).rtp <= limit)
            low = mid;
        else
            high = mid;
    }
    const result = modelAt(id, levels, low);
    modelCache.set(key, result);
    return result;
}
export function boostedPrize(prize, id, levels, roll = 1) {
    if (!levels)
        return prize;
    const scaled = prize * BigInt(growthModel(id, levels).bonusBps);
    return scaled / 10000n + (roll < Number(scaled % 10000n) / 10000 ? 1n : 0n);
}
export function scratchTool(level) {
    if (!Number.isInteger(level) || level < 0 || level > 10)
        throw new Error('刮擦等级无效');
    return { name: level >= 9 ? '神币' : level >= 6 ? '金币' : level >= 3 ? '银币' : '铜币', width: 30 * Math.sqrt(1 + .15 * level), area: 1 + .15 * level };
}
