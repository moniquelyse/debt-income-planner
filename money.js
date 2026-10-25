// Amount formatting (no DOM). Each currency is shown in the convention of its own country (CLP: 1.234.567;
// USD in an English-speaking country: 1,234.56), not that of the interface language.
(function (root) {
  // Used in many countries, so there is no convention of its own: the interface language decides.
  const SHARED = new Set(['EUR', 'USD']);
  const homes = {};

  // A currency's "home" locale, derived from Intl data (nothing to maintain by hand): the first two letters of an
  // ISO 4217 code are the country (CLP -> CL) and Intl knows which language is spoken there (es-CL). Without a valid
  // country (XOF, ANG...) or with a non-Latin script (Arabic, Cyrillic, CJK: the symbol would come out in another
  // script), the interface locale is used. Digits are always Latin.
  function currencyLocale(cur, uiLocale) {
    const key = cur + '|' + uiLocale;
    if (homes[key]) return homes[key];
    let loc = uiLocale;
    const region = cur.slice(0, 2);
    if (!SHARED.has(cur) && cur[0] !== 'X') {
      try {
        const max = new Intl.Locale('und-' + region).maximize();
        if (max.region === region && max.script === 'Latn') loc = max.language + '-' + region;
      } catch (e) { /* keep the interface locale */ }
    }
    return (homes[key] = loc + '-u-nu-latn');
  }

  // Some regional formats lack a currency's symbol (es-CL shows "EUR", not "€"): then the en-GB one is used, which
  // also tells dollars apart ("US$", "CA$"); if that has none either, the code stays.
  const syms = {};
  function symbolFor(cur) {
    if (!(cur in syms)) {
      const p = new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur }).formatToParts(0).find(x => x.type === 'currency');
      syms[cur] = p ? p.value : cur;
    }
    return syms[cur];
  }

  const fmts = {};
  // Returns HTML: decimals go in <span class="dec"> so they can be dimmed.
  function format(n, cur, uiLocale) {
    const loc = currencyLocale(cur, uiLocale), key = loc + '|' + cur;
    const f = fmts[key] || (fmts[key] = new Intl.NumberFormat(loc, { style: 'currency', currency: cur }));
    const parts = f.formatToParts(n), out = [];
    parts.forEach((p, i) => {
      if (p.type === 'currency' && p.value === cur && symbolFor(cur) !== cur) {
        out.push(symbolFor(cur));
        // "EUR 3.000" -> "€3.000": a leading symbol sits against the number (unless it ends in a letter: "F CFA 3.001")
        if (i === 0 && !/\p{L}$/u.test(symbolFor(cur)) && parts[1] && parts[1].type === 'literal' && !parts[1].value.trim()) parts[1] = { type: 'skip', value: '' };
      } else if (p.type === 'decimal' || p.type === 'fraction') out.push(`<span class="dec">${p.value}</span>`);
      else out.push(p.value);
    });
    return out.join('');
  }

  // Just the number, with that currency's separators and decimals (no symbol): to preview what is being typed.
  const nfs = {};
  function number(n, cur, uiLocale) {
    const loc = currencyLocale(cur, uiLocale), key = loc + '|' + cur;
    if (!nfs[key]) {
      const digits = new Intl.NumberFormat(loc, { style: 'currency', currency: cur }).resolvedOptions().maximumFractionDigits;
      nfs[key] = new Intl.NumberFormat(loc, { minimumFractionDigits: 0, maximumFractionDigits: digits });
    }
    return nfs[key].format(n);
  }

  // Group and decimal separators of a currency's convention (to read amounts typed or pasted in it).
  function separators(cur, uiLocale) {
    const parts = new Intl.NumberFormat(currencyLocale(cur, uiLocale)).formatToParts(1234567.5);
    const pick = type => (parts.find(p => p.type === type) || {}).value;
    return { group: pick('group'), decimal: pick('decimal') };
  }

  const api = { format, number, separators, currencyLocale };
  if (typeof module !== 'undefined') module.exports = api; else root.Money = api;
})(this);
