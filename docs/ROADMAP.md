# PartStock capability roadmap

Reference product for **features** only: [Part-DB](https://github.com/Part-DB/Part-DB-server) (docs.part-db.de).
We do **not** copy Part-DB code (AGPL) or remove per-user ownership.

Hard constraints:
- Every inventory entity stays `ownerId`-scoped (why Part-DB was abandoned).
- No SaaS billing / no paid PartsBox dependency.
- Self-host, MIT.

Status: `done` | `partial` | `todo` | `later` | `wont`

## Matrix vs Part-DB feature list

| Capability (Part-DB-like) | Status | Notes |
|---------------------------|--------|--------|
| Parts CRUD + search | done | name/MPN/mfr/description |
| Storage locations (tree) | done | cycle detection |
| Lots | done | per-part codes |
| Stock multi-location + adjust | partial | API + summary; UI stock entry weak |
| Per-user ownership isolation | done | **differentiator** |
| Auth session + CSRF | done | |
| Labels generate (QR/Code128) | done | print sheet |
| Barcode scan (webcam + keyboard wedge) | done | /api/scan + Scan page; BarcodeDetector optional |
| **Import part from shop URL** | todo | metadata first; bot walls expected |
| Categories (tree) | partial | CRUD + cycle check + UI; done for P0 slice |
| Tags | partial | CRUD + part assign + UI; done for P0 slice |
| **Attachments** (datasheet PDF, images) | todo | local disk + owner scope |
| **Part detail page** (rich notes, history) | partial | view/edit + stock + lots UI done; history later |
| Stock receive UI (+qty at location) | done | adjust form + list-all stock |
| CSV import-export parts | done | category/tags auto-create; stock rows later |
| **Parametric / custom fields UI** | partial | JSON blob; no schema UI |
| **Manufacturer / footprint as entities** | todo | now free strings |
| **Barcode on location** | todo | |
| BOM + CSV import | done | |
| Builds pick / reserve / consume | done | single-stage |
| Project “how many can I build” | partial | via builds; no simple calculator UI |
| Audit log store | done | |
| **Audit log UI + part history** | todo | |
| **Version / revert part** | later | |
| Multi-language | partial | vi + en only |
| Groups + fine RBAC | later | now admin/user/readonly string |
| 2FA / password reset email | later | |
| SSO/SAML | later | |
| Distributor APIs (LCSC, DigiKey, …) | later | optional plugins |
| AI shop extract | later / wont default | cost + flaky |
| KiCad integration | later | |
| Multi-currency price FX | later | unit cost on lot optional first |
| Browser extension submit-from-shop | later | after URL import |
| MySQL | later | SQLite + PG schema path exists |
| Windows first-class support | todo | dad hits runtime bugs; track separately |

## Delivery phases (order of value for a real workshop)

### P0 — Daily inventory depth (foundation)
1. Category tree + tags (owner-scoped)
2. Part detail page (edit, stock, lots, files, history)
3. Stock receive / adjust UI (location + qty + reason)
4. Attachments (datasheet/image upload, serve owned files)
5. Barcode: scan → lookup part/lot/location; generate if missing
6. Import from URL (preview → create part; SSRF-safe fetch)
7. CSV import/export parts (+ optional stock rows)
8. Tests + browser for each slice

### P1 — Usability & scale
9. Strong search (filters: category, tag, footprint, low stock, has stock)
10. Manufacturer/footprint tables or normalized filters
11. Custom field definitions UI
12. Location labels + scan-to-location putaway
13. Audit log UI
14. “Can build N?” calculator from BOM without full build run

### P2 — Integrations (optional)
15. Distributor provider interface (LCSC/Mouser…) behind config
16. KiCad library export/sync
17. Browser extension / bookmarklet for shop pages
18. Bulk tools, print templates Avery sizes

### P3 — Enterprise-ish (only if asked)
19. Groups + fine permissions **still ownership-first** (share workspace model TBD)
20. 2FA, password reset
21. SSO
22. Part revision history + revert

## Non-goals (unless Sir reopens)
- Feature-parity claim with Part-DB marketing page in one release
- Removing ownership for “shared single warehouse” Part-DB mode
- AGPL reimplementation of Part-DB internals
- Full AI scraping of every shop

## Tracking
Checkboxes live in this file; update when a phase ships.
P0 items: all open as of roadmap creation.
