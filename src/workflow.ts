/** Staff-controlled approval states; a submitted form NEVER guarantees an accepted stay. */
export type BookingStatus = 'requested' | 'reviewing' | 'approved' | 'declined' | 'cancelled' | 'completed';
export type InvoiceStatus = 'draft' | 'approved' | 'sent' | 'paid' | 'void';
const bookingMoves: Record<BookingStatus, BookingStatus[]> = {
  requested: ['reviewing', 'declined', 'cancelled'],
  reviewing: ['approved', 'declined', 'cancelled'],
  approved: ['cancelled', 'completed'],
  declined: [], cancelled: [], completed: [],
};
const invoiceMoves: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ['approved', 'void'],
  approved: ['sent', 'void'],
  sent: ['paid', 'void'],
  paid: [], void: [],
};
export function moveBooking(current: BookingStatus, next: BookingStatus): BookingStatus {
  if (!bookingMoves[current].includes(next)) throw new Error(`Invalid booking transition: ${current} -> ${next}`);
  return next;
}
export function moveInvoice(current: InvoiceStatus, next: InvoiceStatus): InvoiceStatus {
  if (!invoiceMoves[current].includes(next)) throw new Error(`Invalid invoice transition: ${current} -> ${next}`);
  return next;
}
