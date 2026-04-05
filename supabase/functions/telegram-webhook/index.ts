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

      // Guardar chat_id en Supabase
      const { error } = await supabase
        .from("profiles")
        .update({ telegram_chat_id: chatId.toString() })
        .eq("user_id", userId);

      if (error) {
        console.error("Error updating profile:", error);
        await sendTelegramMessage(chatId, "❌ Error al conectar. Intenta nuevamente.");
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      // Confirmación
      await sendTelegramMessage(
        chatId,
        "✅ *Conectado a CDL Radar*\n\nAhora recibirás alertas de todas las señales de trading en tiempo real.\n\n🔔 Las notificaciones llegarán automáticamente cuando el Radar detecte oportunidades.",
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
