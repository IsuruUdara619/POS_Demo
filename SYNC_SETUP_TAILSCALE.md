
# Sync Setup Guide (Using Tailscale)

This guide explains how to set up data synchronization using **Tailscale**. This method is highly recommended as it is more stable and secure than using ngrok or public IP addresses, and it does not require any router configuration like port forwarding.

## Architecture Overview

Tailscale creates a secure, private network (a mesh VPN or "tailnet") that connects your devices directly, no matter where they are. Each device gets a stable, private IP address that only other devices in your tailnet can see.

- **PC1 (Server & Client)**: Runs the application. Other PCs will connect to it using its unique Tailscale IP address.
- **PC2 (Client)**: Runs the application and is configured to sync with PC1 using PC1's Tailscale IP.

![Tailscale Architecture Diagram](https://i.imgur.com/d5s3g4W.png)

---

## Step 1: Install and Configure Tailscale on Both PCs

You must perform these steps on **both PC1 and PC2**.

1.  **Download and Install Tailscale**:
    -   Go to the [Tailscale download page](https://tail
    \
    \
    scale.com/download/windows) and download the client for Windows.
    -   Run the installer and follow the on-screen instructions.

2.  **Log In to Tailscale**:
    -   Once installed, Tailscale will prompt you to log in. A web browser will open.
    -   Log in using a Google, Microsoft, Apple, or other account. **It is crucial to use the exact same account on both PCs.**
    -   After logging in, the Tailscale application will connect, and your PC will join your private network.

3.  **Find PC1's Tailscale IP Address**:
    -   On **PC1**, open the Tailscale application from your system tray (the icons in the bottom-right of your screen).
    -   The IP address listed at the top of the window is your Tailscale IP. It will usually start with `100.x.x.x`.
    -   This IP address is stable and will not change. **Copy this IP address.**

---

## Step 2: Configure the Application on Both PCs

Now, you will update the `.env` file on both machines to use PC1's Tailscale IP address.

### Configuration for PC1 (The Server)

1.  On PC1, navigate to `C:\Users\Onyx\Desktop\POS_Demo\POS_Demo\backend`.
2.  Open the `.env` file.
3.  Update the `CENTRAL_API_URL` with PC1's Tailscale IP.

```dotenv
# .env file for PC1
NODE_ID=a1b2c3d4-e5f6-7890-1234-567890abcdef

# Use the Tailscale IP of this machine (PC1)
CENTRAL_API_URL=http://<PC1_TAILSCALE_IP>:5000/api
```

### Configuration for PC2 (The Client)

1.  On PC2, navigate to the backend folder and open the `.env` file.
2.  Update the `CENTRAL_API_URL` with PC1's Tailscale IP.

```dotenv
# .env file for PC2
NODE_ID=f1e2d3c4-b5a6-9870-4321-098765fedcba # Ensure this is a different UUID!

# Use the Tailscale IP of the other machine (PC1)
CENTRAL_API_URL=http://<PC1_TAILSCALE_IP>:5000/api
```

> **Important**: Replace `<PC1_TAILSCALE_IP>` with the actual Tailscale IP address you copied from PC1, and remember to add `:5000/api` at the end.

---

## Step 3: Adjust Firewall on PC1 (If Needed)

Tailscale usually handles firewall rules well, but if PC2 cannot connect, you may need to ensure the Windows Firewall on PC1 allows incoming connections for your application over the Tailscale network.

1.  Open **Windows Defender Firewall** on PC1.
2.  Go to **"Advanced settings"**.
3.  Click **"Inbound Rules"** -> **"New Rule..."**.
4.  Select **Program**, click Next, and point it to the `node.exe` executable (usually in `C:\Program Files\nodejs\node.exe`).
5.  Select **Allow the connection**, click Next.
6.  Check the **Private** box (Tailscale creates a private network interface). You can leave the others unchecked for better security. Click Next.
7.  Give the rule a name like `POS Sync (Tailscale)` and click Finish.

---

## Step 4: Run and Verify

1.  **Restart the backend** application on both PCs for the new `.env` settings to take effect.
2.  Make sure the Tailscale application is running on both machines.
3.  Perform an action on PC2 (e.g., create a new customer).
4.  After the sync interval (about 30 seconds), the data should appear on PC1.

This setup is secure, stable, and the recommended way to connect your two PCs without dealing with public IP addresses or router settings.