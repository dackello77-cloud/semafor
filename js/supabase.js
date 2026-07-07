import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = "https://dapegyncqmaezcpgrqxd.supabase.co";
const supabaseAnonKey = "sb_publishable_fQUD4c2uFtFH3d0nU10mjg_M-lC7PWr";

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
