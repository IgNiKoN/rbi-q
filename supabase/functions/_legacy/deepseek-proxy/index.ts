import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DEEPSEEK_API_KEY = Deno.env.get('DEEPSEEK_API_KEY');
const CORPORATE_PASSWORD = Deno.env.get('AI_CORP_PASSWORD') || '12345';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ------ СТАРЫЙ СПОСОБ (Bearer token) ------
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (token && token === CORPORATE_PASSWORD) {
      const body = await req.json();
      const dsResponse = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify(body)
      });
      const dsData = await dsResponse.json();
      return new Response(JSON.stringify(dsData), {
        status: dsResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ------ НОВЫЕ РЕЖИМЫ (mode) ------
    const body = await req.json();
    const { model, messages, temperature, max_tokens, mode, engineer_name, project_code, password } = body;

    if (mode === 'corporate') {
      if (password !== CORPORATE_PASSWORD) {
        return new Response(JSON.stringify({ error: 'Неверный корпоративный пароль' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    } else if (mode === 'role') {
      // P2-0034 (решение владельца 25.10.2026): вход «по имени инженера и коду объекта» закрыт — ИИ по учётке в Платформе 2.0.
      return new Response(JSON.stringify({ error: 'Режим отключён, войдите в Платформу 2.0' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ error: 'Неизвестный режим доступа' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ------ ВЫЗОВ DEEPSEEK ------
    const dsResponse = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens })
    });
    const dsData = await dsResponse.json();
    return new Response(JSON.stringify(dsData), {
      status: dsResponse.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
