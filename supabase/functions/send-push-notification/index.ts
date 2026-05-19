const ONESIGNAL_REST_API_KEY = Deno.env.get('ONESIGNAL_REST_API_KEY')!;
const ONESIGNAL_APP_ID       = Deno.env.get('ONESIGNAL_APP_ID')!;
const ADMIN_EXTERNAL_ID      = Deno.env.get('ADMIN_ONESIGNAL_EXTERNAL_ID')!; // Supabase user ID de l'admin

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const { title, message } = await req.json();

  const resp = await fetch('https://onesignal.com/api/v1/notifications', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${ONESIGNAL_REST_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      app_id:                     ONESIGNAL_APP_ID,
      include_external_user_ids:  [ADMIN_EXTERNAL_ID],
      headings:  { fr: title   || 'Voisy Admin', en: title   || 'Voisy Admin' },
      contents:  { fr: message || '',            en: message || '' },
    }),
  });

  const body = await resp.json();
  if (!resp.ok) {
    return new Response(JSON.stringify({ error: body }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ sent: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
