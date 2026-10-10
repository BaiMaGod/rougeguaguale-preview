import { CARDS, cardDefinition } from './config.js';
import { createIdiomTicket } from './generator.js';
import { cashOut, chooseCell, revealCell, resolveTicket, resolveBaseTicket } from './resolver.js';
import { newProgression, awardMilestones, restoreProgression, upgradeProgression } from './growth.js';
import { newMachine, restoreMachine } from './machine-state.js';
import { newRunBuild, restoreRunBuild, offerDraft, spendBoost, DRAFT_EVENTS } from './run-build.js';
import { newRebirth, restoreRebirth } from './rebirth-state.js';
export const SAVE_KEY = 'idiom-run-v31-base';
export const LEGACY_KEY = 'foil-run-v4';
export function newGame(seed) {
    return { version: 34, runSeed: seed, cash: 60n, peak: 60n, bought: 0, unlockedCount: 1, active: null, stats: {}, runStats: {}, runBuild: newRunBuild(), rebirth: newRebirth(), history: [], lastRecovery: 0, recoveryCount: 0, machine: newMachine(),
        progression: awardMilestones(newProgression(), 1, 60n, {}) };
}
export function upgradeTech(state, tech) {
    return { ...state, progression: upgradeProgression(state.progression, tech) };
}
function unlock(state) {
    let count = state.unlockedCount;
    while (count < CARDS.length && (state.runStats[CARDS[count - 1].id]?.played ?? 0) >= 3 && state.peak >= CARDS[count].price * 2n)
        count++;
    return { ...state, unlockedCount: count };
}
export function purchaseTicket(state, id, confirmRisk = false, actor = 'manual') {
    if (actor === 'manual' && (state.machine.running || state.machine.job))
        throw new Error('先暂停并完成机器票，再手动买票');
    if (state.runBuild.pending)
        throw new Error('先选择或跳过本局三选一强化');
    const def = cardDefinition(id);
    if (actor === 'machine' && !def.automationAllowedByDefault)
        throw new Error('一念天堂禁止自动处理');
    if (state.active && !state.active.settled)
        throw new Error('请先完成并领取当前票');
    if (CARDS.indexOf(def) >= state.unlockedCount)
        throw new Error('这张卡尚未解锁');
    if (state.cash < def.price)
        throw new Error('现金不足，可以先刮低价卡');
    if (id === 'T18' && !confirmRisk)
        throw new Error('购买前需确认恶魔破产风险');
    const bought = state.bought + 1, nonce = state.runSeed + ':' + bought;
    const levels = state.progression.levels;
    const boost = spendBoost(state.runBuild, id, actor === 'manual');
    const active = createIdiomTicket(id, nonce + ':' + id, nonce, Object.values(levels).some(l => l > 0) ? levels : undefined, boost.boost);
    return { ...state, bought, cash: state.cash - def.price, active, runBuild: boost.build };
}
export function startScratch(state, index) {
    if (state.machine.job)
        throw new Error('当前票正在由机器处理');
    if (!state.active)
        throw new Error('请先购买一张票');
    return { ...state, active: chooseCell(state.active, index) };
}
export function scratchCell(state, index) {
    if (state.machine.job)
        throw new Error('当前票正在由机器处理');
    if (!state.active)
        throw new Error('请先购买一张票');
    return { ...state, active: revealCell(state.active, index) };
}
export function stopAndCollect(state) {
    if (!state.active)
        throw new Error('没有可收手的票');
    return settleActive({ ...state, active: cashOut(state.active) });
}
export function settleActive(state, actor = 'manual') {
    if (state.machine.job && actor === 'manual')
        throw new Error('请在机器界面领取当前票');
    const t = state.active;
    if (!t || t.settled)
        return state;
    if (actor === 'machine' && !cardDefinition(t.cardId).automationAllowedByDefault)
        throw new Error('一念天堂禁止自动处理');
    const resolution = resolveTicket(t);
    if (resolution.status === 'playing')
        throw new Error('这张票还未完成');
    const previous = state.stats[t.cardId] ?? { played: 0, won: 0, best: 0n };
    const runPrevious = state.runStats[t.cardId] ?? { played: 0, won: 0, best: 0n };
    const basePrize = resolveBaseTicket(t).prize;
    const stats = { ...state.stats, [t.cardId]: { played: previous.played + 1, won: previous.won + (resolution.prize > 0n ? 1 : 0), best: resolution.prize > previous.best ? resolution.prize : previous.best,
            bestBase: basePrize > (previous.bestBase ?? previous.best) ? basePrize : (previous.bestBase ?? previous.best) } };
    const cash = resolution.status === 'bankrupt' ? 0n : state.cash + resolution.prize;
    const runStats = { ...state.runStats, [t.cardId]: { played: runPrevious.played + 1, won: runPrevious.won + (resolution.prize > 0n ? 1 : 0), best: resolution.prize > runPrevious.best ? resolution.prize : runPrevious.best,
            bestBase: basePrize > (runPrevious.bestBase ?? runPrevious.best) ? basePrize : (runPrevious.bestBase ?? runPrevious.best) } };
    // One immutable snapshot contains both receipt and balance. Replays cannot pay twice.
    const next = unlock({ ...state, cash, peak: cash > state.peak ? cash : state.peak, stats, runStats, active: { ...t, settled: true },
        history: [{ nonce: t.nonce, cardId: t.cardId, prize: resolution.prize, status: resolution.status }, ...state.history].slice(0, 100) });
    const build = { ...state.runBuild, speedCredits: state.runBuild.speedCredits + (actor === 'manual' && t.boost === 'hands' ? 1 : 0) };
    return { ...next, runBuild: offerDraft(build, state.runSeed, next.peak, Object.values(runStats).reduce((sum, s) => sum + s.played, 0)), ...(resolution.status === 'bankrupt' ? { machine: { ...state.machine, running: false, message: '恶魔降临，机器已暂停，永久成长保留' } } : {}), progression: awardMilestones(next.progression, next.unlockedCount, next.peak, Object.fromEntries(Object.entries(stats).map(([id, s]) => [id, { won: s.won, best: s.bestBase ?? s.best }]))) };
}
export function recoveryCash(state, now) {
    if (state.cash >= 2n || state.active && !state.active.settled)
        throw new Error('现金不足2元且没有待刮票时，可领取恢复金');
    if (state.lastRecovery && now - state.lastRecovery < 60000)
        throw new Error('恢复金每60秒可领取一次');
    return { ...state, cash: 20n, lastRecovery: now, recoveryCount: state.recoveryCount + 1 };
}
export function serializeGame(state) {
    return JSON.stringify(state, (_key, value) => typeof value === 'bigint' ? value.toString() : value);
}
function amount(value) {
    if (typeof value !== 'string' || !/^\d+$/.test(value) || value.length > 60)
        throw new Error('存档金额无效');
    return BigInt(value);
}
function count(value) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
        throw new Error('存档计数无效');
    return value;
}
export function restoreGame(raw) {
    const saved = JSON.parse(raw);
    if (![31, 32, 33, 34].includes(saved.version) || typeof saved.runSeed !== 'string' || saved.runSeed.length > 200)
        throw new Error('存档版本不兼容');
    const fresh = newGame(saved.runSeed), cash = amount(saved.cash), peak = amount(saved.peak);
    if (peak < cash)
        throw new Error('历史金额无效');
    const unlockedCount = count(saved.unlockedCount);
    if (unlockedCount < 1 || unlockedCount > 18)
        throw new Error('解锁进度无效');
    const stats = {};
    for (const [id, data] of Object.entries(saved.stats ?? {})) {
        cardDefinition(id);
        const s = data;
        const played = count(s.played), won = count(s.won);
        if (won > played)
            throw new Error('中奖记录无效');
        stats[id] = { played, won, best: amount(s.best), ...(s.bestBase !== undefined ? { bestBase: amount(s.bestBase) } : {}) };
    }
    const history = (saved.history ?? []).map((r) => {
        cardDefinition(r.cardId);
        if (typeof r.nonce !== 'string' || !['won', 'lost', 'bankrupt'].includes(r.status))
            throw new Error('结算日志无效');
        return { ...r, prize: amount(r.prize) };
    });
    if (history.length > 100 || new Set(history.map(r => r.nonce)).size !== history.length)
        throw new Error('结算日志重复');
    const runStats = {};
    for (const [id, data] of Object.entries(saved.version === 34 ? saved.runStats : saved.stats ?? {})) {
        cardDefinition(id);
        const s = data, played = count(s.played), won = count(s.won), best = amount(s.best);
        if (won > played || played > (stats[id]?.played ?? 0) || won > (stats[id]?.won ?? 0) || best > (stats[id]?.best ?? 0n))
            throw new Error('本局卡种记录无效');
        runStats[id] = { played, won, best, ...(s.bestBase !== undefined ? { bestBase: amount(s.bestBase) } : {}) };
    }
    let active = null;
    if (saved.active) {
        const t = saved.active;
        cardDefinition(t.cardId);
        if (typeof t.nonce !== 'string' || typeof t.rngSeed !== 'string' || typeof t.settled !== 'boolean' || typeof t.cashout !== 'boolean')
            throw new Error('票据无效');
        if (saved.version === 31 && t.growth)
            throw new Error('旧版票据字段无效');
        if (saved.version < 34 && t.boost)
            throw new Error('旧版票据强化无效');
        active = createIdiomTicket(t.cardId, t.rngSeed, t.nonce, t.growth, t.boost);
        if (t.prizeTableVersion !== active.prizeTableVersion || t.bonusRoll !== active.bonusRoll || t.publicSafeIndex !== active.publicSafeIndex || JSON.stringify(t.committedLayout) !== JSON.stringify(active.committedLayout))
            throw new Error('开奖数据已损坏，原存档已保留');
        if (!Array.isArray(t.revealed) || !Array.isArray(t.choices) || new Set(t.revealed).size !== t.revealed.length)
            throw new Error('揭晓记录无效');
        for (const index of t.revealed)
            active = revealCell(active, index);
        for (const index of t.choices)
            if (!active.revealed.includes(index))
                active = chooseCell(active, index);
        if (JSON.stringify(t.choices) !== JSON.stringify(active.choices))
            throw new Error('选择记录无效');
        if (t.cashout)
            active = cashOut(active);
        if (t.settled) {
            if (resolveTicket(active).status === 'playing' || !history.some(r => r.nonce === t.nonce))
                throw new Error('结算记录无效');
            active = { ...active, settled: true };
        }
    }
    const progression = saved.version >= 32 ? restoreProgression(saved.progression) : awardMilestones(newProgression(), unlockedCount, peak, stats);
    const rebirth = saved.version === 34 ? restoreRebirth(saved.rebirth) : { ...newRebirth(), bestTier: unlockedCount, bestPeak: peak, automationUnlocked: (saved.machine?.level ?? 0) >= 2 };
    if ((progression.rebirthEarned ?? 0) !== rebirth.totalPoints)
        throw new Error('永久与转生福运点账本不一致');
    const machine = saved.version >= 33 ? restoreMachine(saved.machine, active, unlockedCount, rebirth.automationUnlocked) : newMachine();
    if (machine.level >= 2 && !rebirth.automationUnlocked)
        throw new Error('永久自动化权限无效');
    const played = Object.values(runStats).reduce((sum, s) => sum + s.played, 0);
    if (saved.version === 34 && played > count(saved.bought))
        throw new Error('本局结算次数超过购票次数');
    const runBuild = saved.version === 34 ? restoreRunBuild(saved.runBuild, saved.runSeed) : offerDraft(newRunBuild(), saved.runSeed, peak, played);
    if (active?.boost && !runBuild.stocks.some(s => s.id === active.boost && s.used > 0))
        throw new Error('票据强化未消耗次数');
    if (runBuild.claimed.some(id => played < 3 || peak < DRAFT_EVENTS.find(e => e.id === id).peak) || runBuild.stocks.reduce((n, s) => n + s.used, 0) > Math.max(0, count(saved.bought) - 3))
        throw new Error('强化触发或购票次数无效');
    if (runBuild.pending && (played < 3 || peak < (runBuild.pending.event === 'wealth:1000000' ? 1000000n : runBuild.pending.event === 'wealth:1000' ? 1000n : 0n)))
        throw new Error('三选一触发条件无效');
    return { ...fresh, cash, peak, bought: count(saved.bought), unlockedCount, stats, runStats, runBuild, rebirth, history, active, progression, machine,
        lastRecovery: count(saved.lastRecovery), recoveryCount: count(saved.recoveryCount) };
}
/** Keep old data verbatim. A corrupt V3.1 save must never be overwritten silently. */
export function loadGame(storage, seed) {
    const legacy = storage.getItem(LEGACY_KEY);
    if (legacy && !storage.getItem('idiom-legacy-v4-backup'))
        storage.setItem('idiom-legacy-v4-backup', legacy);
    const raw = storage.getItem(SAVE_KEY);
    if (raw && JSON.parse(raw).version === 31 && !storage.getItem('idiom-v31-base-backup'))
        storage.setItem('idiom-v31-base-backup', raw);
    if (raw && JSON.parse(raw).version === 32 && !storage.getItem('idiom-v32-growth-backup'))
        storage.setItem('idiom-v32-growth-backup', raw);
    if (raw && JSON.parse(raw).version === 33 && !storage.getItem('idiom-v33-machine-backup'))
        storage.setItem('idiom-v33-machine-backup', raw);
    return { state: raw ? restoreGame(raw) : newGame(seed), legacy: !!legacy };
}
