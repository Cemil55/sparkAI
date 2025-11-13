import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useTicketData } from "../hooks/useTicketData";
import { callGeminiAPI } from "../services/geminiService";

export default function Index() {
  const [ticketId, setTicketId] = useState("");
  const [description, setDescription] = useState("");
  const [llmResponse, setLlmResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const { tickets, loading: ticketsLoading, getTicketById, error } = useTicketData();

  useEffect(() => {
    if (ticketId) {
      const ticket = getTicketById(ticketId);
      if (ticket) {
        setDescription(ticket.description);
      } else {
        setDescription("Ticket nicht gefunden");
      }
    } else {
      setDescription("");
    }
  }, [ticketId, tickets]);

  const handleSendToLLM = async () => {
    if (!description || description === "Ticket nicht gefunden") {
      alert("Bitte geben Sie zuerst eine gültige Ticket ID ein");
      return;
    }

    setLoading(true);
    setLlmResponse("Verarbeitet...");

    try {
      const response = await callGeminiAPI(description);
      setLlmResponse(response);
    } catch (err) {
      setLlmResponse(`Fehler: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, padding: 20, backgroundColor: "#f5f5f5" }}>
      {/* Ticket ID Input */}
      <View style={{ marginTop: 20 }}>
        <Text style={{ fontSize: 12, fontWeight: "bold", marginBottom: 5 }}>Ticket ID</Text>
        <TextInput
          style={{
            borderWidth: 1,
            borderColor: "#ccc",
            padding: 8,
            borderRadius: 5,
            fontSize: 12,
            backgroundColor: "white",
          }}
          placeholder="z.B. 1"
          value={ticketId}
          onChangeText={setTicketId}
        />
      </View>

      {ticketsLoading && <Text style={{ marginTop: 10, color: "blue" }}>Lädt Tickets...</Text>}
      {error && <Text style={{ marginTop: 10, color: "red" }}>Fehler: {error}</Text>}
      <Text style={{ marginTop: 10, fontSize: 10, color: "#666" }}>
        {tickets.length} Tickets geladen
      </Text>

      {/* Ticket Beschreibung */}
      <View style={{ marginTop: 20 }}>
        <Text style={{ fontSize: 12, fontWeight: "bold", marginBottom: 5 }}>
          Ticketbeschreibung
        </Text>
        <TextInput
          style={{
            borderWidth: 1,
            borderColor: "#ccc",
            padding: 10,
            borderRadius: 5,
            height: 80,
            textAlignVertical: "top",
            backgroundColor: "white",
            fontSize: 12,
          }}
          placeholder="Ticketbeschreibung wird hier angezeigt..."
          value={description}
          editable={false}
          multiline
        />
      </View>

      {/* Button */}
      <TouchableOpacity
        onPress={handleSendToLLM}
        disabled={loading}
        style={{
          backgroundColor: loading ? "#ccc" : "#007AFF",
          padding: 12,
          borderRadius: 5,
          marginTop: 15,
          alignItems: "center",
        }}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={{ color: "white", fontWeight: "bold" }}>SparkAI fragen</Text>
        )}
      </TouchableOpacity>

      {/* LLM Response */}
      <View style={{ marginTop: 20 }}>
        <Text style={{ fontSize: 12, fontWeight: "bold", marginBottom: 5 }}>Gemini Antwort</Text>
        <TextInput
          style={{
            borderWidth: 1,
            borderColor: "#ccc",
            padding: 10,
            borderRadius: 5,
            height: 120,
            textAlignVertical: "top",
            backgroundColor: "white",
            fontSize: 12,
          }}
          placeholder="Die Gemini-Antwort wird hier angezeigt..."
          value={llmResponse}
          editable={false}
          multiline
        />
      </View>

      {/* Debug: Verfügbare Tickets */}
      {tickets.length > 0 && (
        <View style={{ marginTop: 20, marginBottom: 20 }}>
          <Text style={{ fontSize: 10, fontWeight: "bold" }}>Verfügbare Tickets:</Text>
          {tickets.slice(0, 5).map((ticket, idx) => (
            <Text key={idx} style={{ fontSize: 9, color: "#666" }}>
              ID: {ticket.id} - {ticket.description?.substring(0, 30)}...
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
