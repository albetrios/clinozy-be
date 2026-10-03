import type { SchemaSnapshot, Table } from './sql-migrations.d.mts';

export type PlanStatus = 'NEW' | 'CHANGED' | 'EXISTING' | 'REMOVED';

export interface PlanField {
  type: string;
  name: string;
  pk: boolean;
  fk: boolean;
  unique: boolean;
  change: 'added' | 'removed' | 'changed' | null;
  note: string | null;
  /** a reference field's target entity, from its `→ entity` comment */
  referenceTo: string | null;
}

export interface PlanEntity {
  name: string;
  status: PlanStatus | null;
  /** the label's optional `domain.table` — chosen by the user while planning */
  target: { schema: string | null; table: string } | null;
  fields: PlanField[];
}

export interface PlanRelation {
  fromEntity: string;
  toEntity: string;
  card: {
    fromKind: 'one' | 'many';
    fromOptional: boolean;
    toKind: 'one' | 'many';
    toOptional: boolean;
  };
  label: string;
  planStatus: 'added' | 'removed' | null;
}

export interface ParsedPlan {
  entities: PlanEntity[];
  relations: PlanRelation[];
  warnings: string[];
}

export interface IterationPlan {
  name: string;
  status: string;
  opened: string;
  summary: string;
  file: string;
}

export const PLAN_FILE: string;
export const DEFAULT_PLAN_SCHEMA: string;

export function tableNameFor(entityName: string): string;

export function parseErDiagrams(markdown: string): ParsedPlan;
export function buildPlanSchema(
  base: SchemaSnapshot,
  plan: ParsedPlan,
): {
  schema: SchemaSnapshot;
  summary: { new: number; changed: number; existing: number; removed: number; matched: number };
  warnings: string[];
};
export function discoverIterationPlans(iterationsDir: string | null | undefined): IterationPlan[];
export function matchLiveTable(
  schema: SchemaSnapshot,
  entityName: string,
  target?: { schema: string | null; table: string } | null,
): Table | null;
