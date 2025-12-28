import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ActivityIndicator, Image, Text, TextInput, TouchableOpacity, View } from "react-native";
import { translateTicket } from "../services/translateService";

type RawDemo = any;

export const TicketLanding: React.FC<{ onSelect: (t: RawDemo) => void }> = ({ onSelect }) => {
  // The demo JSON may be an array or a single object (or malformed).
  // Be defensive: normalize to an array so downstream code can call slice/map safely.
  const raw: any = require("../assets/data/ticket_demo.json");
  let items: RawDemo[] = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (raw && typeof raw === "object") {
    // if it contains an array inside a property like `tickets`, prefer that
    if (Array.isArray(raw.tickets)) items = raw.tickets;
    // otherwise if it looks like a single demo ticket (has Case Number), wrap it
    else if (raw["Case Number"] || raw.caseNumber) items = [raw];
    // otherwise, try converting object values to an array (handles numeric keys or accidental object shapes)
    else {
      const vals = Object.values(raw).filter((v) => v && typeof v === "object");
      if (vals.length) items = vals as RawDemo[];
    }
  }

  if (!items || !Array.isArray(items)) items = [];

  const [itemsState, setItemsState] = useState<RawDemo[]>(items);
  const [translations, setTranslations] = useState<Record<string, { loading: boolean; result?: string | null; error?: string | null; applied?: boolean; original?: { subject?: string; description?: string } }>>({});

  const doTranslate = async (id: string, subject: string, description: string) => {
    setTranslations((s) => ({ ...s, [id]: { ...(s[id] || {}), loading: true } }));
    try {
      const res = await translateTicket(subject || "", description || "");
      // Save original values so we can undo later
      setTranslations((s) => ({ ...s, [id]: { ...(s[id] || {}), loading: false, result: res.text, applied: true, original: { subject, description } } }));

      // If parsed subject/description are available, overwrite local item
      if (res.subject || res.description) {
        setItemsState((prev) =>
          prev.map((item) => {
            const itemId = (item["Case Number"] || "").toString().split("#")[1] || (item["Case Number"] || item.caseNumber);
            if (String(itemId) !== String(id)) return item;
            const updated = { ...(item as any) } as any;
            // store original values on the item so parent can detect translated state
            if (res.subject) {
              updated._originalSubject = item.Subject;
              updated.Subject = res.subject;
            }
            if (res.description) {
              updated._originalDescription = item["Case Description"];
              updated["Case Description"] = res.description;
            }
            updated._translated = true;
            return updated;
          })
        );
      }
    } catch (err: any) {
      setTranslations((s) => ({ ...s, [id]: { ...(s[id] || {}), loading: false, error: String(err.message ?? err) } }));
    }
  };

  const undoTranslate = (id: string) => {
    const t = translations[id];
    if (!t || !t.applied || !t.original) return;
    // Restore original values
    setItemsState((prev) =>
      prev.map((item) => {
        const itemId = (item["Case Number"] || "").toString().split("#")[1] || (item["Case Number"] || item.caseNumber);
        if (String(itemId) !== String(id)) return item;
        const updated = { ...(item as any) } as any;
        if (t.original?.subject) updated.Subject = t.original.subject;
        if (t.original?.description) updated["Case Description"] = t.original.description;
        // clear translation markers
        updated._translated = false;
        delete updated._originalSubject;
        delete updated._originalDescription;
        return updated;
      })
    );
    // Clear translation result and mark as not applied
    setTranslations((s) => ({ ...s, [id]: { ...(s[id] || {}), applied: false, result: null } }));
  };

  const toggleTranslate = async (id: string, subject: string, description: string) => {
    const t = translations[id];
    if (t && t.applied) {
      undoTranslate(id);
    } else {
      await doTranslate(id, subject, description);
    }
  };

  return (
    <View style={{ padding: 20, paddingTop: 20 }}>
      {/* Header: search, filters, change view */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 40 }}>
        <View style={{ flex: 1, backgroundColor: "#fff", borderRadius: 8, padding: 12, borderWidth: 1, borderColor: "#F0F0F3", flexDirection: "row", alignItems: "center" }}>
          <MaterialCommunityIcons name="magnify" size={18} color="#C4C4C4" />
          <TextInput placeholder="Search for ticket ..." placeholderTextColor="#C4C4C4" style={{ marginLeft: 10, flex: 1 }} />
        </View>

        <TouchableOpacity style={{ backgroundColor: "#fff", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#F0F0F3" }}>
          <Text style={{ color: "#6B6B78", fontWeight: "600" }}>Add Filter</Text>
        </TouchableOpacity>

        <TouchableOpacity style={{ backgroundColor: "#fff", borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: "#F0F0F3" }}>
          <Text style={{ color: "#6B6B78", fontWeight: "600" }}>Change View</Text>
        </TouchableOpacity>
      </View>


      {itemsState.slice(0, 4).map((t) => {
        const id = (t["Case Number"] || "").toString().split("#")[1] || (t["Case Number"] || t.caseNumber);
        const priority = (t.Priority || "").toString();
        const status = (t.Status || "").toString();

        const trans = translations[id] || { loading: false };

        return (
          <TouchableOpacity
            key={id}
            onPress={() => onSelect(t)}
            style={{
              backgroundColor: "#fff",
              padding: 18,
              borderRadius: 12,
              marginBottom: 16,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.06,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ fontWeight: "700", fontSize: 16 }}>Ticket# {id}</Text>

                  <TouchableOpacity onPress={() => toggleTranslate(id, t.Subject, t["Case Description"])} style={{ padding: 6, marginLeft: 8 }}>
                    {trans.loading ? (
                      <ActivityIndicator size="small" />
                    ) : (
                      <MaterialCommunityIcons name="translate" size={18} color={trans.applied ? "#A3A3A3" : "#5B60FF"} />
                    )}
                  </TouchableOpacity>

                  <View style={{ marginLeft: 8, flexDirection: "row", gap: 8 }}>
                    <View style={{ backgroundColor: status.toLowerCase().includes("open") ? "#DBEAFE" : "#D1D5DB", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 }}>
                      <Text style={{ color: status.toLowerCase().includes("open") ? "#1E40AF" : "#666", fontWeight: "600" }}>{status}</Text>
                    </View>
                    <View style={{ backgroundColor: priority.toLowerCase().includes("high") ? "#FEE2E2" : priority.toLowerCase().includes("medium") ? "#FEF3C7" : "#D1FAE5", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 }}>
                      <Text style={{ color: priority.toLowerCase().includes("high") ? "#991B1B" : priority.toLowerCase().includes("medium") ? "#92400E" : "#065F46", fontWeight: "600" }}>{priority}</Text>
                    </View>
                  </View>
                </View>

                <Text style={{ marginTop: 10, color: "#444", fontSize: 18, fontWeight: "600" }}>{t.Subject}</Text>
                <Text style={{ marginTop: 6, color: "#777", fontSize: 14 }} numberOfLines={3}>{t["Case Description"]}</Text>

                {trans.error ? (
                  <Text style={{ marginTop: 8, color: "#B93F4B" }}>{trans.error}</Text>
                ) : null}

                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 20 }}>
                  <Image source={require("../assets/images/SBB.png")} style={{ width: 28, height: 28, borderRadius: 14, marginRight: 8 }} />
                  <Text style={{ color: "#8A8A9F", fontWeight: "600" }}>{t.company || t.assigned_to || "Unknown"}</Text>
                </View>
              </View>

              <View style={{ alignItems: "flex-end", justifyContent: "flex-start" }}>
                <Text style={{ color: "#999", fontSize: 12 }}>{t.created}</Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export default TicketLanding;
