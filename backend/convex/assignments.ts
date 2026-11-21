// Owner: backend
//
// TODO queue (query): urgent first, then needs_help, with the proposed responder
// TODO byToken (query): what the responder page at /r/[token] shows
// TODO propose (internal mutation): nearest available responder, write "proposed"
// TODO approve (mutation): proposed -> offered, start the 2 minute expiry
// TODO accept (mutation): offered -> accepted, atomically. First accept wins.
//      Schedules internal.calls.placeConfirmationCall.
// TODO expire (internal mutation): no-op unless still "offered"
// TODO confirmationInfo (internal query): what the confirmation call needs
export {};
