/**
 * 連線自檢 —— `npm run db:check`
 *
 * 取代原本「docker compose up -d db 有沒有起來」的確認步驟。
 * 資料庫改由 pgAdmin 4 建立後，最常見的卡關是：角色沒建、資料庫沒建、
 * public schema 沒有建表權限、或 .env 的 DATABASE_URL 打錯。
 * 這支把這些情況分辨出來，並直接告訴你下一步要做什麼。
 *
 * 設定步驟見 docs/DATABASE_SETUP.md。
 */
import 'dotenv/config';

const SETUP_DOC = 'docs/DATABASE_SETUP.md';

type Parsed = {
  host: string;
  port: string;
  database: string;
  user: string;
  schema: string;
};

function parseDatabaseUrl(raw: string): Parsed | null {
  try {
    const u = new URL(raw);
    return {
      host: u.hostname || 'localhost',
      port: u.port || '5432',
      database: decodeURIComponent(u.pathname.replace(/^\//, '')),
      user: decodeURIComponent(u.username),
      schema: u.searchParams.get('schema') ?? 'public',
    };
  } catch {
    return null;
  }
}

function fail(lines: string[]): never {
  console.error('\n✗ ' + lines.join('\n  '));
  process.exit(1);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    fail([
      '找不到 DATABASE_URL。',
      '請先複製環境變數範本：',
      '  copy packages\\backend\\.env.example packages\\backend\\.env   (Windows)',
      '  cp   packages/backend/.env.example packages/backend/.env      (bash)',
    ]);
  }

  const cfg = parseDatabaseUrl(url);
  if (!cfg) {
    fail([
      `DATABASE_URL 格式不正確：${url}`,
      '正確格式：postgresql://<user>:<password>@<host>:<port>/<database>?schema=public',
    ]);
  }

  console.log('目標連線');
  console.log(`  主機     ${cfg.host}:${cfg.port}`);
  console.log(`  資料庫   ${cfg.database}`);
  console.log(`  使用者   ${cfg.user}`);
  console.log(`  schema   ${cfg.schema}\n`);

  // Prisma Client 未產生時，@prisma/client 匯出的是會在 new 的時候丟錯的 stub，
  // 所以 import 與 instantiate 都要包在同一個 try 裡才擋得住。
  let prisma: any;
  try {
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient({ log: [] });
  } catch {
    fail([
      'Prisma Client 尚未產生（fresh clone、node_modules 被清掉、或改完 schema 後會這樣）。',
      '請先執行：npm run db:generate',
    ]);
  }

  try {
    // 先 $connect()：連線階段的錯誤才會是帶 errorCode 的 PrismaClientInitializationError；
    // 直接下查詢的話錯誤會被包成 invocation error，拿不到 P1001/P1003 這些代碼。
    await prisma.$connect();
    const [{ version }] = await prisma.$queryRawUnsafe<{ version: string }[]>('SELECT version()');
    console.log('✓ 連線成功');
    console.log(`  ${version.split(',')[0]}`);
  } catch (err: any) {
    const code = err?.errorCode ?? err?.code;
    const hints: Record<string, string[]> = {
      P1000: [
        `帳號 "${cfg.user}" 驗證失敗（密碼不符或角色不存在）。`,
        `在 pgAdmin 4 以 postgres 連線，執行 packages/backend/prisma/sql/01_create_role.sql。`,
      ],
      P1001: ['localhost', '127.0.0.1', '::1'].includes(cfg.host)
        ? [
            `連不到 ${cfg.host}:${cfg.port}。`,
            'Windows 請確認 PostgreSQL 服務在跑：Get-Service postgresql*',
            '若停止中：Start-Service postgresql-x64-18',
          ]
        : [
            `連不到遠端資料庫 ${cfg.host}:${cfg.port}。`,
            `先測網路：Test-NetConnection ${cfg.host} -Port ${cfg.port}`,
            '不通時到資料庫主機檢查：服務是否在跑、postgresql.conf 的 listen_addresses、',
            `Windows 防火牆是否放行 ${cfg.port}。步驟見 ${SETUP_DOC} 附錄 C。`,
          ],
      P1003: [
        `資料庫 "${cfg.database}" 不存在。`,
        `請在 pgAdmin 4 的 Databases 右鍵 → Create → Database…，`,
        `Database 填 "${cfg.database}"、Owner 選 "${cfg.user}"。步驟見 ${SETUP_DOC}。`,
      ],
      P1010: [
        `帳號 "${cfg.user}" 沒有存取資料庫 "${cfg.database}" 的權限。`,
        '請執行 packages/backend/prisma/sql/02_grant_existing_database.sql。',
      ],
    };
    fail(hints[code] ?? [`連線失敗（${code ?? 'unknown'}）：${err?.message ?? err}`]);
  }

  // 建表權限：Prisma migrate 需要在 public schema 上有 CREATE
  const [{ has_create }] = await prisma.$queryRawUnsafe<{ has_create: boolean }[]>(
    `SELECT has_schema_privilege(current_user, '${cfg.schema}', 'CREATE') AS has_create`
  );
  if (!has_create) {
    await prisma.$disconnect();
    fail([
      `帳號 "${cfg.user}" 在 ${cfg.schema} schema 沒有 CREATE 權限，Prisma migrate 會失敗。`,
      '請在 pgAdmin 4 對「這個資料庫」開 Query Tool（以 postgres 身分），',
      '執行 packages/backend/prisma/sql/02_grant_existing_database.sql。',
    ]);
  }
  console.log(`✓ ${cfg.schema} schema 具備 CREATE 權限`);

  // Migration 狀態
  const applied = await prisma
    .$queryRawUnsafe<{ migration_name: string }[]>(
      'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at'
    )
    .catch(() => null);

  if (!applied) {
    console.log('… 尚未套用任何 migration（資料表還沒建立）');
    console.log('   下一步：npm run db:migrate');
  } else {
    console.log(`✓ 已套用 ${applied.length} 個 migration（最新：${applied.at(-1)?.migration_name}）`);
    const units = await prisma.unit.count().catch(() => 0);
    if (units === 0) {
      console.log('… 資料表是空的');
      console.log('   下一步：npm run db:seed');
    } else {
      console.log(`✓ 示範資料已存在（dut_unit ${units} 筆）`);
      console.log('   下一步：npm run dev:backend / npm run dev:frontend');
    }
  }

  await prisma.$disconnect();
  console.log('');
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
