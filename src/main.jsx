import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { jsPDF } from "jspdf";
import { NOTO_SANS_REGULAR, NOTO_SANS_BOLD } from "./fonts";
import "./styles.css";

const DEFAULT_BUSINESS = {
  name: "PRADEEP ENTERPRISES",
  subtitle: "PAINTING & POLISHING CONTRACTOR",
  gstin: "27EDKPG2460P1Z2",
  phone1: "+91 9890319844",
  phone2: "+91 9970599986",
  email: "pradeepenterprises0708@gmail.com",
  address: "Dhanlaxmi Building, Flat No.402,\nBehind of Sanjeevani Hospital,\nNDA Road, Uttam Nagar, Pune 411023",
};

const makeItem = () => ({
  particulars: "",
  qty: "",
  unit: "SQ.FT",
  rate: "",
});

const today = () => new Date().toISOString().slice(0, 10);

function money(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function amountWords(num) {
  num = Math.round(Number(num || 0) * 100) / 100;
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);

  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

  const two = (n) => n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? " " + ones[n % 10] : ""}`;
  const underThousand = (n) => {
    if (!n) return "";
    if (n < 100) return two(n);
    return `${ones[Math.floor(n / 100)]} hundred${n % 100 ? " " + two(n % 100) : ""}`;
  };
  const indian = (n) => {
    if (!n) return "zero";
    const parts = [];
    const crore = Math.floor(n / 10000000);
    n %= 10000000;
    const lakh = Math.floor(n / 100000);
    n %= 100000;
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    if (crore) parts.push(`${underThousand(crore)} crore`);
    if (lakh) parts.push(`${underThousand(lakh)} lakh`);
    if (thousand) parts.push(`${underThousand(thousand)} thousand`);
    if (n) parts.push(underThousand(n));
    return parts.join(" ");
  };

  let result = `${indian(rupees)} rupees`;
  if (paise) result += ` and ${indian(paise)} paise`;
  result += " only.";
  return result.charAt(0).toUpperCase() + result.slice(1);
}

// Keep the invoice at 8 items per A4 page. The last page also supports
// up to 8 items because the row/totals heights below were tightened to fit
// the complete table, totals and Rs-in-Words section above the footer.
const PAGE_ITEM_CAPACITY = 8;
const FINAL_CAPACITY = PAGE_ITEM_CAPACITY;
const CONTINUATION_CAPACITY = PAGE_ITEM_CAPACITY;
function paginateItems(items) {
  const pages = [];
  if (!items.length) return [{ start: 0, rows: [], final: true }];

  for (let cursor = 0; cursor < items.length; cursor += PAGE_ITEM_CAPACITY) {
    const rows = items.slice(cursor, cursor + PAGE_ITEM_CAPACITY);
    pages.push({
      start: cursor,
      rows,
      final: cursor + PAGE_ITEM_CAPACITY >= items.length,
    });
  }
  return pages;
}

function getInvoiceNo() {
  const current = Number(localStorage.getItem("pe-next-invoice") || "1");
  return String(current).padStart(3, "0");
}

// Advances the persisted counter so the *next* invoice gets a fresh number.
// Without this, pe-next-invoice is never written and every invoice reuses
// the same number/filename, so each new PDF just overwrites the last one.
function advanceInvoiceNo() {
  const current = Number(localStorage.getItem("pe-next-invoice") || "1");
  localStorage.setItem("pe-next-invoice", String(current + 1));
}

function App() {
  const [business, setBusiness] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pe-business")) || DEFAULT_BUSINESS; }
    catch { return DEFAULT_BUSINESS; }
  });

  const [customer, setCustomer] = useState({
    name: "KF BIOPLANTS PVT LTD",
    address: "Manjari, 412307 Maharashtra India",
    gstin: "",
  });

  const [invoice, setInvoice] = useState({
    number: getInvoiceNo(),
    date: today(),
    service: "Painting Services",
    cgst: 9,
    sgst: 9,
  });

  const [items, setItems] = useState([
    { particulars: "Laboratory 1", qty: "4555.32", unit: "SQ.FT", rate: "45" },
    { particulars: "Canteen", qty: "562.86", unit: "SQ.FT", rate: "45" },
    { particulars: "Laboratory 3", qty: "1428.0", unit: "SQ.FT", rate: "45" },
  ]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.rate || 0), 0);
    const cgst = subtotal * Number(invoice.cgst || 0) / 100;
    const sgst = subtotal * Number(invoice.sgst || 0) / 100;
    return { subtotal, cgst, sgst, total: subtotal + cgst + sgst };
  }, [items, invoice.cgst, invoice.sgst]);

  // Preview pages mirror the PDF pagination exactly, so what you see on
  // screen is what you'll get in the downloaded file.
  const previewPages = useMemo(() => paginateItems(items), [items]);
  const [previewPage, setPreviewPage] = useState(0);
  useEffect(() => {
    if (previewPage > previewPages.length - 1) setPreviewPage(previewPages.length - 1);
  }, [previewPages, previewPage]);
  const currentPreviewPage = previewPages[Math.min(previewPage, previewPages.length - 1)];

  useEffect(() => {
    localStorage.setItem("pe-business", JSON.stringify(business));
  }, [business]);

  const updateItem = (index, key, value) => {
    setItems(prev => prev.map((x, i) => i === index ? { ...x, [key]: value } : x));
  };

  const addItem = () => setItems(prev => [...prev, makeItem()]);
  const removeItem = (index) => setItems(prev => prev.filter((_, i) => i !== index));

  const generatePDF = async () => {
    const img = new Image();
    img.src = "/invoice-bg.png";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    pdf.addFileToVFS("NotoSans-Regular.ttf", NOTO_SANS_REGULAR);
    pdf.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
    pdf.addFileToVFS("NotoSans-Bold.ttf", NOTO_SANS_BOLD);
    pdf.addFont("NotoSans-Bold.ttf", "NotoSans", "bold");
    pdf.setFont("NotoSans", "normal");

    const W = 210, H = 297;
    const bg = "/invoice-bg.png";

    // Pixel-to-A4 mapping based on the supplied 1414x2000 Canva export.
    const X = p => p / 6.733333;
    const Y = p => p / 6.733333;

    const drawBackground = () => pdf.addImage(img, "PNG", 0, 0, W, H, undefined, "FAST");

    const fill = (x, y, w, h, color = [255,255,255]) => {
      pdf.setFillColor(...color);
      pdf.rect(x, y, w, h, "F");
    };

    const line = (x1,y1,x2,y2,color=[125,125,125],width=.3) => {
      pdf.setDrawColor(...color); pdf.setLineWidth(width); pdf.line(x1,y1,x2,y2);
    };

    const text = (str,x,y,size=10,bold=false,align="left",color=[20,20,20]) => {
      pdf.setFont("NotoSans", bold ? "bold" : "normal");
      pdf.setFontSize(size);
      pdf.setTextColor(...color);
      pdf.text(String(str ?? ""), x, y, { align });
    };

    const wrapText = (str, x, y, maxWidth, size=9, bold=false, lineGap=4) => {
      pdf.setFont("NotoSans", bold ? "bold" : "normal");
      pdf.setFontSize(size);
      const lines = pdf.splitTextToSize(String(str ?? ""), maxWidth);
      lines.forEach((l, i) => text(l, x, y + i * lineGap, size, bold));
      return lines.length;
    };

    // Layout in mm. Re-measured pixel-by-pixel against the supplied 1414x2000
    // Canva PNG (scale: 1mm = 6.7333px) so the drawn boxes line up with the
    // artwork instead of overlapping the "PAINTING & POLISHING CONTRACTOR"
    // subtitle that's baked into the background image.
    const billX = 5.9, billY = 62.5, billW = 198.1, billH = 34.5;
    const tableX = 5.9, tableY = 103.7, tableW = 198.1;
    const col = [16.8, 42.0, 26.4, 26.3, 36.0, 50.6];
    // Compact heights: 8 item rows + totals + Rs-in-Words fit on one A4 page.
const headerH = 15.0, rowH = 10.2;
    const footerY = 262.9;

    const drawBillBox = () => {
      fill(billX, billY, billW, billH, [235,235,235]);
      pdf.setDrawColor(200,200,200); pdf.setLineWidth(.25); pdf.rect(billX,billY,billW,billH);
      line(billX + 98.0, billY, billX + 98.0, billY + billH);
      text("Bill To", billX+5, billY+7.7, 12.0, true, "left", [15,65,110]);
      text(customer.name || "", billX+5, billY+16.3, 8.8, true);
      text(customer.address || "", billX+5, billY+24.1, 7.8);
      if (customer.gstin) text(`GSTIN: ${customer.gstin}`, billX+5, billY+30.0, 6.2);
      text("INVOICE", billX+102, billY+6.2, 11.0, true);
      text(`Invoice #${invoice.number}`, billX+102, billY+12.0, 8.3, true);
      text(`GSTIN No. ${business.gstin}`, billX+102, billY+17.8, 7.9, true);
      const d = invoice.date ? new Date(invoice.date + "T00:00:00") : new Date();
      const dateStr = d.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
      text(dateStr, billX+102, billY+23.6, 7.9, true);
      text(invoice.service, billX+102, billY+29.7, 7.9, true);
    };

    const drawTableHeader = (y) => {
      let x = tableX;
      pdf.setFillColor(177, 10, 65);
      pdf.rect(tableX, y, tableW, headerH, "F");
      const labels = ["SR.NO.", "PARTICULARS", "QNTY", "UNIT", "RATE", "Amount"];
      labels.forEach((label, i) => {
        text(label, x + col[i]/2, y+9.3, 8.6, true, "center", [0,0,0]);
        x += col[i];
      });
      x = tableX;
      for (const cw of col) {
        line(x, y, x, y+headerH, [240,240,240], .25);
        x += cw;
      }
      line(tableX+tableW,y,tableX+tableW,y+headerH,[110,110,110],.65);
      line(tableX,y,tableX+tableW,y,[110,110,110],.65);
      line(tableX,y+headerH,tableX+tableW,y+headerH,[110,110,110],.65);
    };

    const drawRow = (item, index, y) => {
      let x = tableX;
      pdf.setFillColor(255,255,255);
      pdf.rect(tableX, y, tableW, rowH, "F");
      const values = [
        String(index+1),
        item.particulars,
        item.qty,
        item.unit,
        item.rate,
        money(Number(item.qty||0)*Number(item.rate||0)),
      ];
      values.forEach((v,i) => {
        const center = x + col[i]/2;
        if (i === 1) text(v, x+2.5, y+6.7, 7.4, false);
        else if (i === 5) text(v, x+col[i]-2.5, y+6.7, 7.4, false, "right");
        else text(v, center, y+6.7, 7.4, false, "center");
        x += col[i];
      });
      x = tableX;
      for (const cw of col) {
        line(x,y,x,y+rowH,[125,125,125],.55); x += cw;
      }
      line(tableX+tableW,y,tableX+tableW,y+rowH,[125,125,125],.55);
      line(tableX,y+rowH,tableX+tableW,y+rowH,[125,125,125],.55);
    };

    const drawTotals = (startY) => {
      // The totals box reuses the same RATE / Amount column boundaries as
      // the item table, so it's derived from `col` rather than hardcoded.
      const blankW = col[0] + col[1] + col[2] + col[3];
      const totalX = tableX + blankW;
      const labelW = col[4];
      const valueW = col[5];
      const rh = 11.5;
      const rows = [
        ["Subtotal", totals.subtotal],
        [`CGST @ ${invoice.cgst}%`, totals.cgst],
        [`SGST @ ${invoice.sgst}%`, totals.sgst],
        ["Grand Total", totals.total],
      ];
      // blank left area
      fill(tableX, startY, blankW, rh*4, [255,255,255]);
      line(tableX, startY, tableX, startY+rh*4, [110,110,110], .65);
      for (let i=0;i<4;i++) {
        const y = startY + i*rh;
        fill(totalX, y, labelW, rh, [255,255,255]);
        fill(totalX+labelW, y, valueW, rh, [255,255,255]);
        line(totalX,y,totalX+labelW+valueW,y,[125,125,125],.55);
        line(totalX,y,totalX,y+rh,[125,125,125],.55);
        line(totalX+labelW,y,totalX+labelW,y+rh,[125,125,125],.55);
        line(tableX,y,tableX,y+rh,[110,110,110],.65);
        line(tableX+tableW,y,tableX+tableW,y+rh,[110,110,110],.65);
        text(rows[i][0], totalX+3, y+7.7, i===3 ? 7.8 : 7.0, true);
        text(money(rows[i][1]), totalX+labelW+valueW-3, y+7.7, i===3 ? 8.0 : 7.0, i===3, "right");
      }
      line(tableX,startY+rh*4,tableX+tableW,startY+rh*4,[110,110,110],.65);
      const wordsY = startY + rh*4;
      const wordsH = 16.5;
      fill(tableX, wordsY, blankW, wordsH, [255,255,255]);
      fill(totalX, wordsY, tableW-blankW, wordsH, [255,255,255]);
      pdf.setDrawColor(145,145,145);
      pdf.setLineWidth(.45);
      pdf.rect(tableX, wordsY, tableW, wordsH);
      line(totalX, wordsY, totalX, wordsY+wordsH,[110,110,110],.65);
      const words = amountWords(totals.total);
      // Keep the Rs-in-Words text strictly inside the LEFT cell. It is
      // intentionally never allowed to flow into the totals/value cell.
      const label = "Rs in Words:";
      const wordsLeft = tableX + 3;
      const wordsRight = totalX - 3;
      const wordsWidth = wordsRight - wordsLeft;
      const wordsYText = wordsY + 6.6;

      pdf.setFont("NotoSans", "bold");
      pdf.setFontSize(7.0);
      const wordLabelW = pdf.getTextWidth(label + " ");
      text(label, wordsLeft, wordsYText, 7.0, true);

      pdf.setFont("NotoSans", "normal");
      pdf.setFontSize(6.8);

      // Reserve the label width on the first line and wrap the amount words
      // strictly to the LEFT cell. Never draw beyond wordsRight.
      const firstLineWidth = Math.max(20, wordsWidth - wordLabelW);
      const firstLines = pdf.splitTextToSize(words, firstLineWidth);
      const firstLine = firstLines[0] || "";
      text(firstLine, wordsLeft + wordLabelW, wordsYText, 6.8, false);

      // Re-wrap the remaining words using the full left-cell width. The
      // section is deliberately limited to two visual lines so it can never
      // enter the totals/value box or collide with the footer.
      const remaining = firstLines.length > 1
        ? firstLines.slice(1).join(" ")
        : "";
      if (remaining) {
        const secondLines = pdf.splitTextToSize(remaining, wordsWidth);
        if (secondLines[0]) {
          text(secondLines[0], wordsLeft, wordsYText + 5.0, 6.8, false);
        }
      }
      return wordsY + wordsH;
    };

    const drawPage = (pageRows, startIndex, isFinal, pageNumber, totalPages) => {
      drawBackground();
      drawBillBox();
      drawTableHeader(tableY);
      let y = tableY + headerH;
      pageRows.forEach((item, i) => {
        drawRow(item, startIndex + i, y);
        y += rowH;
      });

      if (isFinal) {
        // Reserve totals area. If rows somehow overflow, caller should have paginated.
        const totalsStart = y;
        // Make the table's blank left area continue down to totals.
        const blankW = col[0] + col[1] + col[2] + col[3];
        fill(tableX, y, blankW, Math.max(0, totalsStart-y), [255,255,255]);
        line(tableX, y, tableX, totalsStart, [125,125,125]);
        line(tableX+blankW, y, tableX+blankW, totalsStart, [125,125,125]);
        const tableBottom = drawTotals(totalsStart);
        // Redraw the complete outer table border last. This guarantees a
        // continuous visible boundary around header, item rows, totals and
        // the Rs-in-Words row, even after white fills are painted.
        pdf.setDrawColor(105,105,105);
        pdf.setLineWidth(.7);
        pdf.rect(tableX, tableY, tableW, tableBottom - tableY);
      } else {
        // continuation page: a clean continuation marker below the last row
        text("Continued on next page", tableX+tableW/2, Math.min(y+10, footerY-8), 8, false, "center", [110,110,110]);
      }
      text(`Page ${pageNumber} of ${totalPages}`, 201.5, 289.5, 6.2, false, "right", [255,255,255]);
    };

    // Eight item rows are now supported on every A4 page, including the
    // final page with totals, because the compact row/totals dimensions
    // above are calculated to stay above the footer.
    const pages = paginateItems(items);

    pages.forEach((p, idx) => {
      if (idx > 0) pdf.addPage();
      drawPage(p.rows, p.start, p.final, idx+1, pages.length);
    });

    pdf.save(`Invoice-${invoice.number || "000"}.pdf`);

    // Only advance the counter if the number used was the auto-generated one,
    // so manually-typed invoice numbers don't get silently bumped.
    if (invoice.number === getInvoiceNo()) {
      advanceInvoiceNo();
    }
  };

  const reset = () => {
    setItems([makeItem()]);
    setCustomer({ name:"", address:"", gstin:"" });
    setInvoice({ number:getInvoiceNo(), date:today(), service:"Painting Services", cgst:9, sgst:9 });
    setPreviewPage(0);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="brand">Pradeep Enterprises</div>
          <div className="muted">Billing & Invoice Generator</div>
        </div>
        <div className="actions">
          <button className="secondary" onClick={reset}>New Bill</button>
          <button className="primary" onClick={generatePDF}>Download PDF</button>
        </div>
      </header>

      <main className="layout">
        <section className="panel form-panel">
          <h2>Bill Details</h2>

          <div className="grid two">
            <label>Invoice Number<input value={invoice.number} onChange={e=>setInvoice({...invoice,number:e.target.value})}/></label>
            <label>Date<input type="date" value={invoice.date} onChange={e=>setInvoice({...invoice,date:e.target.value})}/></label>
          </div>

          <div className="grid two">
            <label>Customer Name<input value={customer.name} onChange={e=>setCustomer({...customer,name:e.target.value})}/></label>
            <label>Customer GSTIN<input value={customer.gstin} onChange={e=>setCustomer({...customer,gstin:e.target.value})}/></label>
          </div>
          <label>Customer Address<textarea value={customer.address} onChange={e=>setCustomer({...customer,address:e.target.value})}/></label>

          <div className="grid three">
            <label>Service<input value={invoice.service} onChange={e=>setInvoice({...invoice,service:e.target.value})}/></label>
            <label>CGST %<input type="number" value={invoice.cgst} onChange={e=>setInvoice({...invoice,cgst:e.target.value})}/></label>
            <label>SGST %<input type="number" value={invoice.sgst} onChange={e=>setInvoice({...invoice,sgst:e.target.value})}/></label>
          </div>

          <div className="section-title">
            <h2>Items</h2>
            <button className="secondary small" onClick={addItem}>+ Add Item</button>
          </div>

          <div className="items">
            {items.map((item, i) => (
              <div className="item-card" key={i}>
                <div className="item-no">{i+1}</div>
                <label>Particulars<input value={item.particulars} onChange={e=>updateItem(i,"particulars",e.target.value)}/></label>
                <label>Qty<input type="number" step="any" value={item.qty} onChange={e=>updateItem(i,"qty",e.target.value)}/></label>
                <label>Unit<input value={item.unit} onChange={e=>updateItem(i,"unit",e.target.value)}/></label>
                <label>Rate<input type="number" step="any" value={item.rate} onChange={e=>updateItem(i,"rate",e.target.value)}/></label>
                <div className="item-total">{money(Number(item.qty||0)*Number(item.rate||0))}</div>
                <button className="remove" onClick={()=>removeItem(i)} title="Remove item">×</button>
              </div>
            ))}
          </div>

          <div className="summary">
            <div><span>Subtotal</span><strong>{money(totals.subtotal)}</strong></div>
            <div><span>CGST @ {invoice.cgst}%</span><strong>{money(totals.cgst)}</strong></div>
            <div><span>SGST @ {invoice.sgst}%</span><strong>{money(totals.sgst)}</strong></div>
            <div className="grand"><span>Grand Total</span><strong>{money(totals.total)}</strong></div>
          </div>
          <button className="primary full" onClick={generatePDF}>Generate & Download Invoice PDF</button>
        </section>

        <section className="panel preview-panel">
          <div className="preview-head">
            <div><h2>Invoice Preview</h2><span className="muted">PDF uses the supplied Canva layout</span></div>
            <div className="total-pill">{money(totals.total)}</div>
          </div>
          {previewPages.length > 1 && (
            <div className="preview-pager">
              <button
                className="secondary small"
                onClick={() => setPreviewPage(p => Math.max(0, p - 1))}
                disabled={previewPage === 0}
              >
                ‹ Prev
              </button>
              <span>Page {previewPage + 1} of {previewPages.length}</span>
              <button
                className="secondary small"
                onClick={() => setPreviewPage(p => Math.min(previewPages.length - 1, p + 1))}
                disabled={previewPage === previewPages.length - 1}
              >
                Next ›
              </button>
            </div>
          )}
          <div className="preview-frame">
            <div className="invoice-preview">
              <img src="/invoice-bg.png" alt="" />
              <div className="preview-overlay">
                <div className="preview-bill">
                  <div><b>Bill To</b><strong>{customer.name || "Customer Name"}</strong><span>{customer.address || "Customer Address"}</span></div>
                  <div><b>INVOICE</b><strong>Invoice #{invoice.number}</strong><strong>GSTIN No. {business.gstin}</strong><strong>{invoice.date}</strong><strong>{invoice.service}</strong></div>
                </div>
                <div className="preview-table">
                  <div className="preview-row head"><span>SR.NO.</span><span>PARTICULARS</span><span>QNTY</span><span>UNIT</span><span>RATE</span><span>Amount</span></div>
                  {currentPreviewPage.rows.map((it,i)=><div className="preview-row" key={i}><span>{currentPreviewPage.start+i+1}</span><span>{it.particulars}</span><span>{it.qty}</span><span>{it.unit}</span><span>{it.rate}</span><span>{money(Number(it.qty||0)*Number(it.rate||0))}</span></div>)}
                  {currentPreviewPage.final ? (
                    <div className="preview-totals-block">
                      <div className="preview-totals">
                        <div><span>Subtotal</span><b>{money(totals.subtotal)}</b></div>
                        <div><span>CGST @ {invoice.cgst}%</span><b>{money(totals.cgst)}</b></div>
                        <div><span>SGST @ {invoice.sgst}%</span><b>{money(totals.sgst)}</b></div>
                        <div><span>Grand Total</span><b>{money(totals.total)}</b></div>
                      </div>
                      <div className="preview-words">
                        <div className="words-text"><b>Rs in Words:</b> <span>{amountWords(totals.total)}</span></div>
                        <div className="words-blank"></div>
                      </div>
                    </div>
                  ) : (
                    <div className="preview-continued">Continued on next page</div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <p className="note">The PDF generator automatically creates additional A4 pages when the item count exceeds the safe capacity ({FINAL_CAPACITY} rows on the final page, {CONTINUATION_CAPACITY} rows per earlier page). Totals are placed only on the final page.</p>
        </section>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
