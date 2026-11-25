const BASE = import.meta.env.VITE_API_URL || "";

async function request(path, opts = {}) {
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
  } catch {
    throw { message: "Cannot reach the server. Check your connection and try again.", errors: {} };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw { message: data.message || "Something went wrong", errors: data.errors || {} };
  return data;
}

export const api = {
  options: () => request("/options"),
  stats: () => request("/stats"),
  list: (params) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request(`/patients${qs ? `?${qs}` : ""}`);
  },
  create: (body) => request("/patients", { method: "POST", body: JSON.stringify(body) }),
  update: (id, body) => request(`/patients/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  discharge: (id) => request(`/patients/${id}/discharge`, { method: "PATCH" }),
  remove: (id) => request(`/patients/${id}`, { method: "DELETE" }),
};
