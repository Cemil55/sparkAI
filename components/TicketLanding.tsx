import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Image, Text, TextInput, TouchableOpacity, View } from "react-native";

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


      {items.slice(0, 4).map((t) => {
        const id = (t["Case Number"] || "").toString().split("#")[1] || (t["Case Number"] || t.caseNumber);
        const priority = (t.Priority || "").toString();
        const status = (t.Status || "").toString();

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
                  <View style={{ marginLeft: 8, flexDirection: "row", gap: 8 }}>
                    <View style={{ backgroundColor: status.toLowerCase().includes("open") ? "#EAE7FF" : "#D1D5DB", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 }}>
                      <Text style={{ color: status.toLowerCase().includes("open") ? "#6B21A8" : "#666", fontWeight: "600" }}>{status}</Text>
                    </View>
                    <View style={{ backgroundColor: priority.toLowerCase().includes("high") ? "#FEE2E2" : priority.toLowerCase().includes("medium") ? "#FEF3C7" : "#D1FAE5", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 }}>
                      <Text style={{ color: priority.toLowerCase().includes("high") ? "#991B1B" : priority.toLowerCase().includes("medium") ? "#92400E" : "#065F46", fontWeight: "600" }}>{priority}</Text>
                    </View>
                  </View>
                </View>

                <Text style={{ marginTop: 10, color: "#444", fontSize: 18, fontWeight: "600" }}>{t.Subject}</Text>
                <Text style={{ marginTop: 6, color: "#777", fontSize: 14 }} numberOfLines={3}>{t["Case Description"]}</Text>

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
