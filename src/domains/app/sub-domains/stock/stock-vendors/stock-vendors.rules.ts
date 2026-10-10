import { resolveRecordIds } from '@/domains/app/base-record.repository.js';
import type { BaseRecordRules } from '@/domains/app/base-record.types.js';
import { ConflictError } from '@/shared/errors/index.js';
import type { StockVendorsRepository } from './stock-vendors.repository.js';
import { stock_vendors } from './stock-vendors.schema.js';

/**
 * The stock vendor rules (launch ROUTE #137, routes-final 9.E, S13): delete only with nothing
 * owed, what each is owed and how many purchases each has.
 *
 * @remarks
 * - **Algorithm:** a delete is refused while a live purchase of theirs has a due; every read adds
 *   `payable` — the open dues of their live purchases — and `purchase_count`, their live purchases
 *   paid or not (D81), from one query for the page.
 * - **Failure modes:** `ConflictError` `vendor_has_dues`.
 */
export function createStockVendorsRules(repository: StockVendorsRepository): BaseRecordRules {
  return {
    prepareRemove: async (existing) => {
      if (await repository.hasDues(existing.id)) {
        throw new ConflictError('errors:stockVendorHasDues').withReason('vendor_has_dues');
      }
    },
    decorate: async (outputs, context) => {
      const idsByPublicId = await resolveRecordIds({
        table: stock_vendors,
        organizationId: context.organizationId,
        publicIds: outputs.map((output) => String(output.id)),
      });
      const figures = await repository.findPurchaseFigures([...idsByPublicId.values()]);
      for (const output of outputs) {
        const id = idsByPublicId.get(String(output.id));
        const figure = id === undefined ? undefined : figures.get(id);
        output.payable = figure?.payable ?? 0;
        output.purchase_count = figure?.purchase_count ?? 0;
      }
    },
  };
}
