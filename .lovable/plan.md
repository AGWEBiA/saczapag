# Plan: Integrate Evolution API for WhatsApp Management

I will automate the WhatsApp instance creation and status management by integrating the Evolution API directly into the application flow. This involves creating a set of server-side actions (Edge Functions) to communicate with the Evolution API and updating the UI to reflect real-time status.

## Proposed Changes

### 1. Database & Security
- No migration needed for now as `whatsapp_instances` already exists.
- I will verify and ensure Row Level Security (RLS) is correctly configured for the `whatsapp_instances` table to allow users to manage their own instances.

### 2. Edge Functions (Evolution API Integration)
- Create a new Edge Function `evolution-api` to handle:
    - `create-instance`: Call Evolution API to create a new instance.
    - `get-qr-code`: Fetch the QR code for a specific instance.
    - `get-status`: Check the connection status of an instance.
    - `logout-instance`: Log out and disconnect an instance.
    - `delete-instance`: Remove the instance from both Evolution API and Supabase.

### 3. Frontend Integration
- **Instance Creation**: Update `CreateInstanceDialog` to trigger the Edge Function when a new instance is created in the database.
- **Real-time Status**: Update `InstanceList` to:
    - Show QR codes for instances that are "connecting".
    - Periodically check for status updates.
    - Provide "Connect" (show QR) and "Logout" actions.
- **Error Handling**: Improve feedback for API failures.

### 4. Webhook Setup
- Prepare a webhook handler in the Edge Function to receive events from Evolution API (e.g., status changes, incoming messages) and update the Supabase database automatically.

## Technical Details
- **Secrets**: Use `EVOLUTION_API_URL` and `EVOLUTION_API_KEY` (which the user is configuring in Lovable Cloud).
- **Communication**: Frontend calls Supabase Edge Functions via `supabase.functions.invoke`. Edge Functions use `fetch` to talk to Evolution API.
- **State Management**: Use React Query for caching and auto-refreshing instance statuses.

---
I will start by setting up the Edge Function infrastructure.
