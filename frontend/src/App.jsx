import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { todayISO, validate } from "./validate.js";

const EMPTY = { name: "", age: "", gender: "", ward: "", department: "", doctor: "", admission_date: "", status: "Admitted" };
const NO_FILTERS = { search: "", ward: "", department: "", doctor: "", status: "" };
const AVATARS = [
  ["#0e7490", "#22b8cf"], ["#4f46e5", "#818cf8"], ["#0f766e", "#2dd4bf"],
  ["#be185d", "#f472b6"], ["#b45309", "#fbbf24"], ["#1d4ed8", "#60a5fa"],
];
const avatarStyle = (name) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 997;
  const [a, b] = AVATARS[h % AVATARS.length];
  return { background: `linear-gradient(135deg, ${a}, ${b})` };
};
const TODAY = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const formatDate = (iso) => {
  const [y, m, d] = iso.split("-");
  return new Date(+y, +m - 1, +d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};
const pct = (n, t) => (t ? `${Math.round((n / t) * 100)}% of all patients` : "No patients yet");
const initials = (name) => name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();

/* ------------------------------------------------------------ icons */
const Icon = ({ d, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.map((p, i) => <path key={i} d={p} />)}
  </svg>
);
const ICONS = {
  plus: ["M12 5v14", "M5 12h14"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M21 21l-4.3-4.3"],
  edit: ["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"],
  trash: ["M3 6h18", "M8 6V4h8v2", "M19 6l-1 14H6L5 6"],
  check: ["M20 6L9 17l-5-5"],
  logo: ["M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"],
  users: ["M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M23 21v-2a4 4 0 0 0-3-3.9", "M16 3.1a4 4 0 0 1 0 7.8"],
  bed: ["M2 18V6", "M2 14h20v4", "M22 14v-2a4 4 0 0 0-4-4h-8v6"],
  cal: ["M3 6h18v15H3z", "M16 3v4", "M8 3v4", "M3 11h18"],
  out: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"],
};

/* ------------------------------------------------------------ dialogs */
function useEscape(onClose) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", h); document.body.style.overflow = ""; };
  }, [onClose]);
}

function PatientForm({ options, initial, onClose, onSaved }) {
  const editing = Boolean(initial?.id);
  const [form, setForm] = useState(initial ? { ...initial } : { ...EMPTY, admission_date: todayISO() });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  useEscape(onClose);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  async function submit(ev) {
    ev.preventDefault();
    setFormError("");
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      const body = { ...form, name: form.name.trim().replace(/\s+/g, " "), age: Number(form.age) };
      const saved = editing ? await api.update(initial.id, body) : await api.create(body);
      onSaved(saved, editing);
    } catch (err) {
      setErrors((e) => ({ ...e, ...err.errors }));
      setFormError(err.message);
      setSaving(false);
    }
  }

  const select = (key, label, list) => (
    <div className="field">
      <label htmlFor={`f-${key}`}>{label}</label>
      <select id={`f-${key}`} value={form[key]} onChange={(e) => set(key, e.target.value)} aria-invalid={!!errors[key]}>
        <option value="">Select {label.toLowerCase()}</option>
        {list.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      {errors[key] && <em role="alert">{errors[key]}</em>}
    </div>
  );

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog" onSubmit={submit} noValidate role="dialog" aria-modal="true" aria-labelledby="form-title">
        <div className="dialog-head">
          <h2 id="form-title">{editing ? "Edit patient" : "Admit a patient"}</h2>
          <p>{editing ? "Update the details below and save." : "Enter the patient's details. All fields are required."}</p>
        </div>
        <div className="dialog-body">
          {formError && <div className="banner" role="alert">{formError}</div>}
          <div className="grid">
            <div className="field wide">
              <label htmlFor="f-name">Full name</label>
              <input id="f-name" value={form.name} maxLength={100} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Ravi Kumar" autoFocus aria-invalid={!!errors.name} />
              {errors.name && <em role="alert">{errors.name}</em>}
            </div>
            <div className="field">
              <label htmlFor="f-age">Age</label>
              <input id="f-age" type="number" inputMode="numeric" min="0" max="120" value={form.age} onChange={(e) => set("age", e.target.value)} placeholder="0 to 120" aria-invalid={!!errors.age} />
              {errors.age && <em role="alert">{errors.age}</em>}
            </div>
            {select("gender", "Gender", options.genders)}
            {select("ward", "Ward", options.wards)}
            {select("department", "Department", options.departments)}
            {select("doctor", "Doctor", options.doctors)}
            <div className="field">
              <label htmlFor="f-date">Admission date</label>
              <input id="f-date" type="date" max={todayISO()} value={form.admission_date} onChange={(e) => set("admission_date", e.target.value)} aria-invalid={!!errors.admission_date} />
              {errors.admission_date && <em role="alert">{errors.admission_date}</em>}
            </div>
            {editing && select("status", "Status", options.statuses)}
          </div>
        </div>
        <div className="dialog-foot">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Admit patient"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ConfirmDelete({ patient, onCancel, onConfirm, busy }) {
  useEscape(onCancel);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="dialog small" role="alertdialog" aria-modal="true" aria-labelledby="del-title">
        <div className="dialog-head">
          <h2 id="del-title">Delete this patient?</h2>
          <p><strong>{patient.name}</strong>'s record will be permanently removed. This can't be undone.</p>
        </div>
        <div className="dialog-foot">
          <button className="btn secondary" onClick={onCancel}>Keep patient</button>
          <button className="btn danger" onClick={onConfirm} disabled={busy}>{busy ? "Deleting…" : "Delete patient"}</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ pieces */
function RowActions({ p, onEdit, onDischarge, onDelete }) {
  return (
    <div className="row-actions">
      {p.status === "Admitted" && (
        <button className="btn tonal sm" onClick={() => onDischarge(p)}><Icon d={ICONS.out} size={15} />Discharge</button>
      )}
      <button className="btn secondary sm" onClick={() => onEdit(p)} aria-label={`Edit ${p.name}`} title="Edit"><Icon d={ICONS.edit} size={15} /><span className="opt">Edit</span></button>
      <button className="btn secondary sm danger-text" onClick={() => onDelete(p)} aria-label={`Delete ${p.name}`} title="Delete"><Icon d={ICONS.trash} size={15} /><span className="opt">Delete</span></button>
    </div>
  );
}

const Status = ({ status }) => <span className={`pill ${status.toLowerCase()}`}><i />{status}</span>;

function Stat({ icon, label, value, tone, hint }) {
  return (
    <div className={`stat ${tone}`}>
      <div className="stat-icon"><Icon d={ICONS[icon]} size={22} /></div>
      <div className="stat-text">
        <div className="stat-value">{value ?? "–"}</div>
        <div className="stat-label">{label}</div>
        {hint && <div className="stat-hint">{hint}</div>}
      </div>
    </div>
  );
}

function Tabs({ value, onChange, stats }) {
  const items = [
    ["", "All", stats?.total],
    ["Admitted", "Admitted", stats?.admitted],
    ["Discharged", "Discharged", stats?.discharged],
  ];
  return (
    <div className="tabs" role="tablist" aria-label="Filter by status">
      {items.map(([v, label, n]) => (
        <button key={label} role="tab" aria-selected={value === v} className={value === v ? "tab on" : "tab"} onClick={() => onChange(v)}>
          {label}<span>{n ?? 0}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ app */
export default function App() {
  const [options, setOptions] = useState(null);
  const [patients, setPatients] = useState([]);
  const [stats, setStats] = useState(null);
  const [filters, setFilters] = useState(NO_FILTERS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formFor, setFormFor] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState(null);
  const [tick, setTick] = useState(0);
  const toastTimer = useRef();

  const notify = useCallback((text, type = "ok") => {
    clearTimeout(toastTimer.current);
    setToast({ text, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => { api.options().then(setOptions).catch((e) => setLoadError(e.message)); }, []);

  // list reloads on filter change (search debounced); stale responses are ignored
  useEffect(() => {
    let stale = false;
    const t = setTimeout(() => {
      setLoading(true);
      Promise.all([api.list(filters), api.stats()])
        .then(([list, st]) => { if (!stale) { setPatients(list); setStats(st); setLoadError(""); } })
        .catch((e) => !stale && setLoadError(e.message))
        .finally(() => !stale && setLoading(false));
    }, filters.search ? 250 : 0);
    return () => { stale = true; clearTimeout(t); };
  }, [filters, tick]);

  const reload = () => setTick((n) => n + 1);
  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));
  const hasFilters = Object.values(filters).some(Boolean);

  async function discharge(p) {
    try { await api.discharge(p.id); notify(`${p.name} discharged`); reload(); }
    catch (e) { notify(e.message, "err"); }
  }
  async function confirmDelete() {
    setDeleting(true);
    try { await api.remove(toDelete.id); notify(`${toDelete.name} deleted`); setToDelete(null); reload(); }
    catch (e) { notify(e.message, "err"); }
    setDeleting(false);
  }

  const closeForm = useCallback(() => setFormFor(null), []);
  const cancelDelete = useCallback(() => setToDelete(null), []);

  return (
    <>
      <header className="hero">
        <div className="wrap hero-inner">
          <div className="brand">
            <div className="logo"><Icon d={ICONS.logo} size={22} /></div>
            <span>MediDesk</span>
          </div>
          <button className="btn light" disabled={!options} onClick={() => setFormFor({})}><Icon d={ICONS.plus} />Admit<span className="sm-hide">patient</span></button>
        </div>
        <div className="wrap hero-copy">
          <h1>Patient admissions</h1>
          <p><Icon d={ICONS.cal} size={16} />{TODAY}</p>
        </div>
      </header>

      <main className="wrap">
        <section className="stats" aria-label="Summary">
          <Stat icon="users" label="Total patients" value={stats?.total} tone="blue" hint="All records" />
          <Stat icon="bed" label="Currently admitted" value={stats?.admitted} tone="amber" hint={pct(stats?.admitted, stats?.total)} />
          <Stat icon="out" label="Discharged" value={stats?.discharged} tone="green" hint={pct(stats?.discharged, stats?.total)} />
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Patient list</h2>
              <p>{loading && patients.length === 0 ? "Loading…" : `${patients.length} ${patients.length === 1 ? "patient" : "patients"} shown`}</p>
            </div>
            <Tabs value={filters.status} onChange={(v) => setFilter("status", v)} stats={stats} />
          </div>
          <div className={`toolbar${hasFilters ? " has-clear" : ""}`} role="search">
            <div className="search-box">
              <Icon d={ICONS.search} size={18} />
              <input type="search" placeholder="Search by patient name" value={filters.search} onChange={(e) => setFilter("search", e.target.value)} aria-label="Search patients by name" />
            </div>
            {options && (
              <>
                <select value={filters.ward} onChange={(e) => setFilter("ward", e.target.value)} aria-label="Filter by ward">
                  <option value="">All wards</option>
                  {options.wards.map((o) => <option key={o}>{o}</option>)}
                </select>
                <select value={filters.department} onChange={(e) => setFilter("department", e.target.value)} aria-label="Filter by department">
                  <option value="">All departments</option>
                  {options.departments.map((o) => <option key={o}>{o}</option>)}
                </select>
                <select value={filters.doctor} onChange={(e) => setFilter("doctor", e.target.value)} aria-label="Filter by doctor">
                  <option value="">All doctors</option>
                  {options.doctors.map((o) => <option key={o}>{o}</option>)}
                </select>
              </>
            )}
            {hasFilters && <button className="btn secondary" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>}
          </div>

          {loadError && (
            <div className="banner" role="alert">{loadError}<button className="link" onClick={reload}>Try again</button></div>
          )}

          {loading && patients.length === 0 && !loadError && (
            <div className="skeletons" aria-label="Loading patients">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" />)}</div>
          )}

          {!loadError && !loading && patients.length === 0 && (
            <div className="empty">
              <div className="empty-icon"><Icon d={ICONS.users} size={28} /></div>
              <h2>{hasFilters ? "No patients match these filters" : "No patients admitted yet"}</h2>
              <p>{hasFilters ? "Clear the search or filters to see everyone." : "Admit the first patient to start the list."}</p>
              {hasFilters
                ? <button className="btn secondary" onClick={() => setFilters(NO_FILTERS)}>Clear filters</button>
                : options && <button className="btn primary" onClick={() => setFormFor({})}><Icon d={ICONS.plus} />Admit patient</button>}
            </div>
          )}

          {patients.length > 0 && (
            <div className={loading ? "dim" : ""}>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Patient</th><th>Ward</th><th>Department</th><th>Doctor</th><th>Admitted</th><th>Status</th><th><span className="sr">Actions</span></th></tr>
                  </thead>
                  <tbody>
                    {patients.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="who">
                            <span className="avatar" style={avatarStyle(p.name)}>{initials(p.name)}</span>
                            <div><div className="who-name">{p.name}</div><div className="who-sub">{p.age} yrs, {p.gender}</div></div>
                          </div>
                        </td>
                        <td><span className="chip">{p.ward}</span></td>
                        <td>{p.department}</td>
                        <td>{p.doctor}</td>
                        <td className="nowrap">{formatDate(p.admission_date)}</td>
                        <td><Status status={p.status} /></td>
                        <td><RowActions p={p} onEdit={setFormFor} onDischarge={discharge} onDelete={setToDelete} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className="cards">
                {patients.map((p) => (
                  <li key={p.id} className="card">
                    <div className="card-head">
                      <div className="who">
                        <span className="avatar" style={avatarStyle(p.name)}>{initials(p.name)}</span>
                        <div><div className="who-name">{p.name}</div><div className="who-sub">{p.age} yrs, {p.gender}</div></div>
                      </div>
                      <Status status={p.status} />
                    </div>
                    <dl>
                      <div><dt>Ward</dt><dd>{p.ward}</dd></div>
                      <div><dt>Department</dt><dd>{p.department}</dd></div>
                      <div><dt>Doctor</dt><dd>{p.doctor}</dd></div>
                      <div><dt>Admitted</dt><dd>{formatDate(p.admission_date)}</dd></div>
                    </dl>
                    <RowActions p={p} onEdit={setFormFor} onDischarge={discharge} onDelete={setToDelete} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </main>

      {formFor && options && (
        <PatientForm
          options={options}
          initial={formFor.id ? formFor : null}
          onClose={closeForm}
          onSaved={(saved, editing) => { setFormFor(null); notify(editing ? `${saved.name} updated` : `${saved.name} admitted`); reload(); }}
        />
      )}
      {toDelete && <ConfirmDelete patient={toDelete} busy={deleting} onCancel={cancelDelete} onConfirm={confirmDelete} />}
      {toast && <div className={`toast ${toast.type}`} role="status">{toast.text}</div>}
    </>
  );
}
