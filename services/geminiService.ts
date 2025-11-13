const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || "";

if (!API_KEY) {
  console.warn("⚠️ GEMINI API Key nicht gesetzt! Bitte .env Datei konfigurieren.");
}

export const callGeminiAPI = async (ticketDescription: string): Promise<string> => {
  if (!API_KEY) {
    throw new Error("Gemini API Key fehlt. Bitte .env prüfen.");
  }

  try {
    const prompt = `Du bist ein technischer Support-Agent. Deine Aufgabe ist es, AUSSCHLIESSLICH Lösungsvorschläge für das folgende Problem zu geben.

Gib nur konkrete, praktische Lösungsschritte an - KEINE Erklärungen, KEINE Fragen, KEINE Problemanalyse.

Ticketbeschreibung: ${ticketDescription}

Lösungsvorschläge:`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    const data = await response.json();
    const text =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Keine Antwort erhalten";

    return text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};
