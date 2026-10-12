import { cardDefinition } from './config.js';
import { seededRandom } from './random.js';
export const RUN_BOOST_VERSION = 'v3.1-run-boost-1';
export const BOOSTS = [
    { id: 'lucky', name: '幸运数字', card: 'T04', description: '下3张一较高下，我方数字在开票时+2。' },
    { id: 'rise', name: '连升三级', card: 'T05', description: '下3张步步高升，递增中奖奖金翻倍，每票最多3000元。' },
    { id: 'hint', name: '排雷专家', card: 'T09', description: '下3张十拿九稳，公开一格安全提示；仍需亲自选出3格。' },
    { id: 'guard', name: '保命符', card: 'T11', description: '下3张见好就收，首次踩雷保住此前累计奖金并结束本票。' },
    { id: 'hands', name: '双手开工', card: 'low', description: '下3张T01–T08手刮票完成后，各获得一次500毫秒机器加速。' },
];
export const DRAFT_EVENTS = [{ id: 'start', name: '开工三票', peak: 0n }, { id: 'wealth:1000', name: '千元工坊', peak: 1000n }, { id: 'wealth:1000000', name: '百万工坊', peak: 1000000n }];
export function newRunBuild() { return { stocks: [], claimed: [], choices: [], pending: null, speedCredits: 0 }; }
export function boostInfo(id) { const info = BOOSTS.find(b => b.id === id); if (!info)
    throw new Error('未知本局强化'); return info; }
export function validBoost(id, cardId) {
    cardDefinition(cardId);
    const info = boostInfo(id);
    if (cardId === 'T18' || (info.card === 'low' ? Number(cardId.slice(1)) > 8 : info.card !== cardId))
        throw new Error('本局强化不适用于该票');
    return info.id;
}
export function draftOptions(seed, event, owned) {
    const pool = (event === 'start' ? ['hands', 'lucky', 'rise'] : BOOSTS.map(b => b.id)).filter(id => !owned.includes(id));
    const rng = seededRandom(seed + ':draft:' + event);
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    if (pool.length < 3)
        throw new Error('强化候选不足');
    return pool.slice(0, 3);
}
export function offerDraft(b, seed, peak, played) {
    if (b.pending || played < 3)
        return b;
    const event = DRAFT_EVENTS.find(e => peak >= e.peak && !b.claimed.includes(e.id));
    return event ? { ...b, pending: { event: event.id, options: draftOptions(seed, event.id, b.stocks.map(s => s.id)) } } : b;
}
export function spendBoost(b, cardId, manual = true) {
    const stock = [...b.stocks.filter(s => s.id !== 'hands'), ...b.stocks.filter(s => s.id === 'hands' && manual)].find(s => s.used < 3 && (boostInfo(s.id).card === cardId || s.id === 'hands' && Number(cardId.slice(1)) <= 8));
    if (!stock)
        return { build: b };
    return { build: { ...b, stocks: b.stocks.map(s => s.id === stock.id ? { ...s, used: s.used + 1 } : s) }, boost: stock.id };
}
export function publicSafeIndex(t) { return t.boost === 'hint' ? t.publicSafeIndex : undefined; }
export function restoreRunBuild(value, seed) {
    const b = value;
    if (!b || !Array.isArray(b.stocks) || b.stocks.length > 3 || !Array.isArray(b.claimed) || b.claimed.length > 3 || new Set(b.claimed).size !== b.claimed.length || !Number.isInteger(b.speedCredits) || b.speedCredits < 0 || b.speedCredits > 3)
        throw new Error('本局强化存档无效');
    if (b.claimed.some((id, i) => id !== DRAFT_EVENTS[i].id) || new Set(b.stocks.map(s => s.id)).size !== b.stocks.length || b.stocks.length > b.claimed.length || !Array.isArray(b.choices) || b.choices.length !== b.claimed.length)
        throw new Error('强化选择记录无效');
    const selected = [];
    for (const [i, id] of b.choices.entries()) {
        if (id !== null) {
            if (!draftOptions(seed, b.claimed[i], selected).includes(id))
                throw new Error('强化选择不在候选中');
            selected.push(id);
        }
    }
    if (JSON.stringify(selected) !== JSON.stringify(b.stocks.map(s => s.id)))
        throw new Error('强化库存记录不一致');
    const stocks = b.stocks.map(s => { boostInfo(s.id); if (!Number.isInteger(s.used) || s.used < 0 || s.used > 3)
        throw new Error('强化次数无效'); return { id: s.id, used: s.used }; });
    if (b.speedCredits > (stocks.find(s => s.id === 'hands')?.used ?? 0))
        throw new Error('机器加速次数无效');
    let pending = null;
    if (b.pending) {
        const event = DRAFT_EVENTS[b.claimed.length];
        if (!event || b.pending.event !== event.id || JSON.stringify(b.pending.options) !== JSON.stringify(draftOptions(seed, event.id, stocks.map(s => s.id))))
            throw new Error('三选一候选已损坏');
        pending = { event: event.id, options: [...b.pending.options] };
    }
    return { stocks, claimed: [...b.claimed], choices: [...b.choices], pending, speedCredits: b.speedCredits };
}
