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
    nearCity: null,
    mallPrefill: null,
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

  function cityMatch(mallCity, target) {
    if (!mallCity || !target) return false;
    return mallCity === target || mallCity.includes(target) || target.includes(mallCity);
  }

  function renderHome() {
    const q = state.query.trim().toLowerCase();
    const base = state.nearCity
      ? state.malls.filter((m) => cityMatch(m.city, state.nearCity.city))
      : state.malls;
    const malls = base.filter(
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
        const full = fullCardHTML(list);
        return `
        <a class="mall-card" style="--h:${hue(m.name)}" href="#/mall/${encodeURIComponent(m.id)}">
          <h3>${esc(m.name)}</h3>
          <div class="where">📍 ${esc(m.city)}${m.address ? " · " + esc(m.address) : ""}</div>
          <div class="brief"><span>📈 ${earns}</span><span>📉 ${redeems}</span>${full}</div>
          <div class="count-line">已登记 ${list.length} 条倍率记录</div>
        </a>`;
      })
      .join("");

    $("#app").innerHTML = `
      <section class="hero">
        <h1>一起记下每家商场的积分倍率</h1>
        <p>10 元攒多少积分？100 积分能抵多少停车费和优惠券？网友互助记录，人人可查、人人可补。</p>
        ${
          Api.getRatioStyle() === "cash"
            ? '<div class="ratio-hint">🧮 全链路返现按 <b>1/N（%）</b> 展示：数字越大越划算（如 1% = 每花 100 元返 1 元），可在右上角 ⚙️ 设置里切换为倍率显示</div>'
            : '<div class="ratio-hint">🧮 全链路倍率按 <b>N:1</b> 展示：数字越小越划算（如 100:1 = 每花 100 元返 1 元），右上角 ⚙️ 设置里可切换为返现百分比显示</div>'
        }
        ${
          state.mode === "demo"
            ? '<div class="demo-hint">🧪 当前为演示模式：数据仅保存在你的浏览器里，部署后端后即可联网同步，右上角 ⚙️ 可进行设置</div>'
            : ""
        }
        <div class="stat-row">
          <div class="stat"><b>${state.malls.length}</b><span>收录商场</span></div>
          <div class="stat"><b>${state.rules.length}</b><span>倍率记录</span></div>
          <div class="stat"><b>${totalConfirms}</b><span>网友确认</span></div>
        </div>
        ${
          state.nearCity
            ? `<div class="near-chip">📍 已定位 ${esc(state.nearCity.city)} · 该市已收录 ${base.length} 家 <button data-clear-near>✕ 清除定位筛选</button></div>`
            : '<button class="btn btn-primary near-btn" data-near-locate>📍 定位附近的商场</button>'
        }
      </section>
      ${
        malls.length
          ? `<div class="mall-grid">${cards}</div>`
          : state.nearCity
            ? `<div class="empty"><span class="emoji">🧭</span>${q ? "该市没有匹配的商场，换个关键词或清除定位筛选" : `${esc(state.nearCity.city)} 还没有收录商场`}<br><button class="btn btn-primary" data-add-mall-near>＋ 添加该市第一家</button></div>`
            : `<div class="empty"><span class="emoji">🛍️</span>${q ? "没有匹配的商场，换个关键词试试" : "还没有商场，点右上角「＋ 添加商场」创建第一个"}</div>`
      }`;
  }

  function isParkingRule(r) {
    return r.redeemType === "parking" || (!r.redeemType && (r.tags || []).includes("停车"));
  }

  function fullRateInfo(rules) {
    const earns = rules.filter((r) => r.kind === "earn" && r.fromValue > 0);
    const redeems = rules.filter((r) => r.kind === "redeem" && r.fromValue > 0);
    if (!earns.length || !redeems.length) return null;
    const e = Math.max(...earns.map((r) => r.toValue / r.fromValue));
    const rateOf = (list) => (list.length ? Math.max(...list.map((r) => r.toValue / r.fromValue)) : null);
    const coupon = rateOf(redeems.filter((r) => !isParkingRule(r)));
    const parking = rateOf(redeems.filter(isParkingRule));
    if (!(e > 0)) return null;
    return { e, coupon, parking };
  }

  function perspVal(e, v) {
    if (!(e > 0) || !(v > 0)) return null;
    return Api.getRatioStyle() === "cash" ? `${fmt(e * v * 100)}%（返现）` : `${fmt(1 / (e * v))}:1`;
  }

  function fullRateHTML(rules) {
    const info = fullRateInfo(rules);
    if (!info) return "";
    let vp = Api.getViewpoint();
    if (!info.coupon) vp = "parking";
    else if (!info.parking) vp = "coupon";
    const vc = perspVal(info.e, info.coupon);
    const vpVal = perspVal(info.e, info.parking);
    if (vc && vpVal && vc !== vpVal) {
      const dirs = vp === "parking" ? [vpVal, vc] : [vc, vpVal];
      return `<div class="rule-rate" style="margin-top:10px"><span class="sub">
        <button class="mini-seg ${vp === "coupon" ? "on" : ""}" data-persp="coupon">🎟️ 优惠券</button>
        <button class="mini-seg ${vp === "parking" ? "on" : ""}" data-persp="parking">🅿️ 停车券</button>
        全链路 <b>${vp === "parking" ? dirs[0] : dirs[1]}</b>，按当前记录估算</span></div>`;
    }
    const one = vc || vpVal;
    return one ? `<div class="rule-rate" style="margin-top:10px"><span class="sub">🧮 理论全链路 <b>${one}</b>，按当前记录估算</span></div>` : "";
  }

  function fullCardHTML(rules) {
    const info = fullRateInfo(rules);
    if (!info) return "";
    const vc = perspVal(info.e, info.coupon);
    const vpVal = perspVal(info.e, info.parking);
    if (vc && vpVal) {
      if (vc === vpVal) return `<span>🧮 理论全链路 <b>${vc}</b></span>`;
      return `<span>🧮 券 <b>${vc}</b> · 停车 <b>${vpVal}</b></span>`;
    }
    const one = vc || vpVal;
    return one ? `<span>🧮 理论全链路 <b>${one}</b></span>` : "";
  }

  function ruleCard(rule) {
    const info = rateInfo(rule);
    const mine = votes[rule.id];
    const tags = rule.tags || [];
    let typeBadge = "";
    if (rule.kind === "redeem" && rule.redeemType) {
      if (rule.redeemType === "parking" && !tags.includes("停车")) typeBadge = '<span class="tag">🅿️ 停车</span>';
      else if (rule.redeemType === "coupon" && !tags.some((t) => /券/.test(t))) typeBadge = '<span class="tag">🎟️ 券</span>';
    }
    return `
      <article class="rule-card ${rule.outdated > rule.confirms ? "stale" : ""}" style="animation-delay:${Math.random() * 0.15}s">
        <div class="rule-top">
          <span class="scene">${esc(rule.scene)}</span>
          ${typeBadge}${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}
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

    const fullLine = fullRateHTML(rules);
    $("#app").innerHTML = `
      <button class="back" data-back>← 返回商场列表</button>
      <section class="mall-head" style="--h:${hue(mall.name)}">
        <h2>${esc(mall.name)}</h2>
        <div class="addr">📍 ${esc(mall.city)}${mall.address ? " · " + esc(mall.address) : ""}</div>
        ${fullLine}
      </section>
      <div class="section-head">
        <h3>📈 积分获取（如：10 元 = 1 积分）</h3>
        <div class="line"></div>
        <button class="btn btn-ghost" data-add-rule="earn" data-mall="${esc(mall.id)}">＋ 记录一条</button>
      </div>
      ${earns.length ? `<div class="rule-list">${earns.map(ruleCard).join("")}</div>` : `<div class="empty"><span class="emoji">🪙</span>还没有获取规则的记录，快来补充第一条</div>`}
      <div class="section-head">
        <h3>📉 积分兑换（如：100 积分 = 10 元）</h3>
        <div class="line"></div>
        <button class="btn btn-ghost" data-add-rule="redeem" data-mall="${esc(mall.id)}">＋ 记录一条</button>
      </div>
      ${redeems.length ? `<div class="rule-list">${redeems.map(ruleCard).join("")}</div>` : `<div class="empty"><span class="emoji">🎟️</span>还没有兑换规则的记录，快来补充第一条</div>`}`;
  }

  function initMallDialog() {
    const pSel = $("#mall-province");
    const cSel = $("#mall-city");
    if (!pSel.dataset.ready) {
      pSel.innerHTML = '<option value="">选择省级</option>' + Regions.map((r) => `<option value="${r.n}">${r.n}</option>`).join("");
      pSel.dataset.ready = "1";
    }
    cSel.innerHTML = '<option value="">先选省级</option>';
    cSel.disabled = true;
    if (state.mallPrefill) {
      const prov = Regions.find((r) => r.n === state.mallPrefill.province);
      if (prov) {
        pSel.value = prov.n;
        const region = fillCities(prov.n);
        const match = region.c.find((n) => n === state.mallPrefill.city);
        if (match) {
          cSel.value = match;
          cSel.disabled = false;
        }
      }
      state.mallPrefill = null;
    }
  }

  function fillCities(provName) {
    const cSel = $("#mall-city");
    const region = Regions.find((r) => r.n === provName);
    cSel.innerHTML = region
      ? '<option value="">选择城市</option>' + region.c.map((n) => `<option value="${n}">${n}</option>`).join("")
      : '<option value="">先选省级</option>';
    cSel.disabled = !region;
    return region;
  }

  const geoCache = {};
  const MUNICIPALITIES = ["北京市", "天津市", "上海市", "重庆市", "香港特别行政区", "澳门特别行政区"];

  async function loadGeo(adcode) {
    if (!geoCache[adcode]) {
      const res = await fetch(
        `https://geo.datav.aliyun.com/areas_v3/bound/${adcode}_full.json`,
        { signal: AbortSignal.timeout(9000) }
      );
      if (!res.ok) throw new Error("datav HTTP " + res.status);
      geoCache[adcode] = await res.json();
    }
    return geoCache[adcode];
  }

  function pointInPolygon(pt, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      const crosses = yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function pointInGeometry(pt, geom) {
    const polys =
      geom.type === "Polygon" ? [geom.coordinates] :
      geom.type === "MultiPolygon" ? geom.coordinates : [];
    for (const poly of polys) {
      if (poly.length && pointInPolygon(pt, poly[0])) {
        let holeHit = false;
        for (let k = 1; k < poly.length; k++) {
          if (pointInPolygon(pt, poly[k])) { holeHit = true; break; }
        }
        if (!holeHit) return true;
      }
    }
    return false;
  }

  function findFeatByPoint(features, pt) {
    return (features || []).find((f) => f.geometry && pointInGeometry(pt, f.geometry)) || null;
  }

  function matchRegion(name) {
    if (!name) return null;
    return Regions.find((r) => name.includes(r.n) || r.n.includes(name)) || null;
  }

  async function amapReverse(coords) {
    const url =
      `https://restapi.amap.com/v3/geocode/regeo` +
      `?location=${coords.longitude},${coords.latitude}&key=${encodeURIComponent(Api.getAmapKey())}`;
    let data;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      data = await res.json();
    } catch {
      const err = new Error("amap unreachable");
      err.hint = "高德接口连接失败，请检查网络或 Key 后重试";
      throw err;
    }
    if (data.status !== "1" || !data.regeocode) {
      const err = new Error(data.info || "amap failed");
      err.hint = "高德 Key 校验失败，请确认 ⚙️ 设置里填的是「Web 服务」类型 Key";
      throw err;
    }
    const comp = data.regeocode.addressComponent || {};
    return { province: comp.province, city: Array.isArray(comp.city) ? "" : comp.city };
  }

  async function nominatimReverse(coords) {
    const url =
      `https://nominatim.openstreetmap.org/reverse` +
      `?lat=${coords.latitude}&lon=${coords.longitude}&zoom=10&accept-language=zh-CN&format=json`;
    let res;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    } catch {
      const err = new Error("nominatim unreachable");
      err.hint = "定位数据源暂不可达，请稍后重试或手动选择";
      throw err;
    }
    if (!res.ok) return { province: "", city: "" };
    const addr = (await res.json()).address || {};
    return { province: addr.state || addr.region || "", city: addr.city || addr.county || "" };
  }

  async function datavReverse(coords) {
    const pt = [coords.longitude, coords.latitude];
    const provFeat = findFeatByPoint((await loadGeo("100000")).features, pt);
    if (!provFeat) return { province: "", city: "" };
    const provRegion = matchRegion(provFeat.properties.name);
    if (!provRegion) return { province: "", city: "" };
    if (MUNICIPALITIES.includes(provRegion.n)) {
      return { province: provRegion.n, city: provRegion.c[0] };
    }
    const cityFeat = findFeatByPoint((await loadGeo(provRegion.code)).features, pt);
    return { province: provRegion.n, city: (cityFeat && cityFeat.properties.name) || "" };
  }

  async function reverseGeocode(coords) {
    if (Api.getAmapKey()) return amapReverse(coords);
    try {
      return await datavReverse(coords);
    } catch {
      return nominatimReverse(coords);
    }
  }

  function locateNearCity() {
    if (!navigator.geolocation) {
      toast("当前浏览器不支持地理定位", "bad");
      return;
    }
    toast("正在定位，请稍候…");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { province, city } = await reverseGeocode(pos.coords);
          if (!province || !city) {
            toast(province ? `已定位到${province}，未能精确到市` : "未能匹配到省市，请手动查找商场", "bad");
            return;
          }
          state.nearCity = { province, city };
          render();
          window.scrollTo({ top: 0, behavior: "smooth" });
          toast("已按 " + city + " 筛选商场", "ok");
        } catch (err) {
          toast(err.hint || "定位解析失败，请手动查找商场", "bad");
        }
      },
      () => toast("定位失败，请允许定位权限或手动查找商场", "bad"),
      { timeout: 10000 }
    );
  }

  function bindStatic() {
    $("#add-mall-btn").addEventListener("click", () => {
      state.mallPrefill = null;
      initMallDialog();
      openDialog("#mall-dialog");
    });

    $("#mall-province").addEventListener("change", (e) => {
      fillCities(e.target.value);
    });

    $("#geo-btn").addEventListener("click", () => {
      if (!navigator.geolocation) {
        toast("当前浏览器不支持地理定位", "bad");
        return;
      }
      toast("正在定位，请稍候…");
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            const { province, city } = await reverseGeocode(pos.coords);
            const guesses = [city, province].filter(Boolean);
            let prov = null;
            for (const g of guesses) {
              prov = Regions.find((r) => g.includes(r.n) || r.n.includes(g));
              if (prov) break;
            }
            if (!prov) {
              toast("定位成功但未能匹配省份，请手动选择", "bad");
              return;
            }
            $("#mall-province").value = prov.n;
            const region = fillCities(prov.n);
            let cityName = null;
            for (const g of guesses) {
              cityName = region.c.find((n) => g.includes(n) || n.includes(g));
              if (cityName) break;
            }
            if (cityName) {
              $("#mall-city").value = cityName;
              toast("已定位至 " + cityName, "ok");
            } else {
              $("#mall-city").selectedIndex = 0;
              toast("已定位省份，请继续选择城市", "ok");
            }
          } catch (err) {
            toast(err.hint || "定位解析失败，请手动选择", "bad");
          }
        },
        () => toast("定位失败，请允许定位权限或手动选择", "bad"),
        { timeout: 10000 }
      );
    });
    $("#search").addEventListener("input", (e) => {
      state.query = e.target.value;
      if (document.body.dataset.view === "mall") {
        location.hash = "#/";
        return;
      }
      renderHome();
    });

    $("#api-btn").addEventListener("click", () => {
      const f = $("#api-form").elements;
      f.base.value = Api.getBase();
      f.amapKey.value = Api.getAmapKey();
      $$("#ratio-style .seg").forEach((b) => b.classList.toggle("active", b.dataset.style === Api.getRatioStyle()));
      openDialog("#api-dialog");
    });

    $("#ratio-style").addEventListener("click", (e) => {
      const btn = e.target.closest(".seg");
      if (!btn) return;
      $$("#ratio-style .seg").forEach((b) => b.classList.toggle("active", b === btn));
    });

    $("#api-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target.elements;
      Api.setBase(f.base.value);
      Api.setAmapKey(f.amapKey.value);
      Api.setRatioStyle(($$("#ratio-style .seg").find((b) => b.classList.contains("active")) || {}).dataset?.style);
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
        redeemType: state.ruleKind === "redeem" ? f.redeemType.value : undefined,
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
      if (e.target.closest("[data-near-locate]")) {
        e.preventDefault();
        locateNearCity();
        return;
      }
      if (e.target.closest("[data-clear-near]")) {
        e.preventDefault();
        state.nearCity = null;
        render();
        return;
      }
      if (e.target.closest("[data-add-mall-near]")) {
        e.preventDefault();
        state.mallPrefill = state.nearCity ? { ...state.nearCity } : null;
        initMallDialog();
        openDialog("#mall-dialog");
        return;
      }
      const perspBtn = e.target.closest("[data-persp]");
      if (perspBtn) {
        e.preventDefault();
        if (Api.getViewpoint() !== perspBtn.dataset.persp) {
          Api.setViewpoint(perspBtn.dataset.persp);
          render();
        }
        return;
      }
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
    $("#rule-type-field").hidden = state.ruleKind !== "redeem";
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
