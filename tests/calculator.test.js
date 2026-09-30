import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMortgage, formatTermValue, toTermMonths } from '../src/calculator.js';

test('零利率等额本息按分摊本金，末期结清', () => {
  const result = calculateMortgage({ principal: 1200, termMonths: 3, annualRate: 0, repaymentMethod: 'equal-payment' });
  assert.deepEqual(result.schedule.map(row => row.payment), [400, 400, 400]);
  assert.equal(result.totalInterest, 0);
  assert.equal(result.schedule.at(-1).remaining, 0);
});

test('等额本息按未还本金计算利息并在末期修正分位差', () => {
  const result = calculateMortgage({ principal: 1200, termMonths: 2, annualRate: 12, repaymentMethod: 'equal-payment' });
  assert.deepEqual(result.schedule.map(row => [row.principal, row.interest, row.payment]), [
    [597.01, 12, 609.01],
    [602.99, 6.03, 609.02]
  ]);
  assert.equal(result.totalInterest, 18.03);
});

test('等额本金的利息随余额减少', () => {
  const result = calculateMortgage({ principal: 1200, termMonths: 3, annualRate: 12, repaymentMethod: 'equal-principal' });
  assert.deepEqual(result.schedule.map(row => [row.principal, row.interest]), [[400, 12], [400, 8], [400, 4]]);
  assert.equal(result.totalInterest, 24);
});

test('年份自然换算为整月，非整月的年数报错', () => {
  assert.equal(toTermMonths('1.5', 'years'), 18);
  assert.equal(toTermMonths('25', 'months'), 25);
  assert.throws(() => toTermMonths('1.1', 'years'), /整月/);
});

test('月数切换成年数再切回时不丢失月份', () => {
  assert.equal(formatTermValue(25, 'years'), '2.08333333');
  assert.equal(toTermMonths(formatTermValue(25, 'years'), 'years'), 25);
  assert.equal(formatTermValue(25, 'months'), '25');
});

test('开始日期有日时逐月沿用日期并处理月末，无日时只显示年月', () => {
  const dated = calculateMortgage({ principal: 300, termMonths: 3, annualRate: 0, repaymentMethod: 'equal-payment', startDate: '2028-01-31' });
  assert.deepEqual(dated.schedule.map(row => row.date), ['2028-02-29', '2028-03-31', '2028-04-30']);
  const monthly = calculateMortgage({ principal: 200, termMonths: 2, annualRate: 0, repaymentMethod: 'equal-payment', startDate: '2028-01' });
  assert.deepEqual(monthly.schedule.map(row => row.date), ['2028-02', '2028-03']);
});

test('提前还款缩短期限时维持原月供并提前结清', () => {
  const result = calculateMortgage({
    principal: 1200, termMonths: 4, annualRate: 0, repaymentMethod: 'equal-payment', startDate: '2026-01',
    prepayments: [{ amount: 400, date: '2026-03-15', mode: 'reduce-term' }]
  });
  assert.deepEqual(result.schedule.map(row => [row.payment, row.prepayment, row.remaining]), [
    [300, 0, 900], [300, 400, 200], [200, 0, 0]
  ]);
  assert.equal(result.monthsSaved, 1);
});

test('提前还款降低月供时保留剩余期限', () => {
  const result = calculateMortgage({
    principal: 1200, termMonths: 4, annualRate: 0, repaymentMethod: 'equal-payment', startDate: '2026-01',
    prepayments: [{ amount: 400, date: '2026-03-15', mode: 'reduce-payment' }]
  });
  assert.deepEqual(result.schedule.map(row => [row.payment, row.prepayment]), [
    [300, 0], [300, 400], [100, 0], [100, 0]
  ]);
  assert.equal(result.monthsSaved, 0);
});

test('提前还款按所在月份排序，同月多笔依次处理', () => {
  const result = calculateMortgage({
    principal: 1000, termMonths: 4, annualRate: 0, repaymentMethod: 'equal-principal', startDate: '2026-01',
    prepayments: [
      { amount: 50, date: '2026-03-20', mode: 'reduce-payment' },
      { amount: 100, date: '2026-03-02', mode: 'reduce-term' }
    ]
  });
  assert.equal(result.schedule[1].prepayment, 150);
  assert.equal(result.schedule[1].remaining, 350);
  assert.deepEqual(result.schedule.slice(2).map(row => row.principal), [175, 175]);
});

test('提前还款必须成组填写且必须有开始日期', () => {
  const base = { principal: 1000, termMonths: 12, annualRate: 3, repaymentMethod: 'equal-payment' };
  assert.throws(() => calculateMortgage({ ...base, prepayments: [{ amount: 100, date: '2026-04-01', mode: 'reduce-term' }] }), /开始时间/);
  assert.throws(() => calculateMortgage({ ...base, startDate: '2026-01', prepayments: [{ amount: 100, date: '2026-04-01' }] }), /完整填写/);
  assert.throws(() => calculateMortgage({ ...base, startDate: '2026-01', prepayments: [{ amount: 100, mode: 'reduce-term' }] }), /完整填写/);
});

test('金额、日期与还款期限校验会拦住不可计算的输入', () => {
  const base = { principal: 1000, termMonths: 12, annualRate: 3, repaymentMethod: 'equal-payment', startDate: '2026-01' };
  assert.throws(() => calculateMortgage({ ...base, principal: 0 }), /贷款金额/);
  assert.throws(() => calculateMortgage({ ...base, termMonths: 0 }), /贷款期限/);
  assert.throws(() => calculateMortgage({ ...base, annualRate: -1 }), /年化利率/);
  assert.throws(() => calculateMortgage({ ...base, startDate: '2026-02-30' }), /开始时间/);
  assert.throws(() => calculateMortgage({ ...base, prepayments: [{ amount: 100, date: '2026-01-20', mode: 'reduce-term' }] }), /首期还款/);
});

test('超出余额的提前还款按实际余额扣减并提示后续未使用的计划', () => {
  const result = calculateMortgage({
    principal: 600, termMonths: 3, annualRate: 0, repaymentMethod: 'equal-payment', startDate: '2026-01',
    prepayments: [
      { amount: 999, date: '2026-02-10', mode: 'reduce-term' },
      { amount: 100, date: '2026-03-10', mode: 'reduce-term' }
    ]
  });
  assert.equal(result.schedule[0].prepayment, 400);
  assert.equal(result.schedule[0].remaining, 0);
  assert.equal(result.unusedPrepayments.length, 1);
});

test('提前还款后节省的利息与实际逐期支付金额一致', () => {
  const result = calculateMortgage({
    principal: 1200, termMonths: 3, annualRate: 12, repaymentMethod: 'equal-principal', startDate: '2026-01',
    prepayments: [{ amount: 200, date: '2026-02-10', mode: 'reduce-term' }]
  });
  assert.deepEqual(result.schedule.map(row => row.interest), [12, 6, 2]);
  assert.equal(result.totalInterest, 20);
  assert.equal(result.interestSaved, 4);
  assert.equal(result.totalPayment, 1220);
  assert.equal(result.schedule.reduce((sum, row) => sum + row.total, 0), 1220);
});

test('没有提前还款时不报告缩短的期限', () => {
  const result = calculateMortgage({ principal: 0.01, termMonths: 12, annualRate: 0, repaymentMethod: 'equal-payment' });
  assert.equal(result.monthsSaved, 0);
});

test('金额小于期数时提前还款后仍能结清剩余本金', () => {
  const result = calculateMortgage({
    principal: 0.03, termMonths: 12, annualRate: 0, repaymentMethod: 'equal-principal', startDate: '2026-01',
    prepayments: [{ amount: 0.01, date: '2026-02-10', mode: 'reduce-term' }]
  });
  assert.equal(result.schedule.at(-1).remaining, 0);
  assert.equal(result.schedule.reduce((sum, row) => sum + row.principal + row.prepayment, 0), 0.03);
});

test('等额本金从指定月份起使用新年化利率并持续生效', () => {
  const result = calculateMortgage({
    principal: 1200, termMonths: 3, annualRate: 12, repaymentMethod: 'equal-principal', startDate: '2026-01',
    rateChanges: [{ month: '2026-03', annualRate: 6 }]
  });
  assert.deepEqual(result.schedule.map(row => row.annualRate), [12, 6, 6]);
  assert.deepEqual(result.schedule.map(row => row.interest), [12, 4, 2]);
  assert.deepEqual(result.schedule.map(row => row.principal), [400, 400, 400]);
  assert.equal(result.totalInterest, 18);
});

test('等额本息在调息当期按剩余本金和期数重算月供', () => {
  const result = calculateMortgage({
    principal: 1200, termMonths: 3, annualRate: 0, repaymentMethod: 'equal-payment', startDate: '2026-01',
    rateChanges: [{ month: '2026-03', annualRate: 12 }]
  });
  assert.deepEqual(result.schedule.map(row => [row.payment, row.interest, row.remaining]), [
    [400, 0, 800], [406.01, 8, 401.99], [406.01, 4.02, 0]
  ]);
  assert.equal(result.totalInterest, 12.02);
});

test('多次调息按年月排序，开始月调息适用于首期', () => {
  const result = calculateMortgage({
    principal: 1200, termMonths: 3, annualRate: 0, repaymentMethod: 'equal-principal', startDate: '2026-01',
    rateChanges: [
      { month: '2026-04', annualRate: 6 },
      { month: '2026-01', annualRate: 12 }
    ]
  });
  assert.deepEqual(result.schedule.map(row => row.annualRate), [12, 12, 6]);
  assert.deepEqual(result.schedule.map(row => row.interest), [12, 8, 2]);
});

test('提前还款和调息同月时先按新利率计息，再扣提前还款', () => {
  const result = calculateMortgage({
    principal: 1200, termMonths: 3, annualRate: 12, repaymentMethod: 'equal-principal', startDate: '2026-01',
    rateChanges: [{ month: '2026-02', annualRate: 6 }],
    prepayments: [{ amount: 200, date: '2026-02-10', mode: 'reduce-term' }]
  });
  assert.deepEqual(result.schedule.map(row => row.interest), [6, 3, 1]);
  assert.equal(result.interestSaved, 2);
  assert.equal(result.schedule[0].prepayment, 200);
});

test('调息记录需要完整年月与利率、贷款开始时间，且同月只能有一条', () => {
  const base = { principal: 1200, termMonths: 3, annualRate: 3, repaymentMethod: 'equal-payment' };
  assert.throws(() => calculateMortgage({ ...base, rateChanges: [{ month: '2026-02', annualRate: 4 }] }), /开始时间/);
  assert.throws(() => calculateMortgage({ ...base, startDate: '2026-01', rateChanges: [{ month: '2026-02' }] }), /完整填写/);
  assert.throws(() => calculateMortgage({ ...base, startDate: '2026-01', rateChanges: [{ annualRate: 4 }] }), /完整填写/);
  assert.throws(() => calculateMortgage({ ...base, startDate: '2026-01', rateChanges: [{ month: '2026-02', annualRate: -1 }] }), /利率/);
  assert.throws(() => calculateMortgage({ ...base, startDate: '2026-01', rateChanges: [{ month: '2026-02', annualRate: 4 }, { month: '2026-02', annualRate: 5 }] }), /同一个月/);
  assert.throws(() => calculateMortgage({ ...base, startDate: '2026-01', rateChanges: [{ month: '2025-12', annualRate: 4 }] }), /贷款期限内/);
  assert.throws(() => calculateMortgage({ ...base, startDate: '2026-01', rateChanges: [{ month: '2026-05', annualRate: 4 }] }), /贷款期限内/);
});
