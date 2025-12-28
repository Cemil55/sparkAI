export async function translateTicket(subject: string, description: string): Promise<{ text: string; subject?: string; description?: string }> {
  const endpoint = (process.env.EXPO_PUBLIC_TRANSLATE_ENDPOINT || "").trim();
  if (!endpoint) throw new Error("EXPO_PUBLIC_TRANSLATE_ENDPOINT is not set");

  const buildQuestion = (s: string, d: string) =>
    `Bitte übersetze das folgende Ticket ins Deutsche.\n\nBetreff: ${s}\n\nBeschreibung: ${d}`;

  const payload = { question: buildQuestion(subject || "", description || "") };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await res.json();

  let text: string;
  if (json == null) text = "Keine Antwort vom Übersetzungsdienst";
  else if (typeof json === "string") text = json;
  else if (Array.isArray(json.data) && json.data.length) text = json.data.join("\n\n");
  else if (typeof json.result === "string") text = json.result;
  else if (typeof json.output === "string") text = json.output;
  else text = JSON.stringify(json, null, 2);

  // Normalize escaped newline sequences and strip surrounding quotes / trailing JSON suffixes
  let processed = String(text);

  // If the response is a quoted string, try to parse JSON so escapes are interpreted
  if (/^\s*"/.test(processed) && /"\s*(,|\}|$)/.test(processed)) {
    try {
      const parsed = JSON.parse(processed);
      if (typeof parsed === "string") processed = parsed;
    } catch (e) {
      // ignore parse errors; continue with manual unescape below
    }
  }

  // Repeatedly unescape double-escaped sequences (\\n -> \n -> newline)
  // Handle up to a couple of rounds to be robust against double-escaping
  for (let i = 0; i < 3; i++) {
    if (processed.includes("\\\\n")) processed = processed.replace(/\\\\r?\\n/g, "\\n");
  }
  // Now replace remaining escaped newlines with real newlines
  processed = processed.replace(/\\r?\\n/g, "\n");

  // If the response accidentally contains the rest of a surrounding JSON object (e.g., '" ,\n  "question": ...'),
  // trim anything starting at a closing quote followed by a comma and another JSON key to avoid pollution.
  const trailingJsonIndex = processed.search(/"\s*,\s*\n\s*"[a-zA-Z0-9_]+\s*":/);
  if (trailingJsonIndex !== -1) {
    processed = processed.slice(0, trailingJsonIndex);
  }

  // Remove any wrapping leading/trailing quotes leftover
  processed = processed.replace(/^\s*"/, "").replace(/"\s*$/, "");

  // Now run the extraction on the normalized text
  // Subject should end at the first blank line (\n\n) or literal "\\n\\n" — do not include the subsequent content.
  const subjRegex = /Betreff\s*[:\-]\s*([\s\S]*?)(?:\r?\n\s*\r?\n|\\n\s*\\n|$)/i;
  const descRegex = /Beschreibung\s*[:\-]\s*([\s\S]*)/i;

  let parsedSubject: string | undefined = undefined;
  let parsedDescription: string | undefined = undefined;

  const subjMatch = processed.match(subjRegex);
  const descMatch = processed.match(descRegex);

  if (subjMatch && subjMatch[1]) {
    parsedSubject = subjMatch[1].trim();
  }

  if (descMatch && descMatch[1]) {
    parsedDescription = descMatch[1].trim();
  }

  // Fallback heuristics when explicit labels are not present:
  if (!parsedSubject) {
    // Take the processed text up to the first blank-line or literal "\\n\\n" as the subject candidate
    const firstSegment = (processed || "").split(/(?:\r?\n\s*\r?\n|\\n\s*\\n)/)[0] || "";
    const firstLine = (firstSegment || "").split(/\r?\n/).find((l) => l && l.trim().length > 0);
    if (firstLine) parsedSubject = firstLine.trim().slice(0, 120);
  }

  if (!parsedDescription) {
    // If there is a blank-line split or literal '\\n\\n', use the remainder as description; otherwise use full processed text.
    const parts = (processed || "").split(/(?:\r?\n\s*\r?\n|\\n\s*\\n)/);
    if (parts.length > 1) parsedDescription = parts.slice(1).join("\n\n").trim();
    else parsedDescription = processed.trim();
  }

  // Additional cleanup: if parsedSubject accidentally contains a trailing 'Beschreibung' label or literal '\\n', strip it
  if (parsedSubject) {
    // Remove any trailing '\n' sequences or the word 'Beschreibung' and anything after
    parsedSubject = parsedSubject.replace(/(\\r?\\n|\r?\n)+/g, " ").replace(/\s*Beschreibung\s*[:\-]?.*$/i, "").trim();
  }

  // Set text to the normalized version so callers see consistent output
  text = processed;

  return { text, subject: parsedSubject, description: parsedDescription };
}
