# Pradeep Enterprises Billing App V6

React + Vite billing application based on the supplied Canva invoice PNG.

## What is fixed in V6

- The previous version's ghost/duplicate totals are removed.
- The supplied Canva export is used only for the static header/footer/background.
- Dynamic customer, invoice, items and totals are drawn over a cleaned template background.
- PDF is generated directly with jsPDF at A4 dimensions instead of shrinking the whole HTML page.
- Unicode Noto Sans is embedded so the ₹ symbol works in the PDF.
- Items paginate automatically.
- Final page reserves space for subtotal, CGST, SGST, grand total and amount in words.
- Continuation pages can contain more item rows.
- No totals are drawn on non-final pages.

## Run

```powershell
npm install
npm run dev
```

Then open the Vite URL shown in the terminal.

## Test

Test with:
- 1 item
- 3 items
- 7 items
- 9 items
- 20 items

The 9+ item tests are specifically to verify automatic pagination.

## Important

The business details and customer data in the initial state are examples matching the supplied reference. Replace them with the client's actual details before production use.


## V6 layout calibration

The table x-position, column widths, row height, and typography were recalibrated against the uploaded Canva PNG. The table now uses the wider original proportions, with a larger readable row height. The final page is limited to four item rows so the totals block never collides with the footer; continuation pages fit eight rows safely.


## V6 calibration

- Bill To / Invoice box moved into the actual header gap from the supplied Canva PNG, so it no longer overlaps the contractor title.
- Table moved to the original vertical position.
- Amount in Words is now Title Case: every word starts with a capital letter.
- Final-page capacity is six rows; continuation pages use ten rows.
