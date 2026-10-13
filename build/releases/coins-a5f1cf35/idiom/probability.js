import { cardDefinition, formatMoney, amountPool, LEDGER_POOL, DESTINY_POOL } from './config.js';
import { growthModel, zeroLevels } from './growth.js';
export const formatProbability = (p) => (p * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
/** Public pool odds only; never inspect a ticket's committed result. Choice
 * cards use blind selection, and cashout cards name their stopping policy. */
export function ticketOdds(id, levels = zeroLevels(), version) {
    const m = growthModel(id, levels, version), mode = cardDefinition(id).mode;
    const pct = formatProbability;
    let winChance = m.winChance, summary = '', details = '';
    if (mode === 'amount' || mode === 'ledger') {
        const pool = mode === 'amount' ? amountPool(version) : LEDGER_POOL;
        details = pool.map((tier, i) => formatMoney(tier.prize) + '钱币 ' + pct(m.winChance * m.tiers[i])).join(' · ');
    }
    else if (mode === 'mines') {
        winChance = (6 / 10) * (5 / 9) * (4 / 8);
        details = '盲选3格全安全；安全提示强化另计';
    }
    else if (mode === 'eye') {
        winChance = m.winChance / 3;
        details = '3选1盲选 · 本票有真眼 ' + pct(m.winChance);
    }
    else if (mode === 'ladder') {
        winChance = (1 / 5) ** 3;
        details = '从下往上，每层5选1，连续通过3层';
    }
    else if (mode === 'destiny') {
        winChance = DESTINY_POOL.heaven;
        details = '恶魔 ' + pct(DESTINY_POOL.devil) + ' · 凡间 ' + pct(1 - DESTINY_POOL.heaven - DESTINY_POOL.devil);
    }
    else if (mode === 'cashout') {
        winChance = m.safety[0];
        summary = '首步收手 ' + pct(winChance);
        let survival = 1;
        details = '第1—6步收手：' + m.safety.map(p => { survival *= p; return pct(survival); }).join(' / ');
    }
    return { winChance, summary: summary || '中奖 ' + pct(winChance), details };
}
