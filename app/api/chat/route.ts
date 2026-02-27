import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "@/lib/systemPrompt";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Use the model specified in the PRD. Update here if the model name changes.
const MODEL = "claude-sonnet-4-20250514";

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
    }

    // Validate that the first message is from the user (Anthropic API requirement)
    if (messages[0]?.role !== "user") {
      return NextResponse.json(
        { error: "First message must be from user" },
        { status: 400 }
      );
    }

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });

    const content = response.content[0];
    if (content.type !== "text") {
      return NextResponse.json(
        { error: "Unexpected response type from AI" },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: content.text });
  } catch (error: unknown) {
    console.error("Chat API error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to get AI response";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
