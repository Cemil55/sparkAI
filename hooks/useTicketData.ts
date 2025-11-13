import { useEffect, useState } from "react";

interface Ticket {
  id: string;
  description: string;
  [key: string]: any;
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
      
      const ticketList = ticketFile.tickets.map((row: any) => ({
        id: String(row.id || "").trim(),
        description: String(row.description || ""),
        ...row,
      }));

      console.log("Loaded Tickets:", ticketList);
      setTickets(ticketList);
      setLoading(false);
    } catch (error) {
      console.error("Fehler beim Laden der Tickets:", error);
      setError(String(error));
      setLoading(false);
    }
  };

  const getTicketById = (id: string): Ticket | undefined => {
    const searchId = String(id).trim().toLowerCase();
    console.log("Searching for ID:", searchId);
    
    return tickets.find((ticket) => String(ticket.id).trim().toLowerCase() === searchId);
  };

  return { tickets, loading, getTicketById, error };
};
