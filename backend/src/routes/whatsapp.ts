import { Router } from 'express';
import whatsappService from '../services/whatsapp';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Get status
router.get('/status', authenticateToken, (req, res) => {
  try {
    const status = whatsappService.getStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get QR code
router.get('/qr', authenticateToken, (req, res) => {
  try {
    const qrCode = whatsappService.getQRCode();
    const status = whatsappService.getStatus();
    
    if (!qrCode) {
      if (status.isConnected) {
        return res.json({
          error: 'Already connected',
          message: 'WhatsApp is already connected. No QR code needed.'
        });
      }
      
      if (!status.isInitializing && !status.initializationFinishedAt) {
        // Start initialization if not started
        whatsappService.initialize().catch(err => {
          console.error('Auto-initialization failed:', err);
        });
        
        return res.json({
          error: 'QR code not ready',
          message: 'WhatsApp is initializing. Please try again in a moment.',
          isInitializing: true
        });
      }
      
      return res.json({
        error: 'QR code not ready',
        message: 'QR code is being generated. Please try again.',
        isInitializing: status.isInitializing
      });
    }
    
    res.json({ qrCode });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Initialize
router.post('/initialize', authenticateToken, async (req, res) => {
  try {
    await whatsappService.initialize();
    res.json({ success: true, message: 'Initialization started' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Disconnect
router.post('/disconnect', authenticateToken, async (req, res) => {
  try {
    await whatsappService.disconnect();
    res.json({ success: true, message: 'WhatsApp disconnected successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Reconnect
router.post('/reconnect', authenticateToken, async (req, res) => {
  try {
    await whatsappService.reconnect();
    res.json({ success: true, message: 'WhatsApp reconnecting... Please scan the new QR code.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send Invoice
router.post('/send-invoice', authenticateToken, async (req, res) => {
  try {
    const invoiceData = req.body;
    
    if (!invoiceData.contact_no) {
      return res.status(400).json({ success: false, error: 'Missing contact number' });
    }
    
    await whatsappService.sendInvoiceMessage(invoiceData.contact_no, invoiceData);
    
    res.json({
      success: true,
      message: `Invoice sent to ${invoiceData.contact_no} via WhatsApp`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send invoice'
    });
  }
});

export default router;
