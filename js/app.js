(function () {
  const THEME_KEY = "mallrate_theme";
  const VOTES_KEY = "mallrate_votes";

  const state = {
    mode: "connecting",
    service: null,
    malls: [],
    rules: [],
    query: "",
    ruleKind: "earn",
    draftMallId: null,
  };

  let votes = {};
  try {
    votes = JSON.parse(localStorage.getItem(VOTES_KEY)) || {};
  } catch {
    votes = {};
  }

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function fmt(n) {
    return parseFloat(Number(n).toFixed(2));
  }

  function hue(text) {
    let h = 0;
    for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) % 360;
    return h;
  }

  function toast(msg, type) {
    const el = document.createElement("div");
    el.className = "toast" + (type ? " " + type : "");
    el.textContent = msg;
    $("#toast-root").appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  function rateInfo(rule) {
    if (rule.kind === "earn") {
      return {
        main: `${fmt(rule.fromValue)} 元 = ${fmt(rule.toValue)} 积分`,
        sub: `≈ ${fmt(rule.toValue / rule.fromValue)} 积分 / 元`,
      };
    }
    return {
      main: `${fmt(rule.fromValue)} 积分 = ¥${fmt(rule.toValue)}`,
      sub: `≈ ¥${fmt((rule.toValue / rule.fromValue) * 100)} / 百积分`,
    };
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $("#theme-toggle").textContent = theme === "dark" ? "☀️" : "🌙";
    localStorage.setItem(THEME_KEY, theme);
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const preferDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(saved || (preferDark ? "dark" : "light"));
    $("#theme-toggle").addEventListener("click", () => {
      applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    });
  }

  function setModeBadge() {
    const badge = $("#mode-badge");
    badge.className = "mode-badge mode-" + state.mode;
    badge.innerHTML =
      state.mode === "live"
        ? '<span class="dot"></span>已连接后端'
        : state.mode === "demo"
          ? '<span class="dot"></span>演示模式'
          : '<span class="dot"></span>连接中…';
  }

  async function initMode() {
    state.mode = "connecting";
    setModeBadge();
    const live = await Api.ping();
    state.service = live ? Api.remote : Api.local;
    state.mode = live ? "live" : "demo";
    setModeBadge();
    await loadAll();
  }

  async function loadAll() {
    try {
      state.malls = await state.service.listMalls();
      state.rules = await state.service.listRules();
    } catch (err) {
      toast("加载失败，已回退到演示模式：" + err.message, "bad");
      state.service = Api.local;
      state.mode = "demo";
      setModeBadge();
      state.malls = await Api.local.listMalls();
      state.rules = await Api.local.listRules();
    }
  }

  async function boot() {
    initTheme();
    bindStatic();
    window.addEventListener("hashchange", render);
    await initMode();
    render();
  }

  function render() {
    const match = location.hash.match(/^#\/mall\/(.+)$/);
    const mall = match && state.malls.find((m) => m.id === decodeURIComponent(match[1]));
    document.body.dataset.view = mall ? "mall" : "home";
    if (mall) renderMall(mall);
    else renderHome();
  }

  function renderHome() {
    const q = state.query.trim().toLowerCase();
    const malls = state.malls.filter(
      (m) =>
        !q ||
        m.name.toLowerCase().includes(q) ||
        (m.city || "").toLowerCase().includes(q)
    );
    const rulesByMall = {};
    state.rules.forEach((r) => {
      (rulesByMall[r.mallId] = rulesByMall[r.mallId] || []).push(r);
    });
    const bestEarn = {};
    const bestRedeem = {};
    for (const [mallId, list] of Object.entries(rulesByMall)) {
      const earns = list.filter((r) => r.kind === "earn" && r.fromValue > 0);
      const redeems = list.filter((r) => r.kind === "redeem" && r.fromValue > 0);
      if (earns.length) bestEarn[mallId] = Math.max(...earns.map((r) => r.toValue / r.fromValue));
      if (redeems.length) bestRedeem[mallId] = Math.max(...redeems.map((r) => (r.toValue / r.fromValue) * 100));
    }
    const totalConfirms = state.rules.reduce((s, r) => s + (r.confirms || 0), 0);

    const cards = malls
      .map((m) => {
        const list = rulesByMall[m.id] || [];
        const earns = bestEarn[m.id] ? `最高 <b>${fmt(bestEarn[m.id])} 积分/元</b>` : "暂无积分获取记录";
        const redeems = bestRedeem[m.id] ? `兑换 <b>¥${fmt(bestRedeem[m.id])}/百积分</b>` : "暂无兑换记录";
        return `
        <a class="mall-card" style="--h:${hue(m.name)}" href="#/mall/${encodeURIComponent(m.id)}">
          <h3>${esc(m.name)}</h3>
          <div class="where">📍 ${esc(m.city)}${m.address ? " · " + esc(m.address) : ""}</div>
          <div class="brief"><span>📈 ${earns}</span><span>📉 ${redeems}</span></div>
          <div class="count-line">已登记 ${list.length} 条倍率记录</div>
        </a>`;
      })
      .join("");

    $("#app").innerHTML = `
      <section class="hero">
        <h1>一起记下每家商场的积分倍率</h1>
        <p>x 元攒多少积分？z 积分能抵多少停车费和优惠券？网友互助记录，人人可查、人人可补。</p>
        ${
          state.mode === "demo"
            ? '<div class="demo-hint">🧪 当前为演示模式：数据仅保存在你的浏览器里，部署后端后即可联网同步，右上角 ⚙️ 可设置 API 地址</div>'
            : ""
        }
        <div class="stat-row">
          <div class="stat"><b>${state.malls.length}</b><span>收录商场</span></div>
          <div class="stat"><b>${state.rules.length}</b><span>倍率记录</span></div>
          <div class="stat"><b>${totalConfirms}</b><span>网友确认</span></div>
        </div>
      </section>
      ${
        malls.length
          ? `<div class="mall-grid">${cards}</div>`
          : `<div class="empty"><span class="emoji">🛍️</span>${q ? "没有匹配的商场，换个关键词试试" : "还没有商场，点右上角「＋ 添加商场」创建第一个"}</div>`
      }`;
  }

  function ruleCard(rule) {
    const info = rateInfo(rule);
    const mine = votes[rule.id];
    return `
      <article class="rule-card ${rule.outdated > rule.confirms ? "stale" : ""}" style="animation-delay:${Math.random() * 0.15}s">
        <div class="rule-top">
          <span class="scene">${esc(rule.scene)}</span>
          ${(rule.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}
        </div>
        <div class="rule-rate">
          <span class="main">${esc(info.main)}</span>
          <span class="sub">${esc(info.sub)}</span>
        </div>
        ${rule.note ? `<div class="rule-note">💬 ${esc(rule.note)}</div>` : ""}
        <div class="rule-meta">来源：${esc(rule.source || "未知")} · 更新于 ${esc(rule.date || "—")}</div>
        <div class="rule-foot">
          <button class="vote-btn confirm ${mine === "confirm" ? "mine" : ""}" data-vote="confirm" data-id="${esc(rule.id)}" ${mine ? "disabled" : ""}>
            ✅ 已确认 ${rule.confirms || 0}
          </button>
          <button class="vote-btn outdated ${mine === "outdated" ? "mine" : ""}" data-vote="outdated" data-id="${esc(rule.id)}" ${mine ? "disabled" : ""}>
            ⚠️ 已失效 ${rule.outdated || 0}
          </button>
        </div>
      </article>`;
  }

  function renderMall(mall) {
    const rules = state.rules.filter((r) => r.mallId === mall.id);
    const earns = rules
      .filter((r) => r.kind === "earn")
      .sort((a, b) => (b.confirms || 0) - (a.confirms || 0));
    const redeems = rules
      .filter((r) => r.kind === "redeem")
      .sort((a, b) => (b.confirms || 0) - (a.confirms || 0));

    $("#app").innerHTML = `
      <button class="back" data-back>← 返回商场列表</button>
      <section class="mall-head" style="--h:${hue(mall.name)}">
        <h2>${esc(mall.name)}</h2>
        <div class="addr">📍 ${esc(mall.city)}${mall.address ? " · " + esc(mall.address) : ""}</div>
      </section>
      <div class="section-head">
        <h3>📈 积分获取（x 元 = y 积分）</h3>
        <div class="line"></div>
        <button class="btn btn-ghost" data-add-rule="earn" data-mall="${esc(mall.id)}">＋ 记录一条</button>
      </div>
      ${earns.length ? `<div class="rule-list">${earns.map(ruleCard).join("")}</div>` : `<div class="empty"><span class="emoji">🪙</span>还没有获取规则的记录，快来补充第一条</div>`}
      <div class="section-head">
        <h3>📉 积分兑换（z 积分 = w 元）</h3>
        <div class="line"></div>
        <button class="btn btn-ghost" data-add-rule="redeem" data-mall="${esc(mall.id)}">＋ 记录一条</button>
      </div>
      ${redeems.length ? `<div class="rule-list">${redeems.map(ruleCard).join("")}</div>` : `<div class="empty"><span class="emoji">🎟️</span>还没有兑换规则的记录，快来补充第一条</div>`}`;
  }

  function bindStatic() {
    $("#search").addEventListener("input", (e) => {
      state.query = e.target.value;
      if (document.body.dataset.view === "mall") {
        location.hash = "#/";
        return;
      }
      renderHome();
    });

    $("#add-mall-btn").addEventListener("click", () => openDialog("#mall-dialog"));

    $("#api-btn").addEventListener("click", () => {
      $("#api-form").elements.base.value = Api.getBase();
      openDialog("#api-dialog");
    });

    $("#api-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      Api.setBase(e.target.elements.base.value);
      $("#api-dialog").close();
      await initMode();
      render();
      toast(state.mode === "live" ? "已连接后端 ✔" : "未检测到后端，已进入演示模式", state.mode === "live" ? "ok" : "");
    });

    $("#mall-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const name = f.name.value.trim();
      const city = f.city.value.trim();
      if (!name || !city) {
        toast("请填写商场名称和城市", "bad");
        return;
      }
      try {
        const mall = await state.service.createMall({ name, city, address: f.address.value.trim() });
        await loadAll();
        f.reset();
        $("#mall-dialog").close();
        toast("商场已收录 ✔", "ok");
        location.hash = "#/mall/" + encodeURIComponent(mall.id);
      } catch (err) {
        toast("保存失败：" + err.message, "bad");
      }
    });

    $("#rule-kind").addEventListener("click", (e) => {
      const btn = e.target.closest(".seg");
      if (!btn) return;
      $$("#rule-kind .seg").forEach((b) => b.classList.toggle("active", b === btn));
      state.ruleKind = btn.dataset.kind;
      updateRuleLabels();
    });

    $("#rule-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const data = {
        mallId: state.draftMallId,
        kind: state.ruleKind,
        scene: f.scene.value.trim(),
        fromValue: parseFloat(f.fromValue.value),
        toValue: parseFloat(f.toValue.value),
        tags: f.tags.value.split(/[,，]/).map((t) => t.trim()).filter(Boolean),
        note: f.note.value.trim(),
        source: f.source.value.trim(),
        date: f.date.value || new Date().toISOString().slice(0, 10),
      };
      if (!data.mallId) {
        toast("请先选择商场", "bad");
        return;
      }
      if (!data.scene) {
        toast("请填写适用场景", "bad");
        return;
      }
      if (!(data.fromValue > 0) || !(data.toValue >= 0)) {
        toast("请填写有效的数值", "bad");
        return;
      }
      try {
        await state.service.createRule(data);
        await loadAll();
        f.reset();
        $("#rule-dialog").close();
        toast("倍率已登记，感谢贡献 ✔", "ok");
        render();
      } catch (err) {
        toast("保存失败：" + err.message, "bad");
      }
    });

    $("#app").addEventListener("click", async (e) => {
      if (e.target.closest("[data-back]")) {
        location.hash = "#/";
        return;
      }
      const addBtn = e.target.closest("[data-add-rule]");
      if (addBtn) {
        state.draftMallId = addBtn.dataset.mall;
        state.ruleKind = addBtn.dataset.addRule;
        $$("#rule-kind .seg").forEach((b) => b.classList.toggle("active", b.dataset.kind === state.ruleKind));
        updateRuleLabels();
        const form = $("#rule-form");
        form.reset();
        form.date.value = new Date().toISOString().slice(0, 10);
        openDialog("#rule-dialog");
        return;
      }
      const voteBtn = e.target.closest("[data-vote]");
      if (voteBtn) {
        const id = voteBtn.dataset.id;
        const action = voteBtn.dataset.vote;
        if (votes[id]) {
          toast("你已经投过票啦");
          return;
        }
        try {
          const updated = await state.service.vote(id, action);
          votes[id] = action;
          localStorage.setItem(VOTES_KEY, JSON.stringify(votes));
          const idx = state.rules.findIndex((r) => r.id === id);
          if (idx >= 0) state.rules[idx] = updated;
          toast(action === "confirm" ? "感谢确认 ✔" : "已标记为可能失效", "ok");
          render();
        } catch (err) {
          toast("投票失败：" + err.message, "bad");
        }
      }
    });

    $$(".dlg").forEach((dlg) => {
      dlg.addEventListener("click", (e) => {
        if (e.target.closest("[data-close]")) dlg.close();
      });
    });
  }

  function updateRuleLabels() {
    if (state.ruleKind === "earn") {
      $("#rule-from-label").innerHTML = '消费金额（元）<em>*</em>';
      $("#rule-to-label").innerHTML = '获得积分 <em>*</em>';
    } else {
      $("#rule-from-label").innerHTML = '所需积分 <em>*</em>';
      $("#rule-to-label").innerHTML = '抵扣价值（元）<em>*</em>';
    }
  }

  function openDialog(sel) {
    $(sel).showModal();
  }

  boot();
})();
