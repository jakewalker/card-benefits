/**
 * Claude API integration for the AI parse flow. Owned by Phase D.
 *
 * Turns a plain-English credit-card benefit description into a structured
 * ParsedCardPayload using the Anthropic Messages API with structured outputs
 * (output_config.format = json_schema) plus zod re-validation for defense in
 * depth. Never logs the API key or the raw model output; never touches the DB.
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  parsedCardPayloadSchema,
  type ParsedCardPayload,
} from "../shared/types";

/**
 * The JSON schema handed to the model. It is the exact structural twin of
 * `parsedCardPayloadSchema` in src/shared/types.ts. Structured-outputs rules:
 * `additionalProperties: false` everywhere, every property listed in
 * `required`, and no min/max constraints.
 */
export const PARSED_CARD_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["card", "benefits", "notes"],
  properties: {
    card: {
      type: "object",
      additionalProperties: false,
      required: ["name", "issuer", "annual_fee_cents", "anniversary_date"],
      properties: {
        name: { type: "string" },
        issuer: { type: ["string", "null"] },
        annual_fee_cents: { type: ["integer", "null"] },
        anniversary_date: { type: ["string", "null"], format: "date" },
      },
    },
    benefits: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "description",
          "value_cents",
          "frequency",
          "anchor",
          "category",
          "automatic",
          "confidence",
        ],
        properties: {
          name: { type: "string" },
          description: { type: ["string", "null"] },
          value_cents: { type: ["integer", "null"] },
          frequency: {
            type: "string",
            enum: ["monthly", "quarterly", "semiannual", "annual"],
          },
          anchor: { type: "string", enum: ["calendar", "anniversary"] },
          category: {
            type: "string",
            enum: [
              "dining",
              "hotels",
              "travel",
              "shopping",
              "entertainment",
              "other",
            ],
          },
          automatic: { type: "boolean" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    notes: { type: ["string", "null"] },
  },
} as const;

function systemPrompt(today: string): string {
  return `You are an expert at reading US credit-card benefit descriptions and extracting a card and its RECURRING benefits into a structured schema.

Today's date is ${today}; use it for any relative-date reasoning.

Extract into the schema:

CARD
- name: the card's name.
- issuer: the bank/issuer (e.g. "American Express", "Chase") or null if not stated.
- annual_fee_cents: the annual fee as an integer number of cents (e.g. $695 -> 69500). null if the fee is not mentioned.
- anniversary_date: null UNLESS the text literally states the cardmember anniversary / account-open / renewal date. The user fills this in during review; never guess it.

BENEFITS (array) — one entry per RECURRING benefit only:
- name: short benefit name (e.g. "Uber Cash", "Airline Fee Credit").
- description: a brief description, or null.
- value_cents: the benefit's dollar value as integer cents (e.g. $15 -> 1500), or null if no clear amount.
- frequency: how often the benefit RESETS — one of monthly, quarterly, semiannual, annual.
- anchor: how the cycle is anchored:
    - "calendar" when it resets on calendar boundaries — calendar month / quarter / half-year / year. Phrases like "each calendar year", "January through June", "semi-annually (Jan-Jun, Jul-Dec)", "per calendar quarter".
    - "anniversary" when it resets on the cardmember/membership year — "each cardmember year", "membership year", "each year of card membership". This is the most common pattern for annual travel credits, so prefer it for annual credits unless the text clearly says "calendar year".
- category: what the benefit is spent on — one of:
    - "dining": restaurant, food-delivery, and dining-program credits (Resy, Grubhub, Uber Eats-style credits).
    - "hotels": hotel credits and hotel-program benefits (FHR/THC credits, hotel brand credits, free-night awards).
    - "travel": flights, airline fees, general travel credits, rideshare, TSA PreCheck/Global Entry/CLEAR.
    - "shopping": retail credits (Saks, Amazon-style shopping credits).
    - "entertainment": streaming/digital entertainment, event/ticket credits.
    - "other": anything that doesn't clearly fit (wellness, phone credits, memberships, etc.).
- automatic: true ONLY for benefits that post as statement credits with NO action needed (e.g. an anniversary bonus or credit that simply appears on the statement). If the cardholder must enroll, use a specific merchant, or make a qualifying purchase to trigger the credit, set false.
- confidence:
    - "high" when frequency/anchor/value are explicitly stated in the text.
    - "medium" when you inferred a value from typical card conventions rather than explicit text.
    - "low" when frequency, anchor, or value is genuinely ambiguous in the text.

RULES
- Only RECURRING benefits go in "benefits". One-time signup/welcome bonuses and non-recurring perks (lounge access, elite status, purchase protection, no-foreign-transaction-fees, etc.) are NOT benefits — mention noteworthy ones in "notes" instead.
- Never invent benefits, amounts, or details that are not present in the text.
- Convert all dollar amounts to integer cents.

NOTES
- "notes": a short string surfacing caveats, ambiguities, one-time bonuses, or anything the user should double-check. null if there is nothing to add.`;
}

/**
 * Call Claude to parse a card description into structured data.
 * @param apiKey  Anthropic API key (from the Worker secret).
 * @param text    The user's plain-English card/benefit description.
 * @param today   Today's date 'YYYY-MM-DD' in the app timezone, for context.
 */
export async function parseCardDescription(
  apiKey: string,
  text: string,
  today: string,
): Promise<ParsedCardPayload> {
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: {
      format: { type: "json_schema", schema: PARSED_CARD_JSON_SCHEMA },
    },
    system: systemPrompt(today),
    messages: [{ role: "user", content: text }],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    // No text block means the model returned no structured output; treat as
    // bad output so the route maps it to ai_bad_output.
    throw new SyntaxError("no text block in model response");
  }

  const parsed: unknown = JSON.parse(textBlock.text);
  return parsedCardPayloadSchema.parse(parsed);
}
