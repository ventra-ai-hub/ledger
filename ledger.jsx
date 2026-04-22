import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Download, Upload, Plus, Trash2, Pencil, Check, X, Settings as SettingsIcon, Clock, ChevronDown, Minus, Banknote, Receipt, HandCoins, LayoutDashboard, Sparkles, ArrowUpRight, ArrowDownRight } from 'lucide-react';

// ============ Constants ============
const STORAGE_KEY = 'ventra-ledger-v1';
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const defaultSettings = {
  partnerA: 'Dan',
  partnerB: 'Nelson',
  splitA: 50,
  splitB: 50,
  currency: 'AUD',
};

const defaultData = {
  expenses: [],
  income: [],
  uncollected: [],
  loans: [],
  settings: defaultSettings,
};

// ============ Helpers ============
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};

const monthKey = (iso) => iso ? iso.slice(0, 7) : '';

const fmt = (n, currency = 'AUD') => {
  const num = Number(n) || 0;
  try {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency, minimumFractionDigits: 2 }).format(num);
  } catch { return `$${num.toFixed(2)}`; }
};

const fmtDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(-2)}`;
};

const parseFlexDate = (s) => {
  if (!s) return todayISO();
  const str = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = '20' + y;
    return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  return todayISO();
};

const parseAmount = (s) => {
  if (typeof s === 'number') return s;
  if (!s) return 0;
  return parseFloat(String(s).replace(/[$,\s]/g, '')) || 0;
};

const toCSV = (rows, headers) => {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
};

const parseCSV = (text) => {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return [];
  const parseLine = (line) => {
    const cells = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else {
        if (ch === ',') { cells.push(cur); cur = ''; }
        else if (ch === '"') inQ = true;
        else cur += ch;
      }
    }
    cells.push(cur);
    return cells;
  };
  const headers = parseLine(lines[0]).map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const cells = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => obj[h] = (cells[i] || '').trim());
    return obj;
  });
};

const download = (filename, content, type = 'text/plain') => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
};

// ============ Storage ============
async function loadFromStorage() {
  try {
    const result = await window.storage.get(STORAGE_KEY);
    if (!result) return defaultData;
    const parsed = JSON.parse(result.value);
    return { ...defaultData, ...parsed, settings: { ...defaultSettings, ...(parsed.settings || {}) } };
  } catch { return defaultData; }
}

async function saveToStorage(data) {
  try { await window.storage.set(STORAGE_KEY, JSON.stringify(data)); return true; }
  catch (err) { console.error('Save failed:', err); return false; }
}

// ============ UI Primitives ============

function Dropdown({ value, options, onChange, placeholder = 'Select', className = '', align = 'left' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm bg-white rounded-2xl hover:bg-stone-50 transition-colors"
        style={{ boxShadow: '0 1px 2px rgba(60, 50, 35, 0.04), 0 0 0 1px rgba(60, 50, 35, 0.06)' }}>
        <span className={selected ? 'text-stone-900' : 'text-stone-400'}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={15} className={`text-stone-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`absolute z-50 mt-2 min-w-full bg-white rounded-2xl py-1.5 overflow-hidden ${align === 'right' ? 'right-0' : 'left-0'}`}
          style={{ boxShadow: '0 12px 32px -8px rgba(60, 50, 35, 0.15), 0 0 0 1px rgba(60, 50, 35, 0.06)', animation: 'dropdownIn 180ms cubic-bezier(0.22, 1, 0.36, 1)' }}>
          {options.map(opt => {
            const active = opt.value === value;
            return (
              <button key={opt.value} type="button" onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between gap-3 transition-colors ${active ? 'bg-stone-50 text-stone-900' : 'text-stone-700 hover:bg-stone-50'}`}>
                <span className="whitespace-nowrap">{opt.label}</span>
                {active && <Check size={14} className="text-stone-900" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NumberField({ value, onChange, step = 1, placeholder = '0.00', prefix = '$', className = '' }) {
  const num = parseAmount(value);
  const adjust = (delta) => {
    const v = num + delta;
    onChange(v < 0 ? '0' : v.toFixed(2));
  };
  return (
    <div className={`flex items-center bg-white rounded-2xl overflow-hidden ${className}`}
      style={{ boxShadow: '0 1px 2px rgba(60, 50, 35, 0.04), 0 0 0 1px rgba(60, 50, 35, 0.06)' }}>
      <button type="button" onClick={() => adjust(-step)} tabIndex={-1}
        className="px-3 py-2.5 text-stone-400 hover:text-stone-900 hover:bg-stone-50 transition-colors">
        <Minus size={14} />
      </button>
      <div className="flex-1 flex items-center gap-1 px-2 min-w-0">
        {prefix && <span className="text-stone-400 text-sm">{prefix}</span>}
        <input type="number" step="0.01" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full py-2.5 text-sm bg-transparent focus:outline-none text-stone-900 tabular-nums"
          style={{ fontFamily: "'JetBrains Mono', monospace" }} />
      </div>
      <button type="button" onClick={() => adjust(step)} tabIndex={-1}
        className="px-3 py-2.5 text-stone-400 hover:text-stone-900 hover:bg-stone-50 transition-colors">
        <Plus size={14} />
      </button>
    </div>
  );
}

function TextField({ value, onChange, placeholder, type = 'text', className = '', onKeyDown }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} onKeyDown={onKeyDown}
      className={`w-full px-4 py-2.5 text-sm bg-white rounded-2xl text-stone-900 placeholder:text-stone-400 focus:outline-none transition-all ${className}`}
      style={{ boxShadow: '0 1px 2px rgba(60, 50, 35, 0.04), 0 0 0 1px rgba(60, 50, 35, 0.06)' }} />
  );
}

function Button({ children, onClick, variant = 'primary', size = 'md', className = '', type = 'button', disabled, title }) {
  const sizes = { sm: 'px-3.5 py-2 text-xs', md: 'px-4 py-2.5 text-sm', lg: 'px-5 py-3 text-sm' };
  const variants = {
    primary: 'bg-stone-900 text-stone-50 hover:bg-stone-800 active:scale-[0.98]',
    secondary: 'bg-white text-stone-800 hover:bg-stone-50',
    accent: 'text-stone-50 active:scale-[0.98]',
    ghost: 'text-stone-600 hover:text-stone-900 hover:bg-stone-100',
    danger: 'bg-white text-red-700 hover:bg-red-50',
  };
  const shadow = variant === 'secondary' || variant === 'danger'
    ? { boxShadow: '0 1px 2px rgba(60, 50, 35, 0.04), 0 0 0 1px rgba(60, 50, 35, 0.06)' }
    : variant === 'accent'
    ? { backgroundColor: '#7d9d7a', boxShadow: '0 1px 2px rgba(125, 157, 122, 0.2)' }
    : {};
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} style={shadow}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${sizes[size]} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

function Card({ children, className = '', style = {} }) {
  return (
    <div className={`bg-white rounded-3xl ${className}`}
      style={{ boxShadow: '0 1px 2px rgba(60, 50, 35, 0.03), 0 0 0 1px rgba(60, 50, 35, 0.05)', ...style }}>
      {children}
    </div>
  );
}

function Label({ children, className = '' }) {
  return <label className={`block text-[11px] font-medium tracking-[0.1em] uppercase text-stone-500 mb-1.5 ${className}`}>{children}</label>;
}

// ============ Views ============

function Overview({ data, currentMonth }) {
  const { expenses, income, uncollected, loans, settings } = data;
  const cur = settings.currency;

  const monthExpenses = expenses.filter(e => monthKey(e.date) === currentMonth);
  const monthIncome = income.filter(i => monthKey(i.date) === currentMonth);
  const totalExp = monthExpenses.reduce((s, e) => s + parseAmount(e.amount), 0);
  const totalInc = monthIncome.reduce((s, i) => s + parseAmount(i.amount), 0);
  const net = totalInc - totalExp;

  const shareA = net * (settings.splitA / 100);
  const shareB = net * (settings.splitB / 100);

  const totalUncollected = uncollected.filter(u => !u.collected).reduce((s, u) => s + parseAmount(u.amount), 0);
  const totalLoans = loans.reduce((s, l) => s + parseAmount(l.amount) * (l.direction === 'in' ? -1 : 1), 0);

  const trendMonths = useMemo(() => {
    const [yy, mm] = currentMonth.split('-').map(Number);
    const list = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(yy, mm - 1 - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const e = expenses.filter(x => monthKey(x.date) === key).reduce((s, x) => s + parseAmount(x.amount), 0);
      const inc = income.filter(x => monthKey(x.date) === key).reduce((s, x) => s + parseAmount(x.amount), 0);
      list.push({ key, label: MONTHS_SHORT[d.getMonth()], e, inc });
    }
    return list;
  }, [expenses, income, currentMonth]);

  const maxTrend = Math.max(1, ...trendMonths.map(m => Math.max(m.e, m.inc)));
  const [yy, mm] = currentMonth.split('-').map(Number);
  const monthLabel = `${MONTHS_FULL[mm-1]} ${yy}`;

  const recent = [...monthExpenses.map(x => ({...x, _type: 'expense'})), ...monthIncome.map(x => ({...x, _type: 'income'}))]
    .sort((a,b) => (b.date || '').localeCompare(a.date || '')).slice(0, 6);

  const expPct = totalInc > 0 ? Math.min(100, (totalExp / totalInc) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] tracking-[0.15em] uppercase text-stone-500 mb-2">Summary for</div>
        <h1 style={{ fontFamily: "'Fraunces', serif" }} className="text-5xl font-light text-stone-900 leading-[1.05]">{monthLabel}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#edf3ec' }}>
              <ArrowDownRight size={15} style={{ color: '#5a7d57' }} />
            </div>
            <span className="text-[11px] tracking-[0.1em] uppercase text-stone-500">Income in</span>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace" }} className="text-[32px] font-medium text-stone-900 tabular-nums leading-none">{fmt(totalInc, cur)}</div>
          <div className="text-xs text-stone-500 mt-2">{monthIncome.length} {monthIncome.length === 1 ? 'entry' : 'entries'}</div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#f5ede8' }}>
              <ArrowUpRight size={15} style={{ color: '#a06e4e' }} />
            </div>
            <span className="text-[11px] tracking-[0.1em] uppercase text-stone-500">Expenses out</span>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace" }} className="text-[32px] font-medium text-stone-900 tabular-nums leading-none">{fmt(totalExp, cur)}</div>
          <div className="text-xs text-stone-500 mt-2">{monthExpenses.length} {monthExpenses.length === 1 ? 'charge' : 'charges'}</div>
        </Card>

        <Card className="p-6" style={{ background: 'linear-gradient(135deg, #2d2924 0%, #1f1c18 100%)' }}>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(245, 239, 230, 0.1)' }}>
              <Sparkles size={15} className="text-stone-300" />
            </div>
            <span className="text-[11px] tracking-[0.1em] uppercase text-stone-400">Net profit</span>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace" }} className={`text-[32px] font-medium tabular-nums leading-none ${net >= 0 ? 'text-stone-50' : 'text-red-300'}`}>
            {net >= 0 ? '' : '-'}{fmt(Math.abs(net), cur)}
          </div>
          <div className="text-xs text-stone-400 mt-2">After expenses this month</div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="text-[11px] tracking-[0.1em] uppercase text-stone-500 mb-1">Partner split</div>
            <h2 style={{ fontFamily: "'Fraunces', serif" }} className="text-2xl font-light text-stone-900">End of month distribution</h2>
          </div>
          <div className="text-xs text-stone-500 text-right"><div>{settings.splitA}% / {settings.splitB}%</div></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[{ name: settings.partnerA, share: shareA, pct: settings.splitA },
            { name: settings.partnerB, share: shareB, pct: settings.splitB }].map(p => (
            <div key={p.name} className="rounded-2xl p-5" style={{ backgroundColor: '#f5efe6' }}>
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-stone-50 text-sm font-medium" style={{ backgroundColor: '#2d2924' }}>
                  {p.name.slice(0,1).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-medium text-stone-900">{p.name}</div>
                  <div className="text-[11px] text-stone-500">{p.pct}% share</div>
                </div>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace" }} className={`text-2xl font-medium tabular-nums ${p.share >= 0 ? 'text-stone-900' : 'text-red-700'}`}>
                {p.share >= 0 ? '' : '-'}{fmt(Math.abs(p.share), cur)}
              </div>
            </div>
          ))}
        </div>

        {totalInc > 0 && (
          <div className="mt-5">
            <div className="flex items-center justify-between text-[11px] tracking-[0.05em] uppercase text-stone-500 mb-2">
              <span>Costs as share of income</span>
              <span>{expPct.toFixed(0)}%</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#eee5d5' }}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${expPct}%`, backgroundColor: expPct > 80 ? '#c47474' : '#a0896b' }} />
            </div>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="text-[11px] tracking-[0.1em] uppercase text-stone-500">Six month trend</div>
            <div className="flex items-center gap-4 text-[11px] text-stone-600">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#c9b9a1' }}></div>Expenses</div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: '#7d9d7a' }}></div>Income</div>
            </div>
          </div>
          <div className="flex items-end gap-3 h-44">
            {trendMonths.map(m => (
              <div key={m.key} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex items-end justify-center gap-1 h-36">
                  <div className="w-1/2 rounded-t-lg transition-all duration-500" style={{ height: `${(m.e / maxTrend) * 100}%`, minHeight: m.e > 0 ? '3px' : '0', backgroundColor: '#c9b9a1' }} title={`Expenses: ${fmt(m.e, cur)}`} />
                  <div className="w-1/2 rounded-t-lg transition-all duration-500" style={{ height: `${(m.inc / maxTrend) * 100}%`, minHeight: m.inc > 0 ? '3px' : '0', backgroundColor: '#7d9d7a' }} title={`Income: ${fmt(m.inc, cur)}`} />
                </div>
                <div className={`text-[11px] ${m.key === currentMonth ? 'text-stone-900 font-medium' : 'text-stone-500'}`}>{m.label}</div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#f5efe6' }}>
                <Clock size={13} className="text-stone-600" />
              </div>
              <span className="text-[11px] tracking-[0.1em] uppercase text-stone-500">Uncollected</span>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace" }} className="text-xl font-medium text-stone-900 tabular-nums">{fmt(totalUncollected, cur)}</div>
            <div className="text-xs text-stone-500 mt-1">{uncollected.filter(u => !u.collected).length} pending</div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#f5efe6' }}>
                <HandCoins size={13} className="text-stone-600" />
              </div>
              <span className="text-[11px] tracking-[0.1em] uppercase text-stone-500">Loan balance</span>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace" }} className={`text-xl font-medium tabular-nums ${totalLoans >= 0 ? 'text-stone-900' : 'text-emerald-800'}`}>
              {totalLoans >= 0 ? '' : '-'}{fmt(Math.abs(totalLoans), cur)}
            </div>
            <div className="text-xs text-stone-500 mt-1">{loans.length} entries</div>
          </Card>
        </div>
      </div>

      {recent.length > 0 && (
        <Card className="p-6">
          <div className="text-[11px] tracking-[0.1em] uppercase text-stone-500 mb-4">Recent activity</div>
          <div className="space-y-0 divide-y" style={{ borderColor: '#f0ece3' }}>
            {recent.map(item => (
              <div key={item.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item._type === 'income' ? '#7d9d7a' : '#c9b9a1' }}></div>
                  <div>
                    <div className="text-sm text-stone-900">{item.vendor || item.source}</div>
                    <div className="text-xs text-stone-500">{fmtDate(item.date)}{item.notes ? ` · ${item.notes}` : ''}</div>
                  </div>
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace" }} className={`tabular-nums text-sm font-medium ${item._type === 'income' ? 'text-emerald-800' : 'text-stone-900'}`}>
                  {item._type === 'income' ? '+' : ''}{fmt(parseAmount(item.amount), cur)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function LedgerTab({ kind, data, setData }) {
  const isExpense = kind === 'expense';
  const listKey = isExpense ? 'expenses' : 'income';
  const nameField = isExpense ? 'vendor' : 'source';
  const nameLabel = isExpense ? 'Vendor' : 'Source';
  const title = isExpense ? 'Expenses' : 'Income';
  const helpText = isExpense ? 'Everything coming out of the business account.' : 'Monthly Stripe payouts and any other income.';

  const list = data[listKey];
  const { currency } = data.settings;

  const [filter, setFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ [nameField]: '', date: todayISO(), amount: '', notes: '' });
  const [sortBy, setSortBy] = useState({ field: 'date', dir: 'desc' });

  const months = useMemo(() => {
    const set = new Set(list.map(x => monthKey(x.date)).filter(Boolean));
    return [...set].sort().reverse();
  }, [list]);

  const filtered = useMemo(() => {
    let arr = [...list];
    if (filter !== 'all') arr = arr.filter(x => monthKey(x.date) === filter);
    arr.sort((a, b) => {
      let av = a[sortBy.field], bv = b[sortBy.field];
      if (sortBy.field === 'amount') { av = parseAmount(av); bv = parseAmount(bv); }
      if (av < bv) return sortBy.dir === 'asc' ? -1 : 1;
      if (av > bv) return sortBy.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [list, filter, sortBy]);

  const totalFiltered = filtered.reduce((s, x) => s + parseAmount(x.amount), 0);

  const handleAdd = () => {
    if (!form[nameField].trim() || !form.amount) return;
    const newItem = { id: uid(), ...form, amount: parseAmount(form.amount) };
    setData(d => ({ ...d, [listKey]: [...d[listKey], newItem] }));
    setForm({ [nameField]: '', date: todayISO(), amount: '', notes: '' });
  };

  const handleUpdate = (id, patch) => setData(d => ({ ...d, [listKey]: d[listKey].map(x => x.id === id ? { ...x, ...patch } : x) }));

  const handleDelete = (id) => {
    setData(d => ({ ...d, [listKey]: d[listKey].filter(x => x.id !== id) }));
    if (editingId === id) setEditingId(null);
  };

  const toggleSort = (field) => {
    setSortBy(s => s.field === field ? { field, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'asc' });
  };

  const exportCSV = () => {
    const headers = [nameLabel, 'Date', 'Amount', 'Notes'];
    const rows = filtered.map(x => [x[nameField], x.date, parseAmount(x.amount).toFixed(2), x.notes || '']);
    const suffix = filter === 'all' ? 'all' : filter;
    download(`ventra-${listKey}-${suffix}.csv`, toCSV(rows, headers), 'text/csv');
  };

  const fileInputRef = useRef(null);
  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length === 0) return;
    const imported = rows.map(r => {
      const name = r[nameField.toLowerCase()] || r[nameLabel.toLowerCase()] || r.charge || r.vendor || r.source || r.name || '';
      const date = parseFlexDate(r['date charged'] || r.date || '');
      const amount = parseAmount(r.total || r.amount || r.value || '0');
      const notes = r.notes || r.note || '';
      return { id: uid(), [nameField]: name, date, amount, notes };
    }).filter(x => x[nameField] && x.amount);
    setData(d => ({ ...d, [listKey]: [...d[listKey], ...imported] }));
    e.target.value = '';
    alert(`Imported ${imported.length} ${kind} ${imported.length === 1 ? 'entry' : 'entries'}.`);
  };

  const filterOptions = [{ value: 'all', label: 'All months' }, ...months.map(m => {
    const [y, mo] = m.split('-');
    return { value: m, label: `${MONTHS_FULL[Number(mo)-1]} ${y}` };
  })];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-[11px] tracking-[0.15em] uppercase text-stone-500 mb-2">{isExpense ? 'Money out' : 'Money in'}</div>
          <h1 style={{ fontFamily: "'Fraunces', serif" }} className="text-4xl font-light text-stone-900 leading-none">{title}</h1>
          <p className="text-sm text-stone-500 mt-2">{helpText}</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} className="hidden" />
          <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} /> Import
          </Button>
          <Button variant="secondary" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download size={14} /> Export
          </Button>
        </div>
      </div>

      <Card className="p-5">
        <div className="text-[11px] tracking-[0.1em] uppercase text-stone-500 mb-3">Add {kind}</div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4">
            <Label>{nameLabel}</Label>
            <TextField value={form[nameField]} onChange={v => setForm(f => ({ ...f, [nameField]: v }))}
              placeholder={isExpense ? 'e.g. ElevenLabs' : 'e.g. Stripe payout'} onKeyDown={e => e.key === 'Enter' && handleAdd()} />
          </div>
          <div className="md:col-span-2">
            <Label>Date</Label>
            <TextField type="date" value={form.date} onChange={v => setForm(f => ({ ...f, date: v }))} />
          </div>
          <div className="md:col-span-3">
            <Label>Amount</Label>
            <NumberField value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} />
          </div>
          <div className="md:col-span-2">
            <Label>Notes</Label>
            <TextField value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))}
              placeholder="Optional" onKeyDown={e => e.key === 'Enter' && handleAdd()} />
          </div>
          <div className="md:col-span-1 flex items-end">
            <Button onClick={handleAdd} className="w-full" disabled={!form[nameField].trim() || !form.amount}>
              <Plus size={14} />
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="text-[11px] tracking-[0.1em] uppercase text-stone-500">Showing</div>
          <Dropdown value={filter} options={filterOptions} onChange={setFilter} className="min-w-[170px]" />
        </div>
        <div className="text-right">
          <div className="text-[11px] tracking-[0.1em] uppercase text-stone-500 mb-0.5">Total</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace" }} className={`text-xl font-medium tabular-nums ${isExpense ? 'text-stone-900' : 'text-emerald-800'}`}>
            {fmt(totalFiltered, currency)}
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-14 text-center text-stone-500 text-sm">
            No {kind} entries yet. Add one above or import a CSV.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] tracking-[0.1em] uppercase text-stone-500" style={{ borderBottom: '1px solid #f0ece3' }}>
                  <th className="text-left font-medium px-6 py-4 cursor-pointer hover:text-stone-900 transition-colors" onClick={() => toggleSort(nameField)}>
                    {nameLabel} {sortBy.field === nameField && (sortBy.dir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="text-left font-medium px-6 py-4 cursor-pointer hover:text-stone-900 transition-colors" onClick={() => toggleSort('date')}>
                    Date {sortBy.field === 'date' && (sortBy.dir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="text-right font-medium px-6 py-4 cursor-pointer hover:text-stone-900 transition-colors" onClick={() => toggleSort('amount')}>
                    Amount {sortBy.field === 'amount' && (sortBy.dir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="text-left font-medium px-6 py-4">Notes</th>
                  <th className="w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <Row key={item.id} item={item} nameField={nameField} currency={currency}
                    editing={editingId === item.id}
                    onEdit={() => setEditingId(item.id)}
                    onCancel={() => setEditingId(null)}
                    onSave={(patch) => { handleUpdate(item.id, patch); setEditingId(null); }}
                    onDelete={() => handleDelete(item.id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Row({ item, nameField, currency, editing, onEdit, onCancel, onSave, onDelete }) {
  const [draft, setDraft] = useState(item);
  useEffect(() => { setDraft(item); }, [item, editing]);

  if (editing) {
    return (
      <tr style={{ backgroundColor: '#f7f3eb', borderBottom: '1px solid #f0ece3' }}>
        <td className="px-6 py-2.5"><TextField value={draft[nameField]} onChange={v => setDraft({...draft, [nameField]: v})} /></td>
        <td className="px-6 py-2.5"><TextField type="date" value={draft.date} onChange={v => setDraft({...draft, date: v})} /></td>
        <td className="px-6 py-2.5"><NumberField value={draft.amount} onChange={v => setDraft({...draft, amount: v})} /></td>
        <td className="px-6 py-2.5"><TextField value={draft.notes || ''} onChange={v => setDraft({...draft, notes: v})} /></td>
        <td className="px-6 py-2.5">
          <div className="flex gap-1 justify-end">
            <button onClick={() => onSave({ ...draft, amount: parseAmount(draft.amount) })} className="p-2 rounded-xl text-stone-700 hover:bg-stone-200 transition-colors" title="Save"><Check size={14} /></button>
            <button onClick={onCancel} className="p-2 rounded-xl text-stone-500 hover:bg-stone-200 transition-colors" title="Cancel"><X size={14} /></button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="group hover:bg-stone-50 transition-colors" style={{ borderBottom: '1px solid #f0ece3' }}>
      <td className="px-6 py-4 text-stone-900">{item[nameField]}</td>
      <td className="px-6 py-4 text-stone-600 tabular-nums text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtDate(item.date)}</td>
      <td className="px-6 py-4 text-right tabular-nums font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmt(parseAmount(item.amount), currency)}</td>
      <td className="px-6 py-4 text-stone-500 text-xs">{item.notes}</td>
      <td className="px-6 py-4">
        <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="p-2 rounded-xl text-stone-600 hover:bg-stone-200 transition-colors" title="Edit"><Pencil size={13} /></button>
          <button onClick={onDelete} className="p-2 rounded-xl text-red-700 hover:bg-red-50 transition-colors" title="Delete"><Trash2 size={13} /></button>
        </div>
      </td>
    </tr>
  );
}

function UncollectedTab({ data, setData }) {
  const { uncollected, settings } = data;
  const [form, setForm] = useState({ description: '', amount: '', assignedTo: '', notes: '' });
  const { currency, partnerA, partnerB } = settings;

  const add = () => {
    if (!form.description.trim() || !form.amount) return;
    const item = { id: uid(), date: todayISO(), collected: false, ...form, amount: parseAmount(form.amount) };
    setData(d => ({ ...d, uncollected: [...d.uncollected, item] }));
    setForm({ description: '', amount: '', assignedTo: '', notes: '' });
  };
  const toggle = (id) => setData(d => ({ ...d, uncollected: d.uncollected.map(u => u.id === id ? { ...u, collected: !u.collected } : u) }));
  const remove = (id) => setData(d => ({ ...d, uncollected: d.uncollected.filter(u => u.id !== id) }));

  const pending = uncollected.filter(u => !u.collected);
  const collected = uncollected.filter(u => u.collected);
  const pendingTotal = pending.reduce((s, u) => s + parseAmount(u.amount), 0);

  const assignOptions = [
    { value: '', label: '—' },
    { value: partnerA, label: partnerA },
    { value: partnerB, label: partnerB },
    { value: 'Both', label: 'Both' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] tracking-[0.15em] uppercase text-stone-500 mb-2">Money owed</div>
        <h1 style={{ fontFamily: "'Fraunces', serif" }} className="text-4xl font-light text-stone-900 leading-none">Uncollected</h1>
        <p className="text-sm text-stone-500 mt-2">Fees, reimbursements, or splits owed to the business that haven't come in yet.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-5">
          <div className="text-[11px] tracking-[0.1em] uppercase text-stone-500 mb-2">Pending</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace" }} className="text-2xl font-medium text-stone-900 tabular-nums">{fmt(pendingTotal, currency)}</div>
          <div className="text-xs text-stone-500 mt-1">{pending.length} items</div>
        </Card>
        <Card className="p-5">
          <div className="text-[11px] tracking-[0.1em] uppercase text-stone-500 mb-2">Collected</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace" }} className="text-2xl font-medium text-emerald-800 tabular-nums">{fmt(collected.reduce((s,u) => s + parseAmount(u.amount), 0), currency)}</div>
          <div className="text-xs text-stone-500 mt-1">{collected.length} items</div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="text-[11px] tracking-[0.1em] uppercase text-stone-500 mb-3">Add item</div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5">
            <Label>Description</Label>
            <TextField value={form.description} onChange={v => setForm({...form, description: v})}
              placeholder="e.g. Warwick management fee" onKeyDown={e => e.key === 'Enter' && add()} />
          </div>
          <div className="md:col-span-3">
            <Label>Amount</Label>
            <NumberField value={form.amount} onChange={v => setForm({...form, amount: v})} />
          </div>
          <div className="md:col-span-2">
            <Label>Assigned to</Label>
            <Dropdown value={form.assignedTo} options={assignOptions} onChange={v => setForm({...form, assignedTo: v})} />
          </div>
          <div className="md:col-span-1 flex items-end">
            <Button onClick={add} className="w-full" disabled={!form.description.trim() || !form.amount}>
              <Plus size={14} />
            </Button>
          </div>
          <div className="md:col-span-12">
            <Label>Notes</Label>
            <TextField value={form.notes} onChange={v => setForm({...form, notes: v})} placeholder="Optional" />
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {uncollected.length === 0 ? (
          <div className="p-14 text-center text-stone-500 text-sm">No uncollected items yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] tracking-[0.1em] uppercase text-stone-500" style={{ borderBottom: '1px solid #f0ece3' }}>
                <th className="w-12 text-left px-6 py-4"></th>
                <th className="text-left font-medium px-6 py-4">Description</th>
                <th className="text-left font-medium px-6 py-4">Assigned</th>
                <th className="text-right font-medium px-6 py-4">Amount</th>
                <th className="text-left font-medium px-6 py-4">Notes</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {[...uncollected].sort((a,b) => (a.collected - b.collected) || (b.date || '').localeCompare(a.date || '')).map(u => (
                <tr key={u.id} className={`group hover:bg-stone-50 transition-colors ${u.collected ? 'text-stone-400' : ''}`} style={{ borderBottom: '1px solid #f0ece3' }}>
                  <td className="px-6 py-4">
                    <button onClick={() => toggle(u.id)}
                      className={`w-5 h-5 rounded-md transition-all flex items-center justify-center ${u.collected ? 'text-white' : 'hover:scale-110'}`}
                      style={u.collected ? { backgroundColor: '#7d9d7a' } : { boxShadow: '0 0 0 1.5px #d6ccbe' }}>
                      {u.collected && <Check size={12} />}
                    </button>
                  </td>
                  <td className={`px-6 py-4 ${u.collected ? 'line-through' : 'text-stone-900'}`}>{u.description}</td>
                  <td className="px-6 py-4 text-stone-600 text-xs">{u.assignedTo || '—'}</td>
                  <td className="px-6 py-4 text-right tabular-nums font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmt(parseAmount(u.amount), currency)}</td>
                  <td className="px-6 py-4 text-stone-500 text-xs">{u.notes}</td>
                  <td className="px-6 py-4">
                    <button onClick={() => remove(u.id)} className="p-2 rounded-xl text-red-700 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function LoansTab({ data, setData }) {
  const { loans, settings } = data;
  const [form, setForm] = useState({ description: '', amount: '', date: todayISO(), direction: 'out', notes: '' });
  const { currency } = settings;

  const add = () => {
    if (!form.description.trim() || !form.amount) return;
    const item = { id: uid(), ...form, amount: parseAmount(form.amount) };
    setData(d => ({ ...d, loans: [...d.loans, item] }));
    setForm({ description: '', amount: '', date: todayISO(), direction: 'out', notes: '' });
  };
  const remove = (id) => setData(d => ({ ...d, loans: d.loans.filter(l => l.id !== id) }));

  const total = loans.reduce((s, l) => s + parseAmount(l.amount) * (l.direction === 'in' ? -1 : 1), 0);

  const directionOptions = [
    { value: 'out', label: 'Loaned to business' },
    { value: 'in', label: 'Paid back' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] tracking-[0.15em] uppercase text-stone-500 mb-2">Loans tracker</div>
        <h1 style={{ fontFamily: "'Fraunces', serif" }} className="text-4xl font-light text-stone-900 leading-none">Personal loans</h1>
        <p className="text-sm text-stone-500 mt-2">Money lent to the business or drawn from it, tracked separately from regular expenses.</p>
      </div>

      <Card className="p-5">
        <div className="text-[11px] tracking-[0.1em] uppercase text-stone-500 mb-2">Net position</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace" }} className={`text-3xl font-medium tabular-nums ${total >= 0 ? 'text-stone-900' : 'text-emerald-800'}`}>
          {total >= 0 ? '' : '-'}{fmt(Math.abs(total), currency)}
        </div>
        <div className="text-xs text-stone-500 mt-1">{total >= 0 ? 'Owed back to lender' : 'Business has been paid back'}</div>
      </Card>

      <Card className="p-5">
        <div className="text-[11px] tracking-[0.1em] uppercase text-stone-500 mb-3">Add loan entry</div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4">
            <Label>Description</Label>
            <TextField value={form.description} onChange={v => setForm({...form, description: v})}
              placeholder="e.g. Personal loan to cover setup" onKeyDown={e => e.key === 'Enter' && add()} />
          </div>
          <div className="md:col-span-2">
            <Label>Date</Label>
            <TextField type="date" value={form.date} onChange={v => setForm({...form, date: v})} />
          </div>
          <div className="md:col-span-3">
            <Label>Amount</Label>
            <NumberField value={form.amount} onChange={v => setForm({...form, amount: v})} />
          </div>
          <div className="md:col-span-2">
            <Label>Direction</Label>
            <Dropdown value={form.direction} options={directionOptions} onChange={v => setForm({...form, direction: v})} />
          </div>
          <div className="md:col-span-1 flex items-end">
            <Button onClick={add} className="w-full" disabled={!form.description.trim() || !form.amount}><Plus size={14} /></Button>
          </div>
          <div className="md:col-span-12">
            <Label>Notes</Label>
            <TextField value={form.notes} onChange={v => setForm({...form, notes: v})} placeholder="Optional" />
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {loans.length === 0 ? (
          <div className="p-14 text-center text-stone-500 text-sm">No loan entries yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] tracking-[0.1em] uppercase text-stone-500" style={{ borderBottom: '1px solid #f0ece3' }}>
                <th className="text-left font-medium px-6 py-4">Description</th>
                <th className="text-left font-medium px-6 py-4">Date</th>
                <th className="text-left font-medium px-6 py-4">Direction</th>
                <th className="text-right font-medium px-6 py-4">Amount</th>
                <th className="text-left font-medium px-6 py-4">Notes</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {[...loans].sort((a,b) => (b.date || '').localeCompare(a.date || '')).map(l => (
                <tr key={l.id} className="group hover:bg-stone-50 transition-colors" style={{ borderBottom: '1px solid #f0ece3' }}>
                  <td className="px-6 py-4 text-stone-900">{l.description}</td>
                  <td className="px-6 py-4 text-stone-600 tabular-nums text-xs" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmtDate(l.date)}</td>
                  <td className="px-6 py-4 text-xs">
                    <span className="inline-block px-3 py-1 rounded-full text-[11px]"
                      style={l.direction === 'out' ? { backgroundColor: '#f5efe6', color: '#6b5d4f' } : { backgroundColor: '#edf3ec', color: '#5a7d57' }}>
                      {l.direction === 'out' ? 'Loaned' : 'Paid back'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right tabular-nums font-medium" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmt(parseAmount(l.amount), currency)}</td>
                  <td className="px-6 py-4 text-stone-500 text-xs">{l.notes}</td>
                  <td className="px-6 py-4">
                    <button onClick={() => remove(l.id)} className="p-2 rounded-xl text-red-700 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete"><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function SettingsTab({ data, setData, resetAll }) {
  const { settings } = data;
  const [local, setLocal] = useState(settings);
  const fileRef = useRef(null);

  useEffect(() => { setLocal(settings); }, [settings]);

  const save = () => {
    const splitA = Math.max(0, Math.min(100, Number(local.splitA) || 0));
    const splitB = 100 - splitA;
    setData(d => ({ ...d, settings: { ...local, splitA, splitB } }));
  };

  const exportAll = () => download(`ventra-ledger-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json');

  const importAll = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!imported.expenses || !imported.income) throw new Error('Invalid file');
      const merge = confirm('Click OK to MERGE with existing data.\nClick Cancel to REPLACE all current data.');
      if (merge) {
        setData(d => ({
          expenses: [...d.expenses, ...(imported.expenses || [])],
          income: [...d.income, ...(imported.income || [])],
          uncollected: [...d.uncollected, ...(imported.uncollected || [])],
          loans: [...d.loans, ...(imported.loans || [])],
          settings: d.settings,
        }));
        alert('Imported and merged.');
      } else {
        setData({ ...defaultData, ...imported, settings: { ...defaultSettings, ...(imported.settings || {}) } });
        alert('Imported and replaced.');
      }
    } catch { alert('Could not read that file.'); }
    e.target.value = '';
  };

  const currencyOptions = [
    { value: 'AUD', label: 'AUD — Australian Dollar' },
    { value: 'USD', label: 'USD — US Dollar' },
    { value: 'GBP', label: 'GBP — British Pound' },
    { value: 'EUR', label: 'EUR — Euro' },
    { value: 'NZD', label: 'NZD — New Zealand Dollar' },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <div className="text-[11px] tracking-[0.15em] uppercase text-stone-500 mb-2">Configuration</div>
        <h1 style={{ fontFamily: "'Fraunces', serif" }} className="text-4xl font-light text-stone-900 leading-none">Settings</h1>
      </div>

      <Card className="p-6">
        <h2 className="text-sm font-medium text-stone-900 mb-4">Partners</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Partner A name</Label>
            <TextField value={local.partnerA} onChange={v => setLocal({...local, partnerA: v})} />
          </div>
          <div>
            <Label>Partner B name</Label>
            <TextField value={local.partnerB} onChange={v => setLocal({...local, partnerB: v})} />
          </div>
          <div>
            <Label>{local.partnerA}'s share (%)</Label>
            <NumberField value={local.splitA} onChange={v => setLocal({...local, splitA: Number(v), splitB: 100 - Number(v)})} step={5} prefix="" />
          </div>
          <div>
            <Label>{local.partnerB}'s share (%)</Label>
            <div className="px-4 py-2.5 text-sm rounded-2xl text-stone-500 tabular-nums"
              style={{ backgroundColor: '#f5efe6', fontFamily: "'JetBrains Mono', monospace" }}>
              {100 - (Number(local.splitA) || 0)}%
            </div>
          </div>
          <div className="col-span-2">
            <Label>Currency</Label>
            <Dropdown value={local.currency} options={currencyOptions} onChange={v => setLocal({...local, currency: v})} />
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={save} variant="accent">Save settings</Button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-medium text-stone-900 mb-1">Backup and sync</h2>
        <p className="text-sm text-stone-500 mb-4">Export everything as a JSON file to back up or share. Import to restore or merge.</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportAll} variant="secondary"><Download size={14} /> Export all (JSON)</Button>
          <input ref={fileRef} type="file" accept=".json" onChange={importAll} className="hidden" />
          <Button onClick={() => fileRef.current?.click()} variant="secondary"><Upload size={14} /> Import JSON</Button>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-medium text-red-900 mb-1">Danger zone</h2>
        <p className="text-sm text-stone-500 mb-4">Wipe all ledger data. Export a backup first if you might need it.</p>
        <Button onClick={() => { if (confirm('Delete all data?')) resetAll(); }} variant="danger"><Trash2 size={14} /> Reset all data</Button>
      </Card>
    </div>
  );
}

// ============ Main App ============
export default function App() {
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('overview');
  const [currentMonth, setCurrentMonth] = useState(() => todayISO().slice(0, 7));
  const saveTimer = useRef(null);

  useEffect(() => {
    loadFromStorage().then(d => { setData(d); setLoaded(true); });
  }, []);

  useEffect(() => {
    if (!loaded || !data) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      await saveToStorage(data);
      setTimeout(() => setSaving(false), 400);
    }, 600);
    return () => saveTimer.current && clearTimeout(saveTimer.current);
  }, [data, loaded]);

  const resetAll = () => setData({ ...defaultData, settings: data.settings });

  const monthOptions = useMemo(() => {
    if (!data) return [];
    const set = new Set([currentMonth, ...data.expenses.map(e => monthKey(e.date)), ...data.income.map(e => monthKey(e.date))].filter(Boolean));
    return [...set].sort().reverse().map(m => {
      const [y, mo] = m.split('-');
      return { value: m, label: `${MONTHS_FULL[Number(mo)-1]} ${y}` };
    });
  }, [data, currentMonth]);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f5efe6' }}>
        <div className="text-stone-500 text-sm">Loading...</div>
      </div>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'expenses', label: 'Expenses', icon: Receipt },
    { id: 'income', label: 'Income', icon: Banknote },
    { id: 'uncollected', label: 'Uncollected', icon: Clock },
    { id: 'loans', label: 'Loans', icon: HandCoins },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ];

  const showMonthPicker = tab === 'overview' || tab === 'expenses' || tab === 'income';

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f5efe6', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;1,9..144,300&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <style>{`
        @keyframes dropdownIn {
          from { opacity: 0; transform: translateY(-4px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .tabular-nums { font-variant-numeric: tabular-nums; }
        input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.4; cursor: pointer; }
        input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type="number"] { -moz-appearance: textfield; }
        ::selection { background: #d6ccbe; color: #2a2520; }
      `}</style>

      <div className="flex min-h-screen">
        <aside className="fixed top-0 left-0 h-screen w-[220px] flex flex-col p-4 z-20" style={{ backgroundColor: '#ebe4d8' }}>
          <div className="flex items-center gap-2.5 px-2 pt-2 pb-6">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: '#2d2924' }}>
              <span style={{ fontFamily: "'Fraunces', serif" }} className="text-lg italic text-stone-50 leading-none">V</span>
            </div>
            <div>
              <div style={{ fontFamily: "'Fraunces', serif" }} className="text-base font-medium leading-tight text-stone-900">Ventra</div>
              <div className="text-[10px] tracking-[0.1em] text-stone-500 uppercase">Ledger</div>
            </div>
          </div>

          <nav className="flex-1 space-y-1">
            {tabs.map(t => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-all ${active ? 'bg-white text-stone-900' : 'text-stone-600 hover:text-stone-900 hover:bg-white/40'}`}
                  style={active ? { boxShadow: '0 1px 2px rgba(60, 50, 35, 0.05)' } : {}}>
                  <Icon size={15} strokeWidth={active ? 2 : 1.7} />
                  {t.label}
                </button>
              );
            })}
          </nav>

          <div className="pt-4 border-t" style={{ borderColor: '#d6ccbe' }}>
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-stone-500">
              <div className={`w-1.5 h-1.5 rounded-full ${saving ? 'bg-amber-500' : 'bg-emerald-600'}`}></div>
              <span>{saving ? 'Saving...' : 'All changes saved'}</span>
            </div>
            <div className="px-3 py-1.5 text-[11px] text-stone-400 tracking-[0.05em]">
              {data.settings.partnerA} &amp; {data.settings.partnerB}
            </div>
          </div>
        </aside>

        <main className="flex-1 ml-[220px]">
          {showMonthPicker && (
            <div className="sticky top-0 z-10 px-8 py-4 flex items-center justify-end" style={{ backgroundColor: 'rgba(245, 239, 230, 0.85)', backdropFilter: 'blur(12px)' }}>
              <div className="flex items-center gap-3">
                <span className="text-[11px] tracking-[0.1em] uppercase text-stone-500">Viewing</span>
                <Dropdown value={currentMonth} options={monthOptions} onChange={setCurrentMonth} align="right" className="min-w-[180px]" />
              </div>
            </div>
          )}
          <div className={`px-8 ${showMonthPicker ? 'pb-10 pt-2' : 'py-10'}`}>
            {tab === 'overview' && <Overview data={data} currentMonth={currentMonth} />}
            {tab === 'expenses' && <LedgerTab kind="expense" data={data} setData={setData} />}
            {tab === 'income' && <LedgerTab kind="income" data={data} setData={setData} />}
            {tab === 'uncollected' && <UncollectedTab data={data} setData={setData} />}
            {tab === 'loans' && <LoansTab data={data} setData={setData} />}
            {tab === 'settings' && <SettingsTab data={data} setData={setData} resetAll={resetAll} />}
          </div>
        </main>
      </div>
    </div>
  );
}
