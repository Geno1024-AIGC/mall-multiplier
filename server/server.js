const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const store = require("./store");

const ROOT = path.join(__dirname, "..");
const app = express();

app.use(cors());
app.use(express.json());

function badRequest(res, msg) {
  res.status(400).json({ error: msg });
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const api = express.Router();

api.get("/health", (req, res) => {
  res.json({ ok: true, time: Date.now() });
});

api.get("/malls", (req, res) => {
  const db = store.load();
  const counts = {};
  db.rules.forEach((r) => (counts[r.mallId] = (counts[r.mallId] || 0) + 1));
  res.json(db.malls.slice().sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0)));
});

api.post("/malls", (req, res) => {
  const { name, city, address } = req.body || {};
  if (!name || !String(name).trim()) return badRequest(res, "缺少商场名称");
  if (!city || !String(city).trim()) return badRequest(res, "缺少城市");
  const db = store.load();
  if (db.malls.some((m) => m.name === String(name).trim() && m.city === String(city).trim())) {
    return badRequest(res, "该商场已存在");
  }
  const mall = {
    id: "m" + crypto.randomBytes(6).toString("hex"),
    name: String(name).trim().slice(0, 40),
    city: String(city).trim().slice(0, 20),
    address: String(address || "").trim().slice(0, 80),
    createdAt: new Date().toISOString().slice(0, 10),
  };
  db.malls.push(mall);
  store.save(db);
  res.status(201).json(mall);
});

api.put("/malls/:id", (req, res) => {
  const { name, city, address } = req.body || {};
  if (!name || !String(name).trim()) return badRequest(res, "缺少商场名称");
  if (!city || !String(city).trim()) return badRequest(res, "缺少城市");
  const db = store.load();
  const mall = db.malls.find((m) => m.id === req.params.id);
  if (!mall) return res.status(404).json({ error: "商场不存在" });
  mall.name = String(name).trim().slice(0, 40);
  mall.city = String(city).trim().slice(0, 20);
  mall.address = String(address || "").trim().slice(0, 80);
  store.save(db);
  res.json(mall);
});

api.get("/rules", (req, res) => {
  const db = store.load();
  if (req.query.mall) {
    res.json(db.rules.filter((r) => r.mallId === req.query.mall));
  } else {
    res.json(db.rules);
  }
});

api.post("/rules", (req, res) => {
  const { mallId, kind, scene, fromValue, toValue, redeemType, rewardHours, tags, note, source, date } = req.body || {};
  const db = store.load();
  if (!db.malls.some((m) => m.id === mallId)) return badRequest(res, "商场不存在");
  if (kind !== "earn" && kind !== "redeem" && kind !== "perk") {
    return badRequest(res, "kind 必须是 earn、redeem 或 perk");
  }
  if (!scene || !String(scene).trim()) return badRequest(res, "缺少适用场景");
  const from = num(fromValue);
  const to = num(toValue);
  if (from === null || from <= 0) return badRequest(res, "fromValue 必须是正数");
  if (to === null || to < 0) return badRequest(res, "toValue 不能为负数");
  const tagList = Array.isArray(tags)
    ? tags.map((t) => String(t).trim().slice(0, 20)).filter(Boolean).slice(0, 5)
    : [];
  let type;
  if (kind === "redeem") {
    if (redeemType === "parking" || redeemType === "coupon") type = redeemType;
    else if (tagList.includes("停车")) type = "parking";
    else type = "coupon";
  } else if (kind === "perk") {
    type = redeemType === "parking" || redeemType === "coupon" ? redeemType : "parking";
  }
  const hours = num(rewardHours);
  const perkHours =
    kind === "perk" && type === "parking" && hours && hours > 0 ? hours : undefined;
  const rule = {
    id: "r" + crypto.randomBytes(6).toString("hex"),
    mallId,
    kind,
    scene: String(scene).trim().slice(0, 60),
    tags: tagList,
    fromValue: from,
    toValue: to,
    redeemType: type,
    rewardHours: perkHours,
    note: String(note || "").trim().slice(0, 120),
    source: String(source || "").trim().slice(0, 30),
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) ? date : new Date().toISOString().slice(0, 10),
    confirms: 0,
    outdated: 0,
  };
  db.rules.push(rule);
  store.save(db);
  res.status(201).json(rule);
});

api.post("/rules/:id/vote", (req, res) => {
  const { action } = req.body || {};
  if (action !== "confirm" && action !== "outdated") {
    return badRequest(res, "action 必须是 confirm 或 outdated");
  }
  const db = store.load();
  const rule = db.rules.find((r) => r.id === req.params.id);
  if (!rule) return res.status(404).json({ error: "记录不存在" });
  if (action === "confirm") rule.confirms += 1;
  else rule.outdated += 1;
  store.save(db);
  res.json(rule);
});

app.use("/api", api);
app.use("/api", (req, res) => res.status(404).json({ error: "接口不存在" }));
app.use(express.static(ROOT));

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`mall-multiplier API Listening on http://localhost:${PORT}`);
});
