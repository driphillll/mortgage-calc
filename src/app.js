import { calculateMortgage, estimatePaidPeriods, formatTermValue, summarizeRepayment, toTermMonths } from './calculator.js';

const form = document.querySelector('#mortgageForm');
const principal = document.querySelector('#principal');
const termValue = document.querySelector('#termValue');
const termUnit = document.querySelector('#termUnit');
const annualRate = document.querySelector('#annualRate');
const startMonth = document.querySelector('#startMonth');
const startDay = document.querySelector('#startDay');
const addPrepayment = document.querySelector('#addPrepayment');
const prepaymentList = document.querySelector('#prepaymentList');
const prepaymentTemplate = document.querySelector('#prepaymentTemplate');
const addRateChange = document.querySelector('#addRateChange');
const rateChangeList = document.querySelector('#rateChangeList');
const rateChangeTemplate = document.querySelector('#rateChangeTemplate');
const formError = document.querySelector('#formError');
const emptyState = document.querySelector('#emptyState');
const resultContent = document.querySelector('#resultContent');
const scheduleSection = document.querySelector('#scheduleSection');
const educationNumber = document.querySelector('#educationNumber');
const scheduleBody = document.querySelector('#scheduleBody');
const paidPeriods = document.querySelector('#paidPeriods');
const resetPaidPeriods = document.querySelector('#resetPaidPeriods');
const progressError = document.querySelector('#progressError');
const progressAmounts = document.querySelector('#progressAmounts');
const money = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let currentResult = null;
let previousUnit = termUnit.value;
let nextPrepaymentId = 1;
let nextRateChangeId = 1;

function showError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function clearError() {
  formError.textContent = '';
  formError.hidden = true;
}

function invalidateResults() {
  currentResult = null;
  resultContent.hidden = true;
  scheduleSection.hidden = true;
  educationNumber.textContent = '03';
  emptyState.hidden = false;
  clearError();
}

function updatePrepaymentHeadings() {
  [...prepaymentList.children].forEach((item, index) => {
    item.querySelector('.prepayment-title').textContent = `第 ${index + 1} 笔提前还款`;
  });
}

function updateRateChangeHeadings() {
  [...rateChangeList.children].forEach((item, index) => {
    item.querySelector('.rate-change-title').textContent = `第 ${index + 1} 次利率调整`;
  });
}

function syncStartAvailability() {
  const hasStart = Boolean(startMonth.value);
  startDay.disabled = !hasStart;
  if (!hasStart) startDay.value = '';
  addPrepayment.disabled = !hasStart;
  addRateChange.disabled = !hasStart;
  document.querySelector('#prepaymentHint').hidden = hasStart;
  document.querySelector('#rateChangeHint').hidden = hasStart;
  const nextMonth = hasStart ? new Date(`${startMonth.value}-01T00:00:00Z`) : null;
  if (nextMonth) nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  for (const item of prepaymentList.children) {
    for (const field of item.querySelectorAll('input, select')) field.disabled = !hasStart;
    item.querySelector('.prepayment-date').min = nextMonth ? nextMonth.toISOString().slice(0, 10) : '';
  }
  for (const item of rateChangeList.children) {
    for (const field of item.querySelectorAll('input')) field.disabled = !hasStart;
    item.querySelector('.rate-change-month').min = hasStart ? startMonth.value : '';
  }
}

function addRateChangeRow() {
  const item = rateChangeTemplate.content.firstElementChild.cloneNode(true);
  const id = nextRateChangeId++;
  for (const [selector, labelSelector, suffix] of [
    ['.rate-change-month', '.rate-month-label', 'month'],
    ['.rate-change-value', '.rate-value-label', 'rate']
  ]) {
    const field = item.querySelector(selector);
    const label = item.querySelector(labelSelector);
    field.id = `rate-change-${id}-${suffix}`;
    label.htmlFor = field.id;
  }
  item.querySelector('.remove-button').addEventListener('click', () => {
    item.remove();
    updateRateChangeHeadings();
    invalidateResults();
  });
  rateChangeList.append(item);
  updateRateChangeHeadings();
  syncStartAvailability();
  item.querySelector('.rate-change-month').focus();
  invalidateResults();
}

function addPrepaymentRow() {
  const item = prepaymentTemplate.content.firstElementChild.cloneNode(true);
  const id = nextPrepaymentId++;
  for (const [selector, labelSelector, suffix] of [
    ['.prepayment-amount', '.amount-label', 'amount'],
    ['.prepayment-date', '.date-label', 'date'],
    ['.prepayment-mode', '.mode-label', 'mode']
  ]) {
    const field = item.querySelector(selector);
    const label = item.querySelector(labelSelector);
    field.id = `prepayment-${id}-${suffix}`;
    label.htmlFor = field.id;
  }
  item.querySelector('.remove-button').addEventListener('click', () => {
    item.remove();
    updatePrepaymentHeadings();
    invalidateResults();
  });
  prepaymentList.append(item);
  updatePrepaymentHeadings();
  syncStartAvailability();
  item.querySelector('.prepayment-amount').focus();
  invalidateResults();
}

function readInput() {
  const day = startDay.value.trim();
  if (day && !startMonth.value) throw new RangeError('请先填写贷款开始年月');
  if (day && (!/^\d+$/.test(day) || Number(day) < 1 || Number(day) > 31)) {
    throw new RangeError('贷款开始日期须为 1 至 31 日');
  }
  const startDate = startMonth.value ? `${startMonth.value}${day ? `-${day.padStart(2, '0')}` : ''}` : undefined;
  return {
    principal: principal.value,
    termMonths: toTermMonths(termValue.value, termUnit.value),
    annualRate: annualRate.value,
    repaymentMethod: form.elements.repaymentMethod.value,
    startDate,
    rateChanges: [...rateChangeList.children].map(item => ({
      month: item.querySelector('.rate-change-month').value,
      annualRate: item.querySelector('.rate-change-value').value
    })),
    prepayments: [...prepaymentList.children].map(item => ({
      amount: item.querySelector('.prepayment-amount').value,
      date: item.querySelector('.prepayment-date').value,
      mode: item.querySelector('.prepayment-mode').value
    }))
  };
}

function setText(selector, value) {
  document.querySelector(selector).textContent = value;
}

function wanTitle(amount) {
  return `${money.format(amount / 10000)} 万元`;
}

function setMoney(selector, amount) {
  const element = document.querySelector(selector);
  element.textContent = `¥ ${money.format(amount)}`;
  element.title = wanTitle(amount);
}

function renderProgress() {
  if (!currentResult) return;
  try {
    if (!/^\d+$/.test(paidPeriods.value)) throw new RangeError('请输入整数的已还期数');
    const count = Number(paidPeriods.value);
    const summary = summarizeRepayment(currentResult.schedule, count);
    for (const [name, amount] of Object.entries(summary)) setMoney(`#${name}`, amount);
    const lastPaidDate = currentResult.schedule[count - 1]?.date;
    setText('#progressThrough', `已还 ${count} 期 · 待还 ${currentResult.actualMonths - count} 期${lastPaidDate ? ` · 已计入至 ${lastPaidDate}` : ''}`);
    paidPeriods.setAttribute('aria-invalid', 'false');
    progressError.hidden = true;
    progressError.textContent = '';
    progressAmounts.hidden = false;
  } catch (error) {
    paidPeriods.setAttribute('aria-invalid', 'true');
    progressError.textContent = error.message;
    progressError.hidden = false;
    progressAmounts.hidden = true;
  }
}

function renderSchedule(schedule) {
  const fragment = document.createDocumentFragment();
  for (const row of schedule) {
    const tr = document.createElement('tr');
    if (row.prepayment > 0) tr.classList.add('has-prepayment');
    if (row.rateChanged) tr.classList.add('has-rate-change');
    const values = [
      `${row.period}`,
      row.date ?? '—',
      `${row.annualRate}%`,
      money.format(row.principal),
      money.format(row.interest),
      money.format(row.payment),
      row.prepayment ? money.format(row.prepayment) : '—',
      money.format(row.remaining)
    ];
    const amounts = [row.principal, row.interest, row.payment, row.prepayment, row.remaining];
    values.forEach((value, index) => {
      const td = document.createElement('td');
      td.textContent = value;
      if (index > 1) td.classList.add('numeric');
      if (index >= 3 && (index !== 6 || row.prepayment > 0)) td.title = wanTitle(amounts[index - 3]);
      if (index === 2) {
        td.classList.add(row.rateChanged ? 'rate-change-cell' : 'rate-cell');
        if (row.rateChanged) {
          const detail = document.createElement('small');
          detail.className = 'rate-change-meta';
          detail.textContent = `${row.rateChangeMonth} 生效`;
          td.append(detail);
        }
      }
      if (index === 6 && row.prepayment > 0) {
        td.classList.add('prepayment-cell');
        const detail = document.createElement('small');
        detail.className = 'prepayment-meta';
        detail.textContent = row.prepaymentEvents.map(item => item.date).join('、');
        td.append(detail);
      }
      tr.append(td);
    });
    fragment.append(tr);
  }
  scheduleBody.replaceChildren(fragment);
}

function renderResult(input, result) {
  currentResult = result;
  setText('#paymentLabel', input.repaymentMethod === 'equal-payment' ? '首期月供' : '首月月供');
  setMoney('#initialPayment', result.initialPayment);
  setMoney('#summaryPrincipal', Number(input.principal));
  setMoney('#summaryInterest', result.totalInterest);
  setMoney('#summaryTotal', result.totalPayment);
  setText('#summaryMonths', `${result.actualMonths} 期`);
  setMoney('#summarySavings', result.interestSaved);
  setText('#summaryMonthsSaved', `${result.monthsSaved} 个月`);
  paidPeriods.max = String(result.actualMonths);
  paidPeriods.value = String(estimatePaidPeriods(result.schedule));
  resetPaidPeriods.disabled = !input.startDate;
  setText('#paidPeriodsLimit', `/ ${result.actualMonths} 期`);
  setText('#progressHint', `${input.startDate ? '默认按今天估算；仅填年月时按月末判断。' : '未填开始时间，默认 0 期。'}可按账单修改。金额按计划和完整期数估算，已还本金含期内提前还款。`);
  renderProgress();
  document.querySelector('#savingsBlock').hidden = input.prepayments.length === 0;
  const unusedNotice = document.querySelector('#unusedNotice');
  const notices = [];
  if (result.unusedPrepayments.length) notices.push(`${result.unusedPrepayments.length} 笔提前还款发生在实际结清之后，未计入还款总额。`);
  if (result.unusedRateChanges.length) notices.push(`${result.unusedRateChanges.length} 次利率调整发生在实际结清之后，未作用于还款计划。`);
  unusedNotice.hidden = notices.length === 0;
  unusedNotice.textContent = notices.join(' ');
  setText('#scheduleCount', `共 ${result.actualMonths} 期 · 金额单位：元 · 悬停金额可查看万元`);
  if (result.totalPrepayment) {
    const prepaymentSummary = document.createElement('span');
    prepaymentSummary.textContent = ` · 全期提前还款 ¥ ${money.format(result.totalPrepayment)}`;
    prepaymentSummary.title = wanTitle(result.totalPrepayment);
    document.querySelector('#scheduleCount').append(prepaymentSummary);
  }
  renderSchedule(result.schedule);
  emptyState.hidden = true;
  resultContent.hidden = false;
  scheduleSection.hidden = false;
  educationNumber.textContent = '04';
}

termUnit.addEventListener('change', () => {
  if (!termValue.value) {
    previousUnit = termUnit.value;
    return;
  }
  try {
    const months = toTermMonths(termValue.value, previousUnit);
    termValue.value = formatTermValue(months, termUnit.value);
    previousUnit = termUnit.value;
    invalidateResults();
  } catch (error) {
    termUnit.value = previousUnit;
    showError(error.message);
  }
});

startMonth.addEventListener('input', () => {
  syncStartAvailability();
  invalidateResults();
});

addPrepayment.addEventListener('click', addPrepaymentRow);
addRateChange.addEventListener('click', addRateChangeRow);
paidPeriods.addEventListener('input', renderProgress);
resetPaidPeriods.addEventListener('click', () => {
  if (!currentResult) return;
  paidPeriods.value = String(estimatePaidPeriods(currentResult.schedule));
  renderProgress();
});
form.addEventListener('input', event => {
  if (event.target !== startMonth) invalidateResults();
});
form.addEventListener('change', event => {
  if (event.target !== termUnit) invalidateResults();
});

form.addEventListener('submit', event => {
  event.preventDefault();
  clearError();
  try {
    const input = readInput();
    renderResult(input, calculateMortgage(input));
  } catch (error) {
    currentResult = null;
    resultContent.hidden = true;
    scheduleSection.hidden = true;
    educationNumber.textContent = '03';
    emptyState.hidden = false;
    showError(error.message);
  }
});
