// Calculation logic (no DOM). Dates are 'YYYY-MM-DD'.
(function (root) {
  function parseDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return { y, m, d };
  }
  function monthKey(y, m) {
    return y + '-' + String(m).padStart(2, '0');
  }
  function addMonths(y, m, n) {
    const t = y * 12 + (m - 1) + n;
    return { y: Math.floor(t / 12), m: (t % 12) + 1 };
  }
  function daysIn(y, m) {
    return new Date(y, m, 0).getDate();
  }

  // Individual instalments of a loan: [{key, date, amount, currency, id, creditId, bank}]
  function installments(c) {
    if (c.schedule) {
      return c.schedule.map(r => ({
        key: r.month,
        date:
          r.month +
          '-' +
          String(daysIn(...r.month.split('-').map(Number))).padStart(2, '0'),
        amount: r.amount,
        currency: c.currency,
        id: c.id + ':' + r.month,
        creditId: c.id,
        bank: c.bank,
      }));
    }
    const { y, m, d } = parseDate(c.firstDate);
    const out = [];
    for (let i = 0; i < c.months; i++) {
      const a = addMonths(y, m, i);
      const day = Math.min(d, daysIn(a.y, a.m));
      out.push({
        key: monthKey(a.y, a.m),
        date: monthKey(a.y, a.m) + '-' + String(day).padStart(2, '0'),
        amount: c.amount,
        currency: c.currency,
        id: c.id + ':' + monthKey(a.y, a.m),
        creditId: c.id,
        bank: c.bank,
      });
    }
    return out;
  }

  // Monthly recurring income (repeat: 'monthly') becomes one occurrence per month, with id 'incomeId:YYYY-MM',
  // from its `date` up to the month of `until` (the last repetition), or with no `until` up to the last instalment
  // of `credits`. One-off income passes through.
  function expandIncomes(incomes, credits) {
    let last = null; // last month with an instalment, as y*12+m
    for (const c of credits) {
      const its = installments(c);
      if (!its.length) continue;
      const [y, m] = its[its.length - 1].key.split('-').map(Number);
      last = Math.max(last === null ? -Infinity : last, y * 12 + m);
    }
    return incomes.flatMap(inc => {
      if (inc.repeat !== 'monthly') return [inc];
      const { y, m } = parseDate(inc.date),
        start = y * 12 + m;
      let end = last;
      if (inc.until) {
        const u = parseDate(inc.until);
        end = u.y * 12 + u.m;
      }
      const n = end === null ? 1 : Math.max(inc.until ? 0 : 1, end - start + 1);
      const { repeat, until, ...base } = inc;
      return installments({
        id: inc.id,
        amount: inc.amount,
        months: n,
        firstDate: inc.date,
      }).map(o => ({ ...base, id: o.id, date: o.date, parent: inc.id }));
    });
  }

  // Combined monthly schedule and what the declared income covers from `today` ('YYYY-MM-DD') on. Income before
  // `today` is ignored, and an unpaid instalment past its date is `overdue`: never covered, the user marks it.
  // Each month, money is used in this order: expiring recurring income, one-off income (carries over), carrying
  // recurring income (its leftover goes to a reserve) and, last, the reserve (`fromReserve`).
  function schedule(credits, incomes, paid, today = '') {
    paid = paid || {};
    const month = today.slice(0, 7);
    const inc = expandIncomes(incomes, credits)
      .map(i => ({ ...i, key: i.date.slice(0, 7) }))
      .filter(i => i.key >= month)
      .sort((a, b) => a.date.localeCompare(b.date));

    const byMonth = new Map();
    for (const c of credits) {
      for (const it of installments(c)) {
        if (!byMonth.has(it.key))
          byMonth.set(it.key, {
            key: it.key,
            due: 0,
            paidAmount: 0,
            overdue: 0,
            items: [],
          });
        const row = byMonth.get(it.key);
        it.paid = !!paid[it.id];
        it.late = !it.paid && it.date < today;
        row.due += it.amount;
        if (it.paid) row.paidAmount += it.amount;
        else if (it.late) row.overdue += it.amount;
        row.items.push(it);
      }
    }
    const rows = [...byMonth.values()].sort((a, b) =>
      a.key.localeCompare(b.key),
    );

    const isRecurring = o => o.parent != null;
    const expiring = new Map(),
      carrying = new Map(); // month -> recurring income of that month that expires / carries
    const addTo = (map, o) => map.set(o.key, (map.get(o.key) || 0) + o.amount);
    inc
      .filter(o => isRecurring(o) && !o.carry)
      .forEach(o => addTo(expiring, o));
    inc.filter(o => isRecurring(o) && o.carry).forEach(o => addTo(carrying, o));
    const oneTime = inc.filter(o => !isRecurring(o));
    const carryMonths = [...carrying.keys()].sort();

    let pool = 0,
      next = 0,
      reserve = 0,
      ck = 0,
      usedOneTime = 0,
      usedCarrying = 0;
    for (const r of rows) {
      r.unpaid = r.due - r.paidAmount;
      r.waiting = r.unpaid - r.overdue;
      // the leftover of months with no instalments also goes to the reserve
      while (ck < carryMonths.length && carryMonths[ck] < r.key)
        reserve += carrying.get(carryMonths[ck++]);
      while (next < oneTime.length && oneTime[next].key <= r.key)
        pool += oneTime[next++].amount;
      let need = r.waiting;
      const take = available => {
        const x = Math.min(available, need);
        need -= x;
        return x;
      };
      const fromExpiring = take(expiring.get(r.key) || 0);
      const fromOneTime = take(pool);
      pool -= fromOneTime;
      usedOneTime += fromOneTime;
      const salary = carrying.get(r.key) || 0;
      if (carryMonths[ck] === r.key) ck++;
      const fromSalary = take(salary);
      r.fromReserve = take(reserve);
      reserve += salary - fromSalary - r.fromReserve;
      usedCarrying += fromSalary + r.fromReserve;
      r.covered = fromExpiring + fromOneTime + fromSalary + r.fromReserve;
      r.missing = r.unpaid - r.covered;
      r.status =
        r.unpaid === 0 ? 'paid' : r.covered > 0 ? 'covered' : 'pending';
    }

    // Months covered by income: only fully covered ones, in a row from the first month with something not due yet
    // (paid and overdue parts neither count nor break the run).
    let fullMonths = 0;
    for (const r of rows) {
      if (r.waiting === 0) continue;
      if (r.covered === r.waiting) fullMonths++;
      else break;
    }

    const sum = f => rows.reduce((s, r) => s + f(r), 0);
    const totalDue = sum(r => r.due);
    const totalPaid = sum(r => r.paidAmount);
    // "to allocate": one-off money and reserves left over; what an expiring recurring income does not cover is lost
    const total = list => list.reduce((s, i) => s + i.amount, 0);
    const carryingTotal = total(inc.filter(o => isRecurring(o) && o.carry));
    return {
      rows,
      totalDue,
      totalPaid,
      totalPending: totalDue - totalPaid,
      totalCovered: sum(r => r.covered),
      totalMissing: sum(r => r.missing),
      unusedIncome: Math.max(
        0,
        total(oneTime) - usedOneTime + carryingTotal - usedCarrying,
      ),
      fullMonths,
    };
  }

  // One schedule per currency: currencies are never converted or added together. Returns
  // { currencies, by: {currency: schedule}, months: [{key, by: {currency: row}}] }.
  function scheduleAll(credits, incomes, paid, today) {
    const cur = x => x.currency;
    const currencies = [...new Set([...credits, ...incomes].map(cur))];
    const by = {},
      months = new Map();
    for (const c of currencies) {
      by[c] = schedule(
        credits.filter(x => cur(x) === c).map(x => ({ ...x, currency: c })),
        incomes.filter(x => cur(x) === c),
        paid,
        today,
      );
      for (const r of by[c].rows) {
        if (!months.has(r.key)) months.set(r.key, { key: r.key, by: {} });
        months.get(r.key).by[c] = r;
      }
    }
    return {
      currencies,
      by,
      months: [...months.values()].sort((a, b) => a.key.localeCompare(b.key)),
    };
  }

  // Parses an amount typed or pasted in the convention `sep` ({group, decimal}). With both separators present the
  // last one is the decimal; a lone one follows the convention unless it can only be grouping (not 3 digits after it).
  function parseAmount(raw, sep) {
    let s = String(raw)
      .trim()
      .replace(/[\s\u00a0'\u2019]/g, '');
    if (!/^\d[\d.,]*$/.test(s)) return NaN;
    const count = ch => s.split(ch).length - 1;
    let dec = null;
    if (count('.') && count(','))
      dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
    else if (count('.') + count(',') === 1) {
      const ch = count('.') ? '.' : ',';
      dec =
        ch === sep.decimal || s.length - s.indexOf(ch) - 1 !== 3 ? ch : null;
    }
    if (dec === null) s = s.replace(/[.,]/g, '');
    else if (count(dec) > 1) return NaN;
    else
      s = s
        .split(dec === '.' ? ',' : '.')
        .join('')
        .replace(',', '.');
    return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
  }

  // Month from 'YYYY-MM', 'YYYY-MM-DD', 'DD-MM-YYYY' or 'MM-YYYY' (also with '/'): 'YYYY-MM', or null.
  function parseMonth(raw) {
    const s = String(raw).trim();
    let y, m, mt;
    if ((mt = s.match(/^(\d{4})[-\/](\d{1,2})(?:[-\/]\d{1,2})?$/))) {
      y = +mt[1];
      m = +mt[2];
    } else if ((mt = s.match(/^(?:\d{1,2}[-\/])?(\d{1,2})[-\/](\d{4})$/))) {
      y = +mt[2];
      m = +mt[1];
    } else return null;
    return m >= 1 && m <= 12 && y >= 1900 ? monthKey(y, m) : null;
  }

  // Variable amounts: rows of "month, amount" into [{month, amount}] sorted by month. The separator can be a tab
  // (what Excel or Sheets paste), a semicolon, a comma or spaces: the first one that reads every row wins, otherwise
  // the one with the fewest errors. The first line may be a header and zero amounts are skipped.
  // Errors are {line, code}, code being 'cols' | 'date' | 'amount' | 'dup'.
  function parseSchedule(text, sep) {
    const lines = String(text)
      .split(/\r?\n/)
      .map((raw, i) => ({ line: i + 1, s: raw.trim() }))
      .filter(l => l.s);
    const attempt = delim => {
      const rows = [],
        errors = [],
        seen = new Set();
      lines.forEach(({ line, s }, idx) => {
        const cells = (delim ? s.split(delim) : s.split(/\s+/)).map(c =>
          c.trim(),
        );
        if (cells.length !== 2) return errors.push({ line, code: 'cols' });
        const month = parseMonth(cells[0]),
          amount = parseAmount(cells[1], sep);
        if (idx === 0 && month === null && Number.isNaN(amount)) return;
        if (month === null) return errors.push({ line, code: 'date' });
        if (Number.isNaN(amount)) return errors.push({ line, code: 'amount' });
        if (seen.has(month)) return errors.push({ line, code: 'dup' });
        seen.add(month);
        if (amount > 0) rows.push({ month, amount });
      });
      rows.sort((a, b) => a.month.localeCompare(b.month));
      return { rows, errors };
    };
    let best = null;
    for (const delim of ['\t', ';', ',', null]) {
      const r = attempt(delim);
      if (!best || r.errors.length < best.errors.length) best = r;
      if (!r.errors.length) break;
    }
    return best;
  }

  const api = {
    installments,
    schedule,
    scheduleAll,
    expandIncomes,
    parseSchedule,
    parseAmount,
    monthKey,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Calc = api;
})(this);
