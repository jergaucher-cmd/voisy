const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const { prenom, email } = await req.json();

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>Compte suspendu — Voisy</title></head>
<body style="margin:0;padding:0;background:#F9FAFB;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:480px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E8E8E4;">

        <tr>
          <td style="background:#1A1A1A;padding:28px 32px;text-align:center;">
            <div style="color:white;font-size:20px;font-weight:800;letter-spacing:1px;">VOISY</div>
          </td>
        </tr>

        <tr>
          <td style="padding:36px 32px 28px;text-align:center;">
            <p style="font-size:15px;font-weight:600;color:#6B7280;margin:0 0 10px;">Bonjour ${prenom},</p>
            <p style="font-size:20px;font-weight:800;color:#1A1A1A;margin:0 0 20px;line-height:1.3;">
              Votre compte a été suspendu
            </p>
            <p style="font-size:15px;color:#374151;margin:0 0 28px;line-height:1.7;">
              Votre compte Voisy a été suspendu suite à un non-respect de notre charte de bonne conduite.
            </p>
            <p style="font-size:14px;color:#6B7280;margin:0 0 28px;line-height:1.7;">
              Pour toute question ou contestation, contactez-nous à :<br>
              <a href="mailto:contact@voisy.eu" style="color:#2D6A4F;font-weight:700;">contact@voisy.eu</a>
            </p>
          </td>
        </tr>

        <tr>
          <td style="padding:16px 32px 24px;border-top:1px solid #E8E8E4;text-align:center;">
            <p style="font-size:12px;color:#9CA3AF;margin:0;">
              Voisy — notification automatique · Ne pas répondre à cet email
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Voisy <contact@voisy.eu>',
      to: [email],
      subject: 'Votre compte Voisy a été suspendu',
      html,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return new Response(JSON.stringify({ error: err }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ sent: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
