
# Sync Setup Guide (No Port Forwarding)

This guide explains how to set up data synchronization when you cannot configure port forwarding on your router. We will use a free tunneling service called **ngrok** to create a secure, public URL for your server PC.

## Architecture Overview

The architecture is the same as the hybrid model, but instead of using your public IP address directly, we will use a public URL provided by ngrok. This URL will securely tunnel traffic to your server PC (PC1).

- **PC1 (Server & Client)**: Runs the application locally. It will also run the `ngrok` tool to expose its local server to the internet via a secure tunnel.
- **PC2 (Client)**: Runs the application and is configured to sync with PC1 using the public `ngrok` URL.

![ngrok Architecture Diagram](https://i.imgur.com/gB7G9a3.png)

> **Important Note on ngrok Free Tier**: The free version of ngrok provides a **temporary** URL that changes every time you restart the ngrok tool. This means you may need to update the `.env` file on PC2 if PC1 or the ngrok tunnel restarts. A paid ngrok plan provides a permanent, reserved URL.

---

## Step 1: Set up ngrok on PC1 (The Server)

1.  **Download ngrok**:
    -   Go to the [ngrok download page](https://ngrok.com/download) and download the ZIP file for Windows.
    -   Unzip the file. You will have a single executable file: `ngrok.exe`. Place this file in an easy-to-access location (e.g., `C:\Users\Onyx\Desktop`).

2.  **Connect Your Account (Optional but Recommended)**:
    -   Sign up for a free account on the [ngrok website](https://dashboard.ngrok.com/signup).
    -   On your ngrok dashboard, you will find an "Auth Token".
    -   Open a Command Prompt (`cmd`) on PC1, navigate to where you saved `ngrok.exe`, and run the command provided on your dashboard. It will look like this:
        ```bash
        ngrok config add-authtoken <YOUR_AUTH_TOKEN>
        ```

3.  **Start the POS Backend Application on PC1**:
    -   Before starting the tunnel, make sure the backend application is running on PC1 (using `npm start` in the `backend` folder).

4.  **Start the ngrok Tunnel on PC1**:
    -   Open a **new** Command Prompt.
    -   Navigate to where you saved `ngrok.exe`.
    -   Run the following command to start a tunnel to your local backend server running on port 5000:
        ```bash
        ngrok http 5000
        ```

5.  **Get the Public URL**:
    -   When ngrok starts, it will display a screen with connection details. Look for the line starting with **`Forwarding`**.
    -   You will see a URL ending in `.ngrok-free.app` (e.g., `https://random-string-123.ngrok-free.app`).
    -   This is your new public URL. **Copy the `https://` version.**

---

## Step 2: Configure the Application on Both PCs

Now you must update the `.env` file on **both** PCs to use the ngrok URL.

### Configuration for PC1 (The Server)

1.  Navigate to `C:\Users\Onyx\Desktop\POS_Demo\POS_Demo\backend`.
2.  Open the `.env` file.
3.  Update the `CENTRAL_API_URL` with your new ngrok URL.

```dotenv
# .env file for PC1
NODE_ID=a1b2c3d4-e5f6-7890-1234-567890abcdef
CENTRAL_API_URL=https://<YOUR_NGROK_URL>/api
```

### Configuration for PC2 (The Client)

1.  On PC2, navigate to the backend folder and open the `.env` file.
2.  Update the `CENTRAL_API_URL` with the **same** ngrok URL.

```dotenv
# .env file for PC2
NODE_ID=f1e2d3c4-b5a6-9870-4321-098765fedcba # Ensure this is a different UUID!
CENTRAL_API_URL=https://<YOUR_NGROK_URL>/api
```

> **Important**: Replace `https://<YOUR_NGROK_URL>` with the actual forwarding URL from your ngrok terminal, and remember to add `/api` at the end.

---

## Step 3: Run and Verify

1.  **Restart the backend** application on both PCs for the new `.env` settings to take effect.
2.  Keep the `ngrok` terminal window open on PC1. You can see live traffic as sync requests come in.
3.  Perform an action on PC2 (like creating a product).
4.  After about 30 seconds, the data should appear on PC1. You can check the application UI or the `ngrok` terminal on PC1 for a `POST /api/sync/push` request.

---

## More Permanent Alternative: Tailscale

If you find updating the ngrok URL frequently to be a hassle, a more advanced but highly stable solution is **[Tailscale](https://tailscale.com/)**.

-   Tailscale creates a secure private network (a "mesh VPN") between your devices.
-   You install the Tailscale app on both PC1 and PC2.
-   Tailscale assigns each machine a permanent, private IP address that **does not change**.
-   You would then use PC1's *Tailscale IP address* in the `.env` files instead of a public or ngrok URL.
-   This method is extremely secure and reliable, and is free for personal use.
