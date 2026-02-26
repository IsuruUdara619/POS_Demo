import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import * as QRCode from 'qrcode';
import * as path from 'path';
import * as fs from 'fs';

interface WhatsAppStatus {
  isConnected: boolean;
  isInitializing: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  hasQRCode: boolean;
  lastConnectedAt: Date | null;
  qrGeneratedAt: Date | null;
  initializationFinishedAt: Date | null;
  authenticatedAt: Date | null;
  loadingStartedAt: Date | null;
  loadingProgress: number;
}

class WhatsAppService {
  private client: Client | null = null;
  private qrCode: string | null = null;
  private isReady: boolean = false;
  private isInitializing: boolean = false;
  private isAuthenticating: boolean = false;
  private isLoading: boolean = false;
  private lastConnectedAt: Date | null = null;
  private qrGeneratedAt: Date | null = null;
  private initializationFinishedAt: Date | null = null;
  private authenticatedAt: Date | null = null;
  private loadingStartedAt: Date | null = null;
  private loadingProgress: number = 0;
  private autoRestartTimeout: NodeJS.Timeout | null = null;
  private periodicConnectionCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    console.log('[WhatsApp Service] Service created');
  }

  /**
   * Get current status
   */
  getStatus(): WhatsAppStatus {
    return {
      isConnected: this.isReady,
      isInitializing: this.isInitializing,
      isAuthenticated: this.isAuthenticating,
      isLoading: this.isLoading,
      hasQRCode: !!this.qrCode,
      lastConnectedAt: this.lastConnectedAt,
      qrGeneratedAt: this.qrGeneratedAt,
      initializationFinishedAt: this.initializationFinishedAt,
      authenticatedAt: this.authenticatedAt,
      loadingStartedAt: this.loadingStartedAt,
      loadingProgress: this.loadingProgress
    };
  }

  /**
   * Get QR code
   */
  getQRCode(): string | null {
    return this.qrCode;
  }

  /**
   * Initialize WhatsApp client with retry logic
   */
  async initialize(retryCount = 0): Promise<void> {
    const MAX_RETRIES = 3;
    
    if (this.isInitializing) {
      console.log('[WhatsApp Service] Already initializing, skipping...');
      return;
    }

    // If client exists and is initializing, destroy it first
    if (this.client) {
      console.log('[WhatsApp Service] Existing client found, destroying...');
      try {
        await this.client.destroy();
        this.client = null;
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err: any) {
        console.warn('[WhatsApp Service] Error destroying existing client:', err.message);
        this.client = null;
      }
    }

    this.isInitializing = true;

    try {
      console.log('[WhatsApp Service] 🚀 Starting initialization (attempt ' + (retryCount + 1) + '/' + MAX_RETRIES + ')...');
      
      // Use project root for session storage
      const authPath = path.join(process.cwd(), 'whatsapp-session');
      
      // Ensure directory exists
      if (!fs.existsSync(authPath)) {
        console.log('[WhatsApp Service] Creating session directory:', authPath);
        fs.mkdirSync(authPath, { recursive: true });
      }

      console.log('[WhatsApp Service] Session storage:', authPath);

      // Configure Puppeteer
      const puppeteerConfig = {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--no-zygote',
          '--disable-web-security',
        ]
      };

      console.log('[WhatsApp Service] 📱 Creating WhatsApp client...');
      
      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: authPath
        }),
        puppeteer: puppeteerConfig
      });

      // Setup event handlers
      this.setupEventHandlers();

      console.log('[WhatsApp Service] 🔌 Initializing client...');
      
      try {
        await this.client.initialize();
        
        this.initializationFinishedAt = new Date();
        console.log('[WhatsApp Service] ✅ Initialization started successfully');
        console.log('[WhatsApp Service] ⏳ Waiting for QR code or authentication...');
        
      } catch (initError: any) {
        // Check if it's the "browser already running" error
        if (initError.message && initError.message.includes('browser is already running')) {
          console.error('[WhatsApp Service] ⚠️ Browser already running error detected!');
          
          // Destroy the client completely
          if (this.client) {
            console.log('[WhatsApp Service] 🗑️ Force destroying client and browser...');
            try {
              await this.client.destroy();
            } catch (destroyErr: any) {
              console.warn('[WhatsApp Service] Error during destroy:', destroyErr.message);
            }
            this.client = null;
          }
          
          // If we haven't exceeded retry limit, try again
          if (retryCount < MAX_RETRIES - 1) {
            const waitTime = Math.pow(2, retryCount) * 3000; // Exponential backoff
            console.log(`[WhatsApp Service] ⏳ Waiting ${waitTime/1000}s before retry...`);
            this.isInitializing = false;
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return await this.initialize(retryCount + 1);
          } else {
            console.error('[WhatsApp Service] ❌ Max retries exceeded');
            throw new Error('Failed to initialize WhatsApp after ' + MAX_RETRIES + ' attempts');
          }
        } else {
          throw initError;
        }
      }
      
    } catch (error) {
      console.error('[WhatsApp Service] ❌ Initialization failed:', error);
      this.isInitializing = false;
      
      // Clean up
      if (this.client) {
        try {
          await this.client.destroy();
        } catch (err) {
          // Ignore cleanup errors
        }
        this.client = null;
      }
      
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Setup event handlers for WhatsApp client
   */
  private setupEventHandlers() {
    if (!this.client) return;

    // QR Code event
    this.client.on('qr', async (qr) => {
      console.log('[WhatsApp Service] 📷 QR Code received');
      try {
        this.qrCode = await QRCode.toDataURL(qr);
        this.qrGeneratedAt = new Date();
        console.log('[WhatsApp Service] ✅ QR Code generated at', this.qrGeneratedAt);
      } catch (err) {
        console.error('[WhatsApp Service] ❌ Error generating QR code:', err);
      }
    });

    // Ready event
    this.client.on('ready', () => {
      console.log('[WhatsApp Service] ✅✅✅ CLIENT IS READY! Connection established!');
      this.isReady = true;
      this.isAuthenticating = false;
      this.isLoading = false;
      this.qrCode = null;
      this.lastConnectedAt = new Date();
      this.loadingStartedAt = null;
      
      // Clear timeouts
      if (this.autoRestartTimeout) {
        clearTimeout(this.autoRestartTimeout);
        this.autoRestartTimeout = null;
      }
      if (this.periodicConnectionCheckInterval) {
        clearInterval(this.periodicConnectionCheckInterval);
        this.periodicConnectionCheckInterval = null;
      }
    });

    // Authenticated event
    this.client.on('authenticated', () => {
      console.log('[WhatsApp Service] 🔐 CLIENT AUTHENTICATED! QR code scanned.');
      this.isAuthenticating = true;
      this.authenticatedAt = new Date();
      this.qrCode = null;
      this.loadingProgress = 0;
      
      console.log('[WhatsApp Service] ⏳ Waiting for ready event...');
      
      // Start periodic connection state checking
      console.log('[WhatsApp Service] 🔄 Starting periodic connection checks...');
      let checkCount = 0;
      
      if (this.periodicConnectionCheckInterval) {
        clearInterval(this.periodicConnectionCheckInterval);
      }
      
      this.periodicConnectionCheckInterval = setInterval(async () => {
        if (this.isReady) {
          if (this.periodicConnectionCheckInterval) {
            clearInterval(this.periodicConnectionCheckInterval);
            this.periodicConnectionCheckInterval = null;
          }
          return;
        }
        
        checkCount++;
        console.log(`[WhatsApp Service] 🔍 Check #${checkCount} - Verifying state...`);
        
        try {
          if (this.client) {
            const state = await this.client.getState();
            console.log(`[WhatsApp Service] State: ${state}`);
            
            if (state === 'CONNECTED') {
              console.log('[WhatsApp Service] ✅ Manually triggering ready state');
              this.isReady = true;
              this.isAuthenticating = false;
              this.isLoading = false;
              this.lastConnectedAt = new Date();
              this.loadingStartedAt = null;
              
              if (this.periodicConnectionCheckInterval) {
                clearInterval(this.periodicConnectionCheckInterval);
                this.periodicConnectionCheckInterval = null;
              }
              if (this.autoRestartTimeout) {
                clearTimeout(this.autoRestartTimeout);
                this.autoRestartTimeout = null;
              }
            }
          }
        } catch (error: any) {
          console.log(`[WhatsApp Service] ⚠️ Check #${checkCount} failed:`, error.message);
        }
      }, 10000); // Check every 10 seconds
      
      // Auto-restart if stuck (3 minutes timeout)
      if (this.autoRestartTimeout) {
        clearTimeout(this.autoRestartTimeout);
      }
      this.autoRestartTimeout = setTimeout(() => {
        if (this.isAuthenticating && !this.isReady) {
          console.log('[WhatsApp Service] ⚠️ Stuck in authenticated state. Auto-restarting...');
          
          if (this.periodicConnectionCheckInterval) {
            clearInterval(this.periodicConnectionCheckInterval);
            this.periodicConnectionCheckInterval = null;
          }
          
          this.restart().catch(err => {
            console.error('[WhatsApp Service] Auto-restart failed:', err);
          });
        }
      }, 180000); // 3 minutes
    });

    // Loading screen event
    this.client.on('loading_screen', (percent, message) => {
      const percentNum = typeof percent === 'string' ? parseInt(percent, 10) : percent;
      console.log('[WhatsApp Service] 📊 Loading:', percentNum + '%', message);
      this.isLoading = true;
      this.loadingProgress = percentNum;
      
      if (!this.loadingStartedAt) {
        this.loadingStartedAt = new Date();
      }
    });

    // Authentication failure event
    this.client.on('auth_failure', (msg) => {
      console.error('[WhatsApp Service] ❌ Authentication failure:', msg);
      this.isReady = false;
      this.isAuthenticating = false;
      this.isLoading = false;
      this.qrCode = null;
      
      if (this.autoRestartTimeout) {
        clearTimeout(this.autoRestartTimeout);
        this.autoRestartTimeout = null;
      }
    });

    // Disconnected event
    this.client.on('disconnected', (reason) => {
      console.log('[WhatsApp Service] ⚠️ Client disconnected:', reason);
      this.isReady = false;
      this.isAuthenticating = false;
      this.isLoading = false;
      this.qrCode = null;
      
      if (this.autoRestartTimeout) {
        clearTimeout(this.autoRestartTimeout);
        this.autoRestartTimeout = null;
      }
    });
  }

  /**
   * Restart WhatsApp client
   */
  async restart(): Promise<void> {
    console.log('[WhatsApp Service] 🔄 Restarting...');
    await this.disconnect();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.initialize();
  }

  /**
   * Clear session data
   */
  async clearSession(): Promise<void> {
    const authPath = path.join(process.cwd(), 'whatsapp-session');
    
    try {
      if (fs.existsSync(authPath)) {
        console.log('[WhatsApp Service] 🗑️ Clearing session data...');
        fs.rmSync(authPath, { recursive: true, force: true });
        console.log('[WhatsApp Service] ✅ Session cleared');
      }
    } catch (error) {
      console.error('[WhatsApp Service] ❌ Error clearing session:', error);
      throw error;
    }
  }

  /**
   * Reconnect (disconnect + clear session + initialize)
   */
  async reconnect(): Promise<void> {
    console.log('[WhatsApp Service] 🔄 Reconnecting...');
    try {
      await this.disconnect();
      await this.clearSession();
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.initialize();
      console.log('[WhatsApp Service] Reconnection initiated');
    } catch (error) {
      console.error('[WhatsApp Service] ❌ Reconnection error:', error);
      throw error;
    }
  }

  /**
   * Disconnect WhatsApp client
   */
  async disconnect(): Promise<void> {
    console.log('[WhatsApp Service] 🔌 Disconnecting...');
    
    // Clear all timeouts and intervals
    if (this.autoRestartTimeout) {
      clearTimeout(this.autoRestartTimeout);
      this.autoRestartTimeout = null;
    }
    if (this.periodicConnectionCheckInterval) {
      clearInterval(this.periodicConnectionCheckInterval);
      this.periodicConnectionCheckInterval = null;
    }
    
    if (this.client) {
      try {
        await this.client.destroy();
        this.client = null;
        this.isReady = false;
        this.isAuthenticating = false;
        this.isLoading = false;
        this.qrCode = null;
        this.lastConnectedAt = null;
        this.authenticatedAt = null;
        this.loadingStartedAt = null;
        console.log('[WhatsApp Service] ✅ Client destroyed');
      } catch (error) {
        console.error('[WhatsApp Service] ❌ Disconnect error:', error);
        // Don't throw - continue with cleanup
      }
    }
    
    console.log('[WhatsApp Service] ✅ Disconnected successfully');
  }

  /**
   * Send invoice message to customer
   */
  async sendInvoiceMessage(phoneNumber: string, invoiceData: any): Promise<boolean> {
    if (!this.isReady || !this.client) {
      throw new Error('WhatsApp client is not ready. Please connect first.');
    }

    try {
      // Format phone number (remove non-digits)
      let formattedNumber = phoneNumber.replace(/\D/g, '');
      
      // Add country code if not present (Sri Lanka +94)
      if (!formattedNumber.startsWith('94')) {
        if (formattedNumber.startsWith('0')) {
          formattedNumber = formattedNumber.substring(1);
        }
        formattedNumber = '94' + formattedNumber;
      }

      // WhatsApp format: number@c.us
      const chatId = `${formattedNumber}@c.us`;

      // Check if number exists on WhatsApp
      const numberExists = await this.client.isRegisteredUser(chatId);
      if (!numberExists) {
        throw new Error('This phone number is not registered on WhatsApp');
      }

      // Format the invoice message
      const message = this.formatInvoiceMessage(invoiceData);

      // Send the message
      await this.client.sendMessage(chatId, message);
      console.log(`[WhatsApp Service] ✅ Invoice sent to ${formattedNumber}`);
      
      return true;
    } catch (error: any) {
      console.error('[WhatsApp Service] ❌ Send error:', error);
      throw new Error(error?.message || 'Failed to send WhatsApp message');
    }
  }

  /**
   * Format invoice message
   */
  private formatInvoiceMessage(data: any): string {
    const formattedDate = new Date(data.date).toLocaleDateString('en-GB');
    
    let message = `🛠️ *Demo POS System Invoice*\n`;
    message += `━━━━━━━━━━━━━━━━━━━━\n\n`;
    message += `📋 Invoice: ${data.invoice_no}\n`;
    message += `📅 Date: ${formattedDate}\n`;
    message += `👤 Customer: ${data.customer_name}\n\n`;
    
    message += `*Items:*\n`;
    data.items.forEach((item: any) => {
      message += `• ${item.name} x${item.quantity} - Rs. ${item.total.toFixed(2)}\n`;
    });
    
    message += `\n━━━━━━━━━━━━━━━━━━━━\n`;
    message += `*Total: Rs. ${data.total_amount.toFixed(2)}*\n`;
    
    if (data.discount > 0) {
      message += `(Discount: Rs. ${data.discount.toFixed(2)})\n`;
    }
    
    message += `\nThank you for your business! 🙏`;
    
    return message;
  }
}

// Export singleton instance
const whatsappService = new WhatsAppService();
export default whatsappService;
