-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('EMPTY', 'OCCUPIED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "UnitState" AS ENUM ('NEW', 'IN', 'OUT', 'LEFT');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('Open', 'Tracking', 'Closed');

-- CreateTable
CREATE TABLE "storage_area" (
    "code" TEXT NOT NULL,
    "zh" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "dutStatuses" TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "storage_area_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "storage_rack" (
    "code" TEXT NOT NULL,
    "areaCode" TEXT NOT NULL,
    "no" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_rack_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "storage_slot" (
    "code" TEXT NOT NULL,
    "rackCode" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "pos" INTEGER NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'EMPTY',
    "blockReason" TEXT,
    "blockBy" TEXT,
    "blockAt" TIMESTAMP(3),
    "labelBroken" BOOLEAN NOT NULL DEFAULT false,
    "labelBrokenReason" TEXT,
    "labelBrokenBy" TEXT,
    "labelBrokenAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_slot_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "dut_unit" (
    "sn" TEXT NOT NULL,
    "project" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "dutStatus" TEXT NOT NULL,
    "state" "UnitState" NOT NULL DEFAULT 'NEW',
    "slotCode" TEXT,
    "isTemp" BOOLEAN NOT NULL DEFAULT false,
    "inAt" TIMESTAMP(3),
    "lastMoveAt" TIMESTAMP(3),
    "lastMoveBy" TEXT,
    "loanBy" TEXT,
    "loanOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dut_unit_pkey" PRIMARY KEY ("sn")
);

-- CreateTable
CREATE TABLE "dut_issue" (
    "id" SERIAL NOT NULL,
    "unitSn" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rootCause" TEXT NOT NULL,
    "correctiveAction" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'Open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dut_issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dut_movement" (
    "id" SERIAL NOT NULL,
    "sn" TEXT NOT NULL,
    "fromSlot" TEXT,
    "toSlot" TEXT,
    "action" TEXT NOT NULL,
    "empNo" TEXT NOT NULL,
    "empName" TEXT NOT NULL,
    "station" TEXT NOT NULL DEFAULT 'OBE-STN01',
    "note" TEXT NOT NULL DEFAULT '',
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dut_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_metric" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "station" TEXT NOT NULL DEFAULT 'OBE-STN01',
    "scannedCnt" INTEGER NOT NULL DEFAULT 0,
    "missedCnt" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "scan_metric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "storage_rack_areaCode_no_key" ON "storage_rack"("areaCode", "no");

-- CreateIndex
CREATE INDEX "storage_slot_rackCode_idx" ON "storage_slot"("rackCode");

-- CreateIndex
CREATE INDEX "storage_slot_status_idx" ON "storage_slot"("status");

-- CreateIndex
CREATE UNIQUE INDEX "storage_slot_rackCode_level_pos_key" ON "storage_slot"("rackCode", "level", "pos");

-- CreateIndex
CREATE UNIQUE INDEX "dut_unit_slotCode_key" ON "dut_unit"("slotCode");

-- CreateIndex
CREATE INDEX "dut_unit_state_idx" ON "dut_unit"("state");

-- CreateIndex
CREATE INDEX "dut_unit_dutStatus_idx" ON "dut_unit"("dutStatus");

-- CreateIndex
CREATE INDEX "dut_issue_unitSn_idx" ON "dut_issue"("unitSn");

-- CreateIndex
CREATE INDEX "dut_movement_sn_idx" ON "dut_movement"("sn");

-- CreateIndex
CREATE INDEX "dut_movement_ts_idx" ON "dut_movement"("ts");

-- CreateIndex
CREATE INDEX "dut_movement_action_idx" ON "dut_movement"("action");

-- CreateIndex
CREATE INDEX "scan_metric_date_station_idx" ON "scan_metric"("date", "station");

-- AddForeignKey
ALTER TABLE "storage_rack" ADD CONSTRAINT "storage_rack_areaCode_fkey" FOREIGN KEY ("areaCode") REFERENCES "storage_area"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_slot" ADD CONSTRAINT "storage_slot_rackCode_fkey" FOREIGN KEY ("rackCode") REFERENCES "storage_rack"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dut_unit" ADD CONSTRAINT "dut_unit_slotCode_fkey" FOREIGN KEY ("slotCode") REFERENCES "storage_slot"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dut_issue" ADD CONSTRAINT "dut_issue_unitSn_fkey" FOREIGN KEY ("unitSn") REFERENCES "dut_unit"("sn") ON DELETE CASCADE ON UPDATE CASCADE;

-- v0.4 條碼格式防呆（Prisma schema 無法表達 CHECK，手動補在 migration）
ALTER TABLE "storage_area" ADD CONSTRAINT "storage_area_code_chk" CHECK ("code" IN ('WIP', 'FIN'));
ALTER TABLE "storage_rack" ADD CONSTRAINT "storage_rack_code_chk" CHECK ("code" ~ '^(WIP|FIN)-[0-9]{2}$' AND "code" = "areaCode" || '-' || lpad("no"::text, 2, '0'));
ALTER TABLE "storage_slot" ADD CONSTRAINT "storage_slot_code_chk" CHECK ("code" ~ '^(WIP|FIN)-[0-9]{2}-[0-9]{2}-[0-9]{2}$' AND "code" = "rackCode" || '-' || lpad("level"::text, 2, '0') || '-' || lpad("pos"::text, 2, '0'));
-- 停用中的儲位不可綁機台的一致性：BLOCKED 必有原因
ALTER TABLE "storage_slot" ADD CONSTRAINT "storage_slot_block_chk" CHECK (("status" = 'BLOCKED') = ("blockReason" IS NOT NULL));
