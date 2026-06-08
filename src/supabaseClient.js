import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lxxegyyqcvuuvvjgjcrw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ngvOuft25w-9MIcEBMfAlw__07rkB6H';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
