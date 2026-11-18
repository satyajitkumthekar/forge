/**
 * Supabase Edge Function: Analyze Food
 * Analyzes food from description and/or image using OpenAI GPT-4o with WEEKLY MEMORY
 * SECURITY: Requires authentication + server-side rate limiting
 * MEMORY: Maintains weekly conversation history by fetching past week's food logs from database
 *
 * Two modes, behind the same sign-in check and daily limit:
 * - default: a description and/or image in; name, calories, protein, carbs
 *   and fat out, in one request
 * - mode 'carbs_fat': foods whose calories and protein are already known in;
 *   carbs and fat for each out. For shortcuts that copy a food logged before
 *   the app tracked carbs and fat. Calories and protein are never
 *   re-estimated here, and it skips the week memory to stay fast.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SYSTEM_PROMPT = `You are an expert nutrition analyst specializing in Indian and South Asian cuisine. Analyze food from descriptions and/or images and return accurate calorie and protein estimates.

CRITICAL RULES FOR MULTIPLE ITEMS:
- When you see multiple items on a plate or in the description, IDENTIFY EACH ONE SEPARATELY first
- Estimate portion size for EACH item individually
- Calculate calories and protein for EACH item
- Sum everything up for the final totals
- List all items in the name field (e.g., "2 rotis, dal makhani, rice, raita")

PORTION SIZE ESTIMATION (from images):
- Use visual references: Compare to hand size, plate size, spoon size
- Standard portions: 1 roti ≈ 30g, 1 cup dal ≈ 200g, 1 cup rice ≈ 150g cooked
- If uncertain between sizes, choose the LARGER estimate (people underestimate)
- Account for visible oil/ghee pools - add 1 tbsp (120 cal) per visible pool

INDIAN FOOD SPECIFICS:
- Account for cooking methods: Tandoor items have less oil, curries have more
- Hidden calories: Estimate ghee/oil used in cooking (typically 1-2 tbsp per serving for curries)
- Paneer dishes: Include high fat content (paneer is ~20% fat)
- Fried items: Add 30-50% calories for oil absorption (pakoras, samosas, bhajis)
- Restaurant food: Add 20% more calories than home-cooked (more oil/ghee/sugar)

COMPOSITE DISHES - Break them down:
- Biryani = rice + protein + oil/ghee + garnishes
- Dal makhani = lentils + cream + butter + oil
- Sabzi = vegetables + oil/ghee + spices
- Chole = chickpeas + oil + masala

ACCURACY PRINCIPLES:
- When in doubt, estimate HIGHER (people consistently underestimate calories)
- Don't be conservative with portions - match what you actually see
- Include everything visible: garnishes, sides, accompaniments
- Round to realistic numbers (avoid 347 cal, use 350 cal)

MEMORY & CONSISTENCY:
- Remember specific products/brands mentioned by the user in this week's logs
- Use consistent calorie estimates for items the user logs repeatedly
- If user mentioned exact calories for a custom item, use those values going forward

CARBS AND FAT:
- Also estimate total carbohydrates and total fat in grams, for everything combined
- Settle calories and protein first, exactly as described above, then fit carbs and fat to them
- Check your numbers: protein x 4 + carbs x 4 + fat x 9 should land close to the calories (alcohol and fibre can leave a small gap)

Return ONLY valid JSON with this structure:
{
  "name": "descriptive name listing all items identified",
  "calories": number (total for everything),
  "protein": number (total in grams),
  "carbs": number (total carbohydrates in grams),
  "fat": number (total fat in grams)
}`;

// Strict schema: all five fields always come back, in this order (calories
// and protein are settled before carbs and fat are written)
const ANALYSIS_SCHEMA = {
  name: 'food_analysis',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      calories: { type: 'number' },
      protein: { type: 'number' },
      carbs: { type: 'number' },
      fat: { type: 'number' },
    },
    required: ['name', 'calories', 'protein', 'carbs', 'fat'],
    additionalProperties: false,
  },
};

const CARBS_FAT_PROMPT = `You are an expert nutrition analyst specializing in Indian and South Asian cuisine. You will get a list of foods a person has already logged. The calories and protein of each food are settled and must not be changed. Estimate only the total carbohydrates and total fat of each food, in grams.

RULES:
- Use each food's name and description to judge what it is, how much of it there is, and how it was cooked
- Fit the numbers to what is known: protein x 4 + carbs x 4 + fat x 9 should land close to the food's calories (alcohol and fibre can leave a small gap)
- Account for cooking fat: curries, fried items and restaurant food carry more fat than plain or tandoor items
- Round to realistic numbers (avoid 31.7, use 32)
- Return exactly one result per food, with the same index it was given`;

const CARBS_FAT_SCHEMA = {
  name: 'carbs_fat_estimates',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'integer' },
            carbs: { type: 'number' },
            fat: { type: 'number' },
          },
          required: ['index', 'carbs', 'fat'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  },
};

// A saved meal rarely has more than a dozen items
const CARBS_FAT_MAX_ITEMS = 40;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

/**
 * Grams as the database stores them (one decimal), or null when the model
 * gave nothing usable. Unknown stays unknown: never a made-up zero.
 */
function grams(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0 || value > 9999) return null;
  return Math.round(value * 10) / 10;
}

/**
 * Mode 'carbs_fat': carbs and fat for foods whose calories and protein are
 * already known. Replies in the order the foods were sent.
 */
async function estimateCarbsFat(rawItems: unknown, userId: string, supabaseAdmin: any): Promise<Response> {
  const items = Array.isArray(rawItems)
    ? rawItems.filter(
        (item) =>
          item &&
          typeof item.name === 'string' &&
          item.name.trim() !== '' &&
          typeof item.calories === 'number' &&
          typeof item.protein === 'number'
      )
    : [];

  if (!Array.isArray(rawItems) || items.length === 0 || items.length !== rawItems.length) {
    return new Response(
      JSON.stringify({ error: 'Each food needs a name, calories and protein' }),
      { status: 400, headers: JSON_HEADERS }
    );
  }
  if (items.length > CARBS_FAT_MAX_ITEMS) {
    return new Response(
      JSON.stringify({ error: `At most ${CARBS_FAT_MAX_ITEMS} foods at a time` }),
      { status: 400, headers: JSON_HEADERS }
    );
  }

  const foods = items.map((item, index) => {
    const description =
      typeof item.description === 'string' && item.description.trim() !== '' && item.description !== item.name
        ? item.description.slice(0, 500)
        : undefined;
    return {
      index,
      name: item.name.slice(0, 300),
      ...(description ? { description } : {}),
      calories: item.calories,
      protein: item.protein,
    };
  });

  const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: CARBS_FAT_PROMPT },
        { role: 'user', content: JSON.stringify(foods) },
      ],
      response_format: { type: 'json_schema', json_schema: CARBS_FAT_SCHEMA },
      temperature: 0.3,
      max_tokens: 150 + foods.length * 40,
    }),
  });

  if (!openaiResponse.ok) {
    const errorText = await openaiResponse.text();
    console.error('OpenAI API error:', errorText);
    throw new Error(`OpenAI API error: ${openaiResponse.status}`);
  }

  const openaiData = await openaiResponse.json();
  const result = JSON.parse(openaiData.choices[0].message.content || '{}');
  if (!Array.isArray(result.items)) {
    throw new Error('Invalid response from OpenAI');
  }

  const byIndex = new Map<number, { carbs: unknown; fat: unknown }>();
  for (const estimate of result.items) {
    if (estimate && Number.isInteger(estimate.index)) byIndex.set(estimate.index, estimate);
  }

  await supabaseAdmin.rpc('log_api_usage', {
    user_uuid: userId,
    action: 'carbs_fat_estimate',
    was_success: true,
    error_msg: null,
  });

  return new Response(
    JSON.stringify({
      items: foods.map((food) => {
        const estimate = byIndex.get(food.index);
        return { carbs: grams(estimate?.carbs), fat: grams(estimate?.fat) };
      }),
    }),
    { headers: JSON_HEADERS }
  );
}

// Helper: Get start of current week (Monday) using UTC
function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);

  // Format using UTC to match frontend
  return d.toISOString().split('T')[0];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    // ============================================
    // SECURITY: Verify Authentication
    // ============================================
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing auth token' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Create Supabase client with user's auth token
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    // Create service role client for admin operations
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid auth token' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // ============================================
    // SECURITY: Check Rate Limit SERVER-SIDE
    // ============================================
    const { data: canProceed, error: rateLimitError } = await supabase.rpc(
      'check_and_increment_rate_limit',
      { user_uuid: user.id }
    );

    if (rateLimitError || !canProceed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Parse request body
    const { description, image, mode, items } = await req.json();

    // Shortcut mode: only carbs and fat, for foods already logged
    if (mode === 'carbs_fat') {
      return await estimateCarbsFat(items, user.id, supabaseAdmin);
    }

    if (!description && !image) {
      return new Response(
        JSON.stringify({ error: 'Either description or image is required' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // ============================================
    // MEMORY: Fetch Past Week's Food Logs
    // ============================================
    const currentWeekStart = getWeekStart();

    // Fetch user's food entries from this week
    const { data: recentLogs, error: logsError } = await supabaseAdmin
      .from('food_entries')
      .select('name, description, calories, protein, carbs, fat, created_at')
      .eq('user_id', user.id)
      .gte('entry_date', currentWeekStart)
      .order('created_at', { ascending: true });

    if (logsError) {
      console.error('Error fetching food logs:', logsError);
      // Continue without history if fetch fails - degraded but functional
    }

    // ============================================
    // BUILD CONVERSATION HISTORY
    // ============================================
    const messages: any[] = [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
    ];

    // Add past week's food logs as conversation history
    if (recentLogs && recentLogs.length > 0) {
      for (const log of recentLogs) {
        // Add user message (what they described/logged)
        messages.push({
          role: 'user',
          content: log.description || log.name,
        });

        // Add assistant response (what we analyzed it as). Carbs and fat
        // join the example only when the row has them: food logged before
        // they were tracked stays as it was, never padded with zeros.
        messages.push({
          role: 'assistant',
          content: JSON.stringify({
            name: log.name,
            calories: log.calories,
            protein: log.protein,
            ...(log.carbs != null && log.fat != null ? { carbs: log.carbs, fat: log.fat } : {}),
          }),
        });
      }
    }

    // Add current request as user message
    const currentUserContent: any[] = [];

    if (description) {
      currentUserContent.push({
        type: 'text',
        text: description,
      });
    }

    if (image) {
      currentUserContent.push({
        type: 'image_url',
        image_url: {
          url: image,
        },
      });
    }

    messages.push({
      role: 'user',
      content: currentUserContent,
    });

    // ============================================
    // CALL OPENAI CHAT COMPLETIONS API
    // ============================================
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        response_format: { type: 'json_schema', json_schema: ANALYSIS_SCHEMA },
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${openaiResponse.status}`);
    }

    const openaiData = await openaiResponse.json();
    const result = JSON.parse(openaiData.choices[0].message.content || '{}');

    // Validate response has required fields
    if (!result.name || typeof result.calories !== 'number') {
      throw new Error('Invalid response from OpenAI');
    }

    // ============================================
    // LOG API USAGE FOR ANALYTICS
    // ============================================
    await supabaseAdmin.rpc('log_api_usage', {
      user_uuid: user.id,
      action: 'food_analysis',
      was_success: true,
      error_msg: null,
    });

    return new Response(
      JSON.stringify({
        name: result.name,
        calories: result.calories,
        protein: result.protein || 0,
        carbs: grams(result.carbs),
        fat: grams(result.fat),
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (error) {
    console.error('Food analysis error:', error);

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Failed to analyze food',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
});
