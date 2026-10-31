# Requirements — quality

| Identifier | Requirement | Decision |
| --- | --- | --- |
| `quality.no-meaning-change-today` | With `units_per_pack` 1 and no batch MRP — every row when this ships — every stock number, sale price and credit reads as before. | D5 |
| `quality.never-above-mrp` | No medicine line is ever charged above the MRP printed on its batch (the unit price rounds down). | D2, D6 |
| `quality.errors-translated` | Every new error goes through a translation key, English first. | — |
