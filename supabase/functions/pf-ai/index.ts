// pf-ai — ИИ-помощник Качества Platform 2.0 (P2-0034). Логика — handler.ts; выкладка и откат — docs/EDGE_FUNCTIONS.md.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createHandler } from './handler.ts';

serve(createHandler((name) => Deno.env.get(name)));
