import { useEffect, useState } from "react";

interface Ticket {
  id: string;
  subject: string;
  description: string;
  resolution: string;
  product: string;
  priority: string;
  status: string;
  department: string;
  creation: string;
  raw: Record<string, unknown>;
}

export const useTicketData = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    loadTicketData();
  }, []);

  const loadTicketData = async () => {
    try {
      // Lade die JSON-Datei mit den Tickets
      const ticketFile = require("../assets/data/tickets.json");
      
      const ticketList = ticketFile.tickets.map((row: Record<string, any>): Ticket => {
        const caseNumber = String(row["Case Number"] ?? row.id ?? "").trim();
        const subject = String(row.Subject ?? row.subject ?? "").trim();
        const description = String(row["Case Description"] ?? row.description ?? "").trim();
        const resolution = String(row["Case Resolution Description"] ?? row.resolution ?? "").trim();
        const product = String(row.Product ?? row.department ?? "").trim();

        const status = String(
          row.status ??
            row.Status ??
            row["Case Status"] ??
            row["CaseStatus"] ??
            (resolution ? "Closed" : "Open")
        ).trim();
        const normalizedStatus = status
          ? status.length === 1
            ? status.toUpperCase()
            : status[0].toUpperCase() + status.slice(1).toLowerCase()
          : "Open";

        const rawPriority = String(row.priority ?? row.Priority ?? "Medium").trim().toLowerCase();
        const normalizedPriority =
          rawPriority === "critical"
            ? "Critical"
            : rawPriority === "high"
            ? "High"
            : rawPriority === "low"
            ? "Low"
            : rawPriority === "medium"
            ? "Medium"
            : rawPriority
            ? rawPriority[0].toUpperCase() + rawPriority.slice(1)
            : "Medium";

        const creation = String(row.creation ?? row["Creation Date"] ?? row["Created"] ?? "").trim();
        const department = String(row.department ?? product ?? "Unbekannt").trim() || "Unbekannt";

        return {
          id: caseNumber,
          subject,
          description,
          resolution,
          product,
          priority: normalizedPriority,
          status: normalizedStatus,
          department,
          creation: creation,
          raw: row,
        };
      });

      console.log("Loaded Tickets:", ticketList);
      setTickets(ticketList);
      setLoading(false);
    } catch (error) {
      console.error("Fehler beim Laden der Tickets:", error);
      setError(String(error));
      setLoading(false);
    }
  };

  const getTicketById = (id: string) => {
    const searchId = String(id).trim().toLowerCase();
    console.log("Searching for ID:", searchId);
    
    return tickets.find((ticket) => String(ticket.id).trim().toLowerCase() === searchId);
  };

  const updateTicket = (id: string, updates: Partial<Pick<Ticket, "status" | "priority">>) => {
    setTickets((prev) =>
      prev.map((t) => (String(t.id).trim().toLowerCase() === String(id).trim().toLowerCase() ? { ...t, ...updates } : t))
    );
  };

  return { tickets, loading, getTicketById, error, updateTicket };
};
