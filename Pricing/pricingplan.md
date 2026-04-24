# Pricing Section Rebuild Plan
**Section 04 — Pricing Tables**

---

## 1. Section Heading

```
Customized Instructor-led Corporate Training
Prices and Packages for Organizations Globally
```

Styled as: navy, 32–36px, 800 weight, letter-spacing -0.03em (two-line centered h2, same as current page H2 style).

---

## 2. Tab Switcher

Three tabs displayed as a pill-group row, centered below the heading:

| Tab Label              | Slug     |
|------------------------|----------|
| All Included           | `all`    |
| IT & Technical Training | `it`    |
| Non-Technical Training  | `non-it` |

**Default active:** All Included  
**Active state:** Navy fill, white text  
**Inactive state:** Light-bg fill, border, secondary text — hover shows navy border

---

## 3. Comparison Table Layout

A full-width comparison table with:
- **Column 0 (sticky left):** Feature label column — navy header cell reading "Features"
- **Columns 1–4:** One column per plan — Starter, Growth, Enterprise, Custom

### 3a. Plan Header Row (inside `<thead>`)

Each plan column header contains:

| Field              | Starter | Growth | Enterprise | Custom |
|--------------------|---------|--------|-----------|--------|
| Badge              | —       | MOST POPULAR + Save upto 10% | Save upto 20% | — |
| Plan name          | Starter | Growth | Enterprise | Custom |
| Description        | "Starter package is for organizations with limited training requirements." | "Growth package is for organizations with moderate training requirements." | "Enterprise package is for large organizations with higher number of training requirements." | "Custom package is for large organizations which have higher training requirements." |
| Validity           | Validity: 6 Months | Validity: 9 Months | Validity: 12 Months | Validity: 12 Months |
| CTA button         | Enquire Now (outline) | Enquire Now (solid navy — featured) | Enquire Now (outline) | Enquire Now (outline) |

Growth column gets `featured` styling: navy top border accent, slightly elevated shadow.  
"Most Popular" pill badge sits above the plan name (lime background, navy text).

---

### 3b. Feature Rows (inside `<tbody>`)

Row labels in column 0, values in columns 1–4.  
Rows that are identical across all plans show the shared value with a lighter visual treatment (e.g. grey italic or a single centred cell spanning 4 columns — **do not use colspan**, repeat in each cell for clean column alignment).

| # | Row Label | Superscript | Starter | Growth | Enterprise | Custom |
|---|-----------|------------|---------|--------|-----------|--------|
| 1 | Trainee Licenses | ¹ | **120** | **320** | **800** | **Unlimited⁵** |
| 2 | Training Duration | ² (In-person Onsite* / Virtual Instructor-led Training) | **64 hours** of Group Training³ · Up to 10 training sessions | **160 hours** of Group Training³ · Up to 25 training sessions | **400 hours** of Group Training³ · Up to 60 training sessions | **Unlimited⁵** |
| 3 | Training Programs | — | *(tab-driven — see §4)* | *(tab-driven)* | *(tab-driven)* | *(tab-driven)* |
| 4 | Training Delivery Mode | ⁴ | In-person Onsite ⁴·¹ / Virtual Instructor-led Training | ← same | ← same | ← same |
| 5 | Domain Expert Trainers | — | ✓ On-demand | ✓ On-demand | ✓ On-demand | ✓ On-demand |
| 6 | Dedicated Learning Services Manager | — | ✓ | ✓ | ✓ | ✓ |
| 7 | Trial Training Sessions | — | Paid Trial Available | Paid Trial Available | Paid Trial Available | Paid Trial Available |
| 8 | Retrospective Sessions | (2 hrs. per Training) | ✓ | ✓ | ✓ | ✓ |
| 9 | Add-Ons | — | • Additional Trainee Licenses · • Additional day of training | ← same | ← same | ← same |
| 10 | Additional Services | — | • Training Needs Analysis · • Coaching (One-to-one or small team size and min. 8 hrs.) · • Mentoring (min. 8 hrs.) · • Content Development · • Exam & Certification · • Training at external venue | ← same | ← same | ← same |

**Checkmark style:** lime filled circle with white tick (matches existing `.pt-check` style).  
**Odd/even row striping:** alternating `var(--surface)` / `var(--light-bg)`.

---

## 4. Tab-Driven Content (Row 3 — Training Programs)

Only the Training Programs cell content changes when tabs are switched. JS swaps `innerHTML` on elements with `data-tab-programs`.

| Tab | Text injected |
|-----|--------------|
| All Included | **2,000+** Training programs available across Technical, Management, Behavioral, Leadership, Compliance and Social Impact domains |
| IT & Technical Training | **1,000+** Training programs available across IT & Technical Skills domain |
| Non-Technical Training | **1,000+** Training programs available across Management, Behavioral, Leadership, Compliance and Social Impact domains |

---

## 5. Footnotes Block

Displayed below the table as a 2-column grid, small grey text. Exact content:

```
¹ Trainee Licenses
  - 8 hour session for one trainee is considered as 1 license
  - 4 hours of training for one trainee is considered as half a license

² Training Duration and Training Session Utilization
  - Half-day training lasts for 4 hours and full-day training lasts for 8 hours
  - In a 1-day session of 8 hours with 20 Trainees, the utilization is 8 hours and 20 licenses
  - In a 2-day session of 8 hours with 20 Trainees, the utilization is 16 hours and 40 licenses

³ Group size
  You have the flexibility to select the size of the group training by taking into account
  the package and the allotted trainee licenses

⁴ Training Delivery Mode
  *In-person onsite training is provided at the client's location for a group.
  Onsite Training will be charged 30% extra
  *The cost of onsite training includes the trainer's travel and accommodation expenses
  (Note: Additional fees may apply for remote locations)

⁴·¹ This pricing is for instructor-led virtual training only.

⁵ The Custom Package is priced on a cost per-employee basis. The cost includes an unlimited
  number of training sessions, allowing for a tailored experience to meet specific
  organizational needs.
```

---

## 6. Visual / Brand Styling

| Element | Style |
|---------|-------|
| Table border | 1px `var(--border)` with `border-radius: var(--radius-xl)` on wrapper |
| Feature label column | `var(--light-bg)` background, 13px, 600 weight, `var(--navy)` |
| Plan header — featured (Growth) | Navy top accent bar (4px), `var(--navy)` plan name |
| Checkmark cells | Lime filled circle + white SVG tick (`.pt-check`) |
| Numeric values (120, 320…) | 20px, 800 weight, `var(--navy)` |
| Savings badge | Lime bg, navy text, 11px 700 weight, pill border-radius |
| Most Popular badge | Lime bg pill, positioned above column header |
| CTA — featured | Solid navy bg, white text (`.pt-cta-solid`) |
| CTA — others | Navy outline (`.pt-cta-outline`) |
| Footnote block | `pt-footnotes` style — 12px muted, 2-col grid |
| Mobile breakpoint | Horizontal scroll wrapper on table; feature label column stays sticky left |

---

## 7. Responsive Behavior

- **≥ 1024px:** Full 5-column table (label + 4 plans)
- **768–1023px:** Horizontal scroll; label column sticky with `position: sticky; left: 0`
- **< 768px:** Same horizontal scroll, tab buttons wrap to 2 rows if needed

---

## 8. What Replaces in the Existing HTML

Section 04 (lines ~2054–2241) will be **fully replaced**:

- The 4-card `.pt-grid` layout → replaced by the comparison table
- The separate "All Packages Include" checklist → moved into table rows (rows 5–8)
- The Add-Ons / Additional Services → moved into table rows 9–10
- The footnotes block → kept but expanded with the full ¹²³⁴⁵ content above
- The "Not included" tags block → kept as-is below footnotes
- Tab switcher → replaces the simple 3-button tab above the old card grid

CSS prefix stays `.pt-` (table elements use `.pt-table`, `.pt-thead`, `.pt-tbody`, `.pt-tr`, `.pt-td`, `.pt-th`).

---

**Awaiting your approval to implement.**
