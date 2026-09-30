-- 02_grant_existing_database.sql
-- 只有在「資料庫已經存在、但 Owner 不是 obe」時才需要執行。
-- （例如先前在 pgAdmin 4 裡用預設 Owner=postgres 建好了資料庫）
--
-- 執行方式：在 pgAdmin 4 中以 postgres 連線，
-- 對「目標資料庫本身」（不是 postgres 資料庫）開 Query Tool 執行。
--
-- 若是照 docs/DATABASE_SETUP.md 一開始就把 Owner 設成 obe，這支不需要執行：
-- PostgreSQL 15 以後 public schema 屬於 pg_database_owner，
-- 資料庫 Owner 自動就有 CREATE 權限，Prisma migrate 可直接建表。

-- 1) 把資料庫 Owner 轉給 obe（需在該資料庫「之外」執行，故此行預設註解；
--    要用的話請切到 postgres 資料庫的 Query Tool 單獨執行）
-- ALTER DATABASE obe_dut_v04 OWNER TO obe;

-- 2) 連線權限
GRANT CONNECT, TEMPORARY ON DATABASE obe_dut_v04 TO obe;

-- 3) public schema 的建表權限（Prisma migrate 需要）
ALTER SCHEMA public OWNER TO obe;
GRANT USAGE, CREATE ON SCHEMA public TO obe;

-- 4) 既有物件的權限（資料庫原本就有表時才有作用）
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO obe;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO obe;
