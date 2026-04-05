// Telegram Bot Webhook - Conecta usuarios con CDL Radar
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

serve(async (req) => {
  try {
    // Solo aceptar POST de Telegram
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const update = await req.json();
    console.log("Telegram update:", update);

    // Extraer mensaje
    const message = update.message;
    if (!message || !message.text) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const chatId = message.chat.id;
    const text = message.text;

    // Comando /start con userId
    if (text.startsWith("/start")) {
      const parts = text.split(" ");
      
      if (parts.length < 2) {
        // Sin parámetro - mensaje de bienvenida
        await sendTelegramMessage(
          chatId,
          "👋 Bienvenido a CDL Radar Alerts\n\nPara conectar tu cuenta, presiona el botón 'Conectar Telegram' en el Radar y escanea el código QR."
        );
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      // Decodificar userId del parámetro
      const encodedUserId = parts[1];
      let userId: string;
      
      try {
        userId = atob(encodedUserId);
      } catch {
        await sendTelegramMessage(chatId, "❌ Código QR inválido. Genera uno nuevo desde el Radar.");
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      // Guardar chat_id en Supabase (upsert para crear o actualizar)
      const { error } = await supabase
        .from("telegram_connections")
        .upsert(
          { 
            user_id: userId, 
            telegram_chat_id: chatId.toString(),
            updated_at: new Date().toISOString()
          },
          { onConflict: 'user_id' }
        );

      if (error) {
        console.error("Error saving connection:", error);
        await sendTelegramMessage(chatId, "❌ Error al conectar. Intenta nuevamente.");
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      // Obtener información del usuario si está autenticado
      let userName = "";
      let userEmail = "";
      let isPaid = false;
      
      // Si el userId es un UUID (usuario autenticado), obtener sus datos
      if (userId.length === 36 && userId.includes('-')) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, plan")
          .eq("id", userId)
          .single();
        
        if (profile) {
          userEmail = profile.email || "";
          isPaid = profile.plan === 'paid';
          // Extraer nombre del email (parte antes del @)
          userName = userEmail ? userEmail.split('@')[0] : "";
        }
      }

      // Mensaje personalizado de bienvenida
      let greeting = "👋 *¡Hola";
      if (userName) {
        greeting += `, ${userName}`;
      }
      greeting += "!*\n\n";
      
      if (userEmail) {
        greeting += `📧 Cuenta: ${userEmail}\n\n`;
      }
      
      // Mensaje específico según plan
      let planMessage = "";
      
      if (isPaid) {
        // MENSAJE PREMIUM
        planMessage = 
          "⚠️ *IMPORTANTE - PLAN PREMIUM:*\n" +
          "✅ Tu conexión permanece activa aunque cierres el navegador\n" +
          "✅ Recibirás alertas 24/7 sin límites\n" +
          "✅ Acceso ilimitado al Radar\n\n" +
          "💎 Mantén el Radar abierto (puede estar en background) para recibir señales en tiempo real.";
      } else {
        // MENSAJE FREEMIUM
        planMessage = 
          "🔴🔴🔴 *MODO ESPÍA ACTIVADO* 🔴🔴🔴\n\n" +
          "✅ Este mensaje confirma que el Edge Function está ACTUALIZADO\n" +
          "✅ La consulta a profiles funciona correctamente\n" +
          "✅ userId: " + userId + "\n" +
          "✅ userName: " + (userName || "VACÍO") + "\n" +
          "✅ userEmail: " + (userEmail || "VACÍO") + "\n" +
          "✅ isPaid: " + isPaid + "\n\n" +
          "⚠️ *IMPORTANTE - PLAN GRATUITO:*\n" +
          "🔄 Al cerrar el navegador, tu conexión se desconecta automáticamente\n" +
          "⏰ Tu cuota diaria se renueva a las 12:00 AM (medianoche)\n" +
          "⏱️ Tienes 1 hora de señales por día\n\n" +
          "💡 *OPTIMIZA TU TIEMPO:*\n" +
          "• Tu hora empieza a contar cuando abres el Radar\n" +
          "• Abre a la hora que más te convenga (no desperdicies tu cuota)\n" +
          "• Puedes fraccionar: usa 20 min, cierra, reconéctate más tarde = 40 min restantes\n" +
          "• Cada día a medianoche se renueva tu hora completa\n\n" +
          "💎 *¿Quieres alertas ilimitadas 24/7?* Hazte Premium.";
      }
      
      // Confirmación con instrucciones completas
      await sendTelegramMessage(
        chatId,
        greeting +
        "✅ *Bienvenido a CDL Radar Alerts*\n\n" +
        "Ahora recibirás alertas de trading en tiempo real directamente en Telegram.\n\n" +
        "📢 *CONFIGURA UN SONIDO ESPECIAL:*\n" +
        "1️⃣ Toca mi nombre arriba\n" +
        "2️⃣ Notificaciones → Sonido\n" +
        "3️⃣ Elige un tono único\n\n" +
        "Así no confundirás las alertas de trading con otros mensajes.\n\n" +
        planMessage + "\n\n" +
        "🚀 ¡Listo! Espera la próxima señal NOW.\n\n" +
        "📈 *¡Felices operaciones!* 💰\n\n" +
        "🌐 www.condinerolibre.com",
        true
      );
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }
});

// Enviar mensaje a Telegram
async function sendTelegramMessage(chatId: number, text: string, markdown = false) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: markdown ? "Markdown" : undefined,
    }),
  });
}
