import { findMembershipIdOfUser, resolveRecordIds } from '@/domains/app/base-record.repository.js';
import type { BaseRecordRules, BaseRecordWriteContext } from '@/domains/app/base-record.types.js';
import { STOCK_ITEM_MOVEMENT_TYPE } from '@/domains/app/sub-domains/stock/stock-item-movements/stock-item-movements.constants.js';
import {
  quantityMilli,
  quantityText,
  writeStockMovement,
} from '@/domains/app/sub-domains/stock/stock-item-movements/stock-item-movements.ledger.js';
import { StockItemsRepository } from '@/domains/app/sub-domains/stock/stock-items/stock-items.repository.js';
import { stock_items } from '@/domains/app/sub-domains/stock/stock-items/stock-items.schema.js';
import { fieldValidationError } from '@/shared/errors/index.js';
import { STOCK_COUNT_MOVEMENT_NOTE } from './stock-counts.constants.js';
import type { CreateStockCountInput } from './stock-counts.dto.js';
import type { StockCountsRepository } from './stock-counts.repository.js';
import { stock_counts } from './stock-counts.schema.js';

const itemsRepository = new StockItemsRepository();

/** One counted item as the count writes it — thousandths (S4). */
interface PendingCountLine {
  stockItemId: number;
  systemMilli: number;
  countedMilli: number;
}

/** The lines in flight, by their write context — set by `prepareCreate`, read by `afterWrite`. */
const pendingLines = new WeakMap<BaseRecordWriteContext, PendingCountLine[]>();

/** A 400 on `lines` with its message. */
function linesError({
  messageKey,
  messageParams = {},
}: {
  messageKey: string;
  messageParams?: Record<string, string | number> | undefined;
}) {
  return fieldValidationError({ field: 'lines', messageKey, messageParams });
}

/**
 * S9: the counted lines with the system quantities — the items live here, their balances taken
 * `FOR UPDATE` (so nothing moves them before the count's movements); at least one differs.
 */
async function prepareLines({
  lines,
  context,
}: {
  lines: CreateStockCountInput['lines'];
  context: BaseRecordWriteContext;
}): Promise<PendingCountLine[]> {
  const ids = await resolveRecordIds({
    table: stock_items,
    organizationId: context.organizationId,
    publicIds: lines.map((line) => line.stock_item_id),
  });
  const unknown = lines.find((line) => !ids.has(line.stock_item_id));
  if (unknown) {
    throw linesError({
      messageKey: 'errors:validation.stockCountUnknownItem',
      messageParams: { id: unknown.stock_item_id },
    });
  }
  const balances = await itemsRepository.findQuantities([...ids.values()]);
  const pending = lines.map((line) => {
    const stockItemId = ids.get(line.stock_item_id)!;
    return {
      stockItemId,
      systemMilli: quantityMilli(balances.get(stockItemId)),
      countedMilli: quantityMilli(line.counted_quantity),
    };
  });
  if (pending.every((line) => line.systemMilli === line.countedMilli)) {
    throw linesError({ messageKey: 'errors:validation.stockCountNothingDiffers' });
  }
  return pending;
}

/**
 * The stock count rules (launch ROUTE #137, routes-final 9.C, S9): the counted lines with their
 * system quantities, an `adjust` movement for each difference, and what a page reads.
 *
 * @remarks
 * - **Algorithm:** a save checks the items and takes their balances `FOR UPDATE` (the system
 *   quantities — the server's, never sent), wants at least one difference, stamps the caller as
 *   its author (K2); once written, its lines go in and each differing one moves the item to the
 *   counted quantity with an `adjust` movement noted "Stock check". Every read adds the lines and
 *   `changed_item_count`.
 * - **Failure modes:** `ValidationError` on `lines`.
 */
export function createStockCountsRules(repository: StockCountsRepository): BaseRecordRules {
  return {
    prepareCreate: async (values, context) => {
      const lines = values.lines as CreateStockCountInput['lines'];
      delete values.lines;
      pendingLines.set(context, await prepareLines({ lines, context }));
      values.author_membership_id = await findMembershipIdOfUser({
        organizationId: context.organizationId,
        userId: context.userId,
      });
    },
    afterWrite: async (row, change, context) => {
      if (change.kind !== 'create') return;
      const lines = pendingLines.get(context) ?? [];
      pendingLines.delete(context);
      await repository.insertLines(
        lines.map((line) => ({
          stock_count_id: row.id,
          stock_item_id: line.stockItemId,
          organization_id: context.organizationId,
          system_quantity: quantityText(line.systemMilli),
          counted_quantity: quantityText(line.countedMilli),
        })),
      );
      for (const line of lines) {
        if (line.countedMilli === line.systemMilli) continue;
        await writeStockMovement({
          context,
          stockItemId: line.stockItemId,
          type: STOCK_ITEM_MOVEMENT_TYPE.ADJUST,
          changeMilli: line.countedMilli - line.systemMilli,
          links: { stock_count_id: row.id, note: STOCK_COUNT_MOVEMENT_NOTE },
        });
      }
    },
    decorate: async (outputs, context) => {
      const idsByPublicId = await resolveRecordIds({
        table: stock_counts,
        organizationId: context.organizationId,
        publicIds: outputs.map((output) => String(output.id)),
      });
      const lines = await repository.findLines([...idsByPublicId.values()]);
      for (const output of outputs) {
        const id = idsByPublicId.get(String(output.id));
        const own = lines.filter((line) => line.stock_count_id === id);
        output.lines = own.map((line) => ({
          stock_item_id: line.stock_item_id,
          system_quantity: Number(line.system_quantity),
          counted_quantity: Number(line.counted_quantity),
          difference:
            (quantityMilli(line.counted_quantity) - quantityMilli(line.system_quantity)) / 1000,
        }));
        output.changed_item_count = own.filter(
          (line) => quantityMilli(line.counted_quantity) !== quantityMilli(line.system_quantity),
        ).length;
      }
    },
  };
}
