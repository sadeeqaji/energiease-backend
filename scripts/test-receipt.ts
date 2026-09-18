import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import fs from 'fs';
import path from 'path';

// Complete logo SVG provided by user
export const ENERGIEASE_LOGO_SVG = `<svg width="201" height="35" viewBox="0 0 201 35" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M66.7373 18.4859C66.7373 11.0848 63.2888 7.04483 56.4726 7.04483C54.7114 7.04483 53.1586 7.37421 51.8276 7.96576C52.2309 7.96576 52.6342 7.96576 53.0376 7.96576H53.9854C54.019 7.96576 54.0593 7.96576 54.1064 7.97249C54.1266 7.97249 54.1534 7.97249 54.1803 7.97921L54.6576 8.01954L54.4022 8.42287C53.8846 9.23625 53.3737 10.0429 52.8561 10.8496L50.2143 15.0039H52.4191C52.4662 14.7014 52.5334 14.419 52.6208 14.1569C52.8426 13.4914 53.1922 12.9536 53.6493 12.5436C54.3551 11.9184 55.3231 11.5957 56.4793 11.5957C58.906 11.5957 60.4319 12.967 60.4319 15.5483H53.9316C53.9249 15.629 53.8913 15.7097 53.8442 15.7769L53.8308 15.7903C53.8308 15.7903 53.8173 15.8105 53.8106 15.8172C52.8762 17.1012 51.9284 18.3985 50.9873 19.6892C50.8798 19.8371 50.7722 19.985 50.6646 20.1329L50.3621 20.5496C49.5488 21.6655 48.6883 22.8419 47.8145 24.0384V24.1393C48.0833 24.556 48.3858 24.9459 48.7219 25.3089C50.5168 27.2718 53.1653 28.428 56.486 28.428C61.0235 28.428 64.0619 26.7071 65.6685 23.9107C66.2399 22.9225 65.4803 21.6857 64.3375 21.6857H64.3106C62.3948 21.6857 60.5597 22.2907 58.8858 23.225C58.3413 23.5275 57.6154 23.7225 56.6339 23.7225C54.5366 23.7225 52.7552 22.5125 52.3922 20.2807C52.3452 20.0051 52.325 19.7161 52.325 19.4136H65.8029C66.3205 19.4136 66.744 18.9901 66.744 18.4725L66.7373 18.4859Z" fill="url(#paint0_linear_397_48)"/>
<path d="M49.1591 15.5887H53.2664C52.3521 16.8457 51.4379 18.1028 50.517 19.3598C50.4094 19.5077 50.3019 19.6556 50.1943 19.8035L49.8918 20.2202C49.4347 20.8454 48.9709 21.484 48.4936 22.1361C47.7475 23.1511 46.9879 24.193 46.2148 25.2417C45.7174 25.9139 45.2267 26.5928 44.7292 27.2651L45.9728 23.8032C46.5375 22.2234 47.1021 20.6437 47.6735 19.0573L47.7407 18.8624L47.808 18.6674H44.252C45.0989 16.3416 45.9459 14.0224 46.7929 11.6966L47.008 11.105C47.1895 10.6008 47.3778 10.0967 47.5593 9.59252C47.687 9.24297 47.8147 8.8867 47.9424 8.53043H48.3525C48.6214 8.53043 48.897 8.53043 49.1658 8.53043C49.6902 8.53043 50.2145 8.53043 50.7388 8.53043C51.5052 8.53043 52.2782 8.53043 53.0445 8.53043H53.6495C53.226 9.19592 52.8025 9.86141 52.379 10.5269L50.1137 14.0829C49.8918 14.4325 49.67 14.7753 49.4482 15.1249L49.1658 15.5685L49.1591 15.5887Z" fill="#00CC66"/>
<path d="M0 27.7423V0H21.0336V5.70711H6.98432V10.6344H19.0909V16.3415H6.98432V22.0487H21.2622V27.7558H0V27.7423Z" fill="white"/>
<path d="M42.9612 14.3182V27.7423H36.75V16.2945C36.75 13.3031 35.7013 12.2948 33.6443 12.2948C31.2781 12.2948 29.9203 13.4981 29.9203 16.2542V27.7423H23.709V7.87836H29.9203V10.7487H30.0009C31.0496 8.92702 32.9856 7.2532 36.5214 7.2532C40.3598 7.2532 42.9612 9.77401 42.9612 14.3182Z" fill="white"/>
<path d="M81.3381 7.87836V13.3099C80.8339 13.2292 80.4844 13.1956 80.0542 13.1956C77.2578 13.1956 74.6966 14.9433 74.6966 18.5128V27.749H68.4854V7.88508H74.6966V11.1453H74.7773C75.7453 9.04801 77.4527 7.73047 79.624 7.73047C80.1685 7.73047 80.6323 7.73047 81.3314 7.88508L81.3381 7.87836Z" fill="white"/>
<path d="M95.972 7.87837H102.183V25.3761C102.183 32.4747 98.3449 34.8409 92.248 34.8409C86.151 34.8409 83.2067 31.5807 82.5076 28.4011H88.7928C89.1827 29.4901 90.0767 30.3774 92.248 30.3774C95.0444 30.3774 95.972 28.9053 95.972 25.3694V24.2065H95.8914C95.1183 25.2551 93.3706 26.808 90.4599 26.808C85.3779 26.808 82.1177 22.7747 82.1177 17.0272C82.1177 11.2798 85.3779 7.24649 90.4599 7.24649C93.3706 7.24649 95.1183 8.79931 95.8914 9.84797H95.972V7.87165V7.87837ZM95.8578 17.0339C95.8578 13.814 94.6948 11.9117 92.174 11.9117C89.6532 11.9117 88.4903 13.814 88.4903 17.0339C88.4903 20.2539 89.6532 22.1562 92.174 22.1562C94.6948 22.1562 95.8578 20.2539 95.8578 17.0339Z" fill="white"/>
<path d="M105.558 5.51216V0H111.769V5.51216H105.558ZM105.558 27.749V7.88509H111.769V27.749H105.558Z" fill="white"/>
<path d="M115.379 27.7423V0H136.413V5.70711H122.363V10.6344H134.47V16.3415H122.363V22.0487H136.641V27.7558H115.379V27.7423Z" fill="white"/>
<path d="M138.47 22.5461C138.47 18.4321 141.844 16.839 146.072 15.9517C148.244 15.4878 151.309 15.1786 151.309 13.1956C151.309 12.1066 150.455 11.4075 148.667 11.4075C146.375 11.4075 145.333 12.3419 145.138 14.2778H139.243C139.438 10.4731 142.227 7.21286 148.943 7.21286C154.334 7.21286 157.325 9.38411 157.325 15.4744V23.1578C157.325 24.2065 157.44 24.6703 158.065 24.6703C158.219 24.6703 158.334 24.6703 158.569 24.63V27.581C157.325 27.8163 156.048 27.9305 155.154 27.9305C152.674 27.9305 151.739 26.9962 151.43 25.3291H151.349C149.951 27.0768 147.666 28.354 144.788 28.354C140.91 28.354 138.463 26.0618 138.463 22.5326L138.47 22.5461ZM151.316 19.7161V18.049C150.502 18.3582 149.568 18.5935 147.941 18.9766C145.649 19.5211 144.835 20.4891 144.835 21.8873C144.835 23.3998 145.803 24.0989 147.397 24.0989C149.877 24.0989 151.316 22.0016 151.316 19.7161Z" fill="white"/>
<path d="M160.162 21.1479H165.983C166.178 23.1242 167.495 24.0989 169.862 24.0989C171.683 24.0989 172.503 23.5141 172.503 22.3915C172.503 20.6034 170.527 20.4152 167.65 19.7497C164.155 18.9363 160.552 17.5381 160.552 13.5048C160.552 9.78073 163.657 7.25992 169.243 7.25992C175.609 7.25992 178.09 10.4798 178.285 13.9753H172.463C172.268 12.3822 171.415 11.5285 169.358 11.5285C167.65 11.5285 166.911 12.1469 166.911 13.1216C166.911 14.4392 168.074 14.5198 171.065 15.2189C174.984 16.1466 178.863 17.3163 178.863 21.9344C178.863 26.0887 175.717 28.3742 169.976 28.3742C163.032 28.3742 160.316 25.04 160.162 21.1546V21.1479Z" fill="white"/>
<path d="M200.986 19.4808H186.708C186.708 22.2369 188.651 23.7493 190.977 23.7493C193.302 23.7493 194.123 22.741 194.506 21.7327H200.831C199.709 25.766 196.408 28.4078 190.822 28.4078C184.382 28.4078 180.503 24.025 180.503 17.8137C180.503 11.9923 184.154 7.21957 190.822 7.21957C197.49 7.21957 200.986 11.2193 200.986 18.5531V19.4875V19.4808ZM194.741 15.6424C194.741 13.0813 193.228 11.7234 190.822 11.7234C188.415 11.7234 186.903 13.0813 186.748 15.6424H194.741Z" fill="white"/>
<defs>
<linearGradient id="paint0_linear_397_48" x1="47.8077" y1="17.7398" x2="66.7373" y2="17.7398" gradientUnits="userSpaceOnUse">
<stop stop-color="#00CC66"/>
<stop offset="1" stop-color="#007BFF"/>
</linearGradient>
</defs>
</svg>`;

// Faint translucent watermark emblem (fill-opacity="0.045")
export const ENERGIEASE_EMBLEM_WATERMARK_SVG = `<svg width="300" height="300" viewBox="42 7 26 23" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M66.7373 18.4859C66.7373 11.0848 63.2888 7.04483 56.4726 7.04483C54.7114 7.04483 53.1586 7.37421 51.8276 7.96576C52.2309 7.96576 52.6342 7.96576 53.0376 7.96576H53.9854C54.019 7.96576 54.0593 7.96576 54.1064 7.97249C54.1266 7.97249 54.1534 7.97249 54.1803 7.97921L54.6576 8.01954L54.4022 8.42287C53.8846 9.23625 53.3737 10.0429 52.8561 10.8496L50.2143 15.0039H52.4191C52.4662 14.7014 52.5334 14.419 52.6208 14.1569C52.8426 13.4914 53.1922 12.9536 53.6493 12.5436C54.3551 11.9184 55.3231 11.5957 56.4793 11.5957C58.906 11.5957 60.4319 12.967 60.4319 15.5483H53.9316C53.9249 15.629 53.8913 15.7097 53.8442 15.7769L53.8308 15.7903C53.8308 15.7903 53.8173 15.8105 53.8106 15.8172C52.8762 17.1012 51.9284 18.3985 50.9873 19.6892C50.8798 19.8371 50.7722 19.985 50.6646 20.1329L50.3621 20.5496C49.5488 21.6655 48.6883 22.8419 47.8145 24.0384V24.1393C48.0833 24.556 48.3858 24.9459 48.7219 25.3089C50.5168 27.2718 53.1653 28.428 56.486 28.428C61.0235 28.428 64.0619 26.7071 65.6685 23.9107C66.2399 22.9225 65.4803 21.6857 64.3375 21.6857H64.3106C62.3948 21.6857 60.5597 22.2907 58.8858 23.225C58.3413 23.5275 57.6154 23.7225 56.6339 23.7225C54.5366 23.7225 52.7552 22.5125 52.3922 20.2807C52.3452 20.0051 52.325 19.7161 52.325 19.4136H65.8029C66.3205 19.4136 66.744 18.9901 66.744 18.4725L66.7373 18.4859Z" fill="#007BFF" fill-opacity="0.045"/>
<path d="M49.1591 15.5887H53.2664C52.3521 16.8457 51.4379 18.1028 50.517 19.3598C50.4094 19.5077 50.3019 19.6556 50.1943 19.8035L49.8918 20.2202C49.4347 20.8454 48.9709 21.484 48.4936 22.1361C47.7475 23.1511 46.9879 24.193 46.2148 25.2417C45.7174 25.9139 45.2267 26.5928 44.7292 27.2651L45.9728 23.8032C46.5375 22.2234 47.1021 20.6437 47.6735 19.0573L47.7407 18.8624L47.808 18.6674H44.252C45.0989 16.3416 45.9459 14.0224 46.7929 11.6966L47.008 11.105C47.1895 10.6008 47.3778 10.0967 47.5593 9.59252C47.687 9.24297 47.8147 8.8867 47.9424 8.53043H48.3525C48.6214 8.53043 48.897 8.53043 49.1658 8.53043C49.6902 8.53043 50.2145 8.53043 50.7388 8.53043C51.5052 8.53043 52.2782 8.53043 53.0445 8.53043H53.6495C53.226 9.19592 52.8025 9.86141 52.379 10.5269L50.1137 14.0829C49.8918 14.4325 49.67 14.7753 49.4482 15.1249L49.1658 15.5685L49.1591 15.5887Z" fill="#00CC66" fill-opacity="0.045"/>
</svg>`;

export interface ReceiptData {
  meterNumber: string;
  customerName: string;
  transactionType?: string;
  address?: string;
  discoHotline?: string;
  vendType?: string;
  unit?: string | number;
  transactionId: string;
  token: string;
  amount: number;
  date?: Date | string;
}

export function generateReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: `Receipt - ${data.transactionId}`,
          Author: 'EnergiEase Bot',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const margin = 40;
      const contentWidth = pageWidth - margin * 2;

      // ==========================================
      // 1. HEADER BANNER
      // ==========================================
      const bannerX = margin;
      const bannerY = 36;
      const bannerHeight = 86;
      const bannerRadius = 10;

      doc.save();
      // Deep navy banner background
      doc.roundedRect(bannerX, bannerY, contentWidth, bannerHeight, bannerRadius)
         .fill('#162D80');

      // Subtle chevron/angled decorative slashes across the banner
      doc.save();
      doc.roundedRect(bannerX, bannerY, contentWidth, bannerHeight, bannerRadius).clip();
      doc.fillColor('#1E3A8A').opacity(0.35);
      for (let i = bannerX - 20; i < bannerX + contentWidth + 60; i += 44) {
        doc.polygon(
          [i, bannerY],
          [i + 30, bannerY],
          [i + 10, bannerY + bannerHeight],
          [i - 20, bannerY + bannerHeight]
        ).fill();
      }
      doc.restore();

      // Render exact SVG Logo inside banner (left-aligned)
      SVGtoPDF(doc, ENERGIEASE_LOGO_SVG, bannerX + 24, bannerY + 26, {
        width: 175,
        height: 34,
        preserveAspectRatio: 'xMinYMid meet',
      });

      // Right-aligned banner text: "Transaction Receipt"
      doc.fillColor('#FFFFFF')
         .fontSize(14)
         .font('Helvetica-Bold')
         .text('Transaction Receipt', bannerX + contentWidth - 230, bannerY + 36, {
           width: 206,
           align: 'right',
         });
      doc.restore();

      // ==========================================
      // 2. DATE & TIME (Top Right below banner)
      // ==========================================
      const dateObj = data.date ? new Date(data.date) : new Date();
      const formattedDate = formatReceiptDate(dateObj);

      doc.fillColor('#334155')
         .fontSize(10.5)
         .font('Helvetica-Oblique')
         .text(formattedDate, bannerX, bannerY + bannerHeight + 14, {
           width: contentWidth,
           align: 'right',
         });

      // ==========================================
      // 3. TOKEN SECTION (Centered)
      // ==========================================
      const tokenStartY = bannerY + bannerHeight + 52;

      doc.fillColor('#94A3B8')
         .fontSize(11)
         .font('Helvetica')
         .text('Token', margin, tokenStartY, {
           width: contentWidth,
           align: 'center',
         });

      // Format token in 4-digit hyphenated chunks (e.g. 4636-9394-1246-9727-5164)
      const formattedToken = formatTokenHyphenated(data.token);

      doc.fillColor('#0F172A')
         .fontSize(22)
         .font('Helvetica-Bold')
         .text(formattedToken, margin, tokenStartY + 18, {
           width: contentWidth,
           align: 'center',
         });

      // ==========================================
      // 4. WATERMARK BEHIND TABLE
      // ==========================================
      const tableStartY = tokenStartY + 68;
      const watermarkWidth = 320;
      const watermarkHeight = 300;
      const watermarkX = (pageWidth - watermarkWidth) / 2;
      const watermarkY = tableStartY - 10;

      doc.save();
      SVGtoPDF(doc, ENERGIEASE_EMBLEM_WATERMARK_SVG, watermarkX, watermarkY, {
        width: watermarkWidth,
        height: watermarkHeight,
        preserveAspectRatio: 'xMidYMid meet',
      });
      doc.restore();

      // ==========================================
      // 5. RECEIPT DETAILS TABLE
      // ==========================================
      const rows: [string, string][] = [
        ['Meter Number', data.meterNumber || 'N/A'],
        ['Customer Name', (data.customerName || 'Customer').toUpperCase()],
        ['Transaction Type', data.transactionType || 'Electricity'],
        ['Address', data.address || 'N/A'],
        ['Disco Hotline', data.discoHotline || '07067307317'],
        ['Vend Type', data.vendType || 'Prepaid'],
        ['Unit', formatUnits(data.unit)],
        ['Transaction ID', data.transactionId || 'N/A'],
      ];

      let currentY = tableStartY;
      const labelColWidth = 140;
      const valueColWidth = contentWidth - labelColWidth - 10;
      const valueColX = margin + labelColWidth + 10;

      for (const [label, value] of rows) {
        doc.fillColor('#94A3B8')
           .fontSize(10.5)
           .font('Helvetica')
           .text(label, margin, currentY, { width: labelColWidth });

        // Calculate height for multi-line values (like Address)
        const valueHeight = doc.heightOfString(value, {
          width: valueColWidth,
          align: 'right',
        });

        doc.fillColor('#0F172A')
           .fontSize(10.5)
           .font('Helvetica-Bold')
           .text(value, valueColX, currentY, {
             width: valueColWidth,
             align: 'right',
           });

        const rowHeight = Math.max(valueHeight, 14);
        currentY += rowHeight + 15;
      }

      // ==========================================
      // 6. DASHED DIVIDER LINE
      // ==========================================
      const dividerY = currentY + 10;
      doc.save();
      doc.strokeColor('#CBD5E1')
         .lineWidth(0.8)
         .dash(4, { space: 3 })
         .moveTo(margin, dividerY)
         .lineTo(pageWidth - margin, dividerY)
         .stroke();
      doc.restore();

      // ==========================================
      // 7. AMOUNT BLOCK (₦ 2,000  Successful)
      // ==========================================
      const amountBlockY = dividerY + 28;
      const formattedAmount = Number(data.amount || 0).toLocaleString();

      const nairaSymbolWidth = 13;
      const amountText = ` ${formattedAmount}`;
      doc.font('Helvetica-Bold').fontSize(26);
      const amountTextWidth = doc.widthOfString(amountText);

      doc.font('Helvetica').fontSize(13.5);
      const successfulText = '  Successful';
      const successfulTextWidth = doc.widthOfString(successfulText);

      const totalBlockWidth = nairaSymbolWidth + amountTextWidth + successfulTextWidth;
      const startBlockX = (pageWidth - totalBlockWidth) / 2;

      // Draw vector Naira sign (N with dual crossbars) in vibrant blue #0070F3 - positioned like superscript
      drawNairaSymbol(doc, startBlockX, amountBlockY + 3, 16, '#0070F3');

      // Draw amount in vibrant blue #0070F3
      doc.fillColor('#0070F3')
         .font('Helvetica-Bold')
         .fontSize(26)
         .text(amountText, startBlockX + nairaSymbolWidth - 2, amountBlockY, { lineBreak: false });

      // Draw "Successful" in soft gray #64748B
      doc.fillColor('#94A3B8')
         .font('Helvetica')
         .fontSize(13.5)
         .text(successfulText, startBlockX + nairaSymbolWidth + amountTextWidth, amountBlockY + 8, { lineBreak: false });

      // ==========================================
      // 8. FOOTER
      // ==========================================
      const footerY = doc.page.height - 60;

      // Left: support@energiease.ng
      doc.fillColor('#0F172A')
         .font('Helvetica-Bold')
         .fontSize(9.5)
         .text('support@energiease.ng', margin, footerY, {
           width: contentWidth / 2,
           align: 'left',
         });

      // Right: energiease.ng
      doc.fillColor('#0F172A')
         .font('Helvetica-Oblique')
         .fontSize(9.5)
         .text('energiease.ng', margin + contentWidth / 2, footerY, {
           width: contentWidth / 2,
           align: 'right',
         });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Custom vector Naira symbol (U+20A6) renderer.
 */
function drawNairaSymbol(doc: PDFKit.PDFDocument, x: number, y: number, size: number, color: string) {
  doc.save();
  doc.fillColor(color).strokeColor(color);

  // Draw base capital 'N'
  doc.font('Helvetica-Bold').fontSize(size).text('N', x, y, { lineBreak: false });

  // Draw dual horizontal crossbars across the N
  const barY1 = y + size * 0.44;
  const barY2 = y + size * 0.60;
  const barWidth = size * 0.72;
  const barLineWidth = Math.max(1.1, size * 0.08);

  doc.lineWidth(barLineWidth)
     .moveTo(x - 0.5, barY1)
     .lineTo(x + barWidth + 0.5, barY1)
     .stroke();

  doc.lineWidth(barLineWidth)
     .moveTo(x - 0.5, barY2)
     .lineTo(x + barWidth + 0.5, barY2)
     .stroke();

  doc.restore();
}

/**
 * Format date like "6 Jul, 2024 - 23:05"
 */
function formatReceiptDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day} ${month}, ${year} - ${hours}:${minutes}`;
}

/**
 * Format token in 4-digit hyphenated chunks (e.g. 4636-9394-1246-9727-5164)
 */
function formatTokenHyphenated(token: string): string {
  if (!token) return 'N/A';
  const clean = token.replace(/[^0-9]/g, '');
  if (clean.length === 20) {
    return clean.match(/.{1,4}/g)?.join('-') || token;
  }
  return token;
}

function formatUnits(unit?: string | number): string {
  if (!unit) return 'N/A';
  const str = String(unit).trim();
  if (str.toLowerCase().includes('kwh')) return str;
  return `${str} KWh`;
}

async function main() {
  console.log('Testing DISCO hotline lookups:');
  const discos = ['AEDC', 'EKEDC', 'IKEDC', 'IBEDC', 'EEDC', 'PHED', 'KEDCO', 'JED', 'KAEDCO', 'BEDC', 'YEDC', 'UNKNOWN'];
  for (const disco of discos) {
    const { getDiscoHotline } = await import('../src/services/receipt.service');
    console.log(`  ${disco} -> ${getDiscoHotline(disco)}`);
  }

  const { default: receiptService } = await import('../src/services/receipt.service');

  const testCases: Array<{ name: string; data: any }> = [
    {
      name: 'standard_prepaid',
      data: {
        meterNumber: '45066869087',
        customerName: 'IKECHUKWU ANEKE',
        transactionType: 'Electricity',
        address: 'PLT AT 359 APO MECHANIC ESTATE Und St. Apo Mechanic',
        discoHotline: '0803700000131',
        vendType: 'Prepaid',
        unit: '14.7 KWh',
        transactionId: '1324567ysdaca42536524',
        token: '46369394124697275164',
        amount: 2000,
        date: new Date('2024-07-06T23:05:00'),
      }
    },
    {
      name: 'postpaid_long_address',
      data: {
        meterNumber: '0101150024921',
        customerName: 'FATIMA MOHAMMED BELLO',
        transactionType: 'Electricity',
        address: 'PLOT 1244, CADASTRAL ZONE B06, MABUSHI DISTRICT, NEAR FEDERAL MINISTRY OF WORKS, ABUJA, FCT',
        discoHotline: '08039020251',
        vendType: 'Postpaid',
        unit: 'N/A',
        transactionId: 'EE-984210-A1B2C3',
        token: '',
        amount: 50000,
        date: new Date(),
      }
    }
  ];

  for (const tc of testCases) {
    const buffer = await receiptService.generateReceiptPdf(tc.data);
    const outPath = path.join(__dirname, `test_receipt_${tc.name}.pdf`);
    fs.writeFileSync(outPath, buffer);
    console.log(`Generated ${tc.name} receipt successfully (${buffer.length} bytes) at ${outPath}`);
  }
}

if (require.main === module) {
  main().catch(console.error);
}
