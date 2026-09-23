export interface ExpoPushMessageForParsing {
  to: string;
}

interface ExpoPushTicket {
  status?: unknown;
  id?: unknown;
  message?: unknown;
  details?: { error?: unknown };
}

export interface ExpoPushResponseSummary {
  ticketIds: string[];
  invalidTokens: string[];
  errors: string[];
}

export function parseExpoPushResponse(
  messages: ExpoPushMessageForParsing[],
  payload: unknown,
): ExpoPushResponseSummary {
  const tickets =
    payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: ExpoPushTicket[] }).data ?? [])
      : [];
  const ticketIds: string[] = [];
  const invalidTokens: string[] = [];
  const errors: string[] = [];

  tickets.forEach((ticket, index) => {
    if (ticket.status === "ok" && typeof ticket.id === "string") {
      ticketIds.push(ticket.id);
      return;
    }

    const message = typeof ticket.message === "string" ? ticket.message : "Expo push ticket failed";
    errors.push(message);
    if (
      ticket.details?.error === "DeviceNotRegistered" &&
      typeof messages[index]?.to === "string"
    ) {
      invalidTokens.push(messages[index].to);
    }
  });

  return { ticketIds, invalidTokens, errors };
}
