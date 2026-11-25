// Mirrors the backend rules in backend/main.py
// "Today" in IST, the same clock the backend uses for the future-date check
export const todayISO = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export function validate(f) {
  const e = {};
  const name = (f.name || "").trim();
  if (!name) e.name = "Name is required";
  else if (!/^[A-Za-z]+( [A-Za-z]+)*$/.test(name.replace(/\s+/g, " "))) e.name = "Name must contain letters only (no numbers or symbols)";

  if (f.age === "" || f.age === null || f.age === undefined) e.age = "Age is required";
  else if (isNaN(Number(f.age))) e.age = "Age must be a number";
  else if (!Number.isInteger(Number(f.age))) e.age = "Age must be a whole number";
  else if (Number(f.age) < 0 || Number(f.age) > 120) e.age = "Age must be between 0 and 120";

  for (const [k, label] of [["gender", "Gender"], ["ward", "Ward"], ["department", "Department"], ["doctor", "Doctor"]]) {
    if (!f[k]) e[k] = `${label} is required`;
  }

  if (!f.admission_date) e.admission_date = "Admission date is required";
  else if (f.admission_date > todayISO()) e.admission_date = "Admission date cannot be in the future";
  return e;
}
