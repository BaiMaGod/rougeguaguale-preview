import { cloneTicket } from './rules.js';
import { copyBuild, shopPrice } from './build.js';
export const ITEMS = [
    { id: 'I01', name: '冷风瓶', description: '压力降低 1（压力为 0 时不可使用）', price: 3, icon: '❄' },
    { id: 'I02', name: '显影液', description: '本张票免费显影机会 +2', price: 3, icon: '👁' },
    { id: 'I03', name: '新刮片', description: '本张票常规刮力 +1（常规总量上限 12）', price: 4, icon: '✂' },
    { id: 'I04', name: '透光尺', description: '选一整行，免费显影该行所有未激活格子', price: 5, icon: '▤' },
    { id: 'I05', name: '彩墨补充包', description: '指定一种自然符号，本票所有该符号基础分 +6', price: 4, icon: '✿' },
    { id: 'I06', name: '铜铃绳', description: '本张票倍率 M +0.30', price: 4, icon: '♫' },
    { id: 'I07', name: '烫金缎带', description: '本张票正常结算独立倍率 X ×1.25', price: 5, icon: '✦' },
    { id: 'I08', name: '活字镊子', description: '交换两个已激活的非墨团格子', price: 3, icon: '↔' },
    { id: 'I09', name: '批注贴纸', description: '指定显影一格，之后刮开该自然符号 B +12', price: 3, icon: '✎' },
    { id: 'I10', name: '防污布', description: '下一枚激活墨团的压力增量 -1', price: 4, icon: '▧' },
    { id: 'I11', name: '隔热手套', description: '此后追加刮开的 M 代价减半', price: 4, icon: '♧' },
    { id: 'I12', name: '复写纸', description: '下一枚激活自然符号获得一次自身基础分回声', price: 4, icon: '❖' }
];
export function itemDef(id) {
    const found = ITEMS.find(v => v.id === id);
    if (!found)
        throw new Error('不存在的道具 ' + id);
    return found;
}
export function itemOffer(seed, round) {
    let h = 2166136261 >>> 0;
    for (const c of seed + ':tools:' + round) {
        h ^= c.charCodeAt(0);
        h = Math.imul(h, 16777619);
    }
    return ITEMS[(h >>> 0) % ITEMS.length].id;
}
export function buyItem(build, id) {
    const def = itemDef(id);
    if ((build.items ?? []).length >= 2)
        throw new Error('背包已满（最多2件）');
    const cost = shopPrice(build, def.price);
    if (build.copper < cost)
        throw new Error('铜券不足');
    const b = copyBuild(build);
    b.copper -= cost;
    if (cost !== def.price)
        b.shopDiscountUsed = true;
    b.items.push(id);
    return b;
}
export function isTargetedItem(id) { return ['I04', 'I05', 'I08', 'I09'].includes(id); }
export function canUseItem(ticket, id) {
    if (ticket.status !== 'active' || ticket.settled || ((ticket.itemsUsed ?? 0) >= 2))
        return false;
    if (id === 'I01')
        return ticket.pressure > 0;
    if (id === 'I02')
        return ticket.cells.some(c => c.state === 'hidden') || ticket.cells.some(c => c.state === 'scouted');
    if (id === 'I04')
        return ticket.cells.some(c => c.state !== 'active');
    if (id === 'I05')
        return true;
    if (id === 'I08')
        return ticket.cells.filter(c => c.state === 'active' && c.symbol !== 'ink').length >= 2;
    if (id === 'I09')
        return ticket.cells.some(c => c.state === 'hidden');
    if (id === 'I10')
        return !ticket.inkGuard;
    if (id === 'I11')
        return !ticket.extraDiscount;
    if (id === 'I12')
        return !ticket.echoPending;
    if (id === 'I03') {
        const normalUsed = ticket.activatedOrder.length - ticket.extraUsed;
        return normalUsed + ticket.regularRemaining < 12;
    }
    return true;
}
export function useItem(build, ticket, id, target = {}) {
    itemDef(id);
    if (!(build.items ?? []).includes(id))
        throw new Error('背包没有该道具');
    if (!canUseItem(ticket, id))
        throw new Error('当前状态无法使用此道具');
    // Validate targets before spending currency or inventory; invalid interaction is a no-op.
    if (id === 'I04' && (!Number.isInteger(target.row) || target.row === undefined || target.row < 0 || target.row > 3 ||
        !ticket.cells.some(c => Math.floor(c.index / 4) === target.row && c.state !== 'active')))
        throw new Error('请选择可以显影的行');
    if (id === 'I05' && (!target.symbol || !['star', 'bell', 'leaf', 'gear', 'gem', 'key', 'spark', 'sun', 'moon', 'vault'].includes(target.symbol)))
        throw new Error('请指定自然符号');
    if (id === 'I08' && (!Number.isInteger(target.cell) || !Number.isInteger(target.second) ||
        target.cell === target.second || ![target.cell, target.second].every(i => {
        const cell = ticket.cells[i];
        return cell?.state === 'active' && cell.symbol !== 'ink';
    })))
        throw new Error('请选择两个不同的已激活非墨团格子');
    if (id === 'I09' && (!Number.isInteger(target.cell) || ticket.cells[target.cell]?.state !== 'hidden'))
        throw new Error('请指定一个尚未显影的格子');
    const next = cloneTicket(ticket), b = copyBuild(build);
    b.items.splice(b.items.indexOf(id), 1);
    next.itemsUsed = (next.itemsUsed ?? 0) + 1;
    switch (id) {
        case 'I01':
            next.pressure = Math.max(0, next.pressure - 1);
            break;
        case 'I02':
            next.scoutRemaining += 2;
            break;
        case 'I03':
            next.regularRemaining++;
            break;
        case 'I04':
            for (const cell of next.cells) {
                if (Math.floor(cell.index / 4) === target.row && cell.state === 'hidden')
                    cell.state = 'scouted';
            }
            break;
        case 'I05':
            next.inkColor = target.symbol;
            break;
        case 'I06':
            next.itemMultiplier = (next.itemMultiplier ?? 0) + .30;
            break;
        case 'I07':
            next.itemIndependent = (next.itemIndependent ?? 1) * 1.25;
            break;
        case 'I08': {
            const one = next.cells[target.cell], two = next.cells[target.second];
            [one.symbol, two.symbol] = [two.symbol, one.symbol];
            break;
        }
        case 'I09':
            next.cells[target.cell].state = 'scouted';
            next.annotatedCell = target.cell;
            break;
        case 'I10':
            next.inkGuard = true;
            break;
        case 'I11':
            next.extraDiscount = true;
            break;
        case 'I12':
            next.echoPending = true;
            break;
    }
    return { build: b, ticket: next };
}
