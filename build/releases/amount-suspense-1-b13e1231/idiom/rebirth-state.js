export const REBIRTH_BASE = 2;
export const REBIRTH_BONUSES = [
    ...[4, 6, 9, 12, 15, 18].map((tier, i) => ({ id: 'tier:' + tier, tier, peak: 0n, points: [4, 6, 8, 10, 12, 16][i], name: '最高卡阶 ' + tier })),
    ...[1000n, 10000n, 1000000n, 1000000000n, 1000000000000n].map((peak, i) => ({ id: 'peak:' + peak, tier: 0, peak, points: [2, 3, 5, 8, 12][i], name: '现金峰值 ' + peak + '元' })),
];
export function newRebirth() { return { count: 0, totalPoints: 0, claimed: [], bestTier: 1, bestPeak: 60n, automationUnlocked: false, records: [] }; }
export function rebirthGain(r, tier, peak) {
    const first = REBIRTH_BONUSES.filter(b => !r.claimed.includes(b.id) && tier >= b.tier && peak >= b.peak).map(b => b.id);
    return { gain: REBIRTH_BASE + first.reduce((sum, id) => sum + REBIRTH_BONUSES.find(b => b.id === id).points, 0), first };
}
export function restoreRebirth(value) {
    const r = value, integer = (n) => Number.isSafeInteger(n) && n >= 0, amount = (v) => { if (typeof v !== 'string' || !/^\d{1,60}$/.test(v))
        throw new Error('转生金额无效'); return BigInt(v); };
    if (!r || !integer(r.count) || !integer(r.totalPoints) || !integer(r.bestTier) || r.bestTier < 1 || r.bestTier > 18 || typeof r.automationUnlocked !== 'boolean' || !Array.isArray(r.claimed) || new Set(r.claimed).size !== r.claimed.length)
        throw new Error('转生账本无效');
    let total = r.count * REBIRTH_BASE;
    for (const id of r.claimed) {
        const b = REBIRTH_BONUSES.find(b => b.id === id);
        if (!b || r.count === 0)
            throw new Error('转生奖励记录无效');
        total += b.points;
    }
    if (total !== r.totalPoints || !Number.isSafeInteger(total) || !Array.isArray(r.records) || r.records.length !== Math.min(r.count, 50) || new Set(r.records.map(x => x.seed)).size !== r.records.length)
        throw new Error('转生奖励账本不平');
    const bestPeak = amount(r.bestPeak), records = r.records.map(x => { if (typeof x.seed !== 'string' || x.seed.length > 200 || !integer(x.tier) || x.tier < 4 || x.tier > 18 || !integer(x.gain) || x.gain < 2 || !integer(x.machineLevel) || x.machineLevel > 4 || x.discarded !== null && typeof x.discarded !== 'string')
        throw new Error('转生记录无效'); const peak = amount(x.peak), cash = amount(x.cash); if (peak < 1000n || peak < cash || peak > bestPeak || x.tier > r.bestTier)
        throw new Error('转生进度无效'); return { ...x, peak, cash }; });
    const recorded = records.reduce((sum, x) => sum + x.gain, 0);
    if (recorded > total || r.count <= 50 && recorded !== total || r.claimed.some(id => { const b = REBIRTH_BONUSES.find(b => b.id === id); return b.tier > r.bestTier || b.peak > bestPeak; }))
        throw new Error('转生收益无效');
    return { count: r.count, totalPoints: r.totalPoints, claimed: [...r.claimed], bestTier: r.bestTier, bestPeak, automationUnlocked: r.automationUnlocked, records };
}
