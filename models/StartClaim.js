import mongoose from "mongoose";

// Held for the moment someone starts a piece of work, so two people (or a double click)
// can't start the same one. Removed right after; anything left behind expires.
const StartClaimSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  at: { type: Date, default: Date.now, expires: 60 },
});

export default mongoose.models.StartClaim || mongoose.model("StartClaim", StartClaimSchema);
