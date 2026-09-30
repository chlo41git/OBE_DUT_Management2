# 資料庫設定（pgAdmin 4）

本專案的資料庫**不再使用 Docker**，改由本機安裝的 PostgreSQL 承載、用 **pgAdmin 4** 建立與連線。

| 項目 | 值 |
|---|---|
| 主機 / 連接埠 | `localhost:5432` |
| 資料庫 | `obe_dut_v04` |
| 應用程式帳號 | `obe` / `CHANGE_ME` |
| schema | `public` |

> 這組值只出現在 `packages/backend/.env` 的 `DATABASE_URL` 一處；要改名稱或密碼，改那一行即可，程式其他地方不會寫死。
>
> 資料庫放在**另一台電腦**（例如 app 在 `<APP_HOST>`、PostgreSQL 在 `<DB_HOST>`）時，Step 1–3 改在資料庫主機上做，另外還要開放遠端連線——見 [附錄 C](#附錄-c遠端資料庫資料庫在另一台電腦)。

---

## 前置：PostgreSQL 與 pgAdmin 4

Windows 用 [PostgreSQL 官方安裝程式](https://www.postgresql.org/download/windows/)安裝時，pgAdmin 4 會一併裝進去，路徑約為：

```
C:\Program Files\PostgreSQL\18\pgAdmin 4\        pgAdmin 4
C:\Program Files\PostgreSQL\18\bin\              psql.exe / pg_dump.exe 等命令列工具
```

確認資料庫服務在跑（PowerShell）：

```powershell
Get-Service postgresql*
# 若 Status 是 Stopped：
Start-Service postgresql-x64-18
```

Prisma 需要 PostgreSQL 12 以上；18 沒問題。

---

## Step 1 — 在 pgAdmin 4 註冊本機伺服器

第一次開 pgAdmin 4 會要求設定 master password（這是 pgAdmin 自己保管連線密碼用的，跟資料庫密碼無關）。

安裝程式通常已自動建好一個 **PostgreSQL 18** 的 server 節點；若左側樹狀沒有：

1. 左側 **Servers** 右鍵 → **Register** → **Server…**
2. **General** 頁籤 → Name：`Local PostgreSQL 18`（自取）
3. **Connection** 頁籤：
   - Host name/address：`localhost`
   - Port：`5432`
   - Maintenance database：`postgres`
   - Username：`postgres`
   - Password：安裝 PostgreSQL 時設定的超級使用者密碼（勾 Save password）
4. **Save**

---

## Step 2 — 建立應用程式帳號 `obe`

展開剛才的 server → 點 **Databases** → **postgres** → 工具列 **Query Tool**（或右鍵 → Query Tool），貼上並執行：

`packages/backend/prisma/sql/01_create_role.sql`

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'obe') THEN
    CREATE ROLE obe LOGIN CREATEDB PASSWORD 'CHANGE_ME';
  ELSE
    ALTER ROLE obe LOGIN CREATEDB PASSWORD 'CHANGE_ME';
  END IF;
END
$$;
```

執行鍵是 ▶ 或 **F5**。可重複執行，帳號已存在時只會重設密碼並補上 `CREATEDB`。

**`CREATEDB` 不能省。** `prisma migrate dev` 每次都會另外開一個暫時的 **shadow database** 來比對 schema drift，用完即刪；帳號沒有 `CREATEDB` 就會失敗於：

```
Error: P3014
Prisma Migrate could not create the shadow database.
Original error: ERROR: permission denied to create database
```

Docker 版的 `obe` 是容器內的超級使用者、天生就有這個權限，所以舊的 compose 流程不需要特別設定；改用本機 PostgreSQL 後才要明寫。`CREATEDB` 只允許建立自己的資料庫，不等於 `SUPERUSER`。

> 帳號已經建好但漏了 `CREATEDB`，不必重建——在 `postgres` 的 Query Tool 補一行即可：
> ```sql
> ALTER ROLE obe CREATEDB;
> ```
> 確認結果：`SELECT rolname, rolcreatedb FROM pg_roles WHERE rolname = 'obe';` 應為 `t`。

> 也可以改用 GUI：**Login/Group Roles** 右鍵 → Create → Login/Group Role…，
> General 頁籤 Name 填 `obe`，Definition 頁籤 Password 填 `CHANGE_ME`，
> Privileges 頁籤把 **Can login?** 與 **Can create databases?** 都打開。

---

## Step 3 — 建立資料庫 `obe_dut_v04`

1. 左側 **Databases** 右鍵 → **Create** → **Database…**
2. **General** 頁籤：
   - Database：`obe_dut_v04`
   - **Owner：`obe`** ← 這一格很重要
   - Comment：`OBE DUT 儲位管理系統`（可略）
3. **Definition** 頁籤：Encoding 保持 `UTF8`
4. **Save**

**Owner 一定要選 `obe`。** PostgreSQL 15 以後 `public` schema 歸 `pg_database_owner` 所有，Owner 是 `obe` 時 Prisma 才有權限建表；若沿用預設的 `postgres` 當 Owner，`prisma migrate` 會在建第一張表時報 `permission denied for schema public`。

已經用 `postgres` 建好了也不用重建——對**該資料庫**開 Query Tool，執行 `packages/backend/prisma/sql/02_grant_existing_database.sql` 補權限即可。

---

## Step 4 — 設定 backend 環境變數

```powershell
copy packages\backend\.env.example packages\backend\.env
```

```bash
cp packages/backend/.env.example packages/backend/.env   # bash
```

若 Step 2/3 用了不同的資料庫名稱或密碼，改 `.env` 裡的 `DATABASE_URL` 這一行：

```
DATABASE_URL="postgresql://obe:CHANGE_ME@localhost:5432/obe_dut_v04?schema=public"
```

密碼含 `@ : / ? #` 等字元要做 percent-encoding（例如 `p@ss` → `p%40ss`）。

---

## Step 5 — 建表、灌示範資料

從 repo 根目錄：

```bash
npm install            # 尚未安裝過依賴的話
npm run db:check       # 自檢：連線／權限／migration 狀態，會指出下一步
npm run db:migrate     # prisma migrate dev，建立所有資料表
npm run db:seed        # 產生 6 分區 / 34 台車 / 約 400 台機台的示範資料
npm run db:check       # 再跑一次確認
```

`npm run db:check` 會分辨常見卡關並直接給指令，例如：

```
✗ 資料庫 "obe_dut_v04" 不存在。
  請在 pgAdmin 4 的 Databases 右鍵 → Create → Database…，
  Database 填 "obe_dut_v04"、Owner 選 "obe"。
```

> `db:seed` 是**從零重建**（會先清掉所有資料表內容），不是累加。手動測試的資料會被洗掉。

---

## Step 6 — 在 pgAdmin 4 檢視資料

左側展開：

```
Servers → Local PostgreSQL 18 → Databases → obe_dut_v04 → Schemas → public → Tables
```

會看到 `storage_zone`、`storage_rack`、`storage_slot`、`dut_unit`、`dut_issue`、`dut_movement`、`storage_exception`、`scan_metric`、`config_setting`，以及 Prisma 自用的 `_prisma_migrations`。

任一張表右鍵 → **View/Edit Data** → **All Rows** 即可瀏覽。

Prisma 自家的 GUI 也還在：`npm run db:studio`（<http://localhost:5555>）。

---

## 疑難排解

| 症狀 | 原因與處理 |
|---|---|
| `db:check` 報 P1001 連不到 `localhost:5432` | 服務沒起來 → `Start-Service postgresql-x64-18`；或 5432 被別的程式佔用 → `netstat -ano \| findstr :5432` |
| `db:check` 報 P1000 驗證失敗 | `obe` 帳號不存在或密碼不符 → 重跑 Step 2 的 `01_create_role.sql` |
| `db:check` 報 P1003 資料庫不存在 | 還沒做 Step 3；或 `.env` 的資料庫名稱與 pgAdmin 裡建的不一致（注意 `obe_dut_v04` vs `obe_dut_db`） |
| `migrate` 報 `permission denied for schema public` | 資料庫 Owner 不是 `obe` → 執行 `02_grant_existing_database.sql` |
| `migrate` 報 **P3014** `could not create the shadow database` / `permission denied to create database` | `obe` 少了 `CREATEDB`（見 Step 2）→ 在 `postgres` 的 Query Tool 執行 `ALTER ROLE obe CREATEDB;`。急著建表可先用不需要 shadow database 的 `npm run db:deploy` 套用既有 migration，但要改 `schema.prisma` 前仍得補上這個權限 |
| 報 `TS2305 no exported member 'Unit'` 等約 34 個編譯錯誤 | Prisma Client 沒產生 → `npm run db:generate` |
| 遠端連線逾時／`no pg_hba.conf entry for host …` | 資料庫在另一台電腦時的網路／授權設定 → 見附錄 C 的疑難排解 |
| pgAdmin 4 一直要 master password | 那是 pgAdmin 自身的密碼保管機制，與資料庫無關；忘記的話可在 Preferences → Paths/Master Password 重設（會清掉已存的連線密碼） |

---

## 附錄 A：把既有 Docker 資料庫搬過來

如果在別台機器／別的環境裡有含實際資料的 Docker PostgreSQL，要搬進本機這份：

```bash
# 1. 在有 Docker 的那台匯出（自訂格式，可選擇性還原）
docker exec -t obe_dut_db pg_dump -U obe -d obe_dut -F c -f /tmp/obe_dut_v04.dump
docker cp obe_dut_db:/tmp/obe_dut_v04.dump ./obe_dut_v04.dump
```

> ⚠ **v0.3 → v0.4 的 schema 不相容**（`storage_zone` → `storage_area`、儲位碼 `R05-L03-P2` → `FIN-04-01-04`、移除異常單／規則設定表）。
> 本附錄只適用於「同為 v0.4 schema」的資料庫搬移；v0.3 的舊資料不能直接還原，需另寫轉換腳本（先決定舊台車 R01..R34 對應到哪個 WIP/FIN 台車號）。

把 `obe_dut_v04.dump` 複製到本機後，依 Step 1–3 先把空的 `obe_dut_v04` 建好，再還原：

```powershell
$env:PGPASSWORD='CHANGE_ME'
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" `
    -U obe -h localhost -p 5432 -d obe_dut_v04 --no-owner --clean --if-exists `
    .\obe_dut_v04.dump
```

也可以在 pgAdmin 4 裡做：`obe_dut_v04` 右鍵 → **Restore…** → Format 選 `Custom or tar`、Filename 選該 dump，Restore options 勾 **Clean before restore** 與 **Do not save Owner**。

還原完跑 `npm run db:check`；若 migration 版本與程式碼不同步，再跑 `npm run db:deploy` 補上未套用的 migration。

> **跨大版本注意**：Docker 用的是 PostgreSQL 16、本機是 18，`pg_restore` 從舊版還原到新版是支援的方向（反過來不行）。

## 附錄 B：清掉先前殘留的空資料庫

若之前在 pgAdmin 4 裡誤建了名稱不符的空資料庫（例如照 container 名字建的 `obe_dut_db`），確認裡面沒有資料表後可以移除：

pgAdmin 4 左側該資料庫右鍵 → **Delete/Drop**；或在 `postgres` 的 Query Tool 執行：

```sql
DROP DATABASE IF EXISTS obe_dut_db;
```

---

## 附錄 C：遠端資料庫（資料庫在另一台電腦）

範例架構：

| 角色 | IP | 跑什麼 |
|---|---|---|
| 應用程式主機 | `<APP_HOST>` | frontend（Vite）＋ backend（Express/Prisma） |
| 資料庫主機 | `<DB_HOST>` | PostgreSQL 18 ＋ pgAdmin 4 |

PostgreSQL 預設只接受本機（`localhost`）連線，所以資料庫主機上的 pgAdmin 4 連得到，不代表別台連得到。要開三道門：**監聽位址**、**`pg_hba.conf` 授權**、**Windows 防火牆**。

### C-1　資料庫主機（<DB_HOST>）

**1. 帳號與資料庫**：在資料庫主機的 pgAdmin 4 做完本文件 Step 2、Step 3（`obe` 要有 `CREATEDB`、`obe_dut_v04` 的 Owner 要是 `obe`）。

> 資料庫對網路開放後，建議換掉開發用預設密碼：`ALTER ROLE obe PASSWORD '新密碼';`，並同步改 app 主機 `.env`。

**2. 找設定檔位置**（pgAdmin Query Tool）：

```sql
SHOW config_file;   -- postgresql.conf
SHOW hba_file;      -- pg_hba.conf
```

預設在 `C:\Program Files\PostgreSQL\18\data\`，需以系統管理員權限編輯。

**3. `postgresql.conf` — 監聽網路介面**（行首若有 `#` 要拿掉）：

```conf
listen_addresses = '*'          # 或 'localhost,<DB_HOST>'
port = 5432
```

**4. `pg_hba.conf` — 允許 app 主機連線**，在檔尾加：

```conf
# TYPE  DATABASE  USER  ADDRESS        METHOD
host    all       obe   <APP_HOST>/32    scram-sha-256
```

DATABASE 欄**要寫 `all`**，不能只寫 `obe_dut_v04`：`prisma migrate dev` 每次都會建立並連進一個臨時的 `prisma_migrate_shadow_db_…`，只放行 `obe_dut_v04` 會被擋。要開放整個網段可改 `<LAN_CIDR>`。

**5. 重啟服務**（系統管理員 PowerShell；改 `listen_addresses` 必須重啟，reload 不夠）：

```powershell
Restart-Service postgresql-x64-18
netstat -ano | findstr :5432     # 應出現 0.0.0.0:5432 LISTENING；只有 127.0.0.1 代表第 3 步沒生效
```

**6. Windows 防火牆放行 5432**（只放行 app 主機）：

```powershell
New-NetFirewallRule -DisplayName "PostgreSQL 5432 (OBE backend)" `
  -Direction Inbound -Protocol TCP -LocalPort 5432 `
  -RemoteAddress <APP_HOST> -Action Allow -Profile Any
```

**7.（建議）固定 IP**：路由器設 DHCP 保留或設靜態 IP，避免 `<DB_HOST>` 變動後 backend 連不上。

### C-2　應用程式主機（<APP_HOST>）

**1. 測網路**：

```powershell
Test-NetConnection <DB_HOST> -Port 5432    # 要看到 TcpTestSucceeded : True
```

也可在本機 pgAdmin 4 Register 一個 Server（Host `<DB_HOST>`、Username `obe`）確認。

**2. `packages/backend/.env`** 的 host 改成資料庫主機：

```env
DATABASE_URL="postgresql://obe:CHANGE_ME@<DB_HOST>:5432/obe_dut_v04?schema=public"
```

**3. 自檢與建表**（repo 根目錄）：

```powershell
npm run db:check      # 主機一行應顯示 <DB_HOST>:5432
npm run db:deploy     # 套用既有 migration（新庫也可用 db:migrate）
npm run db:seed       # 需要示範資料才跑——會清空所有表
```

**4. 重啟 backend**：`.env` 只在啟動時讀取，改完要停掉 `npm run dev:backend` 再重開（先 `netstat -ano | findstr :4000` 確認沒有殘留舊程序）。

### C-3　疑難排解

| 症狀 | 原因與處理 |
|---|---|
| `db:check` 報 P1001／`Test-NetConnection` 失敗 | 資料庫主機沒監聽網路介面（C-1 第 3、5 步）或防火牆擋掉（第 6 步）；也確認服務在跑 |
| `no pg_hba.conf entry for host "<APP_HOST>"` | `pg_hba.conf` 沒有對應規則，或改完沒重啟／reload（C-1 第 4、5 步） |
| `password authentication failed`／P1000 | 帳號密碼與 `.env` 不符；`.env` 內密碼的特殊字元要 percent-encoding |
| `db:check` 過了，但 `db:migrate` 在建 shadow database 時被 pg_hba 擋 | `pg_hba.conf` 的 DATABASE 欄寫成了 `obe_dut_v04`，改成 `all` |
| P3014 `permission denied to create database` | `obe` 少了 `CREATEDB`（Step 2） |
