# CLAUDE.md

本檔案提供 Claude Code（claude.ai/code）在此 repo 中工作時所需的指引。

## 這是什麼專案

以 React + TypeScript + Node/Express + PostgreSQL 實作 `OBE_DUT_儲位管理系統_POC_v04.html` —— 單檔 HTML/JS 的 DUT（測試機台）儲位管理 POC。**POC v04 檔案本身就是規格書**：功能定義不明確或收到 bug 回報時，先讀 POC 裡對應的函式（`inSlotScan`、`inUnitScan`、`commitIn`、`handleOut`、`releaseSlot`、`renderMap`、`renderDash`…），它是預期行為、文案與排版的事實來源。`OBE_DUT_儲位管理系統_POC_v03.html` 只是歷史基準，不要照它改。

本專案是從 v0.3 版系統（`D:\2026\倉儲管理\OBE_DUT_Management - 20260929`）複製後改寫，保留其程式結構與 UI/UX，並依 v04 **縮減功能**：只剩 入庫上架 `/in`、取機出庫 `/out`、找機台與儲位地圖 `/map`、戰情儀表板 `/dash`、事件紀錄 `/log`。異常單、待補清單、機台主檔、規則設定、設計說明、離線模擬、模擬刷取按鈕、`MISSING` 狀態都已**刻意移除**，不要加回來（除非使用者要求）。

### v0.4 儲位編碼（核心）

條碼內容 ＝ `區域-台車-層-機位`，例 `FIN-04-01-04`，與現場已印出的一維 Code128 標籤完全一致；標籤中文面「已驗，04臺車，01層，04機位」。
- 區域只有 `WIP`（未驗，24 台車）與 `FIN`（已驗，12 台車），兩區台車號各自從 01 起；台車碼 `WIP-01`。
- 建議區域：DUT 狀態為 `EQM1 已驗待放行`／`EQM1 已刷出待 Re SWDL` → FIN，其餘 → WIP。只提示不擋下（跨區仍可綁定）。
- 所有碼值解析／正規化集中在 `packages/backend/src/lib/logic.ts`（`normSlot` 接受 `fin 4 1 4`、`FIN_04_01_04` 等寫法）。前端**不解析碼值**，中文面 `labelZh` 等字串由後端算好放在 DTO（`SlotLocDTO`）裡。
- 掃描：Step 1 櫃位＝一維條碼；Step 2 機台 S/N 由 SL2.0／原廠標籤提供（本系統只掃不產生）。本系統產生的標籤一律是櫃位碼，只用 `components/BarCode.tsx`（jsbarcode Code128）。

npm workspaces monorepo：
- `packages/shared` —— `@obe/shared`：前後端共用的 TypeScript 型別（API 合約）。編譯成 CJS 的 `dist/`，**前端只 import type**（Vite 對 linked CJS 套件的 runtime import 不可靠），所以不要把執行期 helper 放這裡給前端用。清掉 `node_modules` 後若解析不到，執行 `npm run build -w @obe/shared`。
- `packages/backend` —— `@obe/backend`：Express + Prisma API。
- `packages/frontend` —— `@obe/frontend`：React 18 + Vite UI，`src/styles/global.css` 對齊 POC `<style>`。

## 常用指令

```bash
npm install                          # 根目錄，安裝所有 workspace
npm run db:check                     # 連線／權限／migration 自檢
npm run db:migrate                   # prisma migrate dev（在 packages/backend 執行）
npm run db:seed                      # 36 台車 / 1,584 儲位 / 1,000 台機台（破壞性：先清空所有資料表；使用 POC 的固定亂數種子，每次結果相同）
npm run dev:backend                  # tsx watch，http://localhost:4000
npm run dev:frontend                 # vite，http://localhost:5173，代理 /api -> :4000
npm run build                        # shared -> backend（先 prisma generate 再 tsc）-> frontend
npm run typecheck -w @obe/backend    # 任何修改後都要跑（frontend 同理）；目前沒有測試框架
```

開發資料庫：`<DB_HOST>:5432/obe_dut_v04`（`packages/backend/.env`，gitignored）。同一台伺服器上的 `obe_dut` 是 v0.3 系統在用的，**不要對它執行 migrate/seed**。

Migration 只有一支 `*_init_v04`，末段手動加了 CHECK constraint（碼值格式、`slot.code = rackCode-LL-PP`、`BLOCKED ⇔ blockReason`）。之後改 schema 用 `npx prisma migrate dev --name <desc>`；若要再加 CHECK，用 `--create-only` 產生後手動補 SQL。

`@obe/backend` 的 build 先跑 `prisma generate` 再 `tsc`：剛 `npm install` 完只有 `@prisma/client` 的 stub，`tsc` 會噴 TS2305／TS7006 —— 不是 bug，跑 `npx prisma generate` 即可。

### 資料庫設定的坑（pgAdmin 4）

`obe_dut_v04` 資料庫的 **Owner 必須是 `obe` role**。PostgreSQL 15 以後 `public` schema 歸 `pg_database_owner` 所有，所以用 pgAdmin 4 的預設 owner（`postgres`）建出來的資料庫，會讓 `obe` 沒有 `public` 的 CREATE 權限，`prisma migrate` 會死在 `permission denied for schema public`。不重建資料庫的修法：對**該資料庫本身**開 Query Tool，執行 `packages/backend/prisma/sql/02_grant_existing_database.sql`。

`obe` role 另外**需要 `CREATEDB`**（`01_create_role.sql` 會給）。`prisma migrate dev` 每次執行都會另開一個用完即丟的 *shadow database* 來比對 schema drift，少了這個權限，`npm run db:migrate` 會失敗於 `P3014 … permission denied to create database`。舊的 docker-compose 環境裡 `obe` 是容器內的超級使用者、隱含就有這個權限，改成本機安裝後才需要明寫。既有 role 的修法：以 `postgres` 執行 `ALTER ROLE obe CREATEDB;`。在還沒補權限之前，`npm run db:deploy`（`prisma migrate deploy`）不需要 shadow database，是套用既有 migration 的方式 —— 但只要要產生新的 migration，就還是得補上這個權限。

`npm run db:check` 會分辨常見的失敗模式（role 不存在 → P1000、服務沒起來 → P1001、資料庫不存在 → P1003、沒有 CONNECT → P1010、`public` 沒有 CREATE），並印出確切的下一道指令 —— 在懷疑是應用層壞掉之前先跑這個。注意資料庫名稱是 `obe_dut_v04`（v0.3 系統的 `obe_dut` 仍在同一台伺服器上，不要動它）。

各 package 專屬指令（從根目錄加 `-w @obe/backend` 或 `-w @obe/frontend`，或 `cd` 進該目錄）：
- `npm run typecheck` —— `tsc --noEmit`。任何修改之後都要跑；目前還沒有測試套件。
- `npm run db:studio`（backend）—— 對本機資料庫開 Prisma Studio GUI。
- `npx prisma migrate dev --name <desc>`（在 `packages/backend`）—— 編輯過 `prisma/schema.prisma` 之後執行。

目前尚未配置測試框架、linter 或 formatter（規劃見 README「後續建議」#5/#6）。

### 已知問題：非 ASCII 路徑下前端建置崩潰

`npm run build -w @obe/frontend` 會在 `✓ … modules transformed.` 之後原生崩潰（`STATUS_STACK_BUFFER_OVERRUN`，結束碼 `0xC0000409`），且沒有任何錯誤輸出。2026-09-23 驗證的根本原因：**專案路徑含非 ASCII 字元**（`D:\2026\倉儲管理\…`）。同一份程式碼在純英數路徑下用 Vite 8.3.0 可正常建置（例如 `subst Q: "D:\2026\倉儲管理"` 之後從 `Q:\OBE_DUT_Management` 建置）。Vite 5.4.x（Rollup）在非 ASCII 路徑下一樣崩潰，所以**降版沒有用** —— 而且會引入未修補的 dev-server 安全性通報。不要為了這件事把 vite 釘在 5。解法：部署到純英數路徑，或透過 `subst` 建置（見 `docs/DEPLOYMENT.md`）。dev 模式（`vite` dev server）不受影響。

另外：backend build 的第一步 `prisma generate`，在 backend 行程還在跑的時候會失敗於 `EPERM … query_engine-windows.dll.node`，因為 Windows 會鎖住已載入的 DLL。**build 之前要先停掉 backend。**

### 區網（LAN）提供服務

`vite.config.ts` 設了 `host: true` + `strictPort: true`（`server` 與 `preview` 都設），這樣區網上其他機台只要有瀏覽器就能開 `http://<app 主機>:5173/dash`。API 透過 Vite 的 `/api` proxy 維持同源，所以 4000 埠從不對外曝露，也不涉及 CORS。步驟見 `docs/DEPLOYMENT.md`。

### Dev server 衛生習慣

backend 是用單純的 `tsx src/server.ts` 啟動（或 `npm run dev:backend`，它用的是 `tsx watch`），沒有 process supervisor 在管。**為了測試而啟動 dev server 之前，一定要先檢查並殺掉殘留的 listener**（Windows：`netstat -ano | grep ':4000\|:5173'`）—— 前幾次 session 留在這兩個埠上的行程，是「它就是不會動」這類混淆回報的真實常見來源（stale HMR 狀態、埠號衝突），不是程式的 bug。不要殺掉無關的 node／瀏覽器行程。

**光殺掉佔埠的行程不夠 —— `tsx watch` 會把它生回來。** `npm run dev:backend` 實際上是一棵三層的行程樹：`npm run dev:backend` → `npm run dev -w @obe/backend` → `tsx watch src/server.ts` → 真正的 server（只有它持有 `:4000`）。只殺掉 listener 的話，`tsx watch` 監控行程會立刻啟動一個新的 server，把 `query_engine-windows.dll.node` 重新鎖住，導致下一次 `npm run build` 失敗於上面那個 `EPERM` —— 2026-09-26 驗證過：兩棵 2026-09-24 遺留下來的 watcher 樹，讓 backend 在兩次獨立的清理嘗試之間不斷復活。`netstat` 看不到 watcher，所以要依 command line 列舉整棵樹，並先殺掉監控行程：

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Select-Object ProcessId, CreationDate, CommandLine      # 找出 tsx/vite/npm-run-dev 的項目
# 擊殺順序：tsx watch / vite  ->  server 子行程  ->  npm 包裝層
```

用 `CreationDate` 判斷哪個是活躍的 session、哪個是殘留；跑了好幾天的 `vite` dev server 就是等著誤導人的 stale HMR 狀態。

**自己為了測試而啟動的 server，測完當場收掉 —— 不要留給下一個人。** 這是上面「啟動前先清理」的前一半：被遺留的 server 會用兩種方式咬人，兩種都在這個 repo 實際發生過（2026-09-24 與 2026-09-26）：`tsx watch` 復活 backend 後鎖住 Prisma DLL，讓後續的 `npm run build` 失敗於 `EPERM`；以及殘留的 server 持有 `:4000`，讓使用者自己的 `npm run dev:backend` 死在 `EADDRINUSE: address already in use :::4000`。所以驗證完就把整棵樹殺掉（順序同上），不要只是「先留著、之後再說」。

兩個相關的細節：

- **改過 `.env` 之後一定要重啟 backend。** `DATABASE_URL` 是啟動時讀進記憶體的，`tsx watch` 只監看原始碼、不會因為 `.env` 變更而重載。修完連線設定卻沿用舊行程，症狀會和沒修一樣（例如 Prisma 仍然回 `denied access`），很容易誤判成修正無效。
- **`tsx watch` 在啟動就崩潰之後，不會自己重試綁定。** 它會停在原地等檔案變更，所以 `EADDRINUSE` 失敗留下的那棵樹是閒置但活著的行程；清掉它再重新啟動，不要期待它自己恢復。


## 架構

### 資料模型（`packages/backend/prisma/schema.prisma`）

`storage_area`（WIP/FIN）→ `storage_rack`（`code`＝`WIP-01`，`@@unique([areaCode, no])`）→ `storage_slot`（11 層 × 4 機位，`code`＝`FIN-04-01-04`，狀態 EMPTY/OCCUPIED/BLOCKED）→ 最多被一台 `dut_unit` 佔用（`slotCode` unique nullable FK）。`dut_unit` 帶 OBE Issue 子表 `dut_issue`。機台狀態 NEW/IN/OUT/LEFT。

`dut_movement`（稽核）的 `sn` 是**純字串、刻意不設 FK**，讓未建檔／被拒收的 S/N 仍留紀錄；台車事件（新增／停用）把台車碼放在 `sn`。不要把 FK 加回去。所有寫入稽核一律走 `eventService.logMovement()`。

參考資料（`AREA_DEFS`、`CFG` 層數／機位數／呆滯天數／去重秒數、`BLOCK_REASONS`、`PROJECTS`…）是 `packages/backend/src/lib/areaDefs.ts` 的靜態常數；`storage_area` 由 seed 從 `AREA_DEFS` 寫入。沒有 config 表（v04 移除了規則設定頁），前端透過 `GET /api/config` 取常數。

### Backend 請求流程

Route（`src/routes/*.ts`）很薄：解析 body/query → 呼叫 `src/services/*.ts` → `res.json()`。商業邏輯與 Prisma 查詢都在 service，多步驟寫入用 `prisma.$transaction`。

入庫／出庫拆成**試跑（dry-run）＋提交（commit）**，因為 UI 要先跳確認 modal：
- `checkinService.scanSlot()` → `scanUnit()`（唯讀，回傳 outcome：`OK`/`RETURN`/`UNKNOWN_SN`/`LEFT_UNIT`/`NEED_MOVE_CONFIRM`/`ALREADY_HERE`/`SLOT_RESCAN`）→ `commitCheckIn()`（可帶 `decision`：`TEMP_CREATE`/`REACTIVATE`/`CONFIRM_MOVE`）。`rejectCheckIn`／`blockLeftCheckIn` 只寫稽核。
- `checkoutService.scanOutSlot()`（唯讀）→ `confirmCheckOut()`（釋放）。
- outcome 型別在 `packages/shared/src/index.ts`，前端以 switch 處理 —— 新增邊界情境要同時改 shared 型別 + service + 前端 modal。
- 移位時先把 unit 的 `slotCode` 清成 null 再指到新位，避免 unique 衝突。

錯誤：丟 `HttpError`（`lib/httpError.ts`），回 `{code, message, details}`。例：停用非空台車回 409 `RACK_NOT_EMPTY`，`details.hint` 是對話框第二行文字。

操作員身分用 `x-emp-no`/`x-emp-name` header（`lib/operator.ts`），不是真正驗證（見 README Phase 2）。兩端都做 percent-encode／decode（中文姓名放 header 會壞），不要移除。

### Frontend

`src/api/client.ts` 是唯一的 fetch 包裝層，注入 operator header。路由（`App.tsx`）用真實路徑；`useEffect` 只在**瀏覽器真的重新載入**時導回 `/dash`（複製 POC「永遠從儀表板開啟」），不影響深連結（例：機台明細「在地圖上定位」→ `/map?kw=...`）。

共用元件改一處即可：`UnitInfo`（入庫／出庫／明細共用的機台資訊）、`UnitDrawer`、`PrintLabelModal`、`BarCode`、`ManualSlotModal`（入庫／出庫共用）、`LogTable`（儀表板／事件紀錄共用）、`Tag`（`AreaTag`、`DutStatusTag`）。

掃描輸入框是**非受控元件**（`ref`，Enter 後手動清空），對應掃描槍「打字＋Enter」。兩頁在 client 端做 2 秒同碼去重。`useScanFocusGuard` 每 700ms 把焦點拉回刷取框（有 `.mask` 即 modal/drawer 開著、或使用者正在別的 input/select 時不搶）。

`CheckIn.tsx` 的 `handleScan` 依 `step` 分派給 `doScanSlot`/`doScanUnit`，**不要**寫成自我遞迴（早期版本在 `SLOT_RESCAN` 分支遞迴呼叫，closure 捕捉到過期 `step` 造成無窮迴圈）。

## 參考資料

- `OBE_DUT_儲位管理系統_POC_v04.html` —— 規格（事實來源）；`..._POC_v03.html` —— 歷史基準。兩者都留在 repo，不要刪。
- `Hint.txt` —— 使用者的任務描述。
- `README.md` —— 設定步驟、API 一覽、v0.3→v0.4 差異、後續正式開發步驟。
- `docs/DATABASE_SETUP.md`、`docs/DEPLOYMENT.md` —— pgAdmin 4 建庫、遠端 DB、區網部署。
