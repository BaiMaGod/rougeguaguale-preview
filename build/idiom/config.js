const rows = [
    ['T01', '一五一十', 2n, 10n, 'amount', '刮出5得5元，刮出10得10元', '在大银层上来回刮擦', '#e5b46f', 1],
    ['T02', '两全其美', 10n, 30n, 'pair', '3格中任意两个相同图案即中奖', '任意顺序刮开，配对只领一次', '#f4aa9b', 3],
    ['T03', '三七二十一', 30n, 120n, 'multiply', '两个数字相乘等于21即中奖', '刮开左右数字，自动显示乘积', '#a6ccbb', 2],
    ['T04', '一较高下', 100n, 500n, 'compare', '我方数字大于对手数字即中奖', '相同数字不中奖', '#a9bbeb', 2],
    ['T05', '步步高升', 300n, 1500n, 'rise', '从左到右3个数字严格递增即中奖', '相等也不算递增', '#80cfc0', 3],
    ['T06', '积少成多', 1000n, 5000n, 'sum', '4笔金额相加达到100即中奖', '累计额只用于判定，中奖领5千', '#e6bd76', 4],
    ['T07', '六六大顺', 3000n, 16666n, 'dice', '两颗骰子都出现6即中奖', '刮出两颗六点骰子', '#e6a49d', 2],
    ['T08', '七上八下', 10000n, 50000n, 'position', '上方是7、下方是8即中奖', '上8下7不中奖', '#afbaea', 2],
    ['T09', '十拿九稳', 30000n, 150000n, 'mines', '连续选出3个安全格即中奖', '10格有4枚雷，踩雷本票失败', '#afca8f', 10],
    ['T10', '四通八达', 100000n, 500000n, 'path', '刮出从起点到宝箱的连通道路即中奖', '刮开地图，寻找上下左右连通的道路', '#88c7b9', 9],
    ['T11', '见好就收', 300000n, 3000000n, 'cashout', '逐格累计奖金，踩雷前收手即可领取', '按顺序刮，炸弹只清空本票累计额', '#edb782', 6],
    ['T12', '一举两得', 500000n, 5000000n, 'double', '刮中同领区，同时领取两笔奖金', '两箱奖金相加，同领只结算一次', '#e6c275', 3],
    ['T13', '画龙点睛', 1000000n, 10000000n, 'eye', '从3只眼睛选中真正的龙眼即中奖', '只可选一只眼睛，本票可能没有真龙眼', '#b4d296', 3],
    ['T14', '一本万利', 2000000n, 20000000n, 'ledger', '账簿累计达到300万即中奖', '300万领400万，600万领800万，1000万领2000万', '#e4c784', 6],
    ['T15', '一心一亿', 5000000n, 100000000n, 'heart', '刮出金色真心，获得1亿元', '金色真心为头奖，普通心无奖', '#eea7b7', 1],
    ['T16', '三心二亿', 10000000n, 200000000n, 'hearts', '三颗都是真心，获得2亿元', '必须三颗全为金色真心', '#e89fae', 3],
    ['T17', '一步登天', 100000000n, 10000000000n, 'ladder', '每层选1门，连续通过3层获得100亿元', '3层各5选1，中途选错本票失败', '#d7c8f5', 15],
    ['T18', '一念天堂', 10000000000n, 1000000000000n, 'destiny', '选1门：天堂得1万亿，恶魔清空本局现金', '凡间无奖；永久科技与历史图鉴保留', '#eeaa83', 3],
];
export const CARDS = rows.map(([id, name, price, headlinePrize, mode, rule, hint, color, cells]) => Object.freeze({ id: id, name, price, headlinePrize, mode, rule, hint, color, cells, automationAllowedByDefault: id !== 'T18', prizeTableVersion: 'v3.1-base-draft-1' }));
export function cardDefinition(id) {
    const card = CARDS.find(c => c.id === id);
    if (!card)
        throw new Error('未知卡种：' + id);
    return card;
}
export function formatMoney(amount) {
    const negative = amount < 0n;
    const value = negative ? -amount : amount;
    for (const [unit, label] of [[1000000000000n, '万亿'], [100000000n, '亿'], [10000n, '万']]) {
        if (value >= unit) {
            const whole = value / unit;
            const fraction = (value % unit) * 100n / unit;
            return (negative ? '-' : '') + whole + (fraction ? '.' + fraction.toString().padStart(2, '0').replace(/0+$/, '') : '') + label;
        }
    }
    return amount.toLocaleString('zh-CN');
}
/** Provisional base pools, separated from reveal/choice logic for later growth. */
export const BASE_WIN_CHANCE = Object.freeze({
    T02: .28, T03: .21, T04: .17, T05: .17, T06: .17, T07: .15, T08: .17, T10: .17, T12: .08, T15: .04, T16: .04,
});
export const AMOUNT_POOL = Object.freeze([{ chance: .22, prize: 5n }, { chance: .07, prize: 10n }]);
export const CASHOUT_SAFETY = Object.freeze([.82, .72, .55, .4, .3, .2]);
export const CASHOUT_REWARDS = Object.freeze([100000n, 150000n, 250000n, 500000n, 750000n, 1250000n]);
export const DRAGON_EYE_TICKET_CHANCE = .24;
export const LEDGER_POOL = Object.freeze([{ chance: .25, target: 3000000, prize: 4000000n }, { chance: .06, target: 6000000, prize: 8000000n }, { chance: .01, target: 10000000, prize: 20000000n }]);
export const DESTINY_POOL = Object.freeze({ heaven: .006, devil: .15 });
export const DRAFT_PROBABILITIES = {
    T01: '5元22% · 10元7%', T02: '配对28%', T03: '乘积21：21%', T04: '我方较大17%',
    T05: '严格递增17%', T06: '达标17%', T07: '双6：15%', T08: '上7下8：17%',
    T09: '4雷6安全；连选3安全约16.67%', T10: '全图连通17%',
    T11: '每步条件安全率82% / 72% / 55% / 40% / 30% / 20%',
    T12: '同领8%', T13: '本票有真眼24%；选中概率8%',
    T14: '400万25% · 800万6% · 2000万1%', T15: '金心4%', T16: '三金心4%',
    T17: '每层5选1；登顶0.8%', T18: '每门天堂0.6% · 恶魔15% · 凡间84.4%',
};
