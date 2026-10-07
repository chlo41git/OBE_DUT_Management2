# 區網部署（單一 app 主機 + 瀏覽器 client）

目標：frontend / backend 只裝在一台 **app 主機**上，其它機台只要開瀏覽器連到 `http://<APP_HOST>:5173/dash` 就能使用 OBE DUT 系統，不需要安裝 Node 或放程式碼。

以下 IP 為範例，請換成實際值：

| 角色 | IP | 跑什麼 | 對外開放的埠 |
|---|---|---|---|
| app 主機 | `<APP_HOST>` | frontend（Vite, `:5173`）＋ backend（Express, `:4000`） | **5173** |
| 資料庫主機 | `<DB_HOST>` | PostgreSQL 18 ＋ pgAdmin 4 | 5432（只開放給 app 主機） |
| 各機台（client） | 區網任意 | 瀏覽器 | — |

```
各機台（只需瀏覽器）
      │  http://<APP_HOST>:5173/dash
      ▼
<APP_HOST>  frontend（Vite :5173）──/api 代理──▶ backend（localhost:4000）
                                                        │
                                                        ▼
                                       <DB_HOST>  PostgreSQL（:5432）
```

前端一律用相對路徑呼叫 `/api/...`（`packages/frontend/src/api/client.ts`），由 app 主機上的 Vite 轉給**同一台**的 backend。所以：

- client 只連 5173；**4000 不需要對外開放**。
- 對瀏覽器而言是同源請求，沒有 CORS 問題，backend 的 `CORS_ORIGIN` 不必改。

---

## 一、app 主機（<APP_HOST>）

### 1. 安裝 Node.js

安裝 **Node.js 24 LTS**（開發機為 v24.12.0），用 `node -v`、`npm -v` 確認。

### 2. 搬移程式碼（不要複製 `node_modules`）

- **放在純英數路徑下**，例如 `D:\OBE\OBE_DUT_Management`。路徑中如果有中文（例如 `D:\2026\倉儲管理\…`），`npm run build` 建置前端時會原生崩潰（見第 6 步）；開發模式不受影響。
- 建議用 `git clone`；若直接複製資料夾，排除 `node_modules`、`packages/*/dist`。
- **原因**：`node_modules/@obe/{shared,backend,frontend}` 是 npm workspace 建立的 junction（目錄連結）。zip 或多數複製工具不會保留 junction，會變成空資料夾，導致 backend 啟動就崩潰（`Cannot find module '@obe/shared'`），前端則一直停在「載入中」。
- `packages/backend/.env` 不在 git 裡，要另外帶過去：

  ```env
  DATABASE_URL="postgresql://obe:CHANGE_ME@<DB_HOST>:5432/obe_dut_v04?schema=public"
  PORT=4000
  CORS_ORIGIN="http://localhost:5173"
  ```

### 3. 安裝依賴、確認資料庫連線

repo 根目錄：

```powershell
npm install
Get-ChildItem node_modules\@obe | Select-Object Name, LinkType   # 三個都要是 Junction
npm run db:generate
npm run db:check                                                # 全部打勾才繼續
```

`db:check` 連不上時，見 [DATABASE_SETUP.md 附錄 C](DATABASE_SETUP.md#附錄-c遠端資料庫資料庫在另一台電腦)。

### 4. 資料庫主機授權（app 主機 IP 有變時）

如果 app 主機的 IP 和之前不同，到 <DB_HOST> 更新：

- `pg_hba.conf`：`host  all  obe  <新 IP>/32  scram-sha-256`，然後重新啟動服務
- 防火牆規則 `PostgreSQL 5432 (OBE backend)` 的 `-RemoteAddress`

IP 沒變就跳過這一步。

### 5. Vite 對區網開放（repo 已設定好）

`packages/frontend/vite.config.ts` 已設定：

| 設定 | 作用 |
|---|---|
| `server.host: true`／`preview.host: true` | 監聽 `0.0.0.0`，否則只有 app 主機自己連得到 |
| `port: 5173` + `strictPort: true` | 5173 被佔用時直接報錯，而不是默默換埠（換埠後所有機台的網址會失效） |
| `server.proxy['/api'] → http://localhost:4000` | 把 API 轉給同一台的 backend；`vite preview` 會沿用這個設定 |

### 6. 啟動服務

**正式模式（建議現場使用）**：

```powershell
# 先停掉正在跑的 backend，否則 prisma generate 會因 DLL 被佔用而報 EPERM
npm run build                                    # shared → backend → frontend
npm start -w @obe/backend                        # 視窗 1：node dist/server.js，:4000
cd packages\frontend; npx vite preview           # 視窗 2：提供建置後的靜態檔，並代理 /api
```

**開發模式（臨時測試用）**：repo 根目錄，開兩個視窗：

```powershell
npm run dev:backend      # tsx watch，:4000
npm run dev:frontend     # vite，:5173，啟動訊息會列出 Network: http://<APP_HOST>:5173/
```

缺點是每台 client 首次載入都要即時編譯，比較慢；改到原始碼時，所有已開啟的頁面會熱更新（HMR）；而且 dev server 本身不是為了長期對外服務設計的。

> ⚠️ **路徑不能有中文**：在含非 ASCII 字元的路徑下（例如 `D:\2026\倉儲管理\…`）執行 `npm run build`，前端建置會在 `✓ … modules transformed.` 之後直接結束，沒有任何錯誤訊息，結束碼為 `0xC0000409`（`STATUS_STACK_BUFFER_OVERRUN`）。Vite 8（Rolldown）和 Vite 5（Rollup）都一樣，所以降版沒有用。同一份程式碼放在純英數路徑下就能正常建置（2026-09-23 驗證）。
>
> 暫時不能搬路徑時，可以用 `subst` 借一個磁碟代號來建置：
> ```powershell
> subst Q: "D:\2026\倉儲管理"
> cd Q:\OBE_DUT_Management; npm run build
> subst Q: /D
> ```

- backend 正式模式用 `npm start -w @obe/backend`（＝ `node dist/server.js`）即可，不需要 `tsx`。`@obe/shared` 的 `main` 已指向編譯後的 `dist/index.js`，純 Node 載得起來（2026-09-24 驗證）。
  - 前提是 `packages/shared/dist` 存在。它被 gitignore，但 `npm install` 會經由 shared 的 `prepare` script 自動重建；手動重建是 `npm run build -w @obe/shared`。
  - 仍想用 `npx tsx src/server.ts` 跑也可以（免 build），只是現場機器就得整包帶原始碼。
- 更新版本：`git pull` → `npm install` → `npm run build` → 重新啟動兩個程序（用 PM2 的話見下方）。

#### 用 PM2 管理（取代上面兩個視窗）

repo 根目錄的 `ecosystem.config.cjs` 定義了兩個程序，內容就是上面正式模式的兩個指令：

| PM2 名稱 | cwd | 實際執行 |
|---|---|---|
| `obe-backend` | `packages/backend` | `node dist/server.js`（:4000） |
| `obe-frontend` | `packages/frontend` | `node node_modules/vite/bin/vite.js preview`（:5173） |

- backend 的 cwd 必須是 `packages/backend`：`server.ts` 用 `dotenv/config` 從**目前目錄**讀 `.env`，cwd 錯了就會連不上資料庫。
- 兩個都直接用 `node` 執行 `.js`，不經過 `npm`／`npx`：Windows 上 PM2 無法可靠地啟動 `.cmd` shim。
- 崩潰時自動重啟（間隔 3 秒，最多連續 10 次）；不監看檔案（`watch: false`）。

安裝與啟動（一次性）：

```powershell
npm install -g pm2
npm run build
pm2 start ecosystem.config.cjs
pm2 status                 # 兩個都要是 online
pm2 save                   # 存下目前的程序清單，供開機時 pm2 resurrect 還原（見第 8 步）
```

日常操作：

```powershell
pm2 logs                   # 即時看兩個程序的輸出；pm2 logs obe-backend 只看一個
pm2 restart all
pm2 stop all
```

更新版本：

```powershell
git pull
npm install
pm2 stop obe-backend       # 一定要先停，否則 prisma generate 會因 DLL 被佔用而報 EPERM
npm run build
pm2 restart all
```

> 用 PM2 跑起來之後，**不要再另外執行** `npm start -w @obe/backend` 或 `npm run dev:*`：埠已被 PM2 的程序佔住，會失敗於 `EADDRINUSE`／`Port 5173 is already in use`。要改用開發模式時先 `pm2 stop all`。

### 7. Windows 防火牆放行 5173

以系統管理員身分開 PowerShell：

```powershell
New-NetFirewallRule -DisplayName "OBE DUT frontend 5173" `
  -Direction Inbound -Protocol TCP -LocalPort 5173 `
  -RemoteAddress <LAN_CIDR> -Action Allow -Profile Any
```

- 4000 **不要開**。
- 第一次執行 Node 時 Windows 可能會跳出「允許存取」視窗。若當時按了取消，系統會自動建立一條**封鎖** `node.exe` 的輸入規則。到「具有進階安全性的 Windows Defender 防火牆 → 輸入規則」找 *Node.js JavaScript Runtime*，刪除或改為允許。

### 8. 開機自動啟動（建議）

目標：主機重開機後，**不需要有人登入**，PostgreSQL、backend、frontend 都自動起來。

| 元件 | 誰負責開機啟動 | 要做的事 |
|---|---|---|
| PostgreSQL | Windows 服務 `postgresql-x64-18`（官方安裝程式建立） | 確認啟動類型為「自動」（8-1） |
| backend + frontend | PM2，由工作排程器在開機時執行 `pm2 resurrect` | `pm2 save` ＋ 建立排程工作（8-2、8-3） |

啟動順序不必特別安排：backend 啟動時不會連資料庫，第一個 API 請求進來才連線，所以就算比 PostgreSQL 早起來也不會失敗。

> PM2 在 Windows 上**不會**自己開機啟動（`pm2 startup` 不支援 Windows），一定要做 8-3。

#### 8-1　PostgreSQL：確認服務會自動啟動

資料庫在哪台就在哪台做（系統管理員 PowerShell）：

```powershell
Get-Service postgresql*            # StartType 要是 Automatic
# 若不是：
Set-Service postgresql-x64-18 -StartupType Automatic
# （建議）服務異常終止時自動重啟：1 分鐘後重試，最多 3 次，一天後重新計數
sc.exe failure postgresql-x64-18 reset= 86400 actions= restart/60000/restart/60000/restart/60000
```

服務名稱依版本而異（例：`postgresql-x64-17`），以 `Get-Service postgresql*` 查到的為準。

#### 8-2　PM2：儲存目前的程序清單

`pm2 resurrect` 還原的是**最後一次 `pm2 save` 時**的清單，所以要在兩個程序都正常運作時存檔：

```powershell
pm2 start ecosystem.config.cjs     # 已經在跑就略過
pm2 status                         # obe-backend、obe-frontend 都是 online，且沒有其他不要的程序
pm2 save                           # 寫入 %USERPROFILE%\.pm2\dump.pm2
```

之後只要增刪 PM2 程序（例如 `pm2 delete`、改名），都要再 `pm2 save` 一次；單純 `pm2 restart` 不用。

#### 8-3　工作排程器：開機時執行 `pm2 resurrect`

**執行帳號必須是執行 `pm2 save` 的那個 Windows 帳號**——PM2 的清單與 log 存在該帳號的 `%USERPROFILE%\.pm2`，換成 SYSTEM 等其他帳號會找不到清單，也可能沒有讀取專案資料夾的權限。該帳號**必須設有登入密碼**（「不論使用者登入與否均執行」需要儲存密碼）。

**方法 A：PowerShell 一次建立（建議）**——以系統管理員身分開 PowerShell，執行時會跳出視窗要求輸入該帳號的 Windows 密碼：

```powershell
$pm2      = (Get-Command pm2.cmd).Source            # 例：C:\Users\<帳號>\AppData\Roaming\npm\pm2.cmd
$action   = New-ScheduledTaskAction -Execute $pm2 -Argument 'resurrect'
$trigger  = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = 'PT1M'                             # 開機後延遲 1 分鐘，等網路與 PostgreSQL 就緒
$settings = New-ScheduledTaskSettingsSet `
              -ExecutionTimeLimit ([TimeSpan]::Zero) `
              -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
              -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$cred     = Get-Credential -UserName (whoami) -Message '輸入此帳號的 Windows 登入密碼'
Register-ScheduledTask -TaskName 'OBE DUT - PM2 resurrect' `
  -Action $action -Trigger $trigger -Settings $settings `
  -User $cred.UserName -Password $cred.GetNetworkCredential().Password -RunLevel Highest
```

- `-ExecutionTimeLimit 0`：取消「執行超過 3 天就停止工作」的預設，避免排程器終止工作時連帶影響 PM2。
- 用 Microsoft 帳號登入 Windows 時，`whoami` 顯示的帳號名稱照用即可，密碼填 Microsoft 帳號密碼（不是 PIN）。

**方法 B：GUI**——開「工作排程器」→ 右側「建立工作…」（不要用「建立基本工作」）：

| 頁籤 | 設定 |
|---|---|
| 一般 | 名稱 `OBE DUT - PM2 resurrect`；「變更使用者或群組」選執行 `pm2 save` 的帳號；勾 **不論使用者登入與否均執行**；勾 **以最高權限執行** |
| 觸發程序 | 新增 →「開始工作」選 **啟動時**；勾 **延遲工作的時間：1 分鐘** |
| 動作 | 新增 →「啟動程式」；程式填 `pm2.cmd` 完整路徑（`(Get-Command pm2.cmd).Source` 查）；引數填 `resurrect` |
| 條件 | 取消勾選「只有在電腦使用 AC 電源時才啟動工作」 |
| 設定 | **取消**勾選「如果工作執行超過下列時間，便停止工作」；勾「如果工作失敗，每隔 1 分鐘重新啟動，最多 3 次」 |

按「確定」後會要求輸入該帳號密碼。

#### 8-4　驗證

先不重開機，手動觸發一次：

```powershell
pm2 kill                                          # 停掉 PM2 與兩個程序，模擬剛開機
Start-ScheduledTask -TaskName 'OBE DUT - PM2 resurrect'
Start-Sleep 10; pm2 status                        # 兩個程序都應回到 online
Get-ScheduledTaskInfo -TaskName 'OBE DUT - PM2 resurrect' | Select-Object LastRunTime, LastTaskResult   # 0 = 成功
```

再實際**重開機、不要登入**，從另一台機台開 `http://<APP_HOST>:5173/dash`，儀表板有資料即完成。之後登入確認：

```powershell
Get-Service postgresql*      # Running
pm2 status                   # 兩個都是 online，uptime ≈ 開機後經過的時間
```

#### 8-5　疑難排解

| 症狀 | 原因與處理 |
|---|---|
| 重開機後 `pm2 status` 是空的 | 沒做 `pm2 save`，或排程工作的執行帳號與執行 `pm2 save` 的帳號不同 → 8-2、8-3 |
| `LastTaskResult` 非 0 | 工作排程器左側「工作排程器程式庫」找到該工作 →「歷程記錄」頁籤看錯誤；常見為密碼變更後未更新（工作 → 內容 → 確定，重新輸入密碼） |
| Windows 密碼改過之後就不會自動啟動 | 排程工作存的是舊密碼 → 同上重新輸入 |
| 只有 frontend 起來，頁面一直「載入中」 | backend 崩潰 → `pm2 logs obe-backend --lines 50`；資料庫連不上就 `npm run db:check` |
| 改用了 pm2-installer 等其他方式 | 同時存在兩套 PM2 會互搶 5173／4000 → 只保留一種，刪除本排程工作：`Unregister-ScheduledTask -TaskName 'OBE DUT - PM2 resurrect'` |

> 替代方案：[pm2-installer](https://github.com/jessety/pm2-installer) 可把 PM2 註冊成 Windows 服務。它以 Local Service 帳號執行、使用自己的 PM2_HOME（`C:\ProgramData\pm2`），專案放在使用者資料夾（例如桌面）時可能沒有讀取權限，需要另外調整 —— 一般情況用上面的工作排程器即可。

### 9. 固定 IP

在路由器設 DHCP 保留或設靜態 IP。`<APP_HOST>` 一變，所有機台的書籤都會失效。

---

## 二、各機台（client）

- 只需要瀏覽器（Chrome／Edge），不用安裝 Node，也不用放程式碼。
- 開 `http://<APP_HOST>:5173/dash`，建議加入書籤或設為首頁。
- 條碼掃描器維持鍵盤模式（掃描後送出 Enter）即可。

---

## 三、驗證

| 在哪台執行 | 指令／動作 | 預期結果 |
|---|---|---|
| app 主機 | `netstat -ano \| findstr :5173` | `0.0.0.0:5173 … LISTENING`（只有 `[::1]:5173` 代表沒吃到 `host: true`） |
| app 主機 | `netstat -ano \| findstr :4000` | `LISTENING` |
| app 主機 | `curl http://<APP_HOST>:5173/api/dashboard` | HTTP 200 |
| client | `Test-NetConnection <APP_HOST> -Port 5173` | `TcpTestSucceeded : True` |
| client | 瀏覽器開 `http://<APP_HOST>:5173/dash` | 儀表板有資料 |

## 四、疑難排解

| 症狀 | 原因與處理 |
|---|---|
| client 打不開頁面（連線逾時） | 5173 只監聽 localhost（檢查第 5 步），或防火牆擋住（第 7 步，包括自動建立的 node.exe 封鎖規則） |
| 頁面有出現，但一直停在「載入中」 | backend 沒在跑：app 主機 `netstat` 看不到 4000 → 看 backend 視窗的錯誤訊息；`Cannot find module '@obe/shared'` 就刪掉 `node_modules\@obe` 後重跑 `npm install`（另一個可能是 `packages/shared/dist` 沒建 → `npm run build -w @obe/shared`）；資料庫問題跑 `npm run db:check` |
| `npm run dev:frontend` 報 `Port 5173 is already in use` | 有舊的 Vite 還在跑 → `netstat -ano \| findstr :5173` 找出 PID 後結束它（`strictPort` 刻意不自動換埠） |
| `npm run build` 在 `modules transformed` 之後就結束，沒有任何錯誤訊息 | 專案路徑含中文 → 搬到純英數路徑，或用第 6 步的 `subst` 建置 |
| `npm run build` 報 `EPERM … query_engine-windows.dll.node` | backend 還在跑、佔住 Prisma DLL → 先停掉 backend 再 build（PM2：`pm2 stop obe-backend`；只殺行程沒用，PM2 會把它重啟） |
| `pm2 status` 顯示 `errored` 或一直重啟 | `pm2 logs <名稱> --lines 50` 看錯誤；常見是還沒 `npm run build`（找不到 `dist/server.js` 或 `dist/index.html`）、`.env` 沒帶到 `packages/backend`、或埠被手動啟動的舊程序佔住 |
