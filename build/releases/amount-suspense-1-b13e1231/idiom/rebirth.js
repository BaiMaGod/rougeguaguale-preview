import { newGame, serializeGame } from './wallet.js';
import { addRebirthPoints } from './growth.js';
import { rebirthGain } from './rebirth-state.js';
import { offerDraft } from './run-build.js';
export function runPlayed(s) { return Object.values(s.runStats).reduce((sum, x) => sum + x.played, 0); }
export function chooseRunBoost(s, id) {
    const b = s.runBuild, p = b.pending;
    if (!p)
        throw new Error('没有待选择的强化');
    if (id !== null && (!p.options.includes(id) || b.stocks.some(x => x.id === id)))
        throw new Error('请选择当前三个候选之一');
    const next = { ...b, claimed: [...b.claimed, p.event], choices: [...b.choices, id], pending: null, stocks: id ? [...b.stocks, { id, used: 0 }] : b.stocks };
    return { ...s, runBuild: offerDraft(next, s.runSeed, s.peak, runPlayed(s)) };
}
export function rebirthPreview(s) {
    const played = runPlayed(s), reward = rebirthGain(s.rebirth, s.unlockedCount, s.peak);
    const eligible = s.unlockedCount >= 4 && s.peak >= 1000n && played >= 12;
    return { eligible, canConfirm: eligible && !s.machine.running, played, gain: reward.gain, first: reward.first, token: serializeGame(s),
        unclaimed: !!s.active && !s.active.settled, reason: eligible ? s.machine.running ? '先暂停机器，再确认改命' : '可以改命重开' : '条件：本局解锁第4阶、现金峰值1000元、结算12张票' };
}
export function performRebirth(s, expectedToken) {
    const q = rebirthPreview(s);
    if (!q.canConfirm)
        throw new Error(q.reason);
    if (q.token !== expectedToken)
        throw new Error('转生预览已变化，请重新查看并确认');
    const r = s.rebirth, count = r.count + 1;
    if (!Number.isSafeInteger(count))
        throw new Error('转生次数已达上限');
    const fresh = newGame(s.runSeed.slice(0, 130) + ':rebirth:' + count);
    const receipt = { seed: s.runSeed, tier: s.unlockedCount, peak: s.peak, gain: q.gain, cash: s.cash, machineLevel: s.machine.level, discarded: q.unclaimed ? s.active.nonce : null };
    return { ...fresh, progression: addRebirthPoints(s.progression, q.gain), stats: s.stats, history: s.history, lastRecovery: s.lastRecovery,
        rebirth: { ...r, count, totalPoints: r.totalPoints + q.gain, claimed: [...r.claimed, ...q.first], bestTier: Math.max(r.bestTier, s.unlockedCount), bestPeak: r.bestPeak > s.peak ? r.bestPeak : s.peak, records: [receipt, ...r.records].slice(0, 50) } };
}
