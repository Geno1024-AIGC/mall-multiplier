(function () {
  const BASE_KEY = "mallrate_api_base";
  const DEMO_DB_KEY = "mallrate_demo_db";
  const RATIO_KEY = "mallrate_ratio_style";

  function getRatioStyle() {
    return localStorage.getItem(RATIO_KEY) === "cash" ? "cash" : "ratio";
  }

  function setRatioStyle(v) {
    localStorage.setItem(RATIO_KEY, v === "cash" ? "cash" : "ratio");
  }

  function getBase() {
    return localStorage.getItem(BASE_KEY) || "";
  }

  function setBase(value) {
    const clean = String(value || "").trim().replace(/\/+$/, "");
    if (clean) localStorage.setItem(BASE_KEY, clean);
    else localStorage.removeItem(BASE_KEY);
  }

  async function request(path, options = {}) {
    const res = await fetch(getBase() + path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "HTTP " + res.status);
    }
    return res.status === 204 ? null : res.json();
  }

  async function ping() {
    try {
      const res = await fetch(getBase() + "/api/health", {
        signal: AbortSignal.timeout(2500),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  const Demo = {
    async loadDb() {
      const raw = localStorage.getItem(DEMO_DB_KEY);
      if (raw) return JSON.parse(raw);
      const res = await fetch("shared/seed.json");
      const db = await res.json();
      localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db));
      return db;
    },
    saveDb(db) {
      localStorage.setItem(DEMO_DB_KEY, JSON.stringify(db));
    },
    newId(prefix) {
      return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    },
  };

  const Api = {
    getBase,
    setBase,
    ping,
    getRatioStyle,
    setRatioStyle,
    remote: {
      async listMalls() {
        return request("/api/malls");
      },
      async listRules() {
        return request("/api/rules");
      },
      async createMall(data) {
        return request("/api/malls", { method: "POST", body: JSON.stringify(data) });
      },
      async createRule(data) {
        return request("/api/rules", { method: "POST", body: JSON.stringify(data) });
      },
      async vote(ruleId, action) {
        return request("/api/rules/" + ruleId + "/vote", {
          method: "POST",
          body: JSON.stringify({ action }),
        });
      },
    },
    local: {
      async listMalls() {
        const db = await Demo.loadDb();
        const counts = {};
        db.rules.forEach((r) => (counts[r.mallId] = (counts[r.mallId] || 0) + 1));
        return db.malls.slice().sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0));
      },
      async listRules() {
        const db = await Demo.loadDb();
        return db.rules;
      },
      async createMall(data) {
        const db = await Demo.loadDb();
        const mall = {
          id: Demo.newId("m"),
          name: data.name,
          city: data.city,
          address: data.address || "",
          createdAt: new Date().toISOString().slice(0, 10),
        };
        db.malls.push(mall);
        Demo.saveDb(db);
        return mall;
      },
      async createRule(data) {
        const db = await Demo.loadDb();
        const rule = {
          id: Demo.newId("r"),
          mallId: data.mallId,
          kind: data.kind,
          scene: data.scene,
          tags: data.tags || [],
          fromValue: data.fromValue,
          toValue: data.toValue,
          note: data.note || "",
          source: data.source || "",
          date: data.date || new Date().toISOString().slice(0, 10),
          confirms: 0,
          outdated: 0,
        };
        db.rules.push(rule);
        Demo.saveDb(db);
        return rule;
      },
      async vote(ruleId, action) {
        const db = await Demo.loadDb();
        const rule = db.rules.find((r) => r.id === ruleId);
        if (!rule) throw new Error("记录不存在");
        if (action === "confirm") rule.confirms += 1;
        else if (action === "outdated") rule.outdated += 1;
        else throw new Error("无效的投票类型");
        Demo.saveDb(db);
        return rule;
      },
    },
  };

  window.Api = Api;
})();
