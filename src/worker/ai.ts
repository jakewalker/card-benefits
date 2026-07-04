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
  parsedCardsPayloadSchema,
  type ParsedCardsPayload,
} from "../shared/types";

/**
 * The JSON schema handed to the model. `properties.cards.items` is the exact
 * structural twin of `parsedCardPayloadSchema` in src/shared/types.ts (the
 * whole thing mirrors `parsedCardsPayloadSchema`). Structured-outputs rules:
 * `additionalProperties: false` everywhere, every property listed in
 * `required`, and no min/max constraints.
 */
const PARSED_CARD_ENTRY_SCHEMA = {
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

export const PARSED_CARDS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cards"],
  properties: {
    cards: { type: "array", items: PARSED_CARD_ENTRY_SCHEMA },
  },
} as const;

function systemPrompt(today: string): string {
  return `You are an expert at reading US credit-card benefit descriptions and extracting cards and their RECURRING benefits into a structured schema.

Today's date is ${today}; use it for any relative-date reasoning.

The text may describe ONE card or SEVERAL. Return one entry in "cards" per distinct credit card. Markdown headings are a common convention — e.g. "# Amex" (an issuer) containing "## Platinum" and "## Gold" (two cards) — but any clear separation counts. When an issuer heading wraps several card headings, apply that issuer to each of those cards. Never merge different cards' benefits, and never split one card into two.

For EACH card, extract into its entry:

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
    - "anniversary" ONLY when the text explicitly ties the reset to the cardmember/membership year — "each cardmember year", "membership year", "each year of card membership". When the text doesn't specify, default to "calendar": the large majority of benefits reset on calendar boundaries.
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
- "notes": a short per-card string surfacing caveats, ambiguities, one-time bonuses, or anything the user should double-check for THAT card. null if there is nothing to add.`;
}

/**
 * Call Claude to parse a description of one or more cards into structured
 * data (one `cards` entry per card found).
 * @param apiKey  Anthropic API key (from the Worker secret).
 * @param text    The user's plain-English card/benefit description.
 * @param today   Today's date 'YYYY-MM-DD' in the app timezone, for context.
 */
export async function parseCardDescription(
  apiKey: string,
  text: string,
  today: string,
): Promise<ParsedCardsPayload> {
  const client = new Anthropic({ apiKey });

  // Streamed under the hood (required by the SDK at this max_tokens — large
  // multi-card outputs would otherwise risk HTTP timeouts); we only consume
  // the final message.
  const stream = client.messages.stream({
    model: "claude-opus-4-8",
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    output_config: {
      format: { type: "json_schema", schema: PARSED_CARDS_JSON_SCHEMA },
    },
    system: systemPrompt(today),
    messages: [{ role: "user", content: text }],
  });
  const message = await stream.finalMessage();

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    // No text block means the model returned no structured output; treat as
    // bad output so the route maps it to ai_bad_output.
    throw new SyntaxError("no text block in model response");
  }

  const parsed: unknown = JSON.parse(textBlock.text);
  return parsedCardsPayloadSchema.parse(parsed);
}
