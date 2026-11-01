# 积分倍率图鉴 🧾

一个由网友互助维护的「商场积分倍率」情报站，开源、纯静态前端 + 轻量后端。

- **x 元攒多少积分**——积分获取规则（全场 / 会员日 / 特定卡种…）
- **z 积分值多少钱**——积分兑换规则（停车券 / 优惠券 / 消费抵扣…）
- **全链路倍率**——同一商场两者相乘得到（例如 10 元 1 积分、100 积分换 10 元，则消费 1000 元返 10 元，即 **100:1**），主页会展示该理论值，数字越小越划算（可在 ⚙️ 设置切换为返现百分比 1/N，数字越大越划算）
- 人人可看、人人可补，网友对每条记录投票「✅ 已确认 / ⚠️ 已失效」

## 目录结构

```
├── index.html          前端页面（GitHub Pages 直接托管）
├── css/  js/           样式与逻辑（无构建工具，原生 HTML/JS/CSS）
├── shared/seed.json    初始种子数据（前后端共用一份格式）
├── server/             Express 后端（JSON 文件存储）
│   ├── server.js       API 与静态托管
│   ├── store.js        JSON 存取
│   └── data.json       运行时数据（自动生成，不入库）
└── .github/workflows/  GitHub Pages 自动部署
```

## 快速开始

### 只看前端（演示模式）

前端检测不到后端时，自动用浏览器 localStorage 演示运行，数据仅保存在本地浏览器。
GitHub Pages 部署后默认就是该模式；本地起个静态服务器（如 `python3 -m http.server`）或直接跑后端即可体验完整交互。

### 本地全栈

```bash
cd server
npm install
npm start          # 默认 http://localhost:8787，PORT 环境变量可改
```

后端同时托管前端页面，打开 http://localhost:8787 即全栈联调；
也可以在页面右上角 ⚙️ 设置里填 API 地址后联网同步。

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/malls` | 商场列表（按记录数排序） |
| POST | `/api/malls` | 新增商场 `{name, city, address?}` |
| GET | `/api/rules?mall=<id>` | 倍率记录（可选按商场过滤） |
| POST | `/api/rules` | 新增记录 `{mallId, kind, scene, fromValue, toValue, tags?, note?, source?, date?}`，`kind` 为 `earn`（fromValue=元, toValue=积分）或 `redeem`（fromValue=积分, toValue=元） |
| POST | `/api/rules/:id/vote` | 投票 `{action: "confirm" | "outdated"}` |

数据模型与 `shared/seed.json` 一致：字段 `confirms`/`outdated` 为「确认/失效」投票计数。

## 部署

- **前端（GitHub Pages）**：push 到 `master` 后，workflow 自动部署本仓库根目录。首次使用需在仓库 Settings → Pages 中把 Source 选为 **GitHub Actions**。
- **后端（自有服务器）**：`server/` 目录独立部署（`npm install && PORT=xxx node server.js`），前端无需重新构建，在页面 ⚙️ 填入后端地址即可从演示模式切换到联网同步模式。

## 说明

- 全链路倍率为「最高获取率 × 最高兑换率」的理论值，现实可能受品类、场次等限制，仅供参考。
- 积分规则随商场活动变动，投标「⚠️ 已失效」后如该记录失效票数多于确认票数会置灰显示，欢迎提交新数据。
