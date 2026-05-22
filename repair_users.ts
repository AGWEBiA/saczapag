import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function syncUsers() {
  console.log("Starting sync...");
  const { data: { users }, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });

  if (error) {
    console.error("Error listing users:", error);
    return;
  }

  console.log(`Found ${users.length} users in auth.`);

  for (const user of users) {
    console.log(`Syncing user: ${user.email} (${user.id})`);
    
    // 1. Sync Profile
    const { error: profileError } = await supabase
      .from("profiles")
      .upsert({
        user_id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || "Sem Nome",
        role: "agent" // Default
      }, { onConflict: 'user_id' });

    if (profileError) {
      console.error(`Error syncing profile for ${user.email}:`, profileError.message);
    } else {
      console.log(`Profile synced for ${user.email}`);
    }

    // 2. Sync Role
    const { error: roleError } = await supabase
      .from("user_roles")
      .upsert({
        user_id: user.id,
        role: "atendente" // Default mapping for 'agent'
      }, { onConflict: 'user_id,role' });

    if (roleError) {
      console.error(`Error syncing role for ${user.email}:`, roleError.message);
    }
  }

  console.log("Sync complete.");
}

syncUsers();
