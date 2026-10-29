import { createClient } from "@supabase/supabase-js";

// Credentials are loaded from .env (REACT_APP_SUPABASE_URL / REACT_APP_SUPABASE_KEY).
// Never hardcode secrets in source files — see .env.example for setup instructions.
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "[supabaseClient] Missing REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_KEY.\n" +
    "Copy .env.example → .env and fill in your Supabase credentials."
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
