/**
 * convert-anchor-cookbook - reads a coach's Anchor Meal Cookbook PDF with
 * Claude Opus 4.8 and returns structured cookbook content.
 *
 * Admin-only. The PDF is converted once and never stored (same philosophy
 * as food images in analyze-food). Structured output (json_schema) means
 * the response text is guaranteed-valid AnchorCookbookContent JSON.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Mirrors AnchorCookbookContent in types/index.ts — keep in sync.
const COOKBOOK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title', 'shortTitle', 'clientName', 'subtitle', 'taglines', 'intro',
    'howItWorks', 'meals', 'cheatSheetNote', 'sauceGuide', 'groceryKit', 'signoff',
  ],
  properties: {
    title: { type: 'string' },
    shortTitle: { type: 'string' },
    clientName: { type: 'string' },
    subtitle: { type: 'string' },
    taglines: { type: 'array', items: { type: 'string' } },
    intro: { type: 'string' },
    howItWorks: {
      type: 'object',
      additionalProperties: false,
      required: ['rows', 'footer'],
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['label', 'protein', 'calories'],
            properties: {
              label: { type: 'string' },
              protein: { type: 'number' },
              calories: { type: 'number' },
            },
          },
        },
        footer: { type: 'string' },
      },
    },
    meals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'name', 'timeMinutes', 'blurb', 'ingredients', 'sauces',
          'steps', 'zinger', 'calories', 'protein',
        ],
        properties: {
          name: { type: 'string' },
          timeMinutes: { type: 'number' },
          blurb: { type: 'string' },
          ingredients: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['text', 'calories', 'protein'],
              properties: {
                text: { type: 'string' },
                calories: { type: 'number' },
                protein: { type: 'number' },
              },
            },
          },
          sauces: { type: 'array', items: { type: 'string' } },
          steps: { type: 'array', items: { type: 'string' } },
          zinger: { type: 'string' },
          calories: { type: 'number' },
          protein: { type: 'number' },
        },
      },
    },
    cheatSheetNote: { type: 'string' },
    sauceGuide: {
      type: 'object',
      additionalProperties: false,
      required: ['useFreely', 'useSparingly'],
      properties: {
        useFreely: { type: 'array', items: { type: 'string' } },
        useSparingly: { type: 'array', items: { type: 'string' } },
      },
    },
    groceryKit: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'items', 'note'],
      properties: {
        title: { type: 'string' },
        items: { type: 'array', items: { type: 'string' } },
        note: { type: 'string' },
      },
    },
    signoff: { type: 'string' },
  },
};

const SYSTEM_PROMPT = `You convert a nutrition coach's "Anchor Meal Cookbook" PDF into structured JSON for the Superhuman Lab app. The app renders your JSON as a personal, typeset document for the client, and each recipe's ingredients become one-tap logging presets — so both the words and the numbers matter.

Rules:
1. FAITHFUL TRANSCRIPTION. Preserve the coach's voice exactly — title, subtitle, taglines, intro, blurbs, zingers (the personalized quips), notes, and sign-off must be the coach's own words, cleaned only of PDF artifacts (broken hyphenation, page numbers, repeated headers). Never invent coaching content or change the tone.
2. clientName: the client's first name as it appears in the document, normally capitalized (e.g. "Akshay").
3. title: the document's masthead title as written (e.g. "AKSHAY'S ANCHOR MEAL COOKBOOK").
4. shortTitle: a 1-3 word purpose label for lists. "Anchor Meals" for a general cookbook; reflect the theme when it has one (e.g. "Travel Edition", "Office Lunches").
5. INGREDIENT MACROS: for every recipe, output each ingredient line as written ("text"), and estimate that ingredient's calories and protein so the ingredient sums match the meal's stated totals (within ~5%). If the PDF states no totals for a meal, estimate realistically from the ingredients. Calories as integers; protein to the nearest gram. Water, spices, and zero-calorie items get 0 and 0.
6. Each meal's calories/protein fields = the totals stated in the PDF (or the ingredient sums when none are stated).
7. timeMinutes: as stated, otherwise a realistic estimate.
8. Sections the PDF doesn't contain -> empty strings / empty arrays. Never fabricate a section.
9. signoff: the closing line as written (typically "— Superhuman Lab").`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      return jsonResponse({ error: 'Not authenticated' }, 401);
    }

    // Coach-only surface
    const { data: isAdmin, error: adminError } = await supabaseClient.rpc('is_admin');
    if (adminError || !isAdmin) {
      return jsonResponse({ error: 'Not authorized' }, 403);
    }

    const { pdf_base64 } = await req.json();
    if (!pdf_base64 || typeof pdf_base64 !== 'string') {
      return jsonResponse({ error: 'No PDF provided' }, 400);
    }

    // Tolerate data-URL uploads; Claude needs raw base64
    const pdfData = pdf_base64.replace(/^data:application\/pdf;base64,/, '');
    if (pdfData.length * 0.75 > 10 * 1024 * 1024) {
      return jsonResponse({ error: 'PDF must be less than 10MB' }, 400);
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return jsonResponse(
        { error: 'Anthropic API key not configured — set the ANTHROPIC_API_KEY secret' },
        500
      );
    }

    const anthropic = new Anthropic({ apiKey });

    // Streaming keeps the connection alive through a long conversion;
    // finalMessage() gives the complete response.
    const stream = anthropic.messages.stream({
      model: 'claude-opus-4-8',
      max_tokens: 32000,
      thinking: { type: 'adaptive' },
      output_config: { format: { type: 'json_schema', schema: COOKBOOK_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfData },
            },
            {
              type: 'text',
              text: 'Convert this cookbook PDF into the structured format.',
            },
          ],
        },
      ],
    });

    const message = await stream.finalMessage();

    if (message.stop_reason === 'max_tokens') {
      return jsonResponse({ error: 'The PDF is too long to convert in one pass' }, 422);
    }

    const textBlock = message.content.find((block) => block.type === 'text');
    if (!textBlock || !('text' in textBlock)) {
      return jsonResponse({ error: 'Claude returned no content — try again' }, 502);
    }

    const content = JSON.parse(textBlock.text);
    return jsonResponse({ content });
  } catch (error) {
    console.error('[convert-anchor-cookbook] Error:', error);
    const message =
      error instanceof Anthropic.APIError
        ? `Claude API error (${error.status}): ${error.message}`
        : error instanceof Error
          ? error.message
          : 'Conversion failed';
    return jsonResponse({ error: message }, 500);
  }
});
