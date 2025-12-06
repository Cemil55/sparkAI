import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Image, Text, View } from "react-native";

export type Ticket = {
  id: string;
  subject: string;
  description: string;
  status: "Closed" | "In Progress";
};

const demoTickets: Ticket[] = [
  {
    id: "2023-CS122",
    subject: "Job collection are created, but cntr_g826 table not filled.",
    description: "Job collection are created, but cntr_g826 table not filled.",
    status: "Closed",
  },
  {
    id: "2023-CS121",
    subject: "Keymile MileGate 2300",
    description: "Keymile MileGate 2300",
    status: "In Progress",
  },
  {
    id: "2023-CS120",
    subject: "max bandwidth of TDM mgmt ports on 615",
    description: "max bandwidth of TDM mgmt ports on 615",
    status: "Closed",
  },
];

export const TicketList: React.FC = () => (
  // reduce top spacing so TicketList sits closer to the sections above it
  <View style={{ marginTop: 24 }}>
    <Text style={{ fontSize: 15, fontWeight: "600", marginBottom: 16 }}>
      Last Ticket(s)
    </Text>
    {demoTickets.map((ticket) => (
      <View
        key={ticket.id}
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "white",
          borderRadius: 16,
          marginBottom: 16,
          paddingVertical: 12,
          paddingHorizontal: 18,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 2,
          width: "100%",
        }}
      >
        <Image
          source={require("../assets/images/SBB.png")}
          style={{ width: 40, height: 40, borderRadius: 20, marginRight: 18 }}
        />
        <Text style={{ color: "#7D7A92", fontWeight: "500", marginRight: 18, minWidth: 120 }}>
          SBB CFF FFS
        </Text>
        <Text style={{ fontWeight: "700", fontSize: 16, color: "#27253D", marginRight: 18, minWidth: 160 }}>
          Ticket# {ticket.id}
        </Text>
        <Text style={{ color: "#5E5B73", fontSize: 15, marginRight: 18, flex: 1 }}>
          {ticket.subject}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", marginLeft: "auto", gap: 0 }}>
          <View
            style={{
              backgroundColor: ticket.status === "Closed" ? "#B7E2B7" : "#D1D5DB",
              borderRadius: 8,
              width: 120,
              paddingVertical: 8,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 50,
            }}
          >
            <Text
              style={{
                color: ticket.status === "Closed" ? "#185C1E" : "#666",
                fontWeight: "600",
                fontSize: 15,
                textAlign: "center",
                width: "100%",
              }}
            >
              {ticket.status}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={32} color="#888" style={{ marginLeft: 0 }} />
        </View>
      </View>
    ))}
  </View>
);

export default TicketList;
