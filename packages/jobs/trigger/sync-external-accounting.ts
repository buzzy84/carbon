/**
 * Task to sync entities from accounting providers to Carbon
 */
import { getCarbonServiceRole } from "@carbon/auth";
import {
  getPostgresClient,
  getPostgresConnectionPool,
} from "@carbon/database/client";
import {
  AccountingEntity,
  BatchSyncResult,
  getAccountingIntegration,
  getProviderIntegration,
  SyncFactory,
} from "@carbon/ee/accounting";

import { groupBy } from "@carbon/utils";
import { logger, task } from "@trigger.dev/sdk";
import { PostgresDriver } from "kysely";
import z from "zod";
import { AccountingSyncSchema } from "../../ee/src/accounting/core/models.ts";

const PayloadSchema = AccountingSyncSchema.extend({
  syncDirection: AccountingSyncSchema.shape.syncDirection,
});

type Payload = z.infer<typeof PayloadSchema>;

export const syncExternalAccountingTask = task({
  id: "sync-external-accounting",
  maxDuration: 5 * 60 * 1000, // 5 minutes
  run: async (input: Payload) => {
    const payload = PayloadSchema.parse(input);

    const client = getCarbonServiceRole();

    const integration = await getAccountingIntegration(
      client,
      payload.companyId,
      payload.provider
    );

    const provider = getProviderIntegration(
      client,
      payload.companyId,
      integration.id,
      integration.metadata
    );

    const pool = getPostgresConnectionPool(10);
    const kysely = getPostgresClient(pool, PostgresDriver);

    const results = {
      success: [] as BatchSyncResult[],
      failed: [] as { entities: AccountingEntity[]; error: string }[],
    };

    try {
      const group = groupBy(payload.entities, (e) => e.entityType);

      for (const [entityType, entities] of Object.entries(group)) {
        const type = entityType as AccountingEntity["entityType"];

        try {
          logger.info(
            `Starting sync for ${entities.length} ${entityType} entities`
          );

          const syncer = SyncFactory.getSyncer({
            database: kysely,
            companyId: payload.companyId,
            provider,
            config: provider.getSyncConfig(type),
            entityType: type,
          });

          if (entities.length === 0) {
            logger.info(`No entities to sync for type ${entityType}`);
            continue;
          }

          if (input.syncDirection === "push-to-accounting") {
            const result = await syncer.pushBatchToAccounting(
              entities.map((e) => e.entityId)
            );

            logger.info("Sync result:", { entityType, result });

            results.success.push(result);
          }

          if (input.syncDirection === "pull-from-accounting") {
            const result = await syncer.pullBatchFromAccounting(
              entities.map((e) => e.entityId)
            );

            logger.info("Sync result:", { entityType, result });

            results.success.push(result);
          }
        } catch (error) {
          console.error(`Failed to process ${entityType} entities:`, error);

          results.failed.push({
            entities: entities,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    } catch (error) {
      logger.error("Sync task failed:", error);
    } finally {
      await pool.end();
    }

    return results;
  },
});
