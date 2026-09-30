import { calculateMortgage, formatTermValue, toTermMonths } from './calculator.js';

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
const scheduleBody = document.querySelector('#scheduleBody');
const money = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  resultContent.hidden = true;
  scheduleSection.hidden = true;
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
    values.forEach((value, index) => {
      const td = document.createElement('td');
      td.textContent = value;
      if (index > 1) td.classList.add('numeric');
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
  setText('#paymentLabel', input.repaymentMethod === 'equal-payment' ? '首期月供' : '首月月供');
  setText('#initialPayment', `¥ ${money.format(result.initialPayment)}`);
  setText('#summaryPrincipal', `¥ ${money.format(Number(input.principal))}`);
  setText('#summaryInterest', `¥ ${money.format(result.totalInterest)}`);
  setText('#summaryTotal', `¥ ${money.format(result.totalPayment)}`);
  setText('#summaryMonths', `${result.actualMonths} 期`);
  setText('#summarySavings', `¥ ${money.format(result.interestSaved)}`);
  setText('#summaryMonthsSaved', `${result.monthsSaved} 个月`);
  document.querySelector('#savingsBlock').hidden = input.prepayments.length === 0;
  const unusedNotice = document.querySelector('#unusedNotice');
  const notices = [];
  if (result.unusedPrepayments.length) notices.push(`${result.unusedPrepayments.length} 笔提前还款发生在实际结清之后，未计入还款总额。`);
  if (result.unusedRateChanges.length) notices.push(`${result.unusedRateChanges.length} 次利率调整发生在实际结清之后，未作用于还款计划。`);
  unusedNotice.hidden = notices.length === 0;
  unusedNotice.textContent = notices.join(' ');
  setText('#scheduleCount', `共 ${result.actualMonths} 期 · 金额单位：元${result.totalPrepayment ? ` · 已提前偿还 ¥ ${money.format(result.totalPrepayment)}` : ''}`);
  renderSchedule(result.schedule);
  emptyState.hidden = true;
  resultContent.hidden = false;
  scheduleSection.hidden = false;
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
    resultContent.hidden = true;
    scheduleSection.hidden = true;
    emptyState.hidden = false;
    showError(error.message);
  }
});
