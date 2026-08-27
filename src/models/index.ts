/**
 * Import models from here rather than individually. Mongoose resolves `ref` strings
 * lazily at populate time, so every model must have been registered on the
 * connection before the first populate runs — a single barrel guarantees that.
 */
export { ClinicModel, type Clinic } from "@/models/Clinic";
export { SessionModel, SESSION_STATUSES, type Session, type SessionStatus } from "@/models/Session";
export { TokenModel, TOKEN_STATUSES, type Token, type TokenStatus } from "@/models/Token";
