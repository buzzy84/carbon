-- Approvals System Migration
-- This migration creates tables for a unified approval workflow system

-- Add "Needs Approval" status to purchaseOrderStatus enum
ALTER TYPE "purchaseOrderStatus" ADD VALUE 'Needs Approval';

-- Create approval status enum
CREATE TYPE "approvalStatus" AS ENUM ('Pending', 'Approved', 'Rejected', 'Cancelled');

-- Create approval document type enum
CREATE TYPE "approvalDocumentType" AS ENUM ('purchaseOrder', 'qualityDocument');

-- Core approval request table
CREATE TABLE "approvalRequest" (
  "id" TEXT NOT NULL DEFAULT id('aprq'),
  "documentType" "approvalDocumentType" NOT NULL,
  "documentId" TEXT NOT NULL,
  "status" "approvalStatus" NOT NULL DEFAULT 'Pending',
  "requestedBy" TEXT NOT NULL,
  "requestedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "approverGroupIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "approverId" TEXT,
  "decisionBy" TEXT,
  "decisionAt" TIMESTAMP WITH TIME ZONE,
  "decisionNotes" TEXT,
  "companyId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  CONSTRAINT "approvalRequest_pkey" PRIMARY KEY ("id", "companyId"),
  CONSTRAINT "approvalRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "approvalRequest_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "user"("id"),
  CONSTRAINT "approvalRequest_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "user"("id"),
  CONSTRAINT "approvalRequest_decisionBy_fkey" FOREIGN KEY ("decisionBy") REFERENCES "user"("id"),
  CONSTRAINT "approvalRequest_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id"),
  CONSTRAINT "approvalRequest_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id")
);

-- Indexes for approval requests
CREATE INDEX "approvalRequest_companyId_idx" ON "approvalRequest"("companyId");
CREATE INDEX "approvalRequest_documentType_idx" ON "approvalRequest"("documentType");
CREATE INDEX "approvalRequest_documentId_idx" ON "approvalRequest"("documentId");
CREATE INDEX "approvalRequest_status_idx" ON "approvalRequest"("status");
CREATE INDEX "approvalRequest_requestedBy_idx" ON "approvalRequest"("requestedBy");
CREATE INDEX "approvalRequest_approverId_idx" ON "approvalRequest"("approverId");
CREATE INDEX "approvalRequest_approverGroupIds_idx" ON "approvalRequest" USING GIN("approverGroupIds");

-- Multiple approval rules per document type
-- Each rule defines conditions (amount range for POs) and associated approver groups/users
CREATE TABLE "approvalRule" (
  "id" TEXT NOT NULL DEFAULT id('aprl'),
  "name" TEXT NOT NULL,
  "documentType" "approvalDocumentType" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "approverGroupIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "defaultApproverId" TEXT,
  "lowerBoundAmount" NUMERIC NOT NULL DEFAULT 0,
  "upperBoundAmount" NUMERIC,
  "escalationDays" INTEGER,
  "companyId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedBy" TEXT,
  "updatedAt" TIMESTAMP WITH TIME ZONE,

  CONSTRAINT "approvalRule_pkey" PRIMARY KEY ("id", "companyId"),
  CONSTRAINT "approvalRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "approvalRule_defaultApproverId_fkey" FOREIGN KEY ("defaultApproverId") REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "approvalRule_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id"),
  CONSTRAINT "approvalRule_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "user"("id"),
  CONSTRAINT "approvalRule_name_check" CHECK (LENGTH("name") > 0 AND LENGTH("name") <= 100),
  CONSTRAINT "approvalRule_lowerBoundAmount_check" CHECK ("lowerBoundAmount" >= 0),
  CONSTRAINT "approvalRule_amountRange_check" CHECK (
    "upperBoundAmount" IS NULL OR "upperBoundAmount" > "lowerBoundAmount"
  )
);

-- Indexes for approval rules
CREATE INDEX "approvalRule_companyId_idx" ON "approvalRule"("companyId");
CREATE INDEX "approvalRule_documentType_idx" ON "approvalRule"("documentType");
CREATE INDEX "approvalRule_name_idx" ON "approvalRule"("companyId", "documentType", "name");
CREATE INDEX "approvalRule_amountRange_idx" ON "approvalRule"("companyId", "documentType", "lowerBoundAmount", "upperBoundAmount") WHERE "enabled" = true;

-- View for approval requests with related data
CREATE OR REPLACE VIEW "approvalRequests" WITH (SECURITY_INVOKER=true) AS
SELECT
  ar."id",
  ar."documentType",
  ar."documentId",
  ar."status",
  ar."requestedBy",
  ar."requestedAt",
  ar."approverGroupIds",
  ar."approverId",
  ar."decisionBy",
  ar."decisionAt",
  ar."decisionNotes",
  ar."companyId",
  ar."createdAt",
  -- Get document readable ID based on type
  CASE
    WHEN ar."documentType" = 'purchaseOrder' THEN po."purchaseOrderId"
    WHEN ar."documentType" = 'qualityDocument' THEN qd."name"
    ELSE NULL
  END AS "documentReadableId",
  -- Get document name/description
  CASE
    WHEN ar."documentType" = 'purchaseOrder' THEN s."name"
    WHEN ar."documentType" = 'qualityDocument' THEN qd."description"
    ELSE NULL
  END AS "documentDescription",
  -- Requester info
  ru."fullName" AS "requestedByName",
  ru."avatarUrl" AS "requestedByAvatarUrl",
  -- Approver info
  au."fullName" AS "approverName",
  au."avatarUrl" AS "approverAvatarUrl",
  -- Decision maker info
  du."fullName" AS "decisionByName",
  du."avatarUrl" AS "decisionByAvatarUrl",
  -- Group names as array (get names for all groups in the array)
  (
    SELECT ARRAY_AGG(g."name" ORDER BY g."name")
    FROM "group" g
    WHERE g."id" = ANY(ar."approverGroupIds")
  ) AS "approverGroupNames"
FROM "approvalRequest" ar
LEFT JOIN "purchaseOrder" po ON ar."documentType" = 'purchaseOrder' AND ar."documentId" = po."id"
LEFT JOIN "supplier" s ON po."supplierId" = s."id"
LEFT JOIN "qualityDocument" qd ON ar."documentType" = 'qualityDocument' AND ar."documentId" = qd."id"
LEFT JOIN "user" ru ON ar."requestedBy" = ru."id"
LEFT JOIN "user" au ON ar."approverId" = au."id"
LEFT JOIN "user" du ON ar."decisionBy" = du."id";

-- Enable RLS on approvalRequest
ALTER TABLE "approvalRequest" ENABLE ROW LEVEL SECURITY;

-- Enable RLS on approval rules table
ALTER TABLE "approvalRule" ENABLE ROW LEVEL SECURITY;
