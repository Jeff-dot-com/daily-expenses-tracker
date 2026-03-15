import { NextRequest, NextResponse } from "next/server";

import { Expense } from "@/entities/Expense";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_TAGS,
  GEMINI_PDF_RULES,
} from "@/lib/config";
import { genAI } from "@/lib/gemini";

type AITransaction = {
  date: string;
  description: string;
  amount: number;
  categoryId?: string;
  tagId?: string;
};

export async function POST(request: NextRequest) {
  try {
    if (!genAI) {
      return NextResponse.json(
        { error: "Gemini API key not configured" },
        { status: 500 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = buffer.toString("base64");

    // 1. Move logic to System Instruction
    const systemInstruction = `
You are a specialized bank statement parser. Your goal is to extract every single transaction from the provided PDF.

${GEMINI_PDF_RULES}

Available categories (use the id):
${DEFAULT_CATEGORIES.map((c) => `- ${c.name} (id: ${c.id})`).join("\n")}

Available tags (use the id):
${DEFAULT_TAGS.map((t) => `- ${t.name} (id: ${t.id})`).join("\n")}

Return the data as a JSON array of objects. 
Each object MUST follow this schema:
{
  "date": "YYYY-MM-DD",
  "description": "Merchant name",
  "amount": number,
  "categoryId": "string",
  "tagId": "string"
}

If you cannot find a specific category, default to categoryId "3".
Important: Return ONLY the JSON array. No markdown formatting.`;

    // 2. Initialize model with system instructions
    // Note: 1.5-flash is the current stable workhorse for free-tier PDF OCR
    const model = genAI.getGenerativeModel({
      generationConfig: { responseMimeType: "application/json" },
      model: "gemini-2.5-flash",
      systemInstruction: systemInstruction,
    });

    // 3. Simple prompt for the content call
    const result = await model.generateContent([
      {
        inlineData: {
          data: base64,
          mimeType: file.type,
        },
      },
      "Extract all transactions from the attached bank statement.",
    ]);

    const response = await result.response;
    const text = response.text();

    let transactions: AITransaction[];
    try {
      transactions = JSON.parse(text);
    } catch (error) {
      console.error("JSON Parsing failed. Raw text:", text);
      return NextResponse.json(
        { details: text, error: "AI returned invalid JSON" },
        { status: 500 },
      );
    }

    const expenses: Expense[] = transactions.map((t, index) => ({
      amount: parseFloat(String(t.amount)),
      categoryId: t.categoryId || "3",
      createdAt: new Date(),
      date: new Date(t.date),
      description: t.description || "",
      id: `temp-${Date.now()}-${index}`,
      memberId: "1",
      tagId: t.tagId || null,
      updatedAt: new Date(),
    }));

    return NextResponse.json({
      count: expenses.length,
      expenses,
      success: true,
    });
  } catch (error: any) {
    console.error("PDF parsing error:", error);

    const status = error?.status || 500;
    const message = error?.message || "Internal Server Error";

    if (status === 429) {
      return NextResponse.json(
        {
          code: "RATE_LIMIT",
          error:
            "The free tier is currently busy. Please wait 60 seconds and try again.",
        },
        { status: 429 },
      );
    }

    return NextResponse.json({ error: message }, { status });
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
