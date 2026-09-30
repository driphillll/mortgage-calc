const MAX_MONTHS = 1200;
const toYuan = cents => Math.round(cents) / 100;

export function toTermMonths(value, unit) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || !['years', 'months'].includes(unit)) {
    throw new RangeError('贷款期限须为正数，并选择年或月');
  }
  const months = unit === 'years' ? number * 12 : number;
  if (Math.abs(months - Math.round(months)) > 0.000001) {
    throw new RangeError('贷款期限必须能换算为整月');
  }
  if (months < 1 || months > MAX_MONTHS) {
    throw new RangeError('贷款期限须在 1 至 1200 个月之间');
  }
  return Math.round(months);
}

export function formatTermValue(months, unit) {
  const validMonths = toTermMonths(months, 'months');
  if (unit === 'months') return String(validMonths);
  if (unit === 'years') return String(Number((validMonths / 12).toFixed(8)));
  throw new RangeError('请选择贷款期限单位');
}

function cents(value, field) {
  const number = Number(value);
  if (value === '' || value == null || !Number.isFinite(number) || number <= 0 || number > 100000000000) {
    throw new RangeError(`${field}须为大于 0 的金额`);
  }
  const rounded = Math.round(number * 100);
  if (Math.abs(rounded / 100 - number) > 0.000001) {
    throw new RangeError(`${field}最多保留两位小数`);
  }
  return rounded;
}

function annualRateValue(value, field) {
  const rate = Number(value);
  if (value === '' || value == null || !Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new RangeError(`${field}须在 0% 至 100% 之间`);
  }
  return rate;
}

function parseDate(value, field, requireDay = false) {
  if (typeof value !== 'string') throw new RangeError(`${field}无效`);
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!match || (requireDay && !match[3])) throw new RangeError(`${field}无效`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = match[3] == null ? null : Number(match[3]);
  if (year < 1900 || month < 1 || month > 12 || (day != null && (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()))) {
    throw new RangeError(`${field}无效`);
  }
  return { year, month, day, index: year * 12 + month - 1 };
}

function dueDate(start, offset) {
  const index = start.index + offset;
  const year = Math.floor(index / 12);
  const month = index % 12 + 1;
  const yearMonth = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  if (start.day == null) return yearMonth;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${yearMonth}-${String(Math.min(start.day, lastDay)).padStart(2, '0')}`;
}

function installment(balance, months, monthlyRate) {
  if (monthlyRate === 0) return Math.round(balance / months);
  return Math.round(balance * monthlyRate / (1 - Math.pow(1 + monthlyRate, -months)));
}

function remainingInstallments(balance, regularAmount, monthlyRate, limit) {
  let months = 0;
  while (balance > 0 && months < limit) {
    const interest = Math.round(balance * monthlyRate);
    balance -= Math.min(balance, Math.max(1, regularAmount - interest));
    months += 1;
  }
  return months;
}

function makeSchedule({ principalCents, termMonths, annualRate, repaymentMethod, start, prepayments, rateChanges }) {
  let balance = principalCents;
  let plannedRemaining = termMonths;
  let currentAnnualRate = annualRate;
  let monthlyRate = currentAnnualRate / 1200;
  let regularAmount = repaymentMethod === 'equal-payment'
    ? installment(balance, termMonths, monthlyRate)
    : Math.max(1, Math.round(balance / termMonths));
  const schedule = [];
  const unusedPrepayments = [];
  const unusedRateChanges = [];
  let eventIndex = 0;
  let rateIndex = 0;

  for (let period = 1; period <= termMonths && balance > 0; period += 1) {
    let appliedRateChange = null;
    while (rateIndex < rateChanges.length && rateChanges[rateIndex].monthIndex <= start.index + period) {
      appliedRateChange = rateChanges[rateIndex];
      currentAnnualRate = appliedRateChange.annualRate;
      monthlyRate = currentAnnualRate / 1200;
      rateIndex += 1;
    }
    if (appliedRateChange && repaymentMethod === 'equal-payment') {
      regularAmount = installment(balance, plannedRemaining, monthlyRate);
    }
    const interestCents = Math.round(balance * monthlyRate);
    const principalPaid = plannedRemaining <= 1 ? balance : Math.min(balance, repaymentMethod === 'equal-payment'
      ? Math.max(1, regularAmount - interestCents)
      : regularAmount);
    const paymentCents = interestCents + principalPaid;
    balance -= principalPaid;
    plannedRemaining -= 1;
    let prepaymentCents = 0;
    const prepaymentEvents = [];

    while (eventIndex < prepayments.length && prepayments[eventIndex].monthIndex === start.index + period) {
      const event = prepayments[eventIndex];
      const applied = Math.min(balance, event.amountCents);
      if (applied > 0) {
        balance -= applied;
        prepaymentCents += applied;
        prepaymentEvents.push({ date: event.date, amount: toYuan(applied), mode: event.mode });
        if (balance > 0 && plannedRemaining > 0) {
          if (event.mode === 'reduce-payment') {
            regularAmount = repaymentMethod === 'equal-payment'
              ? installment(balance, plannedRemaining, monthlyRate)
              : Math.max(1, Math.round(balance / plannedRemaining));
          } else {
            plannedRemaining = repaymentMethod === 'equal-payment'
              ? remainingInstallments(balance, regularAmount, monthlyRate, plannedRemaining)
              : Math.ceil(balance / regularAmount);
          }
        }
      } else {
        unusedPrepayments.push({ date: event.date, amount: toYuan(event.amountCents) });
      }
      eventIndex += 1;
    }

    schedule.push({
      period,
      date: start ? dueDate(start, period) : null,
      annualRate: currentAnnualRate,
      rateChanged: Boolean(appliedRateChange),
      rateChangeMonth: appliedRateChange?.month ?? null,
      principal: toYuan(principalPaid),
      interest: toYuan(interestCents),
      payment: toYuan(paymentCents),
      prepayment: toYuan(prepaymentCents),
      prepaymentEvents,
      total: toYuan(paymentCents + prepaymentCents),
      remaining: toYuan(balance)
    });
  }

  for (; eventIndex < prepayments.length; eventIndex += 1) {
    const event = prepayments[eventIndex];
    unusedPrepayments.push({ date: event.date, amount: toYuan(event.amountCents) });
  }
  for (; rateIndex < rateChanges.length; rateIndex += 1) {
    unusedRateChanges.push({ month: rateChanges[rateIndex].month, annualRate: rateChanges[rateIndex].annualRate });
  }

  const totalInterestCents = schedule.reduce((sum, row) => sum + Math.round(row.interest * 100), 0);
  const totalPrepaymentCents = schedule.reduce((sum, row) => sum + Math.round(row.prepayment * 100), 0);
  return {
    schedule,
    unusedPrepayments,
    unusedRateChanges,
    totalInterest: toYuan(totalInterestCents),
    totalPrepayment: toYuan(totalPrepaymentCents),
    totalPayment: toYuan(principalCents + totalInterestCents)
  };
}

export function calculateMortgage(input) {
  const principalCents = cents(input.principal, '贷款金额');
  const termMonths = toTermMonths(input.termMonths, 'months');
  const annualRate = annualRateValue(input.annualRate, '年化利率');
  if (!['equal-payment', 'equal-principal'].includes(input.repaymentMethod)) {
    throw new RangeError('请选择还款方式');
  }
  const start = input.startDate ? parseDate(input.startDate, '贷款开始时间') : null;
  const rawRateChanges = input.rateChanges ?? [];
  if (!Array.isArray(rawRateChanges)) throw new RangeError('利率调整输入无效');
  if (rawRateChanges.length && !start) throw new RangeError('填写利率调整前，请先填写贷款开始时间');
  const rateChanges = rawRateChanges.map((change, index) => {
    if (!change || !change.month || change.annualRate === '' || change.annualRate == null) {
      throw new RangeError(`第 ${index + 1} 条利率调整必须完整填写生效年月和年化利率`);
    }
    if (typeof change.month !== 'string' || !/^\d{4}-\d{2}$/.test(change.month)) {
      throw new RangeError(`第 ${index + 1} 条利率调整年月无效`);
    }
    const date = parseDate(change.month, `第 ${index + 1} 条利率调整年月`);
    if (date.index < start.index || date.index > start.index + termMonths) {
      throw new RangeError('利率调整年月须在贷款期限内');
    }
    return { month: change.month, monthIndex: date.index, annualRate: annualRateValue(change.annualRate, `第 ${index + 1} 条调整后年化利率`) };
  }).sort((a, b) => a.monthIndex - b.monthIndex);
  for (let index = 1; index < rateChanges.length; index += 1) {
    if (rateChanges[index].monthIndex === rateChanges[index - 1].monthIndex) {
      throw new RangeError('同一个月只能有一条利率调整记录');
    }
  }
  const rawPrepayments = input.prepayments ?? [];
  if (!Array.isArray(rawPrepayments)) throw new RangeError('提前还款输入无效');
  if (rawPrepayments.length && !start) throw new RangeError('填写提前还款前，请先填写贷款开始时间');
  const prepayments = rawPrepayments.map((event, index) => {
    if (!event || event.amount === '' || event.amount == null || !event.date || !event.mode) {
      throw new RangeError(`第 ${index + 1} 笔提前还款必须完整填写金额、日期和处理方式`);
    }
    if (!['reduce-term', 'reduce-payment'].includes(event.mode)) {
      throw new RangeError(`第 ${index + 1} 笔提前还款处理方式无效`);
    }
    const date = parseDate(event.date, `第 ${index + 1} 笔提前还款日期`, true);
    if (date.index <= start.index) throw new RangeError('提前还款日期须在首期还款月份或之后');
    if (date.index > start.index + termMonths) throw new RangeError('提前还款日期不能晚于原定结清月份');
    return { amountCents: cents(event.amount, `第 ${index + 1} 笔提前还款金额`), date: event.date, mode: event.mode, monthIndex: date.index, originalIndex: index };
  }).sort((a, b) => a.monthIndex - b.monthIndex || a.date.localeCompare(b.date) || a.originalIndex - b.originalIndex);

  const config = { principalCents, termMonths, annualRate, repaymentMethod: input.repaymentMethod, start, rateChanges };
  const result = makeSchedule({ ...config, prepayments });
  const baseline = prepayments.length ? makeSchedule({ ...config, prepayments: [] }) : result;
  return {
    ...result,
    originalMonths: termMonths,
    actualMonths: result.schedule.length,
    monthsSaved: baseline.schedule.length - result.schedule.length,
    interestSaved: toYuan(Math.round((baseline.totalInterest - result.totalInterest) * 100)),
    initialPayment: result.schedule[0]?.payment ?? 0
  };
}
