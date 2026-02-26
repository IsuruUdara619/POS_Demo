
# Offline-First Sync Setup Guide (2-PC Hybrid Model)

This guide explains how to set up the Point-of-Sale application to synchronize data between two PCs using one of them as a central server. This allows both PCs to work fully offline and sync with each other when they have an internet connection.

## Architecture Overview

This system uses a hybrid model where one PC (let's call it **PC1**) acts as both a regular workstation and the central sync server. The other PC (**PC2**) acts as a client.

- **PC1 (Server & Client)**: Runs the full application and listens for sync requests from other PCs. It needs a stable internet connection and must be turned on for others to sync with it.
- **PC2 (Client)**: Runs the full application and is configured to send its changes to PC1 and ask PC1 for changes made by others.


## Prerequisites

Ensure the following software is installed on **both** PCs:

1.  **PostgreSQL**: A local PostgreSQL server must be running on each machine.
2.  **Node.js**: Required to run the backend and frontend applications.
3.  **Application Code**: The entire `POS_Demo` project folder should be copied to both PCs.

---

## Step 1: Network Configuration for PC1 (The Server)

This is the most critical step. For PC2 to find PC1 over the internet, you must configure the router and firewall at PC1's location.

### 1.1 Find PC1's Local IP Address

- On PC1, open the Command Prompt (`cmd`).
- Type `ipconfig` and press Enter.
- Look for the "IPv4 Address". It will typically look like `192.168.1.100`.

### 1.2 Set Up Port Forwarding on Your Router

- Log in to your internet router's administration page (usually an address like `192.168.1.1` or `192.168.0.1` in a web browser).
- Find the section named **"Port Forwarding"**, "Virtual Servers", or something similar.
- Create a new rule with the following settings:
    - **Service Port / External Port**: `5000`
    - **Internal IP Address / Server IP Address**: The local IP address of PC1 you found in the previous step.
    - **Internal Port**: `5000`
    - **Protocol**: `TCP`
    - **Name/Description**: `POS_Sync_Server` (or any name you prefer)
- Save and apply the new rule.

### 1.3 Find PC1's Public IP Address

- On PC1, open a web browser (like Chrome or Firefox).
- Search for **"what is my IP"**.
- The address displayed is your public IP. Note it down.

> **Note on Dynamic IP**: Most home internet connections have a *dynamic* public IP that can change. If your IP changes frequently, consider using a **Dynamic DNS (DDNS)** service (like No-IP or Dynu) to get a permanent hostname that always points to your network.

### 1.4 Configure Windows Firewall on PC1

- Open Windows Defender Firewall.
- Go to "Advanced settings".
- Click "Inbound Rules" -> "New Rule...".
- Select **Port**, click Next.
- Select **TCP** and specify local port **5000**, click Next.
- Select **Allow the connection**, click Next.
- Check all three boxes (Domain, Private, Public), click Next.
- Give the rule a name like `POS Sync Inbound` and click Finish.

---

## Step 2: Configure the Application on PC1 (The Server)

1.  Navigate to the backend folder: `C:\Users\Onyx\Desktop\POS_Demo\POS_Demo\backend`.
2.  Open the `.env` file in a text editor.
3.  Make sure the following variables are set correctly:

```dotenv
# .env file for PC1 (The Server)

# This is a unique identifier for this PC. You can leave the default.
NODE_ID=a1b2c3d4-e5f6-7890-1234-567890abcdef

# This MUST be the PUBLIC internet address of PC1.
# Replace <YOUR_PUBLIC_IP_ADDRESS> with the address you found in step 1.3.
CENTRAL_API_URL=http://<YOUR_PUBLIC_IP_ADDRESS>:5000/api
```

---

## Step 3: Configure the Application on PC2 (The Client)

1.  On PC2, navigate to the backend folder.
2.  Open the `.env` file in a text editor.
3.  Make sure the following variables are set correctly:

```dotenv
# .env file for PC2 (The Client)

# This ID MUST be new and unique to PC2. 
# Use an online UUID generator to create a new one.
NODE_ID=f1e2d3c4-b5a6-9870-4321-098765fedcba

# This MUST be the PUBLIC internet address of PC1.
# It tells PC2 where to find the server.
CENTRAL_API_URL=http://<PC1s_PUBLIC_IP_ADDRESS>:5000/api
```

---

## Step 4: Run the Application

On **both** PC1 and PC2, you need to start the backend and frontend servers.

### Start the Backend
- Open a terminal or Command Prompt.
- Navigate to `C:\Users\Onyx\Desktop\POS_Demo\POS_Demo\backend`.
- Run the command: `npm start`

### Start the Frontend
- Open a **new** terminal or Command Prompt.
- Navigate to `C:\Users\Onyx\Desktop\POS_Demo\POS_Demo\frontend`.
- Run the command: `npm run dev`

---

## Step 5: Verification

1.  On PC2, perform an action that creates data (e.g., create a new product or make a sale).
2.  Wait for the sync interval (around 30 seconds).
3.  On PC1, check if the new data has appeared.
4.  You can also inspect the sync queue directly by opening this URL in a browser on PC1: `http://localhost:5000/api/debug/sync-queue`. This will show you the raw sync data being processed.

