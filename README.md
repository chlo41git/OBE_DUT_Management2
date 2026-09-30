# OBE DUT 儲位管理系統 v0.4

本專案是 `OBE_DUT_儲位管理系統_POC_v04.html` 的正式化實作，以 v0.3 版系統（`OBE_DUT_Management - 20260929`）的 UI/UX 與程式結構為基礎改寫。

| 模組 | 技術 |
|---|---|
| Frontend | React 18 + TypeScript + Vite + TanStack Query |
| Backend | Node.js + TypeScript + Express + Prisma |
| Database | PostgreSQL 15+（開發環境：`<DB_HOST>` 上的 `obe_dut_v04`） |

## v0.3 → v0.4 變更摘要

| 項目 | v0.3 | v0.4 |
|---|---|---|
| 儲位碼（一維 Code128） | `R05-L03-P2` | **`FIN-04-01-04`**＝區域-台車-層-機位，與現場已印出的條碼一致 |
| 分區 | 6 個用途分區 Z0–Z5 ＋ 分區模式 | **2 區**：`WIP` 未驗（24 台車）／`FIN` 已驗（12 台車），各自從 01 編台車號 |
| 台車 | 全廠流水號 R01..、停放位、中文別名、移車／編輯 | 台車碼 `WIP-01`；只保留 新增／停用／啟用 |
| 標籤中文面 | 「R05　3-2」 | 「已驗，04臺車，01層，04機位」 |
| 機台狀態 | NEW/IN/OUT/MISSING/LEFT | **NEW/IN/OUT/LEFT**（移除失蹤＋異常單） |
| 頁面 | 10 頁 | **5 頁**：入庫上架、取機出庫、找機台與儲位地圖、戰情儀表板、事件紀錄 |
| 移除 | — | 異常單、待補清單、機台主檔、規則設定、設計說明與待決、離線模擬、模擬刷取按鈕 |
| 新增 | — | 條碼槍焦點守門（入庫／出庫頁自動把焦點拉回刷取框）、儀表板呆滯 KPI |

## 資料模型（`packages/backend/prisma/schema.prisma`）

```
storage_area (WIP / FIN)
  └─ storage_rack  code = 區域-台車號      WIP-01 … WIP-24, FIN-01 … FIN-12
       └─ storage_slot  code = 台車-層-機位  FIN-04-01-04（11 層 × 4 機位 = 44 格/台車）
            └─ dut_unit.slotCode (unique)  ── dut_issue（OBE Issue）
dut_movement   稽核流水（sn 不設 FK，保留未建檔／被拒收的 S/N 紀錄）
scan_metric    刷取覆蓋率
```

資料庫層另有 CHECK constraint 保證碼值格式與欄位一致（`storage_slot.code = rackCode-LL-PP`、`storage_rack.code = areaCode-NN`、BLOCKED 必有原因），見 `prisma/migrations/*_init_v04/migration.sql` 末段。

## 快速開始

```bash
npm install                 # 根目錄，安裝所有 workspace
cp packages/backend/.env.example packages/backend/.env   # 已建好的話略過；預設指向 obe_dut_v04

npm run db:check            # 連線／權限自檢
npm run db:migrate          # prisma migrate dev（obe 需 CREATEDB）
npm run db:seed             # 36 台車 / 1,584 儲位 / 1,000 台機台（會先清空所有資料表）

npm run dev:backend         # http://localhost:4000
npm run dev:frontend        # http://localhost:5173（/api 代理到 4000）
```

pgAdmin 4 建帳號／資料庫、遠端資料庫、`pg_hba.conf` 設定見 [docs/DATABASE_SETUP.md](docs/DATABASE_SETUP.md)；區網部署見 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## API 一覽（皆在 `/api` 下）

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/config` | 層數、機位數、呆滯天數、去重秒數、停用原因清單 |
| GET | `/areas`、`/areas/free-count` | 區域主檔、各區可用空位 |
| GET/POST | `/racks` | 台車清單／新增台車（`{areaCode}`，台車號自動接續） |
| PATCH | `/racks/:code/toggle` | 停用／啟用（車上有機台 → 409 `RACK_NOT_EMPTY`） |
| PATCH | `/slots/:code/block`、`/unblock` | 儲位停用／解除 |
| GET | `/map/slots`、`/map/find?kw=` | 地圖燈號、S/N（或後四碼）查詢定位 |
| GET | `/units/:sn` | 機台明細 |
| POST | `/checkin/scan-slot` → `/checkin/scan-unit` → `/checkin/commit` | 入庫：先櫃位、後機台（dry-run + commit） |
| POST | `/checkin/reject`、`/checkin/block-left` | 未建檔拒收、已離場擋下（只留稽核） |
| POST | `/checkout/scan-slot` → `/checkout/confirm` | 出庫：刷櫃位 → 二次確認 → 釋放 |
| POST | `/manual-slot` | 標籤破損手動輸入（標記待補印＋稽核） |
| GET | `/events?type=&kw=&sn=`、`/events/types` | 事件紀錄 |
| GET | `/dashboard` | 儀表板 |

## 驗證狀態

- `tsc --noEmit`：shared／backend／frontend 皆通過。
- 端對端 API 測試（對 `obe_dut_v04` 實跑）：入庫所有分支（格式錯、順序錯、查無、佔用、停用、停用台車、換目標、未建檔臨時建檔／拒收、已離場重新啟用／擋下、移位、歸還、重複刷、跨區提示）、出庫所有分支、手動輸入、儲位停用／解除、台車新增／停用、查詢定位、稽核紀錄工號＋姓名 —— 全部通過。
- **尚未做瀏覽器畫面驗收**：請 `npm run dev:backend` + `npm run dev:frontend` 後逐頁比對 POC v0.4。
- 已知：`vite build` 在含中文的路徑下會原生崩潰，需用 `subst` 或純英數路徑建置（見 CLAUDE.md）。

## 後續正式開發步驟與建議工具

### Phase 0 — 規格定稿（1–2 週）
1. **Open Items 拍板**：WIP/FIN 以外是否還會新增區域？台車號上限 99（條碼只有 2 碼）是否足夠？臨時建檔機台的補主檔流程（v0.4 已移除待補清單頁，需決定由 SL2.0 端處理或加回管理頁）。
2. **API 契約文件化**：用 `zod` 定義 request schema（套件已安裝）＋ `@asteasolutions/zod-to-openapi` 產生 OpenAPI，作為與 SL2.0／MES 對接的正式契約；前端可用 `openapi-typescript` 產型別。

### Phase 1 — 品質基礎（與開發並行）
3. **測試**：
   - 後端單元／整合：**Vitest** + **supertest**；資料庫用 **Testcontainers (PostgreSQL)**，每個測試跑獨立 DB。本次的端對端腳本可直接改寫成第一批整合測試。
   - 前端：**Vitest + React Testing Library**（入庫狀態機、焦點守門）；**Playwright** 做 E2E（刷櫃位 → 刷 S/N → 綁定；可模擬掃描槍的「輸入＋Enter」）。
4. **程式規範**：ESLint（`typescript-eslint`、`eslint-plugin-react-hooks`）＋ Prettier ＋ `husky` / `lint-staged` pre-commit。
5. **CI**：GitHub Actions / GitLab CI / Azure DevOps：`typecheck → lint → test → prisma migrate diff（擋破壞性變更）→ build`。

### Phase 2 — 正式上線必要功能
6. **身分驗證與權限**：目前操作員是 `x-emp-no/x-emp-name` header（可偽造）。有 AD/SSO 就接 **OIDC**（`openid-client`）或 **SAML**；無則「員工證＋PIN」。以 **RBAC** middleware 控制 OP／JQE／組長權限（重新啟用、停用台車、新增台車需具名核可）。
7. **SL2.0 / MES 整合**：短期 `node-cron` 或 **BullMQ** 排程從 SL2.0 同步 unit 主檔（upsert `dut_unit`）；長期改事件驅動（Webhook / Kafka）。OBE Issue 以 S/N 互串。
8. **即時推播**：地圖／儀表板目前 15 秒輪詢；多刷取站同時作業時改用 **Server-Sent Events** 或 **Socket.IO**，commit 後廣播儲位變更。
9. **標籤列印**：`BarCode.tsx` 已是可掃描的 Code128；新增台車後需批次列印 44 張 → 用 **pdfmake / pdf-lib** 產 PDF，或接條碼印表機（Zebra **ZPL**、TSC **TSPL**）。
10. **斷網作業**（若現場需要）：PWA + **Workbox** + IndexedDB 佇列，交易帶冪等鍵，恢復後依序重放並處理衝突。

### Phase 3 — 部署與維運
11. **部署**：Backend 以 **PM2**（Windows 可用 **NSSM** 註冊成服務）或 **Docker** 執行；Frontend `vite build` 後由 **Nginx / IIS** 靜態服務並反向代理 `/api`。資料庫用公司既有 PostgreSQL，正式環境一律 `prisma migrate deploy`。
12. **備份**：`pg_dump` 每日排程＋異地保存；定期演練還原。
13. **可觀測性**：**pino** 結構化 log →（ELK / Loki）；**Prometheus + Grafana** 追蹤上線 KPI（刷取覆蓋率、呆滯機台數、日入出庫量）；**Sentry** 錯誤追蹤。
14. **效能**：目前千台等級全表聚合無虞；數萬台以上將儀表板 KPI 改 materialized view，`dut_movement` 依月份 partition。

### 硬體與現場
15. 掃描槍需支援 Code128（櫃位）與 QR（S/N），設定為「鍵盤模式＋Enter 結尾」；先借 1 台實測再定採購量。
16. 刷取站電腦只需瀏覽器連 `http://<app 主機>:5173/in`；焦點守門已處理「焦點跑掉條碼打到別處」的問題。
