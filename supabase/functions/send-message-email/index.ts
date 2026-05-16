import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const { conversation_id, recipient_id, sender_name } = await req.json();

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Check email_notifications preference (DEFAULT true, so only skip if explicitly false)
  const { data: profile } = await admin
    .from('profiles')
    .select('prenom, email_notifications')
    .eq('id', recipient_id)
    .single();

  if (!profile || profile.email_notifications === false) {
    return new Response(JSON.stringify({ skipped: 'notifications_disabled' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Rate limiting: max one email per hour per conversation per recipient
  const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { data: recentLog } = await admin
    .from('message_email_log')
    .select('id')
    .eq('conversation_id', conversation_id)
    .eq('recipient_id', recipient_id)
    .gte('sent_at', oneHourAgo)
    .limit(1);

  if (recentLog && recentLog.length > 0) {
    return new Response(JSON.stringify({ skipped: 'rate_limited' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Get recipient email via admin API
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(recipient_id);
  if (userError || !userData?.user?.email) {
    return new Response(JSON.stringify({ error: 'recipient_not_found' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const recipientEmail = userData.user.email;
  const recipientPrenom = profile.prenom || 'là';

  // Send email via Resend
  const resendResp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Voisy <contact@voisy.eu>',
      to: [recipientEmail],
      subject: 'Vous avez un nouveau message sur Voisy',
      html: buildEmailHtml(sender_name, recipientPrenom, recipient_id),
    }),
  });

  if (!resendResp.ok) {
    const err = await resendResp.text();
    return new Response(JSON.stringify({ error: err }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Log the send for rate limiting
  await admin.from('message_email_log').insert({ conversation_id, recipient_id });

  return new Response(JSON.stringify({ sent: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

function buildEmailHtml(senderName: string, recipientPrenom: string, recipientId: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nouveau message sur Voisy</title>
</head>
<body style="margin:0;padding:0;background:#FAFAF8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF8;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #E8E8E4;">

          <tr>
            <td style="background:#2D6A4F;padding:28px 32px;text-align:center;">
              <svg width="48" height="34" viewBox="0 0 80 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 54 L19 10 Q20 6 21 10 L39 54 Z" fill="rgba(255,255,255,0.95)"/>
                <path d="M41 54 L59 10 Q60 6 61 10 L78 54 Z" fill="rgba(255,255,255,0.55)"/>
              </svg>
              <div style="color:white;font-size:20px;font-weight:800;letter-spacing:1px;margin-top:6px;">VOISY</div>
            </td>
          </tr>

          <tr>
            <td style="padding:36px 32px 28px;text-align:center;">
              <p style="font-size:15px;font-weight:600;color:#6B7280;margin:0 0 10px;">Bonjour ${recipientPrenom},</p>
              <p style="font-size:22px;font-weight:800;color:#1A1A1A;margin:0 0 20px;line-height:1.3;">
                Vous avez un<br>nouveau message
              </p>
              <p style="font-size:15px;color:#374151;margin:0 0 32px;line-height:1.65;">
                <strong style="color:#1A1A1A;">${senderName}</strong> vous a envoyé un message<br>
                sur Voisy. Connectez-vous pour lui répondre.
              </p>
              <a href="https://www.voisy.eu"
                 style="display:inline-block;background:#2D6A4F;color:white;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:0.02em;">
                Voir le message →
              </a>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px;"><hr style="border:none;border-top:1px solid #E8E8E4;margin:0;"></td>
          </tr>

          <tr>
            <td style="padding:20px 32px 28px;text-align:center;">
              <p style="font-size:12px;color:#9CA3AF;margin:0;line-height:1.7;">
                Voisy — Entraide locale à Angers<br>
                <a href="https://www.voisy.eu" style="color:#9CA3AF;text-decoration:underline;">
                  Gérer mes préférences de notification
                </a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
