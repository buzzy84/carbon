CREATE TYPE "trainingFrequency" AS ENUM (
  'Once',
  'Quarterly',
  'Annual'
);

CREATE TYPE "trainingStatus" AS ENUM (
  'Draft',
  'Active',
  'Archived'
);

CREATE TYPE "trainingType" AS ENUM (
  'Mandatory',
  'Optional'
);

CREATE TABLE "training" (
  "id" TEXT NOT NULL DEFAULT id('train'),
  "name" TEXT NOT NULL,
  "description" TEXT,
  "version" NUMERIC NOT NULL DEFAULT 0,
  "status" "trainingStatus" NOT NULL DEFAULT 'Draft',
  "frequency" "trainingFrequency" NOT NULL DEFAULT 'Once',
  "type" "trainingType" NOT NULL DEFAULT 'Mandatory',
  "content" JSON DEFAULT '{}',
  "estimatedDuration" TEXT,
  "tags" TEXT[],
  "assignee" TEXT,
  "companyId" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  "updatedBy" TEXT,

  CONSTRAINT "training_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "training_version_check" CHECK ("version" >= 0),
  CONSTRAINT "training_version_unique" UNIQUE ("name", "companyId", "version"),
  CONSTRAINT "training_assignee_fkey" FOREIGN KEY ("assignee") REFERENCES "user"("id") ON UPDATE CASCADE,
  CONSTRAINT "training_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "training_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON UPDATE CASCADE,
  CONSTRAINT "training_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON UPDATE CASCADE
);

CREATE INDEX "training_companyId_idx" ON "training" ("companyId");

ALTER TABLE "training" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."training"
FOR SELECT USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_role()
    )::text[]
  )
);

CREATE POLICY "INSERT" ON "public"."training"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('people_create')
    )::text[]
  )
);

CREATE POLICY "UPDATE" ON "public"."training"
FOR UPDATE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('people_update')
    )::text[]
  )
);

CREATE POLICY "DELETE" ON "public"."training"
FOR DELETE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('people_delete')
    )::text[]
  )
);


CREATE TABLE "trainingAssignment" (
  "id" SERIAL PRIMARY KEY,
  "trainingId" TEXT NOT NULL,
  "employeeId" TEXT,
  "departmentId" TEXT,
  "groupIds" TEXT[],
  "companyId" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  "updatedBy" TEXT,

  CONSTRAINT "trainingAssignment_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "training"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "trainingAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "trainingAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "trainingAssignment_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON UPDATE CASCADE,
  CONSTRAINT "trainingAssignment_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON UPDATE CASCADE,
  CONSTRAINT "trainingAssignment_single_target_check" CHECK (
    (
      ("employeeId" IS NOT NULL)::int +
      ("departmentId" IS NOT NULL)::int +
      ("groupIds" IS NOT NULL AND array_length("groupIds", 1) > 0)::int
    ) = 1
  )
);

CREATE INDEX "trainingAssignment_companyId_idx" ON "trainingAssignment" ("companyId");
CREATE INDEX "trainingAssignment_trainingId_idx" ON "trainingAssignment" ("trainingId");
CREATE INDEX "trainingAssignment_employeeId_idx" ON "trainingAssignment" ("employeeId");
CREATE INDEX "trainingAssignment_departmentId_idx" ON "trainingAssignment" ("departmentId");
CREATE INDEX "trainingAssignment_groupIds_idx" ON "trainingAssignment" ("groupIds");

ALTER TABLE "trainingAssignment" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."trainingAssignment"
FOR SELECT USING (
  "companyId" = ANY (
    ( 
      SELECT
        get_companies_with_employee_permission ('people_view')
    )::text[]
  )
);

CREATE POLICY "INSERT" ON "public"."trainingAssignment"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('people_create')
    )::text[]
  )
);

CREATE POLICY "UPDATE" ON "public"."trainingAssignment"
FOR UPDATE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('people_update')
    )::text[]
  )
);

CREATE POLICY "DELETE" ON "public"."trainingAssignment"
FOR DELETE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('people_delete')
    )::text[]
  )
);

CREATE TABLE "trainingCompletion" (
  "id" SERIAL PRIMARY KEY,
  "trainingAssignmentId" INTEGER NOT NULL,
  "employeeId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "completedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "completedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  "createdBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE,
  "updatedBy" TEXT,

  CONSTRAINT "trainingCompletion_trainingAssignmentId_fkey" FOREIGN KEY ("trainingAssignmentId") REFERENCES "trainingAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "trainingCompletion_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "trainingCompletion_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "trainingCompletion_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON UPDATE CASCADE,
  CONSTRAINT "trainingCompletion_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id") ON UPDATE CASCADE
);

CREATE INDEX "trainingCompletion_companyId_idx" ON "trainingCompletion" ("companyId");
CREATE INDEX "trainingCompletion_trainingAssignmentId_idx" ON "trainingCompletion" ("trainingAssignmentId");
CREATE INDEX "trainingCompletion_employeeId_idx" ON "trainingCompletion" ("employeeId");

ALTER TABLE "trainingCompletion" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SELECT" ON "public"."trainingCompletion"
FOR SELECT USING (
  "companyId" = ANY (
    ( 
      SELECT
        get_companies_with_employee_permission ('people_view')
    )::text[]
  )
);

CREATE POLICY "INSERT" ON "public"."trainingCompletion"
FOR INSERT WITH CHECK (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('people_create')
    )::text[]
  ) OR (
    auth.uid()::text = "employeeId"
    AND "companyId" = ANY (
      (
        SELECT
          get_companies_with_employee_role ()
      )::text[]
    )
  )
);

CREATE POLICY "UPDATE" ON "public"."trainingCompletion"
FOR UPDATE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('people_update')
    )::text[]
  )
);

CREATE POLICY "DELETE" ON "public"."trainingCompletion"
FOR DELETE USING (
  "companyId" = ANY (
    (
      SELECT
        get_companies_with_employee_permission ('people_delete')
    )::text[]
  )
);