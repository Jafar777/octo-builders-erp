import mongoose from "mongoose";

// An employee's anonymous monthly rating (1–5) of their department head. Who rated is
// kept only as a one-way key (lib/teamRatings.js) so a person can change their own
// rating but nobody — not the head, not the CEO, not the database — can tell who gave it.
const TeamRatingSchema = new mongoose.Schema(
  {
    month: { type: String, required: true }, // YYYY-MM
    head: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    raterKey: { type: String, required: true },
    score: { type: Number, min: 1, max: 5, required: true },
  },
  // No timestamps: the time of a rating could hint at who gave it.
  { timestamps: false }
);

TeamRatingSchema.index({ month: 1, head: 1, raterKey: 1 }, { unique: true });

export default mongoose.models.TeamRating || mongoose.model("TeamRating", TeamRatingSchema);
