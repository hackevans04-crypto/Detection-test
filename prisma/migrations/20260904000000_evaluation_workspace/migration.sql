CREATE TABLE IF NOT EXISTS "evaluation_workspaces" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "evaluatorId" TEXT NOT NULL,
  "institutionId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "evaluation_workspaces_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "evaluation_workspaces_evaluatorId_idx" ON "evaluation_workspaces"("evaluatorId");
CREATE INDEX IF NOT EXISTS "evaluation_workspaces_institutionId_idx" ON "evaluation_workspaces"("institutionId");
CREATE INDEX IF NOT EXISTS "evaluation_workspaces_updatedAt_idx" ON "evaluation_workspaces"("updatedAt");
