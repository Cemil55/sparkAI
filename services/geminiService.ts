import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || "";

if (!API_KEY) {
  console.warn("⚠️ GEMINI API Key nicht gesetzt! Bitte .env Datei konfigurieren.");
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

export const callGeminiAPI = async (ticketDescription: string): Promise<string> => {
  try {
    const prompt = `Du bist ein technischer Support-Agent. Deine Aufgabe ist es, AUSSCHLIESSLICH Lösungsvorschläge für das folgende Problem zu geben.

Gib nur konkrete, praktische Lösungsschritte an - KEINE Erklärungen, KEINE Fragen, KEINE Problemanalyse.

Ticketbeschreibung: ${ticketDescription}

Lösungsvorschläge:`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
