-- 01_create_role.sql
-- 在 pgAdmin 4 中以「超級使用者 postgres」連線，對 postgres 資料庫開 Query Tool 執行。
-- 可重複執行（already exists 不會報錯）。
--
-- 這支只建立應用程式帳號；「資料庫」本身請用 pgAdmin 4 的 GUI 建立
-- （Databases 右鍵 → Create → Database…，Owner 選 obe），
-- 或參見 docs/DATABASE_SETUP.md。
--
-- CREATEDB 是給 `prisma migrate dev` 用的：它每次都會另外開一個暫時的
-- shadow database 來比對 schema drift，沒有這個權限會失敗於
--   Error: P3014 ... ERROR: permission denied to create database
-- （Docker 版的 obe 是容器內的超級使用者，天生就有，所以以前不必特別設。）
-- CREATEDB 只能建自己的資料庫，不等於 SUPERUSER。

-- ⚠ 執行前把下方兩處 'CHANGE_ME' 換成實際密碼，並與 packages/backend/.env 的 DATABASE_URL 一致。

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'obe') THEN
    CREATE ROLE obe LOGIN CREATEDB PASSWORD 'CHANGE_ME';
    RAISE NOTICE 'role "obe" created';
  ELSE
    -- 已存在時重設密碼（確保與 .env 的 DATABASE_URL 一致）並補上 CREATEDB
    ALTER ROLE obe LOGIN CREATEDB PASSWORD 'CHANGE_ME';
    RAISE NOTICE 'role "obe" already exists, password reset and CREATEDB granted';
  END IF;
END
$$;
