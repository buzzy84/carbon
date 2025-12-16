DO $$ BEGIN
    CREATE TYPE "maintenanceDispatchStatus" AS ENUM (
      'Open',
      'Assigned',
      'In Progress',
      'Completed',
      'Cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE "maintenanceFailureMode" (
  "id" TEXT NOT NULL DEFAULT id(),
  "name" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  CONSTRAINT "maintenanceFailureMode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "maintenanceFailureMode_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "maintenanceFailureMode_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "maintenanceFailureMode_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

DO $$ BEGIN
    CREATE TYPE "maintenanceDispatchPriority" AS ENUM (
      'Low',
      'Medium',
      'High',
      'Critical'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "maintenanceSeverity" AS ENUM (
      'Preventive',
      'OPM',
      'Maintenance Required',
      'OEM Required'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE "maintenanceDispatch" (
  "id" TEXT NOT NULL DEFAULT id('dispatch'),
  "content" JSON NOT NULL DEFAULT '{}',
  "status" "maintenanceDispatchStatus" NOT NULL DEFAULT 'Open',
  "priority" "maintenanceDispatchPriority" NOT NULL DEFAULT 'Medium',
  "severity" "maintenanceSeverity",
  "suspectedFailureModeId" TEXT,
  "actualFailureModeId" TEXT,
  "plannedStartTime" TIMESTAMP WITH TIME ZONE,
  "plannedEndTime" TIMESTAMP WITH TIME ZONE,
  "actualStartTime" TIMESTAMP WITH TIME ZONE,
  "actualEndTime" TIMESTAMP WITH TIME ZONE,
  "duration" INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN "actualEndTime" IS NULL THEN 0
      ELSE EXTRACT(EPOCH FROM ("actualEndTime" - "actualStartTime"))::INTEGER
    END
  ) STORED,
  "nonConformanceId" TEXT,
  "assignee" TEXT,
  "companyId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  CONSTRAINT "maintenanceDispatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "maintenanceDispatch_assignee_fkey" FOREIGN KEY ("assignee") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "maintenanceDispatch_suspectedFailureModeId_fkey" FOREIGN KEY ("suspectedFailureModeId") REFERENCES "maintenanceFailureMode"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "maintenanceDispatch_actualFailureModeId_fkey" FOREIGN KEY ("actualFailureModeId") REFERENCES "maintenanceFailureMode"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "maintenanceDispatch_nonConformanceId_fkey" FOREIGN KEY ("nonConformanceId") REFERENCES "nonConformance"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "maintenanceDispatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "maintenanceDispatch_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "maintenanceDispatch_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "maintenanceDispatch_status_idx" ON "maintenanceDispatch" ("status");
CREATE INDEX "maintenanceDispatch_companyId_idx" ON "maintenanceDispatch" ("companyId");

CREATE TABLE "maintenanceDispatchEvent" (
  "id" TEXT NOT NULL DEFAULT id(),
  "maintenanceDispatchId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "workCenterId" TEXT NOT NULL,
  "startTime" TIMESTAMP WITH TIME ZONE NOT NULL,
  "endTime" TIMESTAMP WITH TIME ZONE,
  "notes" TEXT,
  "duration" INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN "endTime" IS NULL THEN 0
      ELSE EXTRACT(EPOCH FROM ("endTime" - "startTime"))::INTEGER
    END
  ) STORED,
  "companyId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  CONSTRAINT "maintenanceDispatchEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "maintenanceDispatchEvent_maintenanceDispatchId_fkey" FOREIGN KEY ("maintenanceDispatchId") REFERENCES "maintenanceDispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "maintenanceDispatchEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "maintenanceDispatchEvent_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "workCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "maintenanceDispatchEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "maintenanceDispatchEvent_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "maintenanceDispatchEvent_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "maintenanceDispatchEvent_maintenanceDispatchId_idx" ON "maintenanceDispatchEvent" ("maintenanceDispatchId");
CREATE INDEX "maintenanceDispatchEvent_employeeId_idx" ON "maintenanceDispatchEvent" ("employeeId");
CREATE INDEX "maintenanceDispatchEvent_companyId_idx" ON "maintenanceDispatchEvent" ("companyId");

CREATE TABLE "maintenanceDispatchComment" (
  "id" TEXT NOT NULL DEFAULT id(),
  "maintenanceDispatchId" TEXT NOT NULL,
  "comment" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  CONSTRAINT "maintenanceDispatchComment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "maintenanceDispatchComment_maintenanceDispatchId_fkey" FOREIGN KEY ("maintenanceDispatchId") REFERENCES "maintenanceDispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "maintenanceDispatchComment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "maintenanceDispatchComment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "maintenanceDispatchComment_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "maintenanceDispatchComment_maintenanceDispatchId_idx" ON "maintenanceDispatchComment" ("maintenanceDispatchId");

CREATE TABLE "maintenanceDispatchWorkCenter" (
  "id" TEXT NOT NULL DEFAULT id(),
  "maintenanceDispatchId" TEXT NOT NULL,
  "workCenterId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  CONSTRAINT "maintenanceDispatchWorkCenter_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "maintenanceDispatchWorkCenter_maintenanceDispatchId_fkey" FOREIGN KEY ("maintenanceDispatchId") REFERENCES "maintenanceDispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "maintenanceDispatchWorkCenter_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "workCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "maintenanceDispatchWorkCenter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "maintenanceDispatchWorkCenter_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "maintenanceDispatchWorkCenter_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "maintenanceDispatchWorkCenter_maintenanceDispatchId_idx" ON "maintenanceDispatchWorkCenter" ("maintenanceDispatchId");
CREATE INDEX "maintenanceDispatchWorkCenter_workCenterId_idx" ON "maintenanceDispatchWorkCenter" ("workCenterId");
CREATE INDEX "maintenanceDispatchWorkCenter_companyId_idx" ON "maintenanceDispatchWorkCenter" ("companyId");

CREATE TABLE "maintenanceDispatchItem" (
  "id" TEXT NOT NULL DEFAULT id(),
  "maintenanceDispatchId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitOfMeasureCode" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  CONSTRAINT "maintenanceDispatchItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "maintenanceDispatchItem_maintenanceDispatchId_fkey" FOREIGN KEY ("maintenanceDispatchId") REFERENCES "maintenanceDispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "maintenanceDispatchItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "maintenanceDispatchItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "maintenanceDispatchItem_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "maintenanceDispatchItem_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "maintenanceDispatchItem_maintenanceDispatchId_idx" ON "maintenanceDispatchItem" ("maintenanceDispatchId");
CREATE INDEX "maintenanceDispatchItem_itemId_idx" ON "maintenanceDispatchItem" ("itemId");
CREATE INDEX "maintenanceDispatchItem_companyId_idx" ON "maintenanceDispatchItem" ("companyId");

CREATE TABLE "workCenterReplacementPart" (
  "id" TEXT NOT NULL DEFAULT id(),
  "workCenterId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitOfMeasureCode" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  CONSTRAINT "workCenterReplacementPart_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "workCenterReplacementPart_workCenterId_fkey" FOREIGN KEY ("workCenterId") REFERENCES "workCenter"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workCenterReplacementPart_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "item"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workCenterReplacementPart_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workCenterReplacementPart_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "workCenterReplacementPart_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "workCenterReplacementPart_workCenterId_idx" ON "workCenterReplacementPart" ("workCenterId");
CREATE INDEX "workCenterReplacementPart_itemId_idx" ON "workCenterReplacementPart" ("itemId");
CREATE INDEX "workCenterReplacementPart_companyId_idx" ON "workCenterReplacementPart" ("companyId");
