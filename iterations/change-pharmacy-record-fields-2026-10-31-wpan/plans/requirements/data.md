# Requirements — data

| Identifier | Requirement | Decision |
| --- | --- | --- |
| `data.medicine-fields` | A medicine holds `hsn_code` (4/6/8 digits), `pack_label` (1–30) and `units_per_pack` (1–1000, default 1). | D1, D3, D9 |
| `data.batch-mrp` | A batch holds the MRP printed on it (`mrp`, above 0, optional); an order line holds the MRP of its packs. | D8 |
| `data.supplier-contact` | A supplier holds `email` (≤ 120) and `address` (≤ 240). | D9 |
| `data.order-note` | A purchase order holds a `note` (≤ 500). | D9, D10 |
| `data.line-snapshots` | A medicine bill line snapshots the pack label (`pack_size`) and HSN code (`hsn_code`) when billed. | D3 |
| `data.units` | A medicine's stock numbers count units; supplier numbers count packs. | D5 |
