import { Router } from 'express';
import jwt from 'jsonwebtoken';
import PDFDocument from 'pdfkit';
import { createCanvas } from 'canvas';
import JsBarcode from 'jsbarcode';
import fs from 'fs';
import path from 'path';
import os from 'os';
import pdfToPrinter from 'pdf-to-printer';
import { exec } from 'child_process';
import { promisify } from 'util';
import { pool } from '../db.ts';
import { ESCPOSPrinter, findPrinterDevice } from '../utils/escposPrinter.ts';

const execPromise = promisify(exec);
const router = Router();

// Helper function to get printer settings from database
async function getPrinterSettings() {
  try {
    const result = await pool.query('SELECT * FROM printer_settings ORDER BY setting_id DESC LIMIT 1');
    if (result.rows.length === 0) {
      // Return defaults if no settings found
      return {
        printer_name: 'Printer_POS-80',
        font_header: 13,
        font_items: 6,
        font_subtotal: 6,
        font_total: 8,
        font_payment: 7,
        margin_top: 10,
        margin_bottom: 10,
        footer_spacing: 20,
        paper_height: 842,
        line_spacing: 12,
        align_header: 'center',
        align_items: 'left',
        align_totals: 'right',
        align_payment: 'left',
        align_footer: 'center'
      };
    }
    return result.rows[0];
  } catch (error) {
    console.error('Error fetching printer settings:', error);
    // Return defaults on error
    return {
      printer_name: 'Printer_POS-80',
      font_header: 13,
      font_items: 6,
      font_subtotal: 6,
      font_total: 8,
      font_payment: 7,
      margin_top: 10,
      margin_bottom: 10,
      footer_spacing: 20,
      paper_height: 842,
      line_spacing: 12,
      align_header: 'center',
      align_items: 'left',
      align_totals: 'right',
      align_payment: 'left',
      align_footer: 'center'
    };
  }
}

/**
 * Get a writable temporary directory for PDF generation
 * Uses user's config directory first, falls back to system temp
 */
function getTempDirectory(): string {
  // Try user config directory first (preferred for Electron apps)
  const userHome = process.env.HOME || os.homedir();
  const configDir = path.join(userHome, '.config', 'bloomswiftpos', 'temp');
  
  // Fallback to system temp directory
  const fallbackDir = path.join(os.tmpdir(), `bloomswiftpos-${process.env.USER || 'user'}`);
  
  // Try to use config directory if accessible
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true, mode: 0o755 });
    }
    // Test write access
    fs.accessSync(configDir, fs.constants.W_OK);
    return configDir;
  } catch (error) {
    console.warn('Could not create/access user temp directory, using system temp:', error);
    try {
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true, mode: 0o755 });
      }
      return fallbackDir;
    } catch (fallbackError) {
      console.error('Could not create system temp directory:', fallbackError);
      // Last resort: use OS temp directly
      return os.tmpdir();
    }
  }
}

// Get printer name from environment variable or use default
const THERMAL_PRINTER_NAME = process.env.THERMAL_PRINTER_NAME || 'Printer_POS-80';

// Detect operating system
const isWindows = process.platform === 'win32';
const isLinux = process.platform === 'linux';
const isMac = process.platform === 'darwin';

/**
 * Cross-platform print function
 * Uses CUPS (lpr) on Linux/macOS and pdf-to-printer on Windows
 */
async function printPDF(pdfPath: string, printerName: string, options: { scale?: 'noscale' | 'fit' | 'shrink' } = {}): Promise<void> {
  console.log('🖨️  [PRINT] ===== printPDF CALLED =====');
  console.log('🖨️  [PRINT] Platform:', process.platform);
  console.log('🖨️  [PRINT] isWindows:', isWindows);
  console.log('🖨️  [PRINT] isLinux:', isLinux);
  console.log('🖨️  [PRINT] isMac:', isMac);
  console.log('🖨️  [PRINT] PDF path:', pdfPath);
  console.log('🖨️  [PRINT] Printer name:', printerName);
  console.log('🖨️  [PRINT] Options:', options);

  if (isWindows) {
    console.log('🖨️  [PRINT] Using Windows printing (pdf-to-printer)');
    // Windows: use pdf-to-printer
    await pdfToPrinter.print(pdfPath, {
      printer: printerName,
      scale: options.scale || 'noscale'
    });
    console.log('🖨️  [PRINT] Windows print completed');
  } else if (isLinux || isMac) {
    console.log('🖨️  [PRINT] Using Linux/Mac printing (CUPS lpr)');
    // Linux/macOS: use simple CUPS lpr command - let printer handle PDF naturally
    const command = `lpr -P "${printerName}" "${pdfPath}"`;
    
    console.log('🖨️  [PRINT] Executing command:', command);
    
    try {
      const result = await execPromise(command);
      console.log('🖨️  [PRINT] Command executed successfully');
      console.log('🖨️  [PRINT] stdout:', result.stdout);
      console.log('🖨️  [PRINT] stderr:', result.stderr);
    } catch (error: any) {
      console.error('🖨️  [PRINT] Command failed!');
      console.error('🖨️  [PRINT] Error code:', error.code);
      console.error('🖨️  [PRINT] Error message:', error.message);
      console.error('🖨️  [PRINT] stdout:', error.stdout);
      console.error('🖨️  [PRINT] stderr:', error.stderr);
      // Provide more helpful error message
      throw new Error(`Failed to print via CUPS: ${error.message}. Make sure CUPS is running and printer "${printerName}" is configured.`);
    }
    console.log('🖨️  [PRINT] Linux/Mac print completed');
  } else {
    console.error('🖨️  [PRINT] Unsupported OS!');
    throw new Error(`Unsupported operating system: ${process.platform}`);
  }
  console.log('🖨️  [PRINT] ===== printPDF COMPLETED =====');
}

// Helper function to check if CUPS is running
async function checkCUPSStatus(): Promise<{ running: boolean; error?: string }> {
  try {
    const { stdout } = await execPromise('systemctl is-active cups 2>&1 || service cups status 2>&1 || echo "unknown"');
    const isRunning = stdout.includes('active') || stdout.includes('running');
    return { running: isRunning, error: isRunning ? undefined : 'CUPS service not running' };
  } catch (error: any) {
    return { running: false, error: error.message };
  }
}

// Helper function to get available printers using lpstat
async function getAvailablePrinters(): Promise<{ printers: string[]; error?: string }> {
  try {
    // Try lpstat first (more reliable on Linux)
    try {
      const { stdout } = await execPromise('lpstat -p 2>&1');
      const printers = stdout
        .split('\n')
        .filter(line => line.startsWith('printer'))
        .map(line => line.split(' ')[1])
        .filter(Boolean);
      
      if (printers.length > 0) {
        return { printers };
      }
    } catch {}

    // Fallback to pdf-to-printer's getPrinters
    const printers = await pdfToPrinter.getPrinters();
    return { printers: printers.map(p => p.name || p.deviceId || String(p)) };
  } catch (error: any) {
    return { printers: [], error: error.message };
  }
}

// Helper function to validate printer exists
async function validatePrinter(printerName: string): Promise<{ valid: boolean; error?: string; availablePrinters?: string[] }> {
  try {
    const cupsStatus = await checkCUPSStatus();
    if (!cupsStatus.running) {
      return {
        valid: false,
        error: `CUPS printing system is not running. Please start CUPS:\n  sudo systemctl start cups\nOr install it:\n  sudo apt install cups`
      };
    }

    const { printers, error } = await getAvailablePrinters();
    
    if (error) {
      return {
        valid: false,
        error: `Cannot detect printers: ${error}`,
        availablePrinters: []
      };
    }

    if (printers.length === 0) {
      return {
        valid: false,
        error: 'No printers found. Please configure your printer:\n  1. Open http://localhost:631 in browser\n  2. Administration > Add Printer\n  3. Select your XP-80C printer',
        availablePrinters: []
      };
    }

    const printerExists = printers.some(p => p === printerName || p.toLowerCase().includes(printerName.toLowerCase()));
    
    if (!printerExists) {
      return {
        valid: false,
        error: `Printer "${printerName}" not found.\n\nAvailable printers:\n${printers.map(p => `  - ${p}`).join('\n')}\n\nTo fix:\n1. Check printer name in Settings\n2. Or configure printer at http://localhost:631`,
        availablePrinters: printers
      };
    }

    return { valid: true };
  } catch (error: any) {
    return {
      valid: false,
      error: `Printer validation error: ${error.message}`,
      availablePrinters: []
    };
  }
}

router.post('/barcode', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).send('Server misconfigured');
  if (!token) return res.status(401).send('Unauthorized');
  
  try {
    jwt.verify(token, secret);
  } catch {
    return res.status(401).send('Unauthorized');
  }

  const { product_name, barcode_value, price, printer_type } = req.body as {
    product_name?: string;
    barcode_value?: string;
    price?: string;
    printer_type?: 'thermal' | 'normal';
  };

  if (!product_name || !barcode_value) {
    return res.status(400).send('Missing product_name or barcode_value');
  }

  const printerType = printer_type || 'thermal'; // Default to thermal for backward compatibility

  const tempDir = getTempDirectory();
  const pdfPath = path.join(tempDir, `barcode_${Date.now()}.pdf`);

  try {
    console.log('Generating barcode for:', product_name);
    console.log('Barcode value:', barcode_value);
    console.log('Using temp directory:', tempDir);

    // Temp directory is already created by getTempDirectory()

    // Generate barcode image - horizontal, scannable
    const canvas = createCanvas(600, 100);
    JsBarcode(canvas, barcode_value, {
      format: 'CODE128',
      width: 2,
      height: 60,
      displayValue: true,
      fontSize: 14,
      margin: 2,
    });
    const barcodeImage = canvas.toDataURL('image/png');

    // Create PDF document - simple portrait
    const doc = new PDFDocument({
      size: [226, 150], // 80mm x ~53mm
      margins: { top: 5, bottom: 5, left: 5, right: 5 }
    });

    // Pipe to file
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    // Product name on LEFT
    doc.fontSize(11)
       .font('Helvetica-Bold')
       .text(product_name, 5, 5, { 
         align: 'left',
         width: 110
       });

    // Price on RIGHT - same line
    if (price) {
      const formattedPrice = `Rs. ${Number(price).toFixed(2)}`;
      doc.fontSize(11)
         .font('Helvetica-Bold')
         .text(formattedPrice, 120, 5, { 
           align: 'right',
           width: 101
         });
    }

    // Barcode - horizontal, centered below
    const barcodeBuffer = Buffer.from(barcodeImage.split(',')[1], 'base64');
    doc.image(barcodeBuffer, 13, 25, {
      width: 200,
      height: 70
    });

    // Finalize PDF
    doc.end();

    // Wait for PDF to be written
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    console.log('PDF generated at:', pdfPath);

    if (printerType === 'thermal') {
      // Print directly to thermal printer
      console.log('Sending to printer: Printer_POS-80');

      await printPDF(pdfPath, 'Printer_POS-80', { scale: 'noscale' });

      console.log('Print job sent successfully!');

      // Clean up PDF file after a delay
      setTimeout(() => {
        try {
          if (fs.existsSync(pdfPath)) {
            fs.unlinkSync(pdfPath);
            console.log('Temp PDF cleaned up');
          }
        } catch (err) {
          console.error('Error cleaning up PDF:', err);
        }
      }, 5000);

      res.json({
        success: true,
        message: 'Barcode printed successfully to thermal printer',
      });
    } else {
      // Return PDF for normal printer (browser printing)
      console.log('Returning PDF for browser printing');

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="barcode_${Date.now()}.pdf"`);
      
      const pdfBuffer = fs.readFileSync(pdfPath);
      res.send(pdfBuffer);

      // Clean up PDF file after a delay
      setTimeout(() => {
        try {
          if (fs.existsSync(pdfPath)) {
            fs.unlinkSync(pdfPath);
            console.log('Temp PDF cleaned up');
          }
        } catch (err) {
          console.error('Error cleaning up PDF:', err);
        }
      }, 5000);
    }
  } catch (error: any) {
    console.error('Print error:', error);
    console.error('Error stack:', error?.stack);
    
    // Clean up PDF file on error
    try {
      if (fs.existsSync(pdfPath)) {
        fs.unlinkSync(pdfPath);
      }
    } catch (err) {
      // Ignore cleanup errors
    }
    
    res.status(500).send(error?.message || 'Failed to print barcode');
  }
});

router.post('/receipt', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).send('Server misconfigured');
  if (!token) return res.status(401).send('Unauthorized');
  
  try {
    jwt.verify(token, secret);
  } catch {
    return res.status(401).send('Unauthorized');
  }

  const { 
    invoice_no, 
    date, 
    customer_name, 
    items, 
    discount, 
    total_amount, 
    payment_type,
    amount_given,
    change_amount
  } = req.body as {
    invoice_no?: string;
    date?: string;
    customer_name?: string;
    items?: Array<{ product_name: string; qty: number; selling_price: number }>;
    discount?: number;
    total_amount?: number;
    payment_type?: string;
    amount_given?: number;
    change_amount?: number;
  };

  if (!items || items.length === 0) {
    return res.status(400).send('No items to print');
  }

  try {
    console.log('🖨️  Printing receipt via ESC/POS for invoice:', invoice_no);

    // Find printer device
    const printerDevice = await findPrinterDevice();
    if (!printerDevice) {
      return res.status(500).json({
        success: false,
        message: 'No thermal printer device found',
        error: 'Please connect your thermal printer via USB'
      });
    }

    console.log('🖨️  Using ESC/POS printer device:', printerDevice);

    // Get printer settings from database
    const dbSettings = await getPrinterSettings();
    console.log('Using printer settings:', dbSettings);

    // Initialize ESC/POS printer
    const escposPrinter = new ESCPOSPrinter(printerDevice);

    // Print receipt using ESC/POS
    await escposPrinter.printReceipt({
      invoice_no,
      date,
      customer_name,
      items,
      discount,
      total_amount: total_amount || 0,
      payment_type,
      amount_given,
      change_amount
    }, dbSettings);

    console.log('✅ Receipt printed successfully via ESC/POS!');

    res.json({
      success: true,
      message: 'Receipt printed successfully via ESC/POS',
      method: 'ESC/POS Direct'
    });
  } catch (error: any) {
    console.error('❌ ESC/POS receipt print error:', error);
    res.status(500).json({
      success: false,
      message: 'ESC/POS print failed',
      error: error?.message || 'Unknown error'
    });
  }
});

// Endpoint to get available printers
router.get('/printers', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).send('Server misconfigured');
  if (!token) return res.status(401).send('Unauthorized');
  
  try {
    jwt.verify(token, secret);
  } catch {
    return res.status(401).send('Unauthorized');
  }

  try {
    console.log('Fetching available printers...');

    const cupsStatus = await checkCUPSStatus();
    const { printers, error } = await getAvailablePrinters();

    res.json({
      success: true,
      cupsRunning: cupsStatus.running,
      currentPrinter: THERMAL_PRINTER_NAME,
      printers: printers || [],
      error: error || cupsStatus.error,
    });
  } catch (error: any) {
    console.error('Error fetching printers:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to fetch printers',
      printers: []
    });
  }
});

// Endpoint to test printer connection
router.post('/test-printer', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).send('Server misconfigured');
  if (!token) return res.status(401).send('Unauthorized');
  
  try {
    jwt.verify(token, secret);
  } catch {
    return res.status(401).send('Unauthorized');
  }

  const { printerName } = req.body as { printerName?: string };
  const testPrinter = printerName || THERMAL_PRINTER_NAME;

  try {
    console.log('Testing printer:', testPrinter);

    const validation = await validatePrinter(testPrinter);
    
    if (!validation.valid) {
      return res.json({
        success: false,
        message: 'Printer test failed',
        error: validation.error,
        availablePrinters: validation.availablePrinters || []
      });
    }

    // Try sending a test print job
    try {
      const tempDir = getTempDirectory();
      const testPdfPath = path.join(tempDir, `test_${Date.now()}.pdf`);
      const doc = new PDFDocument({
        size: [226.77, 100],
        margins: { top: 10, bottom: 10, left: 10, right: 10 }
      });

      const stream = fs.createWriteStream(testPdfPath);
      doc.pipe(stream);

      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('Test Print', 10, 20, { align: 'center', width: 206.77 });
      
      doc.fontSize(9)
         .font('Helvetica')
         .text(`Printer: ${testPrinter}`, 10, 40, { align: 'center', width: 206.77 });
      
      doc.fontSize(9)
         .text(new Date().toLocaleString(), 10, 55, { align: 'center', width: 206.77 });

      doc.end();

      await new Promise<void>((resolve, reject) => {
        stream.on('finish', () => resolve());
        stream.on('error', reject);
      });

      await printPDF(testPdfPath, testPrinter, { scale: 'noscale' });

      // Clean up test file
      setTimeout(() => {
        try {
          if (fs.existsSync(testPdfPath)) {
            fs.unlinkSync(testPdfPath);
          }
        } catch (err) {
          console.error('Error cleaning up test PDF:', err);
        }
      }, 5000);

      res.json({
        success: true,
        message: `Test print sent to ${testPrinter} successfully!`,
      });
    } catch (printError: any) {
      console.error('Print test error:', printError);
      res.json({
        success: false,
        message: 'Printer connection is valid but test print failed',
        error: printError.message
      });
    }
  } catch (error: any) {
    console.error('Printer test error:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to test printer'
    });
  }
});

// Test print with sample receipt using current settings
router.post('/test-receipt', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).send('Server misconfigured');
  if (!token) return res.status(401).send('Unauthorized');
  
  try {
    jwt.verify(token, secret);
  } catch {
    return res.status(401).send('Unauthorized');
  }

  try {
    // Get printer settings from database
    const settings = await getPrinterSettings();
    
    console.log('Generating test receipt with settings:', settings);

    const tempDir = getTempDirectory();
    const pdfPath = path.join(tempDir, `test_receipt_${Date.now()}.pdf`);

    // Sample receipt data
    const sampleData = {
      invoice_no: 'TEST-001',
      date: new Date().toISOString(),
      customer_name: 'Sample Customer',
      items: [
        { product_name: 'Sample Product 1', qty: 2, selling_price: 150.00 },
        { product_name: 'Long Product Name Example Item', qty: 1, selling_price: 450.00 },
        { product_name: 'Test Item 3', qty: 5, selling_price: 75.50 }
      ],
      discount: 10,
      total_amount: 540.00,
      payment_type: 'Cash Payment',
      amount_given: 1000.00,
      change_amount: 460.00
    };

    // Create PDF with dynamic settings
    const doc = new PDFDocument({
      size: [226.77, settings.paper_height || 842],
      margins: { 
        top: settings.margin_top || 10, 
        bottom: settings.margin_bottom || 10, 
        left: 0, 
        right: 3 
      }
    });

    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    const centerWidth = 226.77 - 0 - 3;
    let yPos = settings.margin_top || 10;

    // Header - Company Name
    doc.fontSize(settings.font_header || 13)
       .font('Helvetica-Bold')
       .text('Demo POS System', 0, yPos, { align: settings.align_header || 'center', width: centerWidth });
    yPos += (settings.line_spacing || 12) + 6;

    // Address
    doc.fontSize(9)
       .font('Helvetica')
       .text('No.04, 8th Mile Post, Hansayapalama, Aralaganwila', 0, yPos, { align: settings.align_header || 'center', width: centerWidth });
    yPos += settings.line_spacing || 12;

    // Phone
    doc.fontSize(9)
       .text('0272050404 / 0766132181', 0, yPos, { align: settings.align_header || 'center', width: centerWidth });
    yPos += settings.line_spacing || 12;

    // Powered by
    doc.fontSize(8)
       .text('Powered by:', 0, yPos, { align: settings.align_header || 'center', width: centerWidth });
    yPos += 10;
    
    doc.fontSize(9)
       .font('Helvetica-Bold')
       .text('BloomSwiftPOS', 0, yPos, { align: settings.align_header || 'center', width: centerWidth });
    yPos += 15;

    // Separator line
    doc.moveTo(0, yPos).lineTo(218.7, yPos).stroke();
    yPos += 10;

    // Invoice details
    doc.fontSize(9)
       .font('Helvetica')
       .text(`Invoice: ${sampleData.invoice_no}`, 0, yPos, { align: settings.align_items || 'left' });
    yPos += settings.line_spacing || 12;

    const formattedDate = new Date(sampleData.date).toLocaleDateString('en-GB');
    doc.text(`Date: ${formattedDate}`, 0, yPos, { align: settings.align_items || 'left' });
    yPos += settings.line_spacing || 12;

    doc.text(`Customer: ${sampleData.customer_name}`, 0, yPos, { align: settings.align_items || 'left' });
    yPos += settings.line_spacing || 12;

    // Separator line
    doc.moveTo(0, yPos).lineTo(218.7, yPos).stroke();
    yPos += 10;

    // Items header
    doc.fontSize(settings.font_items || 6)
       .font('Helvetica-Bold')
       .text('Item', 0, yPos, { align: 'left', width: 100, continued: false })
       .text('Qty', 100, yPos, { align: 'center', width: 15, continued: false })
       .text('Price', 140, yPos, { align: 'right', width: 50, continued: false });
    yPos += settings.line_spacing || 12;

    // Separator line
    doc.moveTo(0, yPos).lineTo(218.7, yPos).stroke();
    yPos += 8;

    // Items
    doc.font('Helvetica');
    let subtotal = 0;
    for (const item of sampleData.items) {
      const itemTotal = item.qty * item.selling_price;
      subtotal += itemTotal;
      
      const nameLines = doc.heightOfString(item.product_name, { width: 100 });
      doc.fontSize(settings.font_items || 6)
         .text(item.product_name, 0, yPos, { align: settings.align_items || 'left', width: 100 })
         .text(item.qty.toString(), 100, yPos, { align: 'center', width: 15 })
         .text(`Rs. ${itemTotal.toFixed(2)}`, 140, yPos, { align: 'right', width: 50 });
      yPos += Math.max(settings.line_spacing || 12, nameLines);
    }

    yPos += 5;

    // Separator line
    doc.moveTo(0, yPos).lineTo(218.7, yPos).stroke();
    yPos += 10;

    // Subtotal
    doc.fontSize(settings.font_subtotal || 6)
       .text('Subtotal:', 0, yPos, { align: settings.align_payment || 'left' })
       .text(`Rs. ${subtotal.toFixed(2)}`, 140, yPos, { align: settings.align_totals || 'right', width: 50 });
    yPos += 10;

    // Discount
    const discountAmount = subtotal * (sampleData.discount / 100);
    doc.text(`Discount (${sampleData.discount}%):`, 0, yPos, { align: settings.align_payment || 'left' })
       .text(`Rs. ${discountAmount.toFixed(2)}`, 140, yPos, { align: settings.align_totals || 'right', width: 50 });
    yPos += 10;

    // Separator line
    doc.moveTo(0, yPos).lineTo(218.7, yPos).stroke();
    yPos += 8;

    // Total
    doc.fontSize(settings.font_total || 8)
       .font('Helvetica-Bold')
       .text('TOTAL:', 0, yPos, { align: settings.align_payment || 'left' })
       .text(`Rs. ${sampleData.total_amount.toFixed(2)}`, 140, yPos, { align: settings.align_totals || 'right', width: 50 });
    yPos += 12;

    // Separator line
    doc.moveTo(0, yPos).lineTo(218.7, yPos).stroke();
    yPos += 10;

    // Payment details
    doc.fontSize(settings.font_payment || 7)
       .font('Helvetica')
       .text(`Payment: ${sampleData.payment_type}`, 0, yPos, { align: settings.align_payment || 'left' });
    yPos += 10;

    doc.text('Amount Given:', 0, yPos, { align: settings.align_payment || 'left' })
       .text(`Rs. ${sampleData.amount_given.toFixed(2)}`, 140, yPos, { align: settings.align_totals || 'right', width: 50 });
    yPos += 10;

    doc.text('Change:', 0, yPos, { align: settings.align_payment || 'left' })
       .text(`Rs. ${sampleData.change_amount.toFixed(2)}`, 140, yPos, { align: settings.align_totals || 'right', width: 50 });
    yPos += 10;

    // Separator line
    doc.moveTo(0, yPos).lineTo(218.7, yPos).stroke();
    yPos += (settings.footer_spacing || 20) - 5;

    // Thank you message
    doc.fontSize(9)
       .font('Helvetica-Bold')
       .text('Thank you for your visit!', 0, yPos, { align: settings.align_footer || 'center', width: centerWidth });
    yPos += 15;

    // Final separator line
    doc.moveTo(0, yPos).lineTo(218.7, yPos).stroke();
    yPos += settings.margin_bottom || 10;

    // Finalize PDF
    doc.end();

    // Wait for PDF to be written
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    console.log('Test receipt PDF generated at:', pdfPath);

    // Validate printer before printing
    const printerName = settings.printer_name || THERMAL_PRINTER_NAME;
    const validation = await validatePrinter(printerName);
    
    if (!validation.valid) {
      console.error('Printer validation failed:', validation.error);
      return res.status(500).json({
        success: false,
        message: 'Printer not available',
        error: validation.error,
        availablePrinters: validation.availablePrinters || []
      });
    }

    // Print the test receipt
    await printPDF(pdfPath, printerName, { scale: 'noscale' });

    console.log('Test receipt printed successfully!');

    // Clean up PDF file after a delay
    setTimeout(() => {
      try {
        if (fs.existsSync(pdfPath)) {
          fs.unlinkSync(pdfPath);
          console.log('Temp test receipt PDF cleaned up');
        }
      } catch (err) {
        console.error('Error cleaning up test receipt PDF:', err);
      }
    }, 5000);

    res.json({
      success: true,
      message: 'Test receipt printed successfully with current settings',
    });
  } catch (error: any) {
    console.error('Test receipt error:', error);
    res.status(500).json({
      success: false,
      error: error?.message || 'Failed to print test receipt'
    });
  }
});

// ESC/POS Direct Printing Endpoint (NEW - Bypasses PDF)
router.post('/receipt-escpos', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).send('Server misconfigured');
  if (!token) return res.status(401).send('Unauthorized');
  
  try {
    jwt.verify(token, secret);
  } catch {
    return res.status(401).send('Unauthorized');
  }

  const { 
    invoice_no, 
    date, 
    customer_name, 
    items, 
    discount, 
    total_amount, 
    payment_type,
    amount_given,
    change_amount
  } = req.body as {
    invoice_no?: string;
    date?: string;
    customer_name?: string;
    items?: Array<{ product_name: string; qty: number; selling_price: number }>;
    discount?: number;
    total_amount?: number;
    payment_type?: string;
    amount_given?: number;
    change_amount?: number;
  };

  if (!items || items.length === 0) {
    return res.status(400).send('No items to print');
  }

  try {
    console.log('🖨️  ESC/POS: Printing receipt for invoice:', invoice_no);

    // Find printer device
    const printerDevice = await findPrinterDevice();
    if (!printerDevice) {
      return res.status(500).json({
        success: false,
        message: 'No thermal printer device found',
        error: 'Please connect your thermal printer via USB or configure network printer'
      });
    }

    console.log('🖨️  ESC/POS: Using printer device:', printerDevice);

    // Get printer settings from database
    const settings = await getPrinterSettings();

    // Initialize ESC/POS printer
    const escposPrinter = new ESCPOSPrinter(printerDevice);

    // Print receipt
    await escposPrinter.printReceipt({
      invoice_no,
      date,
      customer_name,
      items,
      discount,
      total_amount: total_amount || 0,
      payment_type,
      amount_given,
      change_amount
    }, settings);

    console.log('✅ ESC/POS receipt printed successfully!');

    res.json({
      success: true,
      message: 'Receipt printed successfully via ESC/POS',
      method: 'ESC/POS Direct'
    });
  } catch (error: any) {
    console.error('❌ ESC/POS print error:', error);
    res.status(500).json({
      success: false,
      message: 'ESC/POS print failed',
      error: error?.message || 'Unknown error',
      fallback: 'Try using PDF printing instead'
    });
  }
});

// ESC/POS Test Print Endpoint
router.post('/test-escpos', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).send('Server misconfigured');
  if (!token) return res.status(401).send('Unauthorized');
  
  try {
    jwt.verify(token, secret);
  } catch {
    return res.status(401).send('Unauthorized');
  }

  try {
    console.log('🖨️  ESC/POS: Testing printer...');

    // Find printer device
    const printerDevice = await findPrinterDevice();
    if (!printerDevice) {
      return res.status(500).json({
        success: false,
        message: 'No thermal printer device found',
        error: 'Please connect your thermal printer via USB',
        possiblePaths: ['/dev/usb/lp0', '/dev/usb/lp1', '/dev/lp0', '/dev/lp1']
      });
    }

    console.log('🖨️  ESC/POS: Found printer at:', printerDevice);

    // Initialize ESC/POS printer
    const escposPrinter = new ESCPOSPrinter(printerDevice);

    // Test print
    await escposPrinter.testPrint();

    console.log('✅ ESC/POS test print successful!');

    res.json({
      success: true,
      message: 'ESC/POS test print successful!',
      printerDevice
    });
  } catch (error: any) {
    console.error('❌ ESC/POS test failed:', error);
    res.status(500).json({
      success: false,
      message: 'ESC/POS test print failed',
      error: error?.message || 'Unknown error',
      troubleshooting: [
        '1. Check printer is powered on and connected via USB',
        '2. Check USB device: ls -l /dev/usb/lp*',
        '3. Check permissions: groups (should include "lp")',
        '4. Add user to lp group: sudo usermod -a -G lp $USER',
        '5. Restart application after adding to group'
      ]
    });
  }
});

export default router;
